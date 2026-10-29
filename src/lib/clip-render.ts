/**
 * Renders a short clip entirely in the browser in any of the supported
 * aspect ratios (9:16, centered 1:1 in 9:16, 1:1, 16:9): trims to the chosen range, smart-crops
 * toward the speaker's face with EMA smoothing, optionally burns the chosen
 * title on screen and keeps the original audio.
 *
 * Nothing leaves the device: the result is a Blob the user can download.
 */

import {
  aspectByKey,
  fontByKey,
  type AspectKey,
  type ClipAudioSettings,
  type CaptionCue,
  type LogoPosition,
  type TitleSettings,
  DEFAULT_TITLE_SETTINGS,
  type TitleStyle,
  innerCropRatio,
} from "./clipforge-types";

// Mobile browsers (iOS especially) stall when a fresh detached <video> is
// created per clip, and createMediaElementSource can only run once per
// element. So one hidden, on-page video + one audio route serve every clip.
let sharedVideo: HTMLVideoElement | null = null;
let sharedSource: MediaElementAudioSourceNode | null = null;
let sharedDest: MediaStreamAudioDestinationNode | null = null;
let sharedSourceGain: GainNode | null = null;
const audioBuffers = new WeakMap<File, Promise<AudioBuffer>>();
const fileUrls = new WeakMap<File, string>();
function getVideo(): HTMLVideoElement {
  if (sharedVideo) return sharedVideo;
  const v = document.createElement("video");
  v.playsInline = true;
  v.setAttribute("playsinline", "");
  v.setAttribute("webkit-playsinline", "");
  v.preload = "auto";
  v.style.cssText =
    "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1";
  document.body.appendChild(v);
  sharedVideo = v;
  return v;
}
function urlFor(file: File) {
  let u = fileUrls.get(file);
  if (!u) {
    u = URL.createObjectURL(file);
    fileUrls.set(file, u);
  }
  return u;
}

// One shared audio context: mobile browsers cap how many can exist, and a
// fresh one per clip is what stalled exports after the second clip.
let sharedAudio: AudioContext | null = null;
function getAudioContext(): AudioContext | null {
  if (sharedAudio && sharedAudio.state !== "closed") return sharedAudio;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    // "playback" = bigger audio buffers (fewer clicks); 48k matches most video audio.
    sharedAudio = new Ctor({ latencyHint: "playback", sampleRate: 48000 });
  } catch {
    try {
      sharedAudio = new Ctor();
    } catch {
      sharedAudio = null;
    }
  }
  return sharedAudio;
}

/** Call from a tap/click so mobile browsers allow audio for the whole batch. */
export function unlockAudio() {
  getAudioContext()?.resume().catch(() => {});
}

export async function loadOverlayImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

const isMobile = () =>
  typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

export type RenderRequest = {
  file: File;
  start: number;
  end: number;
  title: string;
  burnTitle?: boolean;
  titlePosition?: "top" | "bottom";
  aspect?: AspectKey;
  fontKey?: string;
  overlay?: HTMLImageElement | null;
  overlayPosition?: LogoPosition;
  overlayScale?: number;
  overlayOpacity?: number;
  overlayX?: number;
  overlayY?: number;
  titleStyle?: TitleStyle;
  titleSettings?: TitleSettings;
  audio?: ClipAudioSettings;
  showCaptions?: boolean;
  captions?: CaptionCue[];
  blurSquareBackground?: boolean;
  onProgress?: (ratio: number) => void;
  onStage?: (stage: string) => void;
  signal?: AbortSignal;
};

export type RenderedClip = {
  blob: Blob;
  url: string;
  extension: string;
  mimeType: string;
};

type FaceDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<Array<{ boundingBox: DOMRectReadOnly }>>;
};

function pickMp4MimeType(): { mimeType: string; extension: "mp4" } | null {
  const candidates: Array<{ mimeType: string; extension: "mp4" }> = [
    { mimeType: 'video/mp4;codecs="avc1.42E01E,mp4a.40.2"', extension: "mp4" },
    { mimeType: 'video/mp4;codecs="avc1.42E01E,opus"', extension: "mp4" },
    { mimeType: "video/mp4", extension: "mp4" },
  ];
  for (const candidate of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(candidate.mimeType)) {
      return candidate;
    }
  }
  return null;
}

function even(value: number) {
  return Math.max(2, Math.floor(value / 2) * 2);
}

