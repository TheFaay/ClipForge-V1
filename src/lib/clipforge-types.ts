export type ViralClip = {
  id: string;
  start: number;
  end: number;
  score: number;
  reason: string;
  titles: string[];
};

export type ClipAudioMode = "original" | "mix" | "replace";

export type ClipAudioSettings = {
  mode: ClipAudioMode;
  soundFile: File | null;
  soundUrl: string | null;
  originalVolume: number;
  soundVolume: number;
};

export const DEFAULT_CLIP_AUDIO: ClipAudioSettings = {
  mode: "original",
  soundFile: null,
  soundUrl: null,
  originalVolume: 1,
  soundVolume: 0.7,
};

export type Candidate = ViralClip & {
  selected: boolean;
  chosenTitle: string;
  regenerating?: boolean;
  audio: ClipAudioSettings;
};

export type AspectKey = "square" | "vertical" | "vertical-square" | "vertical-43" | "wide";

/** Inner crop ratio (w/h) for formats that place a cropped video inside a 9:16 frame. */
export function innerCropRatio(aspect: AspectKey): number | null {
  if (aspect === "vertical-square") return 1;
  if (aspect === "vertical-43") return 4 / 3;
  return null;
}

export type AspectPreset = {
  key: AspectKey;
  label: string;
  hint: string;
  ratio: string;
  width: number;
  height: number;
};

export const ASPECT_PRESETS: AspectPreset[] = [
  {
    key: "vertical",
    label: "TikTok / Reels / Shorts",
    hint: "Full-screen vertical",
    ratio: "9:16",
    width: 1080,
    height: 1920,
  },
  {
    key: "vertical-square",
    label: "Square in TikTok / Reels",
    hint: "Centered 1:1 crop in a vertical frame",
    ratio: "9:16 · 1:1 crop",
    width: 1080,
    height: 1920,
  },
  {
    key: "vertical-43",
    label: "4:3 in TikTok / Reels",
    hint: "Centered 4:3 crop in a vertical frame",
    ratio: "9:16 · 4:3 crop",
    width: 1080,
    height: 1920,
  },
  {
    key: "square",
    label: "Square feed",
    hint: "Instagram & Facebook feed",
    ratio: "1:1",
    width: 1080,
    height: 1080,
  },
  {
    key: "wide",
    label: "YouTube landscape",
    hint: "Standard widescreen",
    ratio: "16:9",
    width: 1920,
    height: 1080,
  },
];

export function aspectByKey(key: AspectKey): AspectPreset {
  return ASPECT_PRESETS.find((preset) => preset.key === key) ?? ASPECT_PRESETS[0]!;
}

export type TitleFont = { key: string; label: string; family: string; weight: number };

export const TITLE_FONTS: TitleFont[] = [
  { key: "dm-light", label: "DM Sans Light", family: "DM Sans", weight: 400 },
  { key: "dm-medium", label: "DM Sans Medium", family: "DM Sans", weight: 500 },
  { key: "lato-light", label: "Lato Light", family: "Lato", weight: 300 },
  { key: "lato-medium", label: "Lato Medium", family: "Lato", weight: 500 },
  { key: "merriweather", label: "Merriweather Light", family: "Merriweather", weight: 300 },
  { key: "nunito-medium", label: "Nunito Sans Medium", family: "Nunito Sans", weight: 500 },
  { key: "grotesk", label: "Space Grotesk", family: "Space Grotesk", weight: 700 },
  { key: "anton", label: "Anton", family: "Anton", weight: 400 },
  { key: "bebas", label: "Bebas Neue", family: "Bebas Neue", weight: 400 },
  { key: "montserrat", label: "Montserrat", family: "Montserrat", weight: 800 },
  { key: "bangers", label: "Bangers", family: "Bangers", weight: 400 },
  { key: "marker", label: "Permanent Marker", family: "Permanent Marker", weight: 400 },
  { key: "oswald", label: "Oswald", family: "Oswald", weight: 700 },
  { key: "playfair", label: "Playfair Display", family: "Playfair Display", weight: 800 },
  { key: "playfair-regular", label: "Playfair Display Regular", family: "Playfair Display", weight: 400 },
  { key: "classic", label: "Classic (Times)", family: "Times New Roman", weight: 700 },
  { key: "baskerville", label: "Classic Baskerville", family: "Libre Baskerville", weight: 700 },
  { key: "impact", label: "Classic Impact", family: "Impact", weight: 400 },
  { key: "archivo", label: "Archivo Black", family: "Archivo Black", weight: 400 },
  { key: "poppins", label: "Poppins Heavy", family: "Poppins", weight: 800 },
  { key: "slab", label: "Roboto Slab", family: "Roboto Slab", weight: 800 },
  { key: "righteous", label: "Righteous", family: "Righteous", weight: 400 },
  { key: "lobster", label: "Lobster", family: "Lobster", weight: 400 },
  { key: "pacifico", label: "Pacifico", family: "Pacifico", weight: 400 },
  { key: "caveat", label: "Caveat (handwritten)", family: "Caveat", weight: 700 },
];

