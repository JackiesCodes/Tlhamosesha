"""
Decon — computer-vision microservice (reference implementation).

Implements the contract the Next.js app calls when VISION_SERVICE_URL is set:

    POST /analyze  {"image": "data:image/...;base64,..."}
    -> {"objects": [{"kind", "label", "box": [x, y, w, h] (0..1), "confidence", "mask"?}], "texts": []}

Pipeline: YOLO (ultralytics) detections -> SAM (segment-anything) masks per box
-> rembg matting fallback -> OpenCV clean-up. The browser still produces the
final cut-outs; `mask` (a PNG data URL) is returned for callers that want it.
"""
from __future__ import annotations

import base64
import io
import os

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException
from PIL import Image
from pydantic import BaseModel

YOLO_WEIGHTS = os.getenv("YOLO_WEIGHTS", "yolov8x.pt")
SAM_CHECKPOINT = os.getenv("SAM_CHECKPOINT", "sam_vit_h_4b8939.pth")
SAM_MODEL = os.getenv("SAM_MODEL", "vit_h")
RETURN_MASKS = os.getenv("RETURN_MASKS", "1") == "1"

# COCO class -> Decon object kind
KIND = {
    "person": "person",
    "car": "vehicle", "truck": "vehicle", "bus": "vehicle", "motorcycle": "vehicle", "bicycle": "vehicle",
    "airplane": "vehicle", "boat": "vehicle", "train": "vehicle",
    "sports ball": "object", "bottle": "product", "cup": "product", "cell phone": "product",
    "laptop": "product", "handbag": "product", "backpack": "product", "tie": "product", "suitcase": "product",
}

app = FastAPI(title="Decon Vision Service")
_yolo = None
_sam = None


def yolo():
    global _yolo
    if _yolo is None:
        from ultralytics import YOLO

        _yolo = YOLO(YOLO_WEIGHTS)
    return _yolo


def sam():
    global _sam
    if _sam is None and os.path.exists(SAM_CHECKPOINT):
        from segment_anything import SamPredictor, sam_model_registry

        _sam = SamPredictor(sam_model_registry[SAM_MODEL](checkpoint=SAM_CHECKPOINT))
    return _sam


class AnalyzeBody(BaseModel):
    image: str


def decode(data_url: str) -> np.ndarray:
    try:
        raw = base64.b64decode(data_url.split(",", 1)[1])
        return np.array(Image.open(io.BytesIO(raw)).convert("RGB"))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, "image must be a base64 data URL") from exc


def mask_to_data_url(mask: np.ndarray) -> str:
    buf = io.BytesIO()
    Image.fromarray((mask * 255).astype(np.uint8)).save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def refine(mask: np.ndarray) -> np.ndarray:
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_CLOSE, kernel)
    return cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)


def rembg_mask(crop: np.ndarray) -> np.ndarray | None:
    try:
        from rembg import remove
    except ImportError:
        return None
    rgba = np.array(remove(Image.fromarray(crop)))
    return (rgba[..., 3] > 127).astype(np.uint8)


@app.get("/health")
def health():
    return {"ok": True, "yolo": YOLO_WEIGHTS, "sam": os.path.exists(SAM_CHECKPOINT)}


@app.post("/analyze")
def analyze(body: AnalyzeBody):
    img = decode(body.image)
    h, w = img.shape[:2]
    result = yolo()(img, verbose=False)[0]
    predictor = sam()
    if predictor is not None:
        predictor.set_image(img)

    objects = []
    for box, cls, conf in zip(result.boxes.xyxy.cpu().numpy(), result.boxes.cls.cpu().numpy(), result.boxes.conf.cpu().numpy()):
        name = result.names[int(cls)]
        x0, y0, x1, y1 = [float(v) for v in box]
        item = {
            "kind": KIND.get(name, "object"),
            "label": "Person" if name == "person" else name.title(),
            "box": [x0 / w, y0 / h, (x1 - x0) / w, (y1 - y0) / h],
            "confidence": round(float(conf), 3),
        }
        if RETURN_MASKS:
            mask = None
            if predictor is not None:
                masks, scores, _ = predictor.predict(box=np.array([x0, y0, x1, y1]), multimask_output=True)
                mask = masks[int(np.argmax(scores))]
            else:
                crop = img[int(y0):int(y1), int(x0):int(x1)]
                local = rembg_mask(crop)
                if local is not None:
                    mask = np.zeros((h, w), np.uint8)
                    mask[int(y0):int(y1), int(x0):int(x1)] = local
            if mask is not None:
                item["mask"] = mask_to_data_url(refine(mask))
        objects.append(item)
    return {"objects": objects, "texts": [], "notes": f"yolo:{YOLO_WEIGHTS} sam:{predictor is not None}"}