export function outputSize(
  sourceW: number,
  sourceH: number,
  aspect: AspectKey,
  targetW: number,
  targetH: number,
) {
  const targetRatio = targetW / targetH;
  const inner = innerCropRatio(aspect);
  if (inner) {
    const ch = Math.min(sourceH, sourceW / inner);
    const cw = ch * inner;
    const scale = Math.min(1, cw / targetW);
    return { width: even(targetW * scale), height: even(targetH * scale) };
  }
  let cropH = Math.min(sourceH, sourceW / targetRatio);
  let cropW = cropH * targetRatio;
  if (cropW > sourceW) {
    cropW = sourceW;
    cropH = cropW / targetRatio;
  }
  const scale = Math.min(1, cropW / targetW, cropH / targetH);
  return { width: even(targetW * scale), height: even(targetH * scale) };
}

function waitFor(video: HTMLVideoElement, event: string, timeoutMs = 20000) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => {
      cleanup();
      reject(new Error("The video took too long to load. Keep the screen on and try again."));
    }, timeoutMs);
    const onDone = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("This video file could not be read in the browser."));
    };
    const cleanup = () => {
      clearTimeout(t);
      video.removeEventListener(event, onDone);
      video.removeEventListener("error", onError);
    };
    video.addEventListener(event, onDone, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}


