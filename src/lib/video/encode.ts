// Encodes the rebuilt video in the browser (WebCodecs, via Mediabunny), with
// the original soundtrack if the person adds the source file.
import type { Project } from "../types";
import { makeCanvas, release } from "../vision/raster";
import { prepareRenderer } from "./render";

export interface VideoExportOptions {
  format: "mp4" | "webm";
  fps?: number;
  /** The original video (or any audio file); its sound is added under the new pictures. */
  soundtrack?: File;
  onProgress?: (p: number) => void;
}

export interface VideoExportResult {
  blob: Blob;
  fileName: string;
  /** The format actually written; MP4 falls back to WebM where the browser can't encode H.264/HEVC/AV1 into MP4. */
  format: "mp4" | "webm";
  audio: boolean;
}

export async function exportVideo(p: Project, opt: VideoExportOptions): Promise<VideoExportResult> {
  if (typeof VideoEncoder === "undefined") throw new Error("This browser can't encode video. Use a recent Chrome, Edge or Safari.");
  const mb = await import("mediabunny");
  const fps = opt.fps ?? 30;
  const renderer = await prepareRenderer(p);
  // Most encoders need even dimensions.
  const W = renderer.width - (renderer.width % 2);
  const H = renderer.height - (renderer.height % 2);

  let format = opt.format;
  const pick = async (f: "mp4" | "webm") => {
    const out = f === "mp4" ? new mb.Mp4OutputFormat() : new mb.WebMOutputFormat();
    const codec = await mb.getFirstEncodableVideoCodec(out.getSupportedVideoCodecs(), { width: W, height: H });
    return { out, codec };
  };
  let chosen = await pick(format);
  if (!chosen.codec && format === "mp4") {
    format = "webm";
    chosen = await pick(format);
  }
  if (!chosen.codec) throw new Error("This browser can't encode any supported video format.");

  const output = new mb.Output({ format: chosen.out, target: new mb.BufferTarget() });
  const { canvas, ctx } = makeCanvas(W, H);
  const video = new mb.CanvasSource(canvas, { codec: chosen.codec, bitrate: mb.QUALITY_HIGH, keyFrameInterval: 2 });
  output.addVideoTrack(video, { frameRate: fps });

  // Sound: decode the file the person picked and trim it to the video's length.
  let audioBuffer: AudioBuffer | null = null;
  let audio: InstanceType<typeof mb.AudioBufferSource> | null = null;
  if (opt.soundtrack) {
    const audioCodec = await mb.getFirstEncodableAudioCodec(chosen.out.getSupportedAudioCodecs());
    if (audioCodec) {
      const ac = new AudioContext();
      try {
        const decoded = await ac.decodeAudioData(await opt.soundtrack.arrayBuffer());
        const length = Math.min(decoded.length, Math.round(renderer.duration * decoded.sampleRate));
        audioBuffer = new AudioBuffer({ length, numberOfChannels: decoded.numberOfChannels, sampleRate: decoded.sampleRate });
        for (let c = 0; c < decoded.numberOfChannels; c++) audioBuffer.copyToChannel(decoded.getChannelData(c).subarray(0, length), c);
      } catch {
        throw new Error("Couldn't read sound from that file. Pick the original video, or an audio file such as MP3, M4A or WAV.");
      } finally {
        await ac.close();
      }
      audio = new mb.AudioBufferSource({ codec: audioCodec, bitrate: mb.QUALITY_HIGH });
      output.addAudioTrack(audio);
    }
  }

  await output.start();
  const frames = Math.max(1, Math.round(renderer.duration * fps));
  ctx.imageSmoothingQuality = "high";
  for (let i = 0; i < frames; i++) {
    const t = i / fps;
    ctx.save();
    ctx.scale(W / renderer.width, H / renderer.height);
    renderer.draw(ctx, t);
    ctx.restore();
    await video.add(t, 1 / fps);
    if (i % 5 === 0) opt.onProgress?.(i / frames);
  }
  if (audio && audioBuffer) await audio.add(audioBuffer);
  await output.finalize();
  release(canvas);
  opt.onProgress?.(1);

  const buffer = (output.target as InstanceType<typeof mb.BufferTarget>).buffer!;
  const base = p.name.replace(/\W+/g, "-").toLowerCase() || "video";
  return {
    blob: new Blob([buffer], { type: chosen.out.mimeType }),
    fileName: `${base}-rebuilt.${chosen.out.fileExtension.replace(/^\./, "")}`,
    format,
    audio: !!audioBuffer,
  };
}
