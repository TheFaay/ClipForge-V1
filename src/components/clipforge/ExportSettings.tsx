import { Captions, Crosshair, ImagePlus, Minus, Palette, Plus, Ratio, Sparkles, Type, X } from "lucide-react";

import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  ASPECT_PRESETS,
  LOGO_POSITIONS,
  TITLE_FONTS,
  TITLE_STYLES,
  type AspectKey,
  type LogoPosition,
  type TitleSettings,
  type TitleStyle,
} from "@/lib/clipforge-types";
import { Slider } from "@/components/ui/slider";

const PLACEMENT_PRESETS = [
  { label: "Top left", x: 12, y: 12 },
  { label: "Top center", x: 50, y: 12 },
  { label: "Top right", x: 88, y: 12 },
  { label: "Center", x: 50, y: 50 },
  { label: "Bottom left", x: 12, y: 88 },
  { label: "Bottom center", x: 50, y: 88 },
  { label: "Bottom right", x: 88, y: 88 },
] as const;

type RangeControlProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  precise?: boolean;
  onChange: (value: number) => void;
};

function RangeControl({ label, value, min, max, suffix = "%", precise = false, onChange }: RangeControlProps) {
  const updateValue = (next: number) => onChange(Math.max(min, Math.min(max, next)));

  if (precise) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className="text-xs tabular-nums text-muted-foreground">{value}{suffix}</span>
        </div>
        <Slider
          aria-label={label}
          value={[value]}
          min={min}
          max={max}
          step={1}
          onValueChange={([next]) => updateValue(next ?? value)}
        />
        <div className="grid grid-cols-[2rem_minmax(0,1fr)_2rem] items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
            aria-label={`Decrease ${label}`}
            disabled={value <= min}
            onClick={() => updateValue(value - 1)}
          >
            <Minus className="size-3.5" />
          </Button>
          <div className="relative">
            <input
              type="number"
              aria-label={`${label} exact value`}
              value={value}
              min={min}
              max={max}
              step={1}
              onChange={(event) => {
                const next = event.currentTarget.valueAsNumber;
                if (Number.isFinite(next)) updateValue(next);
              }}
              className="h-8 w-full rounded-md border border-input bg-background px-2 pr-7 text-center text-sm tabular-nums text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
            aria-label={`Increase ${label}`}
            disabled={value >= max}
            onClick={() => updateValue(value + 1)}
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[5.5rem_1fr_3.5rem] items-center gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Slider
        aria-label={label}
        value={[value]}
        min={min}
        max={max}
        step={1}
        onValueChange={([next]) => onChange(next ?? value)}
      />
      <span className="text-right text-xs tabular-nums text-muted-foreground">
        {value}{suffix}
      </span>
    </div>
  );
}

type PlacementControlsProps = {
  x: number;
  y: number;
  onChange: (x: number, y: number) => void;
};

function PlacementControls({ x, y, onChange }: PlacementControlsProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {PLACEMENT_PRESETS.map((preset) => (
          <Button
            key={preset.label}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange(preset.x, preset.y)}
            className={cn(
              "rounded-lg border px-2.5 py-1 text-xs transition-colors",
              x === preset.x && y === preset.y
                ? "border-primary/70 bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:border-primary/40",
            )}
          >
            {preset.label}
          </Button>
        ))}
      </div>
      <RangeControl label="Horizontal" value={x} min={0} max={100} onChange={(next) => onChange(next, y)} />
      <RangeControl label="Vertical" value={y} min={0} max={100} onChange={(next) => onChange(x, next)} />
    </div>
  );
}

type Props = {
  aspects: AspectKey[];
  onToggleAspect: (key: AspectKey) => void;
  burnTitle: boolean;
  onBurnTitleChange: (value: boolean) => void;
  fontKey: string;
  onFontChange: (key: string) => void;
  titleSettings: TitleSettings;
  onTitleSettingsChange: (value: TitleSettings) => void;
  overlayUrl: string | null;
  onOverlayChange: (file: File | null) => void;
  overlayPosition: LogoPosition;
  onOverlayPositionChange: (value: LogoPosition) => void;
  overlayScale: number;
  onOverlayScaleChange: (value: number) => void;
  overlayOpacity: number;
  onOverlayOpacityChange: (value: number) => void;
  overlayX: number;
  overlayY: number;
  onOverlayCoordinatesChange: (x: number, y: number) => void;
  titleStyle: TitleStyle;
  onTitleStyleChange: (value: TitleStyle) => void;
  showCaptions: boolean;
  onShowCaptionsChange: (value: boolean) => void;
  blurSquareBackground: boolean;
  onBlurSquareBackgroundChange: (value: boolean) => void;
};