export function fontByKey(key: string): TitleFont {
  return TITLE_FONTS.find((font) => font.key === key) ?? TITLE_FONTS[0]!;
}

export type LogoPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export const LOGO_POSITIONS: { key: LogoPosition; label: string }[] = [
  { key: "top-left", label: "Top left" },
  { key: "top-center", label: "Top center" },
  { key: "top-right", label: "Top right" },
  { key: "center", label: "Center" },
  { key: "bottom-left", label: "Bottom left" },
  { key: "bottom-center", label: "Bottom center" },
  { key: "bottom-right", label: "Bottom right" },
];

export type TitleStyle = "none" | "white" | "translucent";

export type CaptionCue = {
  start: number;
  end: number;
  text: string;
};

export type TitleSettings = {
  x: number;
  y: number;
  scale: number;
  maxWidth: number;
  letterSpacing: number;
  lineSpacing: number;
  textColor: string;
  strokeColor: string;
  strokeWidth: number;
  boxColor: string;
  boxOpacity: number;
  boxRadius: number;
  boxPaddingX: number;
  boxPaddingY: number;
  backgroundColor: string;
  italic?: boolean;
  /** Blurred backdrop for centered-crop vertical formats. */
  blurStrength?: number;
  blurDim?: number;
  blurZoom?: number;
};

export const DEFAULT_TITLE_SETTINGS: TitleSettings = {
  x: 50,
  y: 82,
  scale: 100,
  maxWidth: 86,
  letterSpacing: 0,
  lineSpacing: 122,
  textColor: "#ffffff",
  strokeColor: "#000000",
  strokeWidth: 9,
  boxColor: "#080a12",
  boxOpacity: 62,
  boxRadius: 32,
  boxPaddingX: 45,
  boxPaddingY: 28,
  backgroundColor: "#000000",
  italic: false,
  blurStrength: 55,
  blurDim: 26,
  blurZoom: 115,
};

export const TITLE_STYLES: { key: TitleStyle; label: string }[] = [
  { key: "translucent", label: "Dark box, white text" },
  { key: "white", label: "White box, black text" },
  { key: "none", label: "Text only" },
];

export type RenderedOutput = {
  id: string;
  title: string;
  start: number;
  end: number;
  aspect: AspectKey;
  aspectRatio: string;
  blob: Blob;
  url: string;
  extension: string;
};

export function formatTimecode(totalSeconds: number) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const pad = (value: number) => value.toString().padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`;
}

export function parseTimecode(value: string): number | null {
  const parts = value
    .trim()
    .split(":")
    .map((part) => Number(part));
  if (!parts.length || parts.some((part) => !Number.isFinite(part) || part < 0)) return null;
  const [a = 0, b = 0, c = 0] = parts;
  if (parts.length === 3) return a * 3600 + b * 60 + c;
  if (parts.length === 2) return a * 60 + b;
  return a;
}
