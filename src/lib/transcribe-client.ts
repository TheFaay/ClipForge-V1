import { extractAudioChunks } from "./audio-extract";
import { formatTimecode } from "./clipforge-types";

async function transcribeChunk(blob: Blob): Promise<string> {
  const form = new FormData();
  form.append("file", new File([blob], "chunk.wav", { type: "audio/wav" }), "chunk.wav");

  const response = await fetch("/api/transcribe", { method: "POST", body: form });
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(detail?.error ?? "Could not listen to that part of the video.");
  }
  const payload = (await response.json()) as { text?: string };
  return (payload.text ?? "").trim();
}

/**
 * Turns a local video file into a timestamped transcript by extracting its
 * audio in the browser and transcribing it chunk by chunk.
 */
export async function buildTranscript(
  file: File,
  onProgress?: (ratio: number, label: string) => void,
): Promise<string> {
  const chunks = await extractAudioChunks(file, 90, (ratio) =>
    onProgress?.(ratio * 0.25, "reading the audio"),
  );

  const results: string[] = new Array(chunks.length).fill("");
  let completed = 0;
  const concurrency = 3;
  let cursor = 0;

  async function worker() {
    while (cursor < chunks.length) {
      const current = chunks[cursor];
      cursor += 1;
      if (!current) break;
      try {
        results[current.index] = await transcribeChunk(current.blob);
      } catch {
        results[current.index] = "";
      }
      completed += 1;
      onProgress?.(
        0.25 + 0.75 * (completed / chunks.length),
        `listening ${completed}/${chunks.length}`,
      );
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, chunks.length) }, worker));

  return chunks
    .map((chunk) => {
      const text = results[chunk.index];
      return text ? `[${formatTimecode(chunk.startSeconds)}] ${text}` : "";
    })
    .filter(Boolean)
    .join("\n");
}