export function ExportSettings({
  aspects,
  onToggleAspect,
  burnTitle,
  onBurnTitleChange,
  fontKey,
  onFontChange,
  titleSettings,
  onTitleSettingsChange,
  overlayUrl,
  onOverlayChange,
  overlayPosition,
  onOverlayPositionChange,
  overlayScale,
  onOverlayScaleChange,
  overlayOpacity,
  onOverlayOpacityChange,
  overlayX,
  overlayY,
  onOverlayCoordinatesChange,
  titleStyle,
  onTitleStyleChange,
  showCaptions,
  onShowCaptionsChange,
  blurSquareBackground,
  onBlurSquareBackgroundChange,
}: Props) {
  return (
    <section className="panel space-y-5 p-5">
      <div className="space-y-3">
        <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
          <Ratio className="size-3.5" /> Export formats
        </Label>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ASPECT_PRESETS.map((preset) => {
            const active = aspects.includes(preset.key);
            return (
              <button
                key={preset.key}
                type="button"
                onClick={() => onToggleAspect(preset.key)}
                aria-pressed={active}
                className={cn(
                  "rounded-xl border p-3 text-left transition-all",
                  active
                    ? "border-primary/70 bg-primary/10 glow-primary"
                    : "border-border bg-surface/50 hover:border-primary/40",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{preset.ratio}</span>
                  <span
                    className={cn(
                      "rounded-sm border",
                      active ? "border-primary bg-primary/30" : "border-muted-foreground/50",
                    )}
                    style={{
                      width: preset.key === "wide" ? 22 : preset.key === "square" ? 16 : 11,
                      height: preset.key === "wide" ? 12 : preset.key === "square" ? 16 : 20,
                    }}
                  />
                </div>
                <p className="mt-1 text-sm">{preset.label}</p>
                <p className="text-xs text-muted-foreground">{preset.hint}</p>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Every selected moment is exported once per format you pick here.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
        <div className="flex items-center gap-3">
          <Switch id="burn-title" checked={burnTitle} onCheckedChange={onBurnTitleChange} />
          <Label htmlFor="burn-title" className="flex items-center gap-1.5">
            <Captions className="size-4 text-accent" /> Burn the title onto the video
          </Label>
        </div>
        {!burnTitle ? (
          <p className="text-xs text-muted-foreground">Clips export clean, with no text on screen.</p>
        ) : null}
      </div>

      <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-3">
          <Label htmlFor="speech-captions" className="flex items-center gap-2">
            <Captions className="size-4 text-accent" /> Speech captions
          </Label>
          <Switch id="speech-captions" checked={showCaptions} onCheckedChange={onShowCaptionsChange} />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-3">
          <Label htmlFor="blur-square-background" className="flex items-center gap-2">
            <Sparkles className="size-4 text-accent" /> Blur cropped background
          </Label>
          <Switch
            id="blur-square-background"
            checked={blurSquareBackground}
            disabled={!aspects.includes("vertical-square") && !aspects.includes("vertical-43")}
            onCheckedChange={onBlurSquareBackgroundChange}
          />
        </div>
      </div>
      {blurSquareBackground && (aspects.includes("vertical-square") || aspects.includes("vertical-43")) ? (
        <div className="grid gap-4 rounded-lg border border-border p-3 sm:grid-cols-3">
          <RangeControl precise label="Blur strength" value={titleSettings.blurStrength ?? 55} min={0} max={100} onChange={(blurStrength) => onTitleSettingsChange({ ...titleSettings, blurStrength })} />
          <RangeControl precise label="Darken" value={titleSettings.blurDim ?? 26} min={0} max={85} onChange={(blurDim) => onTitleSettingsChange({ ...titleSettings, blurDim })} />
          <RangeControl precise label="Background zoom" value={titleSettings.blurZoom ?? 115} min={100} max={250} onChange={(blurZoom) => onTitleSettingsChange({ ...titleSettings, blurZoom })} />
        </div>
      ) : null}

      {burnTitle ? (
        <div className="space-y-3 border-t border-border pt-4">
          <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
            <Type className="size-3.5" /> Title font
          </Label>
          <div className="flex items-center gap-3">
            <Switch
              id="italic-title"
              checked={!!titleSettings.italic}
              onCheckedChange={(italic) => onTitleSettingsChange({ ...titleSettings, italic })}
            />
            <Label htmlFor="italic-title" className="italic">Italic text</Label>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TITLE_FONTS.map((font) => (
              <button
                key={font.key}
                type="button"
                onClick={() => onFontChange(font.key)}
                aria-pressed={fontKey === font.key}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left transition-colors",
                  fontKey === font.key
                    ? "border-primary/70 bg-primary/15"
                    : "border-border hover:border-primary/40",
                )}
              >
                <span
                  className="block truncate text-lg leading-tight"
                  style={{ fontFamily: `"${font.family}"`, fontWeight: font.weight, fontStyle: titleSettings.italic ? "italic" : "normal" }}
                >
                  Hook text
                </span>
                <span className="text-xs text-muted-foreground">{font.label}</span>
              </button>
            ))}
          </div>
          <Label className="flex items-center gap-1.5 pt-2 text-xs uppercase tracking-wide text-muted-foreground">
            Text background
          </Label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {TITLE_STYLES.map((style) => (
              <button
                key={style.key}
                type="button"
                onClick={() => {
                  onTitleStyleChange(style.key);
                  if (style.key === "white") {
                    onTitleSettingsChange({ ...titleSettings, textColor: titleSettings.textColor === "#ffffff" ? "#000000" : titleSettings.textColor, boxColor: "#ffffff", boxOpacity: 100 });
                  } else if (style.key === "translucent") {
                    onTitleSettingsChange({ ...titleSettings, textColor: titleSettings.textColor === "#000000" ? "#ffffff" : titleSettings.textColor, boxColor: "#080a12", boxOpacity: 62 });
                  }
                }}
                aria-pressed={titleStyle === style.key}
                className={cn(
                  "flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                  titleStyle === style.key
                    ? "border-primary/70 bg-primary/15"
                    : "border-border hover:border-primary/40",
                )}
              >
                <span
                  className={cn(
                    "rounded px-2 py-0.5 text-sm font-bold",
                    style.key === "white" && "bg-foreground text-background",
                    style.key === "translucent" && "bg-background/70 text-foreground",
                    style.key === "none" && "text-foreground [text-shadow:0_1px_3px_rgb(0_0_0/0.9)]",
                  )}
                >
                  Aa
                </span>
                <span className="text-xs text-muted-foreground">{style.label}</span>
              </button>
            ))}
          </div>
          {titleStyle !== "none" ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">
                Box color
                <input
                  aria-label="Text box color"
                  type="color"
                  value={titleSettings.boxColor}
                  onChange={(event) => onTitleSettingsChange({ ...titleSettings, boxColor: event.target.value })}
                  className="h-7 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                />
              </label>
              <div className="rounded-lg border border-border px-3 py-2">
                <RangeControl precise label="Box opacity" value={titleSettings.boxOpacity} min={0} max={100} suffix="%" onChange={(boxOpacity) => onTitleSettingsChange({ ...titleSettings, boxOpacity })} />
              </div>
              <div className="rounded-lg border border-border px-3 py-2">
                <RangeControl precise label="Corner radius" value={titleSettings.boxRadius} min={0} max={100} suffix="%" onChange={(boxRadius) => onTitleSettingsChange({ ...titleSettings, boxRadius })} />
              </div>
              <div className="rounded-lg border border-border px-3 py-2">
                <RangeControl precise label="Box width spacing" value={titleSettings.boxPaddingX ?? 45} min={0} max={150} suffix="%" onChange={(boxPaddingX) => onTitleSettingsChange({ ...titleSettings, boxPaddingX })} />
              </div>
              <div className="rounded-lg border border-border px-3 py-2">
                <RangeControl precise label="Box height spacing" value={titleSettings.boxPaddingY ?? 28} min={0} max={150} suffix="%" onChange={(boxPaddingY) => onTitleSettingsChange({ ...titleSettings, boxPaddingY })} />
              </div>
            </div>
          ) : null}
          <div className="grid gap-5 border-t border-border pt-4 lg:grid-cols-2">
            <div className="space-y-3">
              <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                <Crosshair className="size-3.5" /> Text position
              </Label>
              <PlacementControls
                x={titleSettings.x}
                y={titleSettings.y}
                onChange={(x, y) => onTitleSettingsChange({ ...titleSettings, x, y })}
              />
            </div>
            <div className="space-y-3">
              <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                <Type className="size-3.5" /> Text layout
              </Label>
              <RangeControl label="Scale" value={titleSettings.scale} min={30} max={200} onChange={(scale) => onTitleSettingsChange({ ...titleSettings, scale })} />
              <RangeControl label="Text width" value={titleSettings.maxWidth} min={20} max={100} onChange={(maxWidth) => onTitleSettingsChange({ ...titleSettings, maxWidth })} />
              <RangeControl label="Characters" value={titleSettings.letterSpacing} min={-20} max={40} onChange={(letterSpacing) => onTitleSettingsChange({ ...titleSettings, letterSpacing })} />
              <RangeControl label="Lines" value={titleSettings.lineSpacing} min={70} max={220} onChange={(lineSpacing) => onTitleSettingsChange({ ...titleSettings, lineSpacing })} />
            </div>
          </div>
          <div className="space-y-3 border-t border-border pt-4">
            <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
              <Palette className="size-3.5" /> Text and outline
            </Label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">
                Text color
                <input
                  aria-label="Text color"
                  type="color"
                  value={titleSettings.textColor}
                  onChange={(event) => onTitleSettingsChange({ ...titleSettings, textColor: event.target.value })}
                  className="h-7 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">
                Outline color
                <input
                  aria-label="Outline color"
                  type="color"
                  value={titleSettings.strokeColor}
                  onChange={(event) => onTitleSettingsChange({ ...titleSettings, strokeColor: event.target.value })}
                  className="h-7 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                />
              </label>
              <div className="rounded-lg border border-border px-3 py-2">
                <RangeControl label="Outline" value={titleSettings.strokeWidth} min={0} max={30} suffix="%" onChange={(strokeWidth) => onTitleSettingsChange({ ...titleSettings, strokeWidth })} />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">
        Video background color (shows around cropped or square video)
        <input
          aria-label="Video background color"
          type="color"
          value={titleSettings.backgroundColor}
          onChange={(event) => onTitleSettingsChange({ ...titleSettings, backgroundColor: event.target.value })}
          className="h-7 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
        />
      </label>

      <div className="space-y-3 border-t border-border pt-4">
        <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
          <ImagePlus className="size-3.5" /> Custom image (logo / watermark)
        </Label>
        {overlayUrl ? (
          <div className="flex flex-wrap items-start gap-4">
            <div className="relative rounded-lg border border-border bg-surface/50 p-2">
              <img src={overlayUrl} alt="Custom overlay" className="h-16 w-auto max-w-32 object-contain" />
              <button
                type="button"
                onClick={() => onOverlayChange(null)}
                className="absolute -right-2 -top-2 rounded-full border border-border bg-background p-1"
                aria-label="Remove image"
              >
                <X className="size-3" />
              </button>
            </div>
            <div className="min-w-56 flex-1 space-y-3">
              <PlacementControls
                x={overlayX}
                y={overlayY}
                onChange={(x, y) => {
                  onOverlayCoordinatesChange(x, y);
                  const matching = LOGO_POSITIONS.find((position) => {
                    const preset = PLACEMENT_PRESETS.find((item) => item.label === position.label);
                    return preset?.x === x && preset.y === y;
                  });
                  if (matching) onOverlayPositionChange(matching.key);
                }}
              />
              <div className="sr-only" aria-hidden="true">
                {LOGO_POSITIONS.map((pos) => (
                  <button
                    key={pos.key}
                    type="button"
                    onClick={() => onOverlayPositionChange(pos.key)}
                    aria-pressed={overlayPosition === pos.key}
                    className={cn(
                      "rounded-lg border px-2.5 py-1 text-xs transition-colors",
                      overlayPosition === pos.key
                        ? "border-primary/70 bg-primary/15 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/40",
                    )}
                  >
                    {pos.label}
                  </button>
                ))}
              </div>
              <RangeControl label="Size" value={Math.round(overlayScale * 100)} min={8} max={200} onChange={(value) => onOverlayScaleChange(value / 100)} />
              <RangeControl label="Opacity" value={Math.round(overlayOpacity * 100)} min={5} max={100} onChange={(value) => onOverlayOpacityChange(value / 100)} />
            </div>
          </div>
        ) : (
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground hover:border-primary/40">
            <ImagePlus className="size-4" /> Add a transparent PNG or WebP image
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onOverlayChange(f);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>
    </section>
  );
}
