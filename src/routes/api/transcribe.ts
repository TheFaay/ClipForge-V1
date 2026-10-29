import { createFileRoute } from "@tanstack/react-router";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/audio/transcriptions";
const MODEL = "google/gemini-3.5-transcribe";
const MAX_BYTES = 13_500_000;

async function readTranscript(response: Response): Promise<string> {
  const body = response.body;
  if (!body) return "";

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let done = "";

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const event = JSON.parse(payload) as { type?: string; delta?: string; text?: string };
        if (event.type?.endsWith("delta") && typeof event.delta === "string") text += event.delta;
        if (event.type?.endsWith("done") && typeof event.text === "string") done = event.text;
        if (!event.type && typeof event.text === "string") done = event.text;
      } catch {
        // Ignore keep-alive or partial frames.
      }
    }
  }

  return (done || text).trim();
}

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) {
          return Response.json({ error: "AI is not configured for this project yet." }, { status: 500 });
        }

        const incoming = await request.formData();
        const file = incoming.get("file");
        if (!(file instanceof File) || !file.size || file.size > MAX_BYTES) {
          return Response.json({ error: "Audio chunk is missing or too large." }, { status: 400 });
        }

        const form = new FormData();
        form.append("model", MODEL);
        form.append("file", new File([file], "chunk.wav", { type: "audio/wav" }), "chunk.wav");
        form.append("response_format", "json");
        form.append("stream", "true");

        const upstream = await fetch(GATEWAY_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
          signal: request.signal,
        });

        if (!upstream.ok) {
          const detail = await upstream.text();
          return Response.json(
            { error: detail.slice(0, 400) || "Transcription failed." },
            { status: upstream.status },
          );
        }

        return Response.json({ text: await readTranscript(upstream) });
      },
    },
  },
});
