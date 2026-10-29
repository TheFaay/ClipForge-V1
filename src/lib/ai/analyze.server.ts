import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

import { createLovableAiGatewayRunIdFetch } from "./run-id";

const GATEWAY_BASE_URL = "https://ai.gateway.lovable.dev/v1";
const MODEL = "openai/gpt-6-astra";

export type ViralClip = {
  id: string;
  start: number;
  end: number;
  score: number;
  reason: string;
  titles: string[];
};

const SYSTEM_PROMPT = `You are a viral short-form video strategist who studies long-form streams and podcasts.
You pick the moments most likely to explode on TikTok, Reels and Shorts.

Return ONLY raw JSON (no markdown fences, no commentary) shaped exactly like:
{"clips":[{"start":"MM:SS","end":"MM:SS","score":87,"reason":"why this pops","titles":["hook 1","hook 2","hook 3"]}]}

Rules:
- Return between 6 and 10 clips.
- Every clip must last between 10 and 20 seconds.
- Clips must never overlap and must stay inside the video duration given by the user.
- score is an integer from 1 to 100 measuring virality potential.
- reason is one short sentence, max 140 characters.
- titles: 3 to 5 casual, lowercase-ish on-screen hooks, max 42 characters each, no hashtags, no emojis.
- When a transcript is supplied, base every pick on what is actually said. Timestamps in the transcript mark the start of each block; estimate the exact moment inside the block.
- Never refuse and never return placeholder clips. Always return your best real picks.`;

function toSeconds(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parts = value.trim().split(":").map(Number);
  if (!parts.length || parts.some((part) => !Number.isFinite(part))) return null;
  const [a = 0, b = 0, c = 0] = parts;
  if (parts.length === 3) return a * 3600 + b * 60 + c;
  if (parts.length === 2) return a * 60 + b;
  if (parts.length === 1) return a;
  return null;
}

function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("The AI response could not be read.");
  return JSON.parse(trimmed.slice(start, end + 1));
}

export async function analyzeStreamForClips(input: {
  youtubeUrl: string;
  durationSeconds: number;
  transcriptHint?: string | undefined;
  transcript?: string | undefined;
  signal?: AbortSignal | undefined;
  exclude?: { start: number; end: number }[] | undefined;
  seed?: string | undefined;
}): Promise<ViralClip[]> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured for this project yet.");

  const runIdFetch = createLovableAiGatewayRunIdFetch();
  const provider = createOpenAI({
    baseURL: GATEWAY_BASE_URL,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });

  const duration = Math.max(1, Math.floor(input.durationSeconds));
  const result = streamText({
    model: provider.responses(MODEL),
    ...(input.signal ? { abortSignal: input.signal } : {}),
    providerOptions: {
      openai: {
        store: false,
        forceReasoning: true,
        reasoningEffort: "medium",
        reasoningSummary: "auto",
        include: ["reasoning.encrypted_content"],
      },
    },
    instructions: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          `YouTube stream: ${input.youtubeUrl}`,
          `Uploaded video duration: ${duration} seconds (${Math.floor(duration / 60)}m ${duration % 60}s).`,
          input.transcript
            ? `Timestamped transcript of the video:\n${input.transcript.slice(0, 200_000)}`
            : "No transcript is available. Spread strong candidate moments across the whole runtime based on the topic and typical pacing.",
          input.transcriptHint ? `Extra context from the creator:\n${input.transcriptHint}` : "",
          input.exclude?.length
            ? `This is a retry. Pick DIFFERENT moments than before — avoid overlapping these ranges (seconds): ${input.exclude.map((r) => `${r.start}-${r.end}`).join(", ")}. Explore other parts of the video and vary your choices. Variation seed: ${input.seed ?? Math.random().toString(36).slice(2)}.`
            : "",
          "Pick the strongest viral moments (maximum 10) and return the JSON payload.",
        ].join("\n\n"),
      },
    ],
  });

  const text = await result.text;
  const parsed = extractJson(text) as { clips?: unknown };
  const rawClips = Array.isArray(parsed.clips) ? parsed.clips : [];

  const clips: ViralClip[] = [];
  for (const raw of rawClips) {
    const item = raw as Record<string, unknown>;
    const start = toSeconds(item["start"]);
    let end = toSeconds(item["end"]);
    if (start === null || end === null) continue;
    if (end - start < 10) end = start + 10;
    if (end - start > 20) end = start + 20;
    if (start < 0 || end > duration) continue;

    const titles = (Array.isArray(item["titles"]) ? item["titles"] : [])
      .filter((title): title is string => typeof title === "string" && title.trim().length > 0)
      .map((title) => title.trim().slice(0, 60))
      .slice(0, 5);

    const score = Number(item["score"]);
    clips.push({
      id: `${Math.round(start)}-${Math.round(end)}-${clips.length}`,
      start: Math.round(start),
      end: Math.round(end),
      score: Number.isFinite(score) ? Math.min(100, Math.max(1, Math.round(score))) : 70,
      reason: typeof item["reason"] === "string" ? item["reason"].slice(0, 200) : "",
      titles: titles.length ? titles : ["you need to hear this"],
    });
  }

  if (!clips.length) throw new Error("No usable moments came back. Try again or add a few transcript notes.");
  return clips.sort((a, b) => a.start - b.start).slice(0, 10);
}
