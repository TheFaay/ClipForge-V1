/**
 * Offline (non-real-time) clip renderer.
 *
 * Instead of playing the video and recording the screen, this decodes the source
 * frame by frame, draws each one at an exact 30fps timestamp, and encodes the
 * result to H.264/AAC MP4. Speed of the computer no longer affects smoothness:
 * a slow machine just takes longer, it doesn't produce laggy video.
 */
import {
  ALL_FORMATS,
  AudioBufferSink,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
} from "mediabunny";
import { aspectByKey, DEFAULT_TITLE_SETTINGS, fontByKey, innerCropRatio } from "./clipforge-types";
import {
  drawCaption,
  drawOverlay,
  drawTitle,
  drawVerticalSquareBackground,
  outputSize,
  type RenderedClip,
  type RenderRequest,
} from "./clip-render";

const FPS = 30;
const AUDIO_RATE = 48000;

type FaceDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<Array<{ boundingBox: DOMRectReadOnly }>>;
};

type AudioTrack = Awaited<ReturnType<InstanceType<typeof Input>["getPrimaryAudioTrack"]>>;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Mixes the clip's original audio and any added sound into one buffer, offline. */
async function buildClipAudio(
  input: { audioTrack: AudioTrack },
  request: RenderRequest,
  start: number,
  end: number,
): Promise<AudioBuffer | null> {
  const audio = request.audio;
  const addedFile = audio && audio.mode !== "original" ? audio.soundFile : null;
  if (!input.audioTrack && !addedFile) return null;

  const length = end - start;
  const frames = Math.max(1, Math.ceil(length * AUDIO_RATE));
  const ctx = new OfflineAudioContext(2, frames, AUDIO_RATE);

  // Master gain with tiny fades so the clip never starts or ends with a click.
  const master = ctx.createGain();
  const edge = Math.min(0.02, length / 4);
  master.gain.setValueAtTime(0, 0);
  master.gain.linearRampToValueAtTime(1, edge);
  master.gain.setValueAtTime(1, Math.max(edge, length - edge));
  master.gain.linearRampToValueAtTime(0, length);
  master.connect(ctx.destination);

  if (input.audioTrack) {
    const originalGain = ctx.createGain();
    originalGain.gain.value = audio?.mode === "replace" ? 0 : clamp01(audio?.originalVolume ?? 1);
    originalGain.connect(master);
    const sink = new AudioBufferSink(input.audioTrack);
    for await (const item of sink.buffers(start, end)) {
      const node = ctx.createBufferSource();
      node.buffer = item.buffer;
      node.connect(originalGain);
      const when = item.timestamp - start;
      if (when >= 0) node.start(when);
      else node.start(0, -when); // chunk begins slightly before the clip start
    }
  }

  if (addedFile) {
    try {
      const decoder = new OfflineAudioContext(2, 1, AUDIO_RATE);
      const buffer = await decoder.decodeAudioData((await addedFile.arrayBuffer()).slice(0));
      const level = clamp01(audio?.soundVolume ?? 0.7);
      const addedGain = ctx.createGain();
      const fade = Math.min(0.025, length / 4);
      addedGain.gain.setValueAtTime(0, 0);
      addedGain.gain.linearRampToValueAtTime(level, fade);
      addedGain.gain.setValueAtTime(level, Math.max(fade, length - fade));
      addedGain.gain.linearRampToValueAtTime(0, length);
      const node = ctx.createBufferSource();
      node.buffer = buffer;
      node.loop = buffer.duration < length;
      node.connect(addedGain);
      addedGain.connect(master);
      node.start(0);
    } catch {
      request.onStage?.("Added sound unavailable — using original audio");
    }
  }

  return ctx.startRendering();
}

