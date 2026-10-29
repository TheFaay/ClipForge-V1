import { useRef, useState } from "react";
import { FileVideo, UploadCloud, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatTimecode } from "@/lib/clipforge-types";

type UploadZoneProps = {
  file: File | null;
  duration: number | null;
  onSelect: (file: File | null) => void;
};

const ACCEPTED = ["video/mp4", "video/quicktime", "video/x-matroska", "video/webm"];

export function UploadZone({ file, duration, onSelect }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (files: FileList | null) => {
    const next = files?.[0];
    if (!next) return;
    if (!next.type.startsWith("video/") && !ACCEPTED.includes(next.type)) return;
    onSelect(next);
  };

  if (file) {
    return (
      <div className="panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
            <FileVideo className="size-6" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium">{file.name}</p>
            <p className="text-sm text-muted-foreground">
              {(file.size / 1024 / 1024).toFixed(1)} MB
              {duration ? ` · ${formatTimecode(duration)} long` : ""}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => onSelect(null)} className="self-start sm:self-auto">
          <X className="size-4" /> Remove
        </Button>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        handleFiles(event.dataTransfer.files);
      }}
      className={cn(
        "panel flex cursor-pointer flex-col items-center gap-3 px-6 py-10 text-center transition-all",
        "hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        dragging && "border-primary glow-primary",
      )}
    >
      <span className="grid size-14 place-items-center rounded-2xl bg-primary/15 text-primary">
        <UploadCloud className="size-7" />
      </span>
      <div>
        <p className="font-display text-lg font-semibold">Drop your video here</p>
        <p className="text-sm text-muted-foreground">MP4, MOV, MKV or WebM — it never leaves your device</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/x-matroska,video/webm,video/*"
        className="hidden"
        onChange={(event) => handleFiles(event.target.files)}
      />
    </div>
  );
}