export function drawTitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  height: number,
  position: "top" | "bottom",
  fontKey: string,
  style: TitleStyle = "translucent",
  settings: TitleSettings,
) {
  if (!text.trim()) return;
  const fontSize = Math.round(Math.min(width, height) * 0.068 * (settings.scale / 100));
  const font = fontByKey(fontKey);
  ctx.font = `${settings.italic ? "italic " : ""}${font.weight} ${fontSize}px "${font.family}", "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const tracking = fontSize * (settings.letterSpacing / 100);
  const measure = (value: string) =>
    ctx.measureText(value).width + Math.max(0, value.length - 1) * tracking;
  const maxWidth = width * (settings.maxWidth / 100);
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.trim().split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (measure(next) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
  }

  const lineHeight = fontSize * (settings.lineSpacing / 100);
  const blockHeight = lines.length * lineHeight;
  const centerX = width * (settings.x / 100);
  const fallbackY = position === "top" ? 14 : 86;
  const centerY = height * ((Number.isFinite(settings.y) ? settings.y : fallbackY) / 100);
  const startY = centerY - blockHeight / 2 + lineHeight / 2;

  const drawTrackedText = (entry: string, y: number, stroke: boolean) => {
    if (!tracking) {
      if (stroke) ctx.strokeText(entry, centerX, y);
      else ctx.fillText(entry, centerX, y);
      return;
    }
    let x = centerX - measure(entry) / 2;
    ctx.textAlign = "left";
    for (const character of entry) {
      if (stroke) ctx.strokeText(character, x, y);
      else ctx.fillText(character, x, y);
      x += ctx.measureText(character).width + tracking;
    }
    ctx.textAlign = "center";
  };

  // Group consecutive non-empty lines into contiguous stacked boxes, then trace
  // one outline per group so every corner (outer and inner steps) is rounded.
  const padX = fontSize * ((settings.boxPaddingX ?? 45) / 100);
  const padY = fontSize * ((settings.boxPaddingY ?? 28) / 100);
  const groups: { left: number; right: number; top: number; bottom: number }[][] = [];
  let current: { left: number; right: number; top: number; bottom: number }[] = [];
  lines.forEach((entry, index) => {
    if (!entry) {
      if (current.length) groups.push(current);
      current = [];
      return;
    }
    const y = startY + index * lineHeight;
    const w = measure(entry) / 2 + padX;
    current.push({ left: centerX - w, right: centerX + w, top: y - lineHeight / 2, bottom: y + lineHeight / 2 });
  });
  if (current.length) groups.push(current);

  if (style !== "none" && groups.length) {
    const radiusPref = fontSize * ((settings.boxRadius ?? 32) / 100);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, (settings.boxOpacity ?? (style === "white" ? 100 : 62)) / 100));
    ctx.fillStyle = settings.boxColor ?? (style === "white" ? "#ffffff" : "#080a12");
    ctx.beginPath();
    for (const group of groups) {
      group[0]!.top -= padY;
      group[group.length - 1]!.bottom += padY;
      const pts: [number, number][] = [];
      group.forEach((b, i) => {
        if (i === 0) pts.push([b.right, b.top]);
        else if (Math.abs(b.right - group[i - 1]!.right) > 0.5) pts.push([b.right, b.top]);
        const next = group[i + 1];
        if (!next || Math.abs(next.right - b.right) > 0.5) pts.push([b.right, b.bottom]);
        if (next && Math.abs(next.right - b.right) > 0.5) pts.push([next.right, b.bottom]);
      });
      for (let i = group.length - 1; i >= 0; i--) {
        const b = group[i]!;
        if (i === group.length - 1) pts.push([b.left, b.bottom]);
        else if (Math.abs(b.left - group[i + 1]!.left) > 0.5) pts.push([b.left, b.bottom]);
        const prev = group[i - 1];
        if (!prev || Math.abs(prev.left - b.left) > 0.5) pts.push([b.left, b.top]);
        if (prev && Math.abs(prev.left - b.left) > 0.5) pts.push([prev.left, b.top]);
      }
      // Transitions between stacked lines can emit the same point twice. A
      // duplicate gives arcTo a zero-length edge, which leaves that one corner
      // sharp. Normalise the outline first, then use one shared radius for the
      // whole bubble so stepped and outer corners always match.
      const outline = pts.filter((point, index) => {
        const previous = pts[(index - 1 + pts.length) % pts.length];
        return !previous || Math.abs(point[0] - previous[0]) > 0.5 || Math.abs(point[1] - previous[1]) > 0.5;
      });
      const n = outline.length;
      const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
      const sharedRadius = n
        ? Math.max(0, Math.min(radiusPref, ...outline.map((point, index) => {
            const previous = outline[(index - 1 + n) % n]!;
            const next = outline[(index + 1) % n]!;
            return Math.min(dist(point, previous), dist(point, next)) / 2;
          })))
        : 0;
      const start = outline[0]!;
      const last = outline[n - 1]!;
      ctx.moveTo((start[0] + last[0]) / 2, (start[1] + last[1]) / 2);
      for (let i = 0; i < n; i++) {
        const point = outline[i]!;
        const next = outline[(i + 1) % n]!;
        ctx.arcTo(point[0], point[1], next[0], next[1], sharedRadius);
      }
      ctx.closePath();
    }
    ctx.fill();
    ctx.restore();
  }

  lines.forEach((entry, index) => {
    const y = startY + index * lineHeight;
    if (!entry) return;
    if (style === "white") {
      ctx.fillStyle = settings.textColor;
      drawTrackedText(entry, y, false);
      return;
    }
    ctx.lineWidth = Math.max(0, fontSize * (settings.strokeWidth / 100));
    ctx.lineJoin = "round";
    ctx.strokeStyle = settings.strokeColor;
    if (settings.strokeWidth > 0) drawTrackedText(entry, y, true);
    ctx.fillStyle = settings.textColor;
    drawTrackedText(entry, y, false);
  });
}

export function buildCaptionCues(transcript: string, duration: number): CaptionCue[] {
  const entries = transcript.split("\n").flatMap((line) => {
    const match = /^\[(\d+):(\d+)(?::(\d+))?\]\s*(.+)$/.exec(line.trim());
    if (!match) return [];
    const first = Number(match[1]);
    const second = Number(match[2]);
    const third = match[3] === undefined ? null : Number(match[3]);
    const start = third === null ? first * 60 + second : first * 3600 + second * 60 + third;
    return [{ start, text: match[4] ?? "" }];
  });
  return entries.flatMap((entry, entryIndex) => {
    const words = entry.text.split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const groups = Array.from({ length: Math.ceil(words.length / 7) }, (_, index) => words.slice(index * 7, index * 7 + 7).join(" "));
    const nextStart = entries[entryIndex + 1]?.start ?? Math.min(duration, entry.start + 90);
    const available = Math.max(groups.length * 1.2, nextStart - entry.start);
    const groupDuration = available / groups.length;
    return groups.map((text, index) => ({
      start: entry.start + index * groupDuration,
      end: Math.min(duration, entry.start + (index + 1) * groupDuration),
      text,
    }));
  });
}

export function drawCaption(ctx: CanvasRenderingContext2D, cues: CaptionCue[], time: number, width: number, height: number) {
  const cue = cues.find((item) => time >= item.start && time < item.end);
  if (!cue) return;
  const size = Math.round(Math.min(width, height) * 0.045);
  ctx.save();
  ctx.font = `600 ${size}px "DM Sans", "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const maxWidth = width * 0.82;
  const words = cue.text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  });
  if (line) lines.push(line);
  const lineHeight = size * 1.18;
  const centerY = height * 0.92;
  const widest = Math.max(...lines.map((item) => ctx.measureText(item).width));
  const boxWidth = widest + size * 1.1;
  const boxHeight = lines.length * lineHeight + size * 0.5;
  ctx.globalAlpha = 0.76;
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.roundRect((width - boxWidth) / 2, centerY - boxHeight / 2, boxWidth, boxHeight, size * 0.3);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#ffffff";
  lines.forEach((item, index) => ctx.fillText(item, width / 2, centerY - ((lines.length - 1) * lineHeight) / 2 + index * lineHeight));
  ctx.restore();
}