export async function renderClipOffline(request: RenderRequest): Promise<RenderedClip> {
  const aspect = request.aspect ?? "vertical";
  const preset = aspectByKey(aspect);
  const burnTitle = request.burnTitle !== false;

  request.onStage?.("Reading video");
  const input = new Input({ source: new BlobSource(request.file), formats: ALL_FORMATS });
  const videoTrack = await input.getPrimaryVideoTrack();
  if (!videoTrack) throw new Error("No video track found in this file.");
  const audioTrack = await input.getPrimaryAudioTrack();
  const duration = await input.computeDuration();

  const start = Math.max(0, Math.min(request.start, Math.max(0, duration - 1)));
  const end = Math.max(start + 1, Math.min(request.end, duration));

  // Full-size decoded frames (rotation already applied by the sink).
  const sink = new CanvasSink(videoTrack);
  const probe = await sink.getCanvas(start);
  if (!probe) throw new Error("Could not decode the first frame.");
  const sourceW = probe.canvas.width;
  const sourceH = probe.canvas.height;

  const dimensions = outputSize(sourceW, sourceH, aspect, preset.width, preset.height);
  const outW = dimensions.width;
  const outH = dimensions.height;
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("This browser can't render clips.");

  const fontKey = request.fontKey ?? "grotesk";
  if (burnTitle && document.fonts) {
    const f = fontByKey(fontKey);
    await document.fonts.load(`${f.weight} 40px "${f.family}"`).catch(() => {});
  }

  // Title + image never change, so draw them once and stamp them on every frame.
  const staticLayer = document.createElement("canvas");
  staticLayer.width = outW;
  staticLayer.height = outH;
  const sctx = staticLayer.getContext("2d");
  if (sctx) {
    if (burnTitle) {
      drawTitle(
        sctx,
        request.title,
        outW,
        outH,
        request.titlePosition ?? "bottom",
        fontKey,
        request.titleStyle,
        request.titleSettings ?? {
          ...DEFAULT_TITLE_SETTINGS,
          y: request.titlePosition === "top" ? 14 : 86,
        },
      );
    }
    if (request.overlay) {
      drawOverlay(
        sctx,
        request.overlay,
        outW,
        outH,
        request.overlayPosition ?? "top-right",
        request.overlayScale ?? 0.2,
        request.overlayOpacity ?? 1,
        request.overlayX,
        request.overlayY,
      );
    }
  }

  // Face tracking (where the browser supports it).
  const FaceDetectorCtor = (
    window as unknown as { FaceDetector?: new (options?: unknown) => FaceDetectorLike }
  ).FaceDetector;
  let detector: FaceDetectorLike | null = null;
  if (FaceDetectorCtor) {
    try {
      detector = new FaceDetectorCtor({ fastMode: true, maxDetectedFaces: 1 });
    } catch {
      detector = null;
    }
  }

  // Encoder setup.
  request.onStage?.("Preparing encoder");
  const pixels = outW * outH;
  const bitrate = Math.round(Math.max(6_000_000, Math.min(20_000_000, pixels * 7.5)));
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat(), target });
  const videoSource = new CanvasSource(canvas, { codec: "avc", bitrate });
  output.addVideoTrack(videoSource, { frameRate: FPS });

  const mixed = await buildClipAudio({ audioTrack }, request, start, end);
  let audioSource: InstanceType<typeof AudioBufferSource> | null = null;
  if (mixed) {
    audioSource = new AudioBufferSource({ codec: "aac", bitrate: 192_000 });
    output.addAudioTrack(audioSource);
  }

  await output.start();
  if (audioSource && mixed) await audioSource.add(mixed);

  // Crop window.
  const cropRatio = innerCropRatio(aspect) ?? outW / outH;
  let cropH = Math.min(sourceH, sourceW / cropRatio);
  let cropW = cropH * cropRatio;
  if (cropW > sourceW) {
    cropW = sourceW;
    cropH = cropW / cropRatio;
  }
  const minX = cropW / 2;
  const maxX = sourceW - cropW / 2;
  const sy = Math.max(0, (sourceH - cropH) / 2);
  let centerX = sourceW / 2;
  let targetX = centerX;

  const totalFrames = Math.max(1, Math.round((end - start) * FPS));
  function* frameTimes() {
    for (let i = 0; i < totalFrames; i++) yield start + i / FPS;
  }

  request.onStage?.(burnTitle ? "Rendering & burning title" : "Rendering clip");
  let index = 0;
  for await (const wrapped of sink.canvasesAtTimestamps(frameTimes())) {
    if (wrapped) {
      const frame = wrapped.canvas;

      if (detector && index % 15 === 0) {
        try {
          const faces = await detector.detect(frame);
          const face = faces[0];
          if (face) targetX = face.boundingBox.x + face.boundingBox.width / 2;
        } catch {
          detector = null;
        }
      }
      centerX += (targetX - centerX) * 0.06;
      const clampedCenter = Math.min(Math.max(minX, maxX), Math.max(minX, centerX));
      const sx = Math.max(0, Math.min(sourceW - cropW, clampedCenter - cropW / 2));

      ctx.fillStyle = request.titleSettings?.backgroundColor || "#000000";
      ctx.fillRect(0, 0, outW, outH);
      if (innerCropRatio(aspect)) {
        drawVerticalSquareBackground(ctx, frame, sx, sy, cropW, cropH, outW, outH, request.blurSquareBackground === true);
      } else {
        ctx.drawImage(frame, sx, sy, cropW, cropH, 0, 0, outW, outH);
      }
      ctx.drawImage(staticLayer, 0, 0);
      if (request.showCaptions) {
        drawCaption(ctx, request.captions ?? [], start + index / FPS, outW, outH);
      }
    }
    // If a frame is missing, the previous picture is simply held for this slot.
    await videoSource.add(index / FPS, 1 / FPS);
    index += 1;
    request.onProgress?.(Math.min(1, index / totalFrames));
  }

  await output.finalize();
  const buffer = target.buffer;
  if (!buffer) throw new Error("The encoder produced no data.");
  const blob = new Blob([buffer], { type: "video/mp4" });
  request.onProgress?.(1);
  return { blob, url: URL.createObjectURL(blob), extension: "mp4", mimeType: "video/mp4" };
}
