import { useEffect, useMemo, useRef, useState } from "react";
import { CircleDot, Eye, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { drawPreviewFrame } from "@/lib/clip-render";
import { aspectByKey, formatTimecode, type AspectKey, type CaptionCue, type LogoPosition, type TitleSettings, type TitleStyle } from "@/lib/clipforge-types";

export type PreviewItem = { id: string; label: string; start: number; title: string };

type Props = {
  file: File | null;
  items: PreviewItem[];
  itemId: string;
  onItemChange: (id: string) => void;
  aspect: AspectKey;
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
  blurSquareBackground: boolean;
  onMarkClip?: (start: number, end: number) => void;
};

export function CompositionPreview(props: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceUrl = useMemo(() => (props.file ? URL.createObjectURL(props.file) : null), [props.file]);
  const selected = props.items.find((item) => item.id === props.itemId) ?? props.items[0];
  const preset = aspectByKey(props.aspect);
  const [markStart, setMarkStart] = useState<number | null>(null);
  const [now, setNow] = useState(0);

  const optionsRef = useRef(props);
  optionsRef.current = props;
  const titleRef = useRef(selected?.title ?? "");
  titleRef.current = selected?.title ?? "";

  useEffect(() => () => { if (sourceUrl) URL.revokeObjectURL(sourceUrl); }, [sourceUrl]);

  // Seek only when the chosen clip actually changes.
  const selectedId = selected?.id;
  const selectedStart = selected?.start;
  useEffect(() => {
    const video = videoRef.current;
    if (!video || selectedStart === undefined) return;
    const seek = () => { video.currentTime = selectedStart; };
    if (video.readyState >= 1) seek();
    else video.addEventListener("loadedmetadata", seek, { once: true });
    return () => video.removeEventListener("loadedmetadata", seek);
  }, [selectedId, selectedStart, sourceUrl]);

  useEffect(() => {
    let frame = 0;
    let lastTick = 0;
    const draw = (time: number) => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= 2) {
        const p = optionsRef.current;
        drawPreviewFrame(canvas, video, {
          aspect: p.aspect,
          title: titleRef.current,
          burnTitle: p.burnTitle,
          fontKey: p.fontKey,
          titleSettings: p.titleSettings,
          titleStyle: p.titleStyle,
          overlay: p.overlay,
          overlayPosition: p.overlayPosition,
          overlayScale: p.overlayScale,
          overlayOpacity: p.overlayOpacity,
          overlayX: p.overlayX,
          overlayY: p.overlayY,
          showCaptions: p.showCaptions,
          captions: p.captions,
          currentTime: video.currentTime,
          blurSquareBackground: p.blurSquareBackground,
        });
        if (time - lastTick > 250) {
          lastTick = time;
          setNow(video.currentTime);
        }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [sourceUrl]);

  if (!sourceUrl || !selected) return null;

  const handleMark = () => {
    const video = videoRef.current;
    if (!video || !props.onMarkClip) return;
    const t = Math.round(video.currentTime);
    if (markStart === null) {
      setMarkStart(t);
      if (video.paused) void video.play().catch(() => {});
      return;
    }
    if (t <= markStart) return;
    props.onMarkClip(markStart, t);
    setMarkStart(null);
  };

  return (
    <section className="panel space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
          <Eye className="size-3.5" /> Output preview
        </Label>
        {props.items.length > 1 ? (
          <Select value={selected.id} onValueChange={props.onItemChange}>
            <SelectTrigger aria-label="Preview clip" className="w-full sm:w-72"><SelectValue /></SelectTrigger>
            <SelectContent>{props.items.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
        ) : null}
      </div>
      <div className="grid items-center gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="overflow-hidden rounded-lg border border-border bg-background">
          <canvas
            ref={canvasRef}
            aria-label="Output composition preview"
            className="mx-auto block max-h-[32rem] w-auto max-w-full bg-background"
            style={{ aspectRatio: `${preset.width} / ${preset.height}` }}
          />
        </div>
        <div className="space-y-3">
          <video ref={videoRef} src={sourceUrl} controls playsInline preload="metadata" className="w-full rounded-lg bg-background" />
          {props.onMarkClip ? (
            <div className="space-y-2">
              <Button
                type="button"
                className="w-full"
                variant={markStart === null ? "default" : "destructive"}
                onClick={handleMark}
                disabled={markStart !== null && Math.round(now) <= markStart}
              >
                {markStart === null ? <CircleDot className="size-4" /> : <Square className="size-4" />}
                {markStart === null ? "Mark clip start" : `Mark clip end (${Math.max(0, Math.round(now) - markStart)}s)`}
              </Button>
              <p className="text-xs text-muted-foreground">
                {markStart === null
                  ? "Play the video and tap to set a start point. Tap again to set the end — a new clip is added below."
                  : `Started at ${formatTimecode(markStart)}. Tap again to finish this clip.`}
              </p>
              {markStart !== null ? (
                <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => setMarkStart(null)}>Cancel</Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">The canvas shows the selected crop, text, and image. Use the player to preview another frame.</p>
    </section>
  );
}
