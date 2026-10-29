import { Eye, Flame, Loader2, RefreshCw, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatTimecode, type Candidate } from "@/lib/clipforge-types";
import { ClipAudioControls } from "@/components/clipforge/ClipAudioControls";

type Props = {
  candidate: Candidate;
  showTitles: boolean;
  onToggle: (id: string, selected: boolean) => void;
  onTitleChange: (id: string, title: string) => void;
  onRegenerate: (id: string) => void;
  onAudioChange: (id: string, audio: Candidate["audio"]) => void;
  onPreview?: (id: string) => void;
};

export function ClipCandidateCard({
  candidate,
  showTitles,
  onToggle,
  onTitleChange,
  onRegenerate,
  onAudioChange,
  onPreview,
}: Props) {
  const duration = candidate.end - candidate.start;
  const isCustom = !candidate.titles.includes(candidate.chosenTitle);

  return (
    <div
      className={cn(
        "panel flex h-full flex-col gap-4 p-5 transition-all",
        candidate.selected ? "border-primary/70 glow-primary" : "hover:border-border/80",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Checkbox
            checked={candidate.selected}
            onCheckedChange={(value) => onToggle(candidate.id, value === true)}
            className="mt-1"
            aria-label="Select this moment"
          />
          <div>
            <p className="font-display text-base font-semibold">
              {formatTimecode(candidate.start)} → {formatTimecode(candidate.end)}
            </p>
            <p className="text-xs text-muted-foreground">{duration}s moment</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {onPreview ? (
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => onPreview(candidate.id)}>
              <Eye className="size-3.5" /> Preview
            </Button>
          ) : null}
          <Badge variant="secondary" className="gap-1 bg-primary/15 text-primary">
            <Flame className="size-3.5" />
            {candidate.score}
          </Badge>
        </div>
      </div>

      {candidate.reason ? (
        <p className="text-sm leading-relaxed text-muted-foreground">{candidate.reason}</p>
      ) : null}

      {showTitles ? (
        <div className="mt-auto space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
              <Sparkles className="size-3.5" /> On-screen title
            </Label>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              disabled={candidate.regenerating}
              onClick={() => onRegenerate(candidate.id)}
            >
              {candidate.regenerating ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              New hooks
            </Button>
          </div>
          <Select
            value={isCustom ? "__custom" : candidate.chosenTitle}
            onValueChange={(value) => {
              if (value === "__custom") return;
              onTitleChange(candidate.id, value);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pick a hook" />
            </SelectTrigger>
            <SelectContent>
              {candidate.titles.map((title) => (
                <SelectItem key={title} value={title}>
                  {title}
                </SelectItem>
              ))}
              {isCustom ? <SelectItem value="__custom">Custom title</SelectItem> : null}
            </SelectContent>
          </Select>
          <Textarea
            value={candidate.chosenTitle}
            onChange={(event) => onTitleChange(candidate.id, event.target.value)}
            placeholder="Write your hook. Press Enter for a new line."
            className="min-h-20 resize-y text-sm"
          />
        </div>
      ) : (
        <p className="mt-auto text-xs text-muted-foreground">
          On-screen text is switched off — this clip exports clean.
        </p>
      )}
      <ClipAudioControls
        value={candidate.audio}
        onChange={(audio) => onAudioChange(candidate.id, audio)}
        compact
      />
    </div>
  );
}
