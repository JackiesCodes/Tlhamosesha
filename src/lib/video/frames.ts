// Video decoding for analysis: a small greyscale copy of (nearly) every frame,
// plus full-resolution grabs of the frames chosen as keyframes.
import { makeCanvas } from "../vision/raster";

export interface GrayFrame {
  /** media time in seconds */
  t: number;
  data: Uint8Array;
}

export interface FrameSet {
  /** video size */
  width: number;
  height: number;
  /** analysis raster size */
  w: number;
  h: number;
  duration: number;
  frames: GrayFrame[];
}

export class VideoUnsupportedError extends Error {}

export function openVideo(src: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.crossOrigin = "anonymous";
    v.onloadeddata = () => resolve(v);
    v.onerror = () =>
      reject(
        new VideoUnsupportedError(
          "This browser can't play this video's format. Try Chrome, Edge or Safari, or convert it to MP4 (H.264) or WebM (VP9) and try again.",
        ),
      );
    v.src = src;
  });
}

const toGray = (rgba: Uint8ClampedArray) => {
  const g = new Uint8Array(rgba.length / 4);
  for (let p = 0, i = 0; p < g.length; p++, i += 4) g[p] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
  return g;
};

/**
 * Plays the video faster than real time and keeps a small greyscale copy of
 * every frame the browser presents. Falls back to stepping with seeks where
 * per-frame callbacks aren't available.
 */
export async function captureFrames(
  video: HTMLVideoElement,
  { maxDim = 480, rate = 2, onProgress }: { maxDim?: number; rate?: number; onProgress?: (p: number) => void } = {},
): Promise<FrameSet> {
  const width = video.videoWidth;
  const height = video.videoHeight;
  const duration = video.duration;
  const k = Math.min(1, maxDim / Math.max(width, height));
  const w = Math.max(1, Math.round(width * k));
  const h = Math.max(1, Math.round(height * k));
  const { ctx } = makeCanvas(w, h);
  const frames: GrayFrame[] = [];
  const grab = (t: number) => {
    ctx.drawImage(video, 0, 0, w, h);
    frames.push({ t, data: toGray(ctx.getImageData(0, 0, w, h).data) });
    onProgress?.(Math.min(1, t / duration));
  };

  if ("requestVideoFrameCallback" in video) {
    await seek(video, 0);
    grab(0);
    video.playbackRate = rate;
    await new Promise<void>((resolve, reject) => {
      let handle = 0;
      const onFrame = (_now: number, meta: VideoFrameCallbackMetadata) => {
        if (meta.mediaTime > frames[frames.length - 1].t + 1e-3) grab(meta.mediaTime);
        if (!video.ended) handle = video.requestVideoFrameCallback(onFrame);
      };
      handle = video.requestVideoFrameCallback(onFrame);
      video.onended = () => {
        // A pending callback would otherwise fire on the next seek (keyframe grabs).
        video.cancelVideoFrameCallback(handle);
        video.onended = null;
        resolve();
      };
      video.play().catch(reject);
    });
    video.playbackRate = 1;
  }
  // Too few frames (no callbacks, or the browser skipped most): step instead.
  if (frames.length < duration * 6) {
    frames.length = 0;
    const step = 1 / 10;
    for (let t = 0; t < duration; t += step) {
      await seek(video, t);
      grab(t);
    }
  }
  frames.sort((a, b) => a.t - b.t);
  return { width, height, w, h, duration, frames };
}

export function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - t) < 1e-4 && video.readyState >= 2) return resolve();
    video.onseeked = () => {
      video.onseeked = null;
      resolve();
    };
    video.currentTime = t;
  });
}

/** Small greyscale copy of the frame at time t, at the frame set's analysis size. */
export async function grayAt(video: HTMLVideoElement, fs: FrameSet, t: number): Promise<Uint8Array> {
  video.pause();
  await seek(video, t);
  const { ctx } = makeCanvas(fs.w, fs.h);
  ctx.drawImage(video, 0, 0, fs.w, fs.h);
  return toGray(ctx.getImageData(0, 0, fs.w, fs.h).data);
}

/** Full-resolution PNG of the frame at time t, as an object URL (revoke it when done). */
export async function grabFrame(video: HTMLVideoElement, t: number): Promise<string> {
  video.pause();
  await seek(video, t);
  const { canvas, ctx } = makeCanvas(video.videoWidth, video.videoHeight);
  ctx.drawImage(video, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Couldn't read a frame from this video.");
  return URL.createObjectURL(blob);
}

/** Lets the browser free the decoder and its buffers. */
export function closeVideo(video: HTMLVideoElement) {
  video.pause();
  video.removeAttribute("src");
  video.load();
}

/** Index of the frame closest to time t. */
export function frameAt(fs: FrameSet, t: number): number {
  let lo = 0;
  let hi = fs.frames.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (fs.frames[mid].t < t) lo = mid;
    else hi = mid;
  }
  return Math.abs(fs.frames[lo].t - t) <= Math.abs(fs.frames[hi].t - t) ? lo : hi;
}