let blurCanvas: HTMLCanvasElement | null = null;
let blurTick = 0;

export function drawVerticalSquareBackground(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement | HTMLCanvasElement,
  sx: number,
  sy: number,
  cropW: number,
  cropH: number,
  outW: number,
  outH: number,
  blur: boolean,
) {
  if (blur) {
    const srcW = video instanceof HTMLVideoElement ? video.videoWidth : video.width;
    const srcH = video instanceof HTMLVideoElement ? video.videoHeight : video.height;
    const coverScale = Math.max(outW / srcW, outH / srcH);
    const w = srcW * coverScale;
    const h = srcH * coverScale;
    // Blur on a tiny canvas and upscale: visually identical, far cheaper per frame.
    const small = blurCanvas ?? (blurCanvas = document.createElement("canvas"));
    const sw = Math.max(16, Math.round(outW / 12));
    const sh = Math.max(16, Math.round(outH / 12));
    let refreshBlur = blurTick++ % 3 === 0;
    if (small.width !== sw || small.height !== sh) { small.width = sw; small.height = sh; refreshBlur = true; }
    const sctx = small.getContext("2d");
    ctx.save();
    if (sctx) {
      if (refreshBlur) {
        sctx.filter = "blur(2px)";
        sctx.drawImage(video, ((outW - w) / 2) / 12, ((outH - h) / 2) / 12, w / 12, h / 12);
        sctx.filter = "none";
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "low";
      ctx.drawImage(small, 0, 0, outW, outH);
    }
    ctx.globalAlpha = 0.26;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, outW, outH);
    ctx.restore();
  }
  const innerH = outW * (cropH / cropW);
  ctx.drawImage(video, sx, sy, cropW, cropH, 0, (outH - innerH) / 2, outW, innerH);
}

export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  width: number,
  height: number,
  position: LogoPosition,
  scale: number,
  opacity = 1,
  customX?: number,
  customY?: number,
) {
  const boxW = width * scale;
  const ratio = img.naturalHeight / img.naturalWidth || 1;
  let w = boxW;
  let h = boxW * ratio;
  const m = Math.min(width, height) * 0.04;
  const [v, hz] = position === "center" ? ["center", "center"] : position.split("-");
  const presetX = hz === "left" ? m : hz === "right" ? width - w - m : (width - w) / 2;
  const presetY = v === "top" ? m : v === "bottom" ? height - h - m : (height - h) / 2;
  const x = customX === undefined ? presetX : width * (customX / 100) - w / 2;
  const y = customY === undefined ? presetY : height * (customY / 100) - h / 2;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
  ctx.drawImage(img, x, y, w, h);
  ctx.restore();
}

type PreviewFrameOptions = {
  aspect: AspectKey;
  title: string;
  burnTitle: boolean;
  fontKey: string;
  titleSettings: TitleSettings;
  titleStyle: TitleStyle;
  overlay: HTMLImageElement | null;
  overlayPosition: LogoPosition;
  overlayScale: number;
  overlayOpacity: number;
  overlayX: number;
  overlayY: number;
  showCaptions: boolean;
  captions: CaptionCue[];
  currentTime: number;
  blurSquareBackground: boolean;
};

