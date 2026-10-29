import { Music2, Volume2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ClipAudioSettings } from "@/lib/clipforge-types";

type Props = {
  value: ClipAudioSettings;
  onChange: (value: ClipAudioSettings) => void;
  compact?: boolean;
};

function VolumeControl({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr_3rem] items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Slider
        aria-label={label}
        min={0}
        max={100}
        step={1}
        value={[Math.round(value * 100)]}
        onValueChange={([next]) => onChange((next ?? value * 100) / 100)}
      />
      <span className="text-right text-xs tabular-nums text-muted-foreground">{Math.round(value * 100)}%</span>
    </div>
  );
}

export function ClipAudioControls({ value, onChange, compact = false }: Props) {
  const updateFile = (file: File | null) => {
    if (value.soundUrl) URL.revokeObjectURL(value.soundUrl);
    onChange({
      ...value,
      soundFile: file,
      soundUrl: file ? URL.createObjectURL(file) : null,
      mode: file ? (value.mode === "original" ? "mix" : value.mode) : "original",
    });
  };

  return (
    <div className="space-y-3 border-t border-border pt-3">
      <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        <Music2 className="size-3.5" /> Clip audio
      </Label>
      {value.soundFile ? (
        <div className="flex items-center gap-2">
          <audio src={value.soundUrl ?? undefined} controls preload="metadata" className="h-9 min-w-0 flex-1" />
          <Button type="button" variant="ghost" size="icon" aria-label="Remove added sound" onClick={() => updateFile(null)}>
            <X className="size-4" />
          </Button>
        </div>
      ) : (
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:border-primary/40">
          <Music2 className="size-4" /> Add sound to this clip
          <input
            type="file"
            accept="audio/*"
            className="sr-only"
            onChange={(event) => {
              const next = event.target.files?.[0];
              if (next) updateFile(next);
              event.target.value = "";
            }}
          />
        </label>
      )}
      {value.soundFile ? (
        <Select value={value.mode} onValueChange={(mode) => onChange({ ...value, mode: mode as ClipAudioSettings["mode"] })}>
          <SelectTrigger aria-label="Audio mode" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="original">Original audio only</SelectItem>
            <SelectItem value="mix">Mix original + added sound</SelectItem>
            <SelectItem value="replace">Added sound only</SelectItem>
          </SelectContent>
        </Select>
      ) : null}
      <div className={compact ? "space-y-2" : "grid gap-2 sm:grid-cols-2"}>
        {value.mode !== "replace" ? (
          <VolumeControl label="Original" value={value.originalVolume} onChange={(originalVolume) => onChange({ ...value, originalVolume })} />
        ) : null}
        {value.soundFile && value.mode !== "original" ? (
          <VolumeControl label="Added sound" value={value.soundVolume} onChange={(soundVolume) => onChange({ ...value, soundVolume })} />
        ) : null}
      </div>
    </div>
  );
}