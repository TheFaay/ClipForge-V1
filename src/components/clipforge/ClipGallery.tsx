import { useState } from "react";
import { Download, Package, Share2 } from "lucide-react";
import { zip } from "fflate";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { downloadBlob, safeFileName } from "@/lib/clip-render";
import { formatTimecode, type RenderedOutput } from "@/lib/clipforge-types";
import { cn } from "@/lib/utils";

type Props = {
  outputs: RenderedOutput[];
};

export function ClipGallery({ outputs }: Props) {
  const [zipping, setZipping] = useState(false);

  if (!outputs.length) return null;

  const fileNameFor = (output: RenderedOutput, index: number) =>
    `${String(index + 1).padStart(2, "0")}-${safeFileName(output.title)}-${output.aspectRatio.replace(":", "x")}.${output.extension}`;

  const canShare = typeof navigator !== "undefined" && typeof navigator.canShare === "function";

  const handleShare = async (output: RenderedOutput, index: number) => {
    try {
      const file = new File([output.blob], fileNameFor(output, index), { type: output.blob.type });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: output.title });
        return;
      }
      downloadBlob(output.blob, fileNameFor(output, index));
    } catch {
      // Sharing was dismissed — nothing to do.
    }
  };

  const handleZip = async () => {
    setZipping(true);
    try {
      const entries: Record<string, Uint8Array> = {};
      for (const [index, output] of outputs.entries()) {
        entries[fileNameFor(output, index)] = new Uint8Array(await output.blob.arrayBuffer());
      }
      const archive = await new Promise<Uint8Array>((resolve, reject) => {
        zip(entries, { level: 0 }, (error, data) => (error ? reject(error) : resolve(data)));
      });
      downloadBlob(
        new Blob([archive.slice().buffer as ArrayBuffer], { type: "application/zip" }),
        "clipforge-clips.zip",
      );
    } catch {
      toast.error("Couldn't build the ZIP. Try downloading the clips one by one.");
    } finally {
      setZipping(false);
    }
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold sm:text-2xl">Your clips</h2>
          <p className="text-sm text-muted-foreground">
            {outputs.length} ready · save them straight to your phone or computer
          </p>
        </div>
        <Button onClick={handleZip} disabled={zipping} variant="secondary">
          <Package className="size-4" />
          {zipping ? "Packing…" : "Download all (ZIP)"}
        </Button>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {outputs.map((output, index) => (
          <div key={output.id} className="panel overflow-hidden">
            <div className="relative bg-background">
              <video
                src={output.url}
                controls
                playsInline
                preload="metadata"
                className={cn(
                  "mx-auto w-full bg-background object-contain",
                  (output.aspect === "vertical" || output.aspect === "vertical-square" || output.aspect === "vertical-43") &&
                    "aspect-[9/16] max-w-[260px]",
                  output.aspect === "square" && "aspect-square",
                  output.aspect === "wide" && "aspect-video",
                )}
              />
              <Badge className="absolute right-3 top-3 bg-surface-strong/90 text-foreground">
                {output.aspectRatio}
              </Badge>
            </div>
            <div className="space-y-3 p-4">
              <div>
                <p className="line-clamp-2 font-medium">{output.title || "Untitled clip"}</p>
                <p className="text-xs text-muted-foreground">
                  {formatTimecode(output.start)} → {formatTimecode(output.end)} · {output.aspectRatio}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={() => downloadBlob(output.blob, fileNameFor(output, index))}
                >
                  <Download className="size-4" /> Download
                </Button>
                {canShare ? (
                  <Button size="sm" variant="secondary" onClick={() => handleShare(output, index)}>
                    <Share2 className="size-4" /> Share
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
