import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Clapperboard,
  Loader2,
  Plus,
  Scissors,
  Sparkles,
  Trash2,
  Wand2,
  Youtube,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";
import { ClipCandidateCard } from "@/components/clipforge/ClipCandidateCard";
import { ClipAudioControls } from "@/components/clipforge/ClipAudioControls";
import { CompositionPreview, type PreviewItem } from "@/components/clipforge/CompositionPreview";
import { ClipGallery } from "@/components/clipforge/ClipGallery";
import { ExportSettings } from "@/components/clipforge/ExportSettings";
import { UploadZone } from "@/components/clipforge/UploadZone";
import { buildCaptionCues, loadOverlayImage, renderClip, unlockAudio } from "@/lib/clip-render";
import type { ClipAudioSettings, LogoPosition, TitleSettings, TitleStyle } from "@/lib/clipforge-types";
import {
  DEFAULT_CLIP_AUDIO,
  DEFAULT_TITLE_SETTINGS,
  aspectByKey,
  parseTimecode,
  formatTimecode,
  type AspectKey,
  type Candidate,
  type RenderedOutput,
} from "@/lib/clipforge-types";
import { analyzeViralClips, regenerateTitles } from "@/lib/analyze.functions";
import { buildTranscript } from "@/lib/transcribe-client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ClipForge V3 — AI viral clipper for TikTok, Shorts & YouTube" },
      {
        name: "description",
        content:
          "Upload a stream, let AI find the viral moments, then export smooth MP4 clips in full-screen 9:16, centered square-in-vertical, 1:1 or 16:9 formats.",
      },
      {
        property: "og:title",
        content: "ClipForge V3 — AI viral clipper for TikTok, Shorts & YouTube",
      },
      {
        property: "og:description",
        content:
          "AI picks viral moments and exports smooth MP4 clips for TikTok, Reels, square feeds and YouTube with custom text and image overlays.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ClipForge,
});

const YOUTUBE_PATTERN = /^(https?:\/\/)?((www|m)\.)?(youtube\.com|youtu\.be)\/.+/i;

type ManualRow = { id: string; start: string; end: string; title: string; audio: ClipAudioSettings; working?: boolean };

type Job = {
  index: number;
  total: number;
  stage: string;
  progress: number;
  title: string;
  ratio: string;
};

type RenderItem = { id: string; start: number; end: number; title: string; audio: ClipAudioSettings };

function excerptFor(transcript: string, start: number, end: number) {
  if (!transcript) return "";
  const lines = transcript.split("\n");
  const picked: string[] = [];
  for (const line of lines) {
    const match = /^\[(\d+):(\d+)(?::(\d+))?\]/.exec(line);
    if (!match) continue;
    const a = Number(match[1]);
    const b = Number(match[2]);
    const c = match[3] === undefined ? null : Number(match[3]);
    const seconds = c === null ? a * 60 + b : a * 3600 + b * 60 + c;
    if (seconds >= start - 120 && seconds <= end + 60) picked.push(line);
  }
  return picked.join("\n");
}