export function drawPreviewFrame(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  options: PreviewFrameOptions,
) {
  const preset = aspectByKey(options.aspect);
  const previewHeight = options.aspect === "wide" ? 360 : options.aspect === "square" ? 480 : 640;
  const previewWidth = even(previewHeight * (preset.width / preset.height));
  if (canvas.width !== previewWidth || canvas.height !== previewHeight) {
    canvas.width = previewWidth;
    canvas.height = previewHeight;
  }
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx || !video.videoWidth || !video.videoHeight) return;
  const outW = canvas.width;
  const outH = canvas.height;
  const cropRatio = innerCropRatio(options.aspect) ?? outW / outH;
  let cropH = Math.min(video.videoHeight, video.videoWidth / cropRatio);
  let cropW = cropH * cropRatio;
  if (cropW > video.videoWidth) {
    cropW = video.videoWidth;
    cropH = cropW / cropRatio;
  }
  const sx = Math.max(0, (video.videoWidth - cropW) / 2);
  const sy = Math.max(0, (video.videoHeight - cropH) / 2);
  ctx.fillStyle = options.titleSettings.backgroundColor || "#000000";
  ctx.fillRect(0, 0, outW, outH);
  if (innerCropRatio(options.aspect)) {
    drawVerticalSquareBackground(ctx, video, sx, sy, cropW, cropH, outW, outH, options.blurSquareBackground);
  } else {
    ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, outW, outH);
  }
  if (options.burnTitle) {
    drawTitle(ctx, options.title, outW, outH, "bottom", options.fontKey, options.titleStyle, options.titleSettings);
  }
  if (options.overlay) {
    drawOverlay(ctx, options.overlay, outW, outH, options.overlayPosition, options.overlayScale, options.overlayOpacity, options.overlayX, options.overlayY);
  }
  if (options.showCaptions) drawCaption(ctx, options.captions, options.currentTime, outW, outH);
}

function decodeAddedAudio(context: AudioContext, file: File) {
  let pending = audioBuffers.get(file);
  if (!pending) {
    pending = file.arrayBuffer().then((data) => context.decodeAudioData(data.slice(0)));
    audioBuffers.set(file, pending);
  }
  return pending;
}

/**
 * Preferred path: render offline, frame by frame, with exact timestamps
 * (smooth, no dependence on live playback speed). If the browser can't do that,
 * fall back to the live-recording renderer below.
 */
export async function renderClip(request: RenderRequest): Promise<RenderedClip> {
  if (typeof VideoEncoder !== "undefined" && typeof VideoDecoder !== "undefined") {
    try {
      const { renderClipOffline } = await import("./clip-render-offline");
      return await renderClipOffline(request);
    } catch (error) {
      console.warn("Offline export failed, using live recording instead:", error);
      request.onStage?.("Using compatibility export");
    }
  }
  return renderClipRealtime(request);
}