function ClipForge() {
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeStatus, setAnalyzeStatus] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [outputs, setOutputs] = useState<RenderedOutput[]>([]);
  const [transcript, setTranscript] = useState("");
  const [aspects, setAspects] = useState<AspectKey[]>(["vertical"]);
  const [burnTitle, setBurnTitle] = useState(true);
  const [fontKey, setFontKey] = useState("grotesk");
  const [titleSettings, setTitleSettings] = useState<TitleSettings>(DEFAULT_TITLE_SETTINGS);
  const [overlayFile, setOverlayFile] = useState<File | null>(null);
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null);
  const [overlayPosition, setOverlayPosition] = useState<LogoPosition>("top-right");
  const [overlayScale, setOverlayScale] = useState(0.2);
  const [overlayOpacity, setOverlayOpacity] = useState(1);
  const [overlayX, setOverlayX] = useState(88);
  const [overlayY, setOverlayY] = useState(12);
  const [titleStyle, setTitleStyle] = useState<TitleStyle>("translucent");
  const [showCaptions, setShowCaptions] = useState(false);
  const [blurSquareBackground, setBlurSquareBackground] = useState(false);
  const [previewOverlay, setPreviewOverlay] = useState<HTMLImageElement | null>(null);
  const [aiPreviewId, setAiPreviewId] = useState("source");
  const [manualPreviewId, setManualPreviewId] = useState("");
  const handleOverlayChange = (next: File | null) => {
    if (overlayUrl) URL.revokeObjectURL(overlayUrl);
    setOverlayFile(next);
    setOverlayUrl(next ? URL.createObjectURL(next) : null);
  };
  const [jsonImport, setJsonImport] = useState("");
  const [manualRows, setManualRows] = useState<ManualRow[]>([
    { id: crypto.randomUUID(), start: "0:00", end: "0:15", title: "", audio: { ...DEFAULT_CLIP_AUDIO } },
  ]);

  useEffect(() => {
    if (!overlayFile) {
      setPreviewOverlay(null);
      return;
    }
    let active = true;
    loadOverlayImage(overlayFile).then((image) => { if (active) setPreviewOverlay(image); }).catch(() => {});
    return () => { active = false; };
  }, [overlayFile]);

  const outputsRef = useRef<RenderedOutput[]>([]);
  outputsRef.current = outputs;

  useEffect(() => {
    return () => {
      outputsRef.current.forEach((output) => URL.revokeObjectURL(output.url));
    };
  }, []);

  const handleSelectFile = useCallback((next: File | null) => {
    setFile(next);
    setDuration(null);
    setCandidates([]);
    setTranscript("");
    if (!next) return;

    const probe = document.createElement("video");
    const url = URL.createObjectURL(next);
    probe.preload = "metadata";
    probe.src = url;
    probe.onloadedmetadata = () => {
      setDuration(probe.duration);
      URL.revokeObjectURL(url);
    };
    probe.onerror = () => {
      URL.revokeObjectURL(url);
      toast.error("That video couldn't be read. Try an MP4 or MOV file.");
      setFile(null);
    };
  }, []);

  const selectedCount = useMemo(
    () => candidates.filter((candidate) => candidate.selected).length,
    [candidates],
  );

  const toggleAspect = (key: AspectKey) => {
    setAspects((current) =>
      current.includes(key)
        ? current.length > 1
          ? current.filter((item) => item !== key)
          : current
        : [...current, key],
    );
  };

  const handleAnalyze = async (retry = false) => {
    if (!file || !duration) {
      toast.error("Upload your video first.");
      return;
    }
    const url = youtubeUrl.trim();
    if (url && !YOUTUBE_PATTERN.test(url)) {
      toast.error("That YouTube link doesn't look right.");
      return;
    }

    setAnalyzing(true);
    setAnalyzeStatus("reading the audio");
    try {
      let text = retry ? transcript : "";
      if (!text) {
        try {
          text = await buildTranscript(file, (_ratio, label) => setAnalyzeStatus(label));
          setTranscript(text);
        } catch {
          toast.message("Couldn't listen to the audio — using your notes instead.");
        }
      }
      const previous = retry ? candidates.map((c) => ({ start: c.start, end: c.end })) : [];
      setAnalyzeStatus("picking the best moments");

      const response = await analyzeViralClips({
        data: {
          youtubeUrl: url ? (url.startsWith("http") ? url : `https://${url}`) : "",
          durationSeconds: duration,
          ...(notes.trim() ? { transcriptHint: notes.trim() } : {}),
          ...(text ? { transcript: text } : {}),
          ...(previous.length ? { exclude: previous, seed: Math.random().toString(36).slice(2, 10) } : {}),
        },
      });
      setCandidates(
        response.clips.map((clip) => ({
          ...clip,
          selected: true,
          chosenTitle: clip.titles[0] ?? "",
          audio: { ...DEFAULT_CLIP_AUDIO },
        })),
      );
      toast.success(`Found ${response.clips.length} viral moments.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The analysis failed. Please try again.");
    } finally {
      setAnalyzing(false);
      setAnalyzeStatus("");
    }
  };

  const handleRegenerate = async (id: string) => {
    const candidate = candidates.find((item) => item.id === id);
    if (!candidate) return;
    setCandidates((current) =>
      current.map((item) => (item.id === id ? { ...item, regenerating: true } : item)),
    );
    try {
      const excerpt = excerptFor(transcript, candidate.start, candidate.end);
      const response = await regenerateTitles({
        data: {
          reason: candidate.reason,
          durationSeconds: candidate.end - candidate.start,
          ...(excerpt ? { transcriptExcerpt: excerpt } : {}),
          ...(notes.trim() ? { context: notes.trim() } : {}),
          avoid: candidate.titles.slice(0, 10),
        },
      });
      setCandidates((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                titles: response.titles,
                chosenTitle: response.titles[0] ?? item.chosenTitle,
                regenerating: false,
              }
            : item,
        ),
      );
      toast.success("Fresh hooks ready.");
    } catch (error) {
      setCandidates((current) =>
        current.map((item) => (item.id === id ? { ...item, regenerating: false } : item)),
      );
      toast.error(error instanceof Error ? error.message : "Couldn't write new hooks.");
    }
  };

  const handleManualHooks = async (rowId: string) => {
    const row = manualRows.find((item) => item.id === rowId);
    if (!row) return;
    const start = parseTimecode(row.start);
    const end = parseTimecode(row.end);
    if (start === null || end === null || end <= start) {
      toast.error("Set a valid start and end time first.");
      return;
    }
    setManualRows((current) =>
      current.map((item) => (item.id === rowId ? { ...item, working: true } : item)),
    );
    try {
      const excerpt = excerptFor(transcript, start, end);
      const response = await regenerateTitles({
        data: {
          reason: row.title || "a highlight from a longer video",
          durationSeconds: end - start,
          ...(excerpt ? { transcriptExcerpt: excerpt } : {}),
          ...(notes.trim() ? { context: notes.trim() } : {}),
          ...(row.title ? { avoid: [row.title] } : {}),
        },
      });
      setManualRows((current) =>
        current.map((item) =>
          item.id === rowId
            ? { ...item, title: response.titles[0] ?? item.title, working: false }
            : item,
        ),
      );
    } catch (error) {
      setManualRows((current) =>
        current.map((item) => (item.id === rowId ? { ...item, working: false } : item)),
      );
      toast.error(error instanceof Error ? error.message : "Couldn't write a hook.");
    }
  };

  const runRenderQueue = async (items: RenderItem[]) => {
    if (!file) {
      toast.error("Upload your video first.");
      return;
    }
    if (!items.length) {
      toast.error("Pick at least one moment to render.");
      return;
    }
    if (!aspects.length) {
      toast.error("Pick at least one export format.");
      return;
    }

    unlockAudio();
    let captionTranscript = transcript;
    if (showCaptions && !captionTranscript) {
      try {
        setJob({ index: 0, total: items.length * aspects.length, stage: "Preparing captions", progress: 0, title: "Speech captions", ratio: "" });
        captionTranscript = await buildTranscript(file, (progress, stage) =>
          setJob((current) => current ? { ...current, progress, stage } : current),
        );
        setTranscript(captionTranscript);
      } catch {
        toast.message("Speech captions were unavailable — exporting without them.");
      }
    }
    const captionCues = buildCaptionCues(captionTranscript, duration ?? 0);
    let overlay: HTMLImageElement | null = null;
    if (overlayFile) {
      try {
        overlay = await loadOverlayImage(overlayFile);
      } catch {
        toast.error("That image couldn't be read — exporting without it.");
      }
    }
    const queue = items.flatMap((item) => aspects.map((aspect) => ({ item, aspect })));
    const results: RenderedOutput[] = [];
    try {
      for (const [index, entry] of queue.entries()) {
        const preset = aspectByKey(entry.aspect);
        setJob({
          index: index + 1,
          total: queue.length,
          stage: "Starting",
          progress: 0,
          title: entry.item.title,
          ratio: preset.ratio,
        });
        const rendered = await renderClip({
          file,
          start: entry.item.start,
          end: entry.item.end,
          title: burnTitle ? entry.item.title : "",
          burnTitle,
          aspect: entry.aspect,
          fontKey,
          titleSettings,
          overlay,
          overlayPosition,
          overlayScale,
          overlayOpacity,
          overlayX,
          overlayY,
          titleStyle,
          audio: entry.item.audio,
          showCaptions: showCaptions && captionCues.length > 0,
          captions: captionCues,
          blurSquareBackground,
          onStage: (stage) => setJob((current) => (current ? { ...current, stage } : current)),
          onProgress: (progress) =>
            setJob((current) => (current ? { ...current, progress } : current)),
        });
        results.push({
          id: `${entry.item.id}-${entry.aspect}-${Date.now()}-${index}`,
          title: entry.item.title || `Clip ${index + 1}`,
          start: entry.item.start,
          end: entry.item.end,
          aspect: entry.aspect,
          aspectRatio: preset.ratio,
          blob: rendered.blob,
          url: rendered.url,
          extension: rendered.extension,
        });
      }
      setOutputs((current) => [...results, ...current]);
      toast.success(`${results.length} clip${results.length > 1 ? "s" : ""} ready to download.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Rendering failed.");
    } finally {
      setJob(null);
    }
  };

  const handleGenerateSelected = () => {
    const items = candidates
      .filter((candidate) => candidate.selected)
      .map((candidate) => ({
        id: candidate.id,
        start: candidate.start,
        end: candidate.end,
        title: candidate.chosenTitle,
        audio: candidate.audio,
      }));
    void runRenderQueue(items);
  };

  const handleManualRender = () => {
    const items: RenderItem[] = [];
    for (const row of manualRows) {
      const start = parseTimecode(row.start);
      const end = parseTimecode(row.end);
      if (start === null || end === null || end <= start) {
        toast.error(`Check the times on the row starting at "${row.start}".`);
        return;
      }
      const length = end - start;
      if (length < 10 || length > 30) {
        toast.error("Each clip must be between 10 and 30 seconds.");
        return;
      }
      if (duration && end > duration) {
        toast.error("A clip ends after the video finishes.");
        return;
      }
      if (row.audio.mode !== "original" && !row.audio.soundFile) {
        toast.error("Add a sound file or choose original audio only.");
        return;
      }
      items.push({ id: row.id, start, end, title: row.title, audio: row.audio });
    }
    void runRenderQueue(items);
  };

  const busy = Boolean(job);
  const aiPreviewItems: PreviewItem[] = candidates.length
    ? candidates.map((candidate, index) => ({ id: candidate.id, label: `Clip ${index + 1} · ${candidate.chosenTitle || "Untitled"}`, start: candidate.start, title: candidate.chosenTitle }))
    : [{ id: "source", label: "Uploaded video", start: 0, title: "YOUR TITLE HERE" }];
  const manualPreviewItems: PreviewItem[] = manualRows.map((row, index) => ({
    id: row.id,
    label: `Range ${index + 1} · ${row.title || "Untitled"}`,
    start: parseTimecode(row.start) ?? 0,
    title: row.title || "YOUR TITLE HERE",
  }));
  const previewProps = {
    file,
    aspect: aspects[0] ?? "vertical" as AspectKey,
    burnTitle,
    fontKey,
    titleSettings,
    titleStyle,
    overlay: previewOverlay,
    overlayPosition,
    overlayScale,
    overlayOpacity,
    overlayX,
    overlayY,
    showCaptions,
    captions: buildCaptionCues(transcript, duration ?? 0),
    blurSquareBackground,
  };

  const handleJsonImport = () => {
    let data: unknown;
    try {
      data = JSON.parse(jsonImport);
    } catch {
      toast.error("That isn't valid JSON. Expected an array like [{\"start\":\"0:10\",\"end\":\"0:25\",\"title\":\"...\"}].");
      return;
    }
    if (!Array.isArray(data)) {
      toast.error("JSON must be an array of clip objects.");
      return;
    }
    const toTime = (value: unknown) => {
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) return formatTimecode(value);
      if (typeof value === "string" && parseTimecode(value.trim()) !== null) return value.trim();
      return null;
    };
    const rows: ManualRow[] = [];
    let skipped = 0;
    for (const item of data) {
      if (!item || typeof item !== "object") { skipped++; continue; }
      const obj = item as Record<string, unknown>;
      const start = toTime(obj["start"]);
      const end = toTime(obj["end"]);
      if (!start || !end || (parseTimecode(end) ?? 0) <= (parseTimecode(start) ?? 0)) { skipped++; continue; }
      rows.push({ id: crypto.randomUUID(), start, end, title: typeof obj["title"] === "string" ? obj["title"] : "", audio: { ...DEFAULT_CLIP_AUDIO } });
    }
    if (!rows.length) {
      toast.error("No valid clips found. Each item needs start, end (after start) and title.");
      return;
    }
    setManualRows((current) => {
      const only = current.length === 1 ? current[0] : undefined;
      const untouched = only && only.start === "0:00" && only.end === "0:15" && !only.title && !only.audio.soundFile;
      return untouched ? rows : [...current, ...rows];
    });
    setJsonImport("");
    toast.success(`Added ${rows.length} clip${rows.length === 1 ? "" : "s"}${skipped ? ` (${skipped} skipped)` : ""}.`);
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-10 sm:px-6 lg:px-8">
      <Toaster />
      <header className="mb-10 space-y-4 text-center sm:text-left">
        <Badge variant="secondary" className="gap-1.5 bg-accent/15 text-accent">
          <Sparkles className="size-3.5" /> AI viral clipper · V3
        </Badge>
        <h1 className="font-display text-4xl font-bold leading-tight sm:text-5xl">
          Turn long streams into <span className="text-gradient">scroll-stopping shorts</span>
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
          Upload your recording, drop the YouTube link, and AI picks the moments worth clipping.
           Export smooth MP4s for TikTok, square feeds or YouTube — with or without text on screen, all on
          your own device.
        </p>
      </header>

      <Tabs defaultValue="ai" className="space-y-8">
        <TabsList className="grid w-full grid-cols-2 sm:max-w-md">
          <TabsTrigger value="ai" className="gap-1.5">
            <Wand2 className="size-4" /> AI clipper
          </TabsTrigger>
          <TabsTrigger value="manual" className="gap-1.5">
            <Scissors className="size-4" /> Manual batch
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ai" className="space-y-8">
          <section className="grid gap-5 lg:grid-cols-2">
            <UploadZone file={file} duration={duration} onSelect={handleSelectFile} />
            <div className="panel space-y-4 p-5">
              <div className="space-y-2">
                <Label htmlFor="youtube" className="flex items-center gap-1.5">
                  <Youtube className="size-4 text-primary" /> YouTube link (optional)
                </Label>
                <Input
                  id="youtube"
                  value={youtubeUrl}
                  onChange={(event) => setYoutubeUrl(event.target.value)}
                  placeholder="https://youtube.com/watch?v=..."
                  inputMode="url"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Topic or transcript notes (optional)</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={3}
                  placeholder="What the stream is about, guests, big moments you remember…"
                />
              </div>
              <Button
                onClick={() => void handleAnalyze(false)}
                disabled={analyzing || busy}
                size="lg"
                className="w-full"
              >
                {analyzing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {analyzing ? `${analyzeStatus || "analyzing"}…` : "Analyze & detect viral clips"}
              </Button>
            </div>
          </section>

          <ExportSettings
            aspects={aspects}
            onToggleAspect={toggleAspect}
            burnTitle={burnTitle}
            onBurnTitleChange={setBurnTitle}
            fontKey={fontKey}
            onFontChange={setFontKey}
            titleSettings={titleSettings}
            onTitleSettingsChange={setTitleSettings}
            overlayUrl={overlayUrl}
            onOverlayChange={handleOverlayChange}
            overlayPosition={overlayPosition}
            onOverlayPositionChange={setOverlayPosition}
            overlayScale={overlayScale}
            onOverlayScaleChange={setOverlayScale}
            overlayOpacity={overlayOpacity}
            onOverlayOpacityChange={setOverlayOpacity}
            overlayX={overlayX}
            overlayY={overlayY}
            onOverlayCoordinatesChange={(x, y) => {
              setOverlayX(x);
              setOverlayY(y);
            }}
            titleStyle={titleStyle}
            onTitleStyleChange={setTitleStyle}
            showCaptions={showCaptions}
            onShowCaptionsChange={setShowCaptions}
            blurSquareBackground={blurSquareBackground}
            onBlurSquareBackgroundChange={setBlurSquareBackground}
          />
          <CompositionPreview
            {...previewProps}
            items={aiPreviewItems}
            itemId={aiPreviewItems.some((item) => item.id === aiPreviewId) ? aiPreviewId : aiPreviewItems[0]?.id ?? "source"}
            onItemChange={setAiPreviewId}
          />

          {candidates.length > 0 ? (
            <section className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl font-semibold sm:text-2xl">
                    Viral candidates
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {selectedCount} of {candidates.length} selected ·{" "}
                    {selectedCount * aspects.length} file
                    {selectedCount * aspects.length === 1 ? "" : "s"} will be exported
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="lg" disabled={analyzing || busy} onClick={() => void handleAnalyze(true)}>
                  {analyzing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Retry with different moments
                </Button>
                <Button
                  onClick={handleGenerateSelected}
                  disabled={busy || selectedCount === 0}
                  size="lg"
                >
                  <Clapperboard className="size-4" /> Generate selected clips
                </Button>
                </div>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {candidates.map((candidate) => (
                  <ClipCandidateCard
                    key={candidate.id}
                    candidate={candidate}
                    showTitles={burnTitle}
                    onToggle={(id, selected) => {
                      setCandidates((current) =>
                        current.map((item) => (item.id === id ? { ...item, selected } : item)),
                      );
                      if (selected) setAiPreviewId(id);
                    }}
                    onPreview={(id) => setAiPreviewId(id)}
                    onTitleChange={(id, chosenTitle) =>
                      setCandidates((current) =>
                        current.map((item) => (item.id === id ? { ...item, chosenTitle } : item)),
                      )
                    }
                    onRegenerate={(id) => void handleRegenerate(id)}
                    onAudioChange={(id, audio) =>
                      setCandidates((current) => current.map((item) => item.id === id ? { ...item, audio } : item))
                    }
                  />
                ))}
              </div>
            </section>
          ) : null}
        </TabsContent>

        <TabsContent value="manual" className="space-y-6">
          <UploadZone file={file} duration={duration} onSelect={handleSelectFile} />

          <ExportSettings
            aspects={aspects}
            onToggleAspect={toggleAspect}
            burnTitle={burnTitle}
            onBurnTitleChange={setBurnTitle}
            fontKey={fontKey}
            onFontChange={setFontKey}
            titleSettings={titleSettings}
            onTitleSettingsChange={setTitleSettings}
            overlayUrl={overlayUrl}
            onOverlayChange={handleOverlayChange}
            overlayPosition={overlayPosition}
            onOverlayPositionChange={setOverlayPosition}
            overlayScale={overlayScale}
            onOverlayScaleChange={setOverlayScale}
            overlayOpacity={overlayOpacity}
            onOverlayOpacityChange={setOverlayOpacity}
            overlayX={overlayX}
            overlayY={overlayY}
            onOverlayCoordinatesChange={(x, y) => {
              setOverlayX(x);
              setOverlayY(y);
            }}
            titleStyle={titleStyle}
            onTitleStyleChange={setTitleStyle}
            showCaptions={showCaptions}
            onShowCaptionsChange={setShowCaptions}
            blurSquareBackground={blurSquareBackground}
            onBlurSquareBackgroundChange={setBlurSquareBackground}
          />
          <CompositionPreview
            {...previewProps}
            items={manualPreviewItems}
            itemId={manualPreviewItems.some((item) => item.id === manualPreviewId) ? manualPreviewId : manualPreviewItems[0]?.id ?? ""}
            onItemChange={setManualPreviewId}
            onMarkClip={(start, end) => {
              const length = end - start;
              const row: ManualRow = { id: crypto.randomUUID(), start: formatTimecode(start), end: formatTimecode(end), title: "", audio: { ...DEFAULT_CLIP_AUDIO } };
              setManualRows((current) => {
                const only = current.length === 1 ? current[0] : undefined;
                const untouched = only && only.start === "0:00" && only.end === "0:15" && !only.title && !only.audio.soundFile;
                return untouched ? [row] : [...current, row];
              });
              if (length < 10 || length > 30) toast.message(`Clip added (${Math.round(length)}s). Clips must be 10–30s to export — adjust the times below.`);
              else toast.success(`Clip added: ${formatTimecode(start)} → ${formatTimecode(end)}`);
            }}
          />

          <div className="panel space-y-3 p-5">
            <Label htmlFor="json-import" className="text-xs uppercase tracking-wide text-muted-foreground">
              Paste clip ranges as JSON
            </Label>
            <Textarea
              id="json-import"
              value={jsonImport}
              onChange={(event) => setJsonImport(event.target.value)}
              placeholder={'[{"start": "1:24", "end": "1:40", "title": "Hook text"}]'}
              className="min-h-24 font-mono text-xs"
            />
            <Button variant="secondary" size="sm" onClick={handleJsonImport} disabled={!jsonImport.trim()}>
              <Plus className="size-4" /> Add ranges from JSON
            </Button>
          </div>

          <div className="panel space-y-4 p-5">
            <div className="space-y-4">
              {manualRows.map((row) => (
                <div key={row.id} className="grid gap-3 sm:grid-cols-[1fr_1fr_2fr_auto_auto]">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Start</Label>
                    <Input
                      value={row.start}
                      onChange={(event) =>
                        setManualRows((current) =>
                          current.map((item) =>
                            item.id === row.id ? { ...item, start: event.target.value } : item,
                          ),
                        )
                      }
                      placeholder="1:24"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">End</Label>
                    <Input
                      value={row.end}
                      onChange={(event) =>
                        setManualRows((current) =>
                          current.map((item) =>
                            item.id === row.id ? { ...item, end: event.target.value } : item,
                          ),
                        )
                      }
                      placeholder="1:40"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      On-screen title {burnTitle ? "" : "(text is off)"}
                    </Label>
                    <Textarea
                      value={row.title}
                      disabled={!burnTitle}
                      onChange={(event) =>
                        setManualRows((current) =>
                          current.map((item) =>
                            item.id === row.id ? { ...item, title: event.target.value } : item,
                          ),
                        )
                      }
                      placeholder="Write title. Press Enter for a new line."
                      className="min-h-16 resize-y"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!burnTitle || row.working}
                      onClick={() => void handleManualHooks(row.id)}
                    >
                      {row.working ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Sparkles className="size-4" />
                      )}
                      AI hook
                    </Button>
                  </div>
                  <div className="flex items-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remove row"
                      onClick={() =>
                        setManualRows((current) =>
                          current.length > 1 ? current.filter((item) => item.id !== row.id) : current,
                        )
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <div className="sm:col-span-5">
                    <ClipAudioControls
                      value={row.audio}
                      onChange={(audio) => setManualRows((current) => current.map((item) => item.id === row.id ? { ...item, audio } : item))}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="secondary"
                onClick={() =>
                  setManualRows((current) => [
                    ...current,
                    { id: crypto.randomUUID(), start: "0:00", end: "0:15", title: "", audio: { ...DEFAULT_CLIP_AUDIO } },
                  ])
                }
              >
                <Plus className="size-4" /> Add range
              </Button>
              <Button onClick={handleManualRender} disabled={busy || !file}>
                <Clapperboard className="size-4" /> Trim & export
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Ranges must be between 10 and 30 seconds. Times can be written as 1:24 or 0:01:24.
            </p>
          </div>
        </TabsContent>
      </Tabs>

      {job ? (
        <section className="panel mt-8 space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">
              Clip {job.index} of {job.total} · {job.ratio}
              {job.title ? ` · “${job.title}”` : ""}
            </p>
            <span className="text-sm text-muted-foreground">{job.stage}</span>
          </div>
          <Progress value={Math.round(job.progress * 100)} />
          <p className="text-xs text-muted-foreground">
            Keep this tab open — clips render in real time on your device.
          </p>
        </section>
      ) : null}

      <div className="mt-12">
        <ClipGallery outputs={outputs} />
      </div>

      {outputs.length === 0 && !job ? (
        <p className="mt-12 text-center text-sm text-muted-foreground">
          Rendered clips appear here with a player, a download button and a ZIP of everything.
        </p>
      ) : null}
    </main>
  );
}