async function renderClipRealtime(request: RenderRequest): Promise<RenderedClip> {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("This browser can't export video. Try Chrome, Edge or Safari.");
  }

  const aspect = request.aspect ?? "vertical";
  const preset = aspectByKey(aspect);
  const burnTitle = request.burnTitle !== false;
  const mp4 = pickMp4MimeType();
  if (!mp4) {
    throw new Error("This browser cannot create MP4 clips. Update your browser or try current Chrome, Edge, or Safari.");
  }

  const objectUrl = urlFor(request.file);
  const video = getVideo();
  video.muted = false;
  const metaReady = video.src === objectUrl && video.readyState >= 1;
  if (!metaReady) {
    video.src = objectUrl;
    video.load();
  }

  let audioContext: AudioContext | null = null;
  let recorder: MediaRecorder | null = null;
  let rafId = 0;
  let timerId: ReturnType<typeof setTimeout> | undefined;
  let videoFrameId = 0;
  let disconnectAudio = () => {};
  let addedSource: AudioBufferSourceNode | null = null;
  let addedGain: GainNode | null = null;

  const cleanup = () => {
    cancelAnimationFrame(rafId);
    clearTimeout(timerId);
    if (videoFrameId && "cancelVideoFrameCallback" in video) {
      video.cancelVideoFrameCallback(videoFrameId);
    }
    disconnectAudio();
    try {
      addedSource?.stop();
    } catch {
      // The added sound may already have stopped naturally.
    }
    addedSource?.disconnect();
    addedGain?.disconnect();
    video.pause();
  };

  try {
    request.onStage?.("Reading video");
    if (!metaReady) await waitFor(video, "loadedmetadata");

    const duration = video.duration;
    const start = Math.max(0, Math.min(request.start, Math.max(0, duration - 1)));
    const end = Math.max(start + 1, Math.min(request.end, duration));
    const sourceW = video.videoWidth;
    const sourceH = video.videoHeight;
    const dimensions = outputSize(sourceW, sourceH, aspect, preset.width, preset.height);
    const outW = dimensions.width;
    const outH = dimensions.height;
    const targetRatio = outW / outH;
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("This browser can't render clips.");

    if (Math.abs(video.currentTime - start) > 0.05) {
      const seeked = waitFor(video, "seeked");
      video.currentTime = start;
      await seeked;
    }

    const fontKey = request.fontKey ?? "grotesk";
    if (burnTitle && document.fonts) {
      const f = fontByKey(fontKey);
      await document.fonts.load(`${f.weight} 40px "${f.family}"`).catch(() => {});
    }

    request.onStage?.("Preparing face tracking");
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

    const videoStream = canvas.captureStream(30);
    const videoTracks = videoStream.getVideoTracks();
    const tracks: MediaStreamTrack[] = [...videoTracks];

    let audioDest: MediaStreamAudioDestinationNode | null = null;
    try {
      audioContext = getAudioContext();
      if (audioContext) {
        if (!sharedSource || sharedSource.context !== audioContext) {
          sharedSource = audioContext.createMediaElementSource(video);
          sharedDest = audioContext.createMediaStreamDestination();
          sharedSourceGain = audioContext.createGain();
          sharedSource.connect(sharedSourceGain);
          sharedSourceGain.connect(sharedDest);
        }
        audioDest = sharedDest;
        const audio = request.audio;
        const originalGain = audio?.mode === "replace" ? 0 : (audio?.originalVolume ?? 1);
        if (sharedSourceGain) sharedSourceGain.gain.value = Math.max(0, Math.min(1, originalGain));
        if (audio?.soundFile && audio.mode !== "original" && audioDest) {
          try {
            const buffer = await decodeAddedAudio(audioContext, audio.soundFile);
            addedGain = audioContext.createGain();
            const now = audioContext.currentTime;
            const clipLength = end - start;
            const level = Math.max(0, Math.min(1, audio.soundVolume));
            const fade = Math.min(0.025, clipLength / 4);
            addedGain.gain.setValueAtTime(0, now);
            addedGain.gain.linearRampToValueAtTime(level, now + fade);
            addedGain.gain.setValueAtTime(level, now + Math.max(fade, clipLength - fade));
            addedGain.gain.linearRampToValueAtTime(0, now + clipLength);
            addedSource = audioContext.createBufferSource();
            addedSource.buffer = buffer;
            addedSource.loop = buffer.duration < clipLength;
            addedSource.connect(addedGain);
            addedGain.connect(audioDest);
          } catch {
            if (sharedSourceGain) sharedSourceGain.gain.value = Math.max(0, Math.min(1, audio.originalVolume));
            request.onStage?.("Added sound unavailable — using original audio");
          }
        }
        if (audioDest) tracks.push(...audioDest.stream.getAudioTracks());
      }
    } catch {
      // No audio capture available: render video only.
    }
    disconnectAudio = () => {
      videoTracks.forEach((track) => track.stop());
      if (sharedSourceGain) sharedSourceGain.gain.value = 0;
    };

    const stream = new MediaStream(tracks);
    const pixels = outW * outH;
    const videoBitsPerSecond = Math.round(Math.max(6_000_000, Math.min(20_000_000, pixels * 7.5)));
    recorder = new MediaRecorder(
      stream,
      {
        mimeType: mp4.mimeType,
        videoBitsPerSecond: isMobile() ? Math.min(videoBitsPerSecond, 12_000_000) : videoBitsPerSecond,
        audioBitsPerSecond: 192_000,
      },
    );

    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    const finished = new Promise<Blob>((resolve, reject) => {
      if (!recorder) {
        reject(new Error("The MP4 recorder could not start."));
        return;
      }
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder?.mimeType || "video/mp4" }));
      recorder.onerror = () => reject(new Error("Rendering failed while exporting."));
    });

    // Largest crop window inside the source that matches the target ratio.
    const cropRatio = innerCropRatio(aspect) ?? targetRatio;
    let cropH = Math.min(sourceH, sourceW / cropRatio);
    let cropW = cropH * cropRatio;
    if (cropW > sourceW) {
      cropW = sourceW;
      cropH = cropW / cropRatio;
    }

    let centerX = sourceW / 2;
    let targetX = centerX;
    const minX = cropW / 2;
    const maxX = sourceW - cropW / 2;
    const sy = Math.max(0, (sourceH - cropH) / 2);
    let frame = 0;
    let detecting = false;
    let staticLayer: HTMLCanvasElement | null = null;

    request.onStage?.(burnTitle ? "Rendering & burning title" : "Rendering clip");
    await audioContext?.resume().catch(() => {});
    const playing = waitFor(video, "playing", 15000).catch(() => {});
    try {
      await video.play();
    } catch {
      // Autoplay blocked (common on phones between clips): retry muted.
      video.muted = true;
      await video.play();
    }
    await playing;
    recorder.start(1000);
    addedSource?.start();
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let watchdog: ReturnType<typeof setInterval> | undefined;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearInterval(watchdog);
        resolve();
      };
      const draw = () => {
        if (request.signal?.aborted) {
          finish();
          return;
        }
        frame += 1;

        if (detector && frame % 15 === 0 && !detecting) {
          detecting = true;
          detector
            .detect(video)
            .then((faces) => {
              const face = faces[0];
              if (face) {
                const target = face.boundingBox.x + face.boundingBox.width / 2;
                // Exponential moving average keeps the pan smooth and jitter-free.
                targetX = target;
              }
            })
            .catch(() => {
              detector = null;
            })
            .finally(() => {
              detecting = false;
            });
        }

        // Ease a little every frame so camera pans glide instead of stepping.
        centerX += (targetX - centerX) * 0.06;
        const clampedCenter = Math.min(Math.max(minX, maxX), Math.max(minX, centerX));
        const sx = Math.max(0, Math.min(sourceW - cropW, clampedCenter - cropW / 2));

        ctx.fillStyle = request.titleSettings?.backgroundColor || "#000000";
        ctx.fillRect(0, 0, outW, outH);
        if (innerCropRatio(aspect)) {
          drawVerticalSquareBackground(ctx, video, sx, sy, cropW, cropH, outW, outH, request.blurSquareBackground === true);
        } else {
          ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, outW, outH);
        }
        if (!staticLayer) {
          staticLayer = document.createElement("canvas");
          staticLayer.width = outW;
          staticLayer.height = outH;
          const lctx = staticLayer.getContext("2d");
          if (lctx) {
            const ctx = lctx;
        if (burnTitle) {
          drawTitle(
            ctx,
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
            ctx,
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
        }
        ctx.drawImage(staticLayer, 0, 0);
        if (request.showCaptions) drawCaption(ctx, request.captions ?? [], video.currentTime, outW, outH);

        const ratio = (video.currentTime - start) / (end - start);
        request.onProgress?.(Math.max(0, Math.min(1, ratio)));

        if (video.currentTime >= end || video.ended) {
          finish();
          return;
        }
        if (video.currentTime !== lastTime) {
          lastTime = video.currentTime;
          lastAdvance = performance.now();
        }
        schedule();
      };
      let lastTime = -1;
      let lastAdvance = performance.now();
      const schedule = () => {
        if ("requestVideoFrameCallback" in video) {
          videoFrameId = video.requestVideoFrameCallback(() => draw());
        } else {
          timerId = setTimeout(() => {
            rafId = requestAnimationFrame(draw);
          }, 1000 / 30);
        }
      };
      watchdog = setInterval(() => {
        if (settled) return;
        if (video.currentTime >= end || video.ended) {
          finish();
          return;
        }
        const stalledFor = performance.now() - lastAdvance;
        if (stalledFor > 5000 && video.paused) video.play().catch(() => {});
        if (stalledFor > 15000) {
          clearInterval(watchdog);
          settled = true;
          reject(new Error("The video stopped responding during export. Keep the screen on and try again."));
        }
      }, 1000);
      schedule();
    });

    // Fade the audio out first: cutting it off at full volume is what makes the end "pop".
    if (audioContext && sharedSourceGain) {
      const g = sharedSourceGain.gain;
      const t = audioContext.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0, t + 0.04);
      await new Promise((r) => setTimeout(r, 80));
    }
    video.pause();
    recorder.stop();
    const blob = await finished;
    request.onProgress?.(1);

    return {
      blob,
      url: URL.createObjectURL(blob),
      extension: mp4.extension,
      mimeType: blob.type,
    };
  } finally {
    cleanup();
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function safeFileName(input: string, fallback = "clip") {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || fallback;
}
