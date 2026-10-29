import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

import { createLovableAiGatewayRunIdFetch } from "./run-id";

const GATEWAY_BASE_URL = "https://ai.gateway.lovable.dev/v1";
const MODEL = "openai/gpt-6-astra";

const SYSTEM_PROMPT = `You write on-screen text hooks for viral short-form videos (TikTok, Reels, Shorts).

Return ONLY raw JSON (no markdown fences, no commentary) shaped exactly like:
{"titles":["hook one","hook two","hook three","hook four"]}

Rules:
- Return between 3 and 5 hooks.
- Each hook is casual, lowercase-ish, max 42 characters, no hashtags, no emojis, no quotes.
- Hooks must fit the specific moment described, not generic filler.
- Never repeat a hook the user says they already have.
- Never refuse.`;

export async function generateHookTitles(input: {
  reason: string;
  transcriptExcerpt?: string | undefined;
  context?: string | undefined;
  avoid?: string[] | undefined;
  durationSeconds: number;
}): Promise<string[]> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured for this project yet.");

  const runIdFetch = createLovableAiGatewayRunIdFetch();
  const provider = createOpenAI({
    baseURL: GATEWAY_BASE_URL,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });

  const result = streamText({
    model: provider.responses(MODEL),
    providerOptions: { openai: { store: false } },
    instructions: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          `Clip length: ${Math.round(input.durationSeconds)} seconds.`,
          input.reason ? `What happens in the clip: ${input.reason}` : "",
          input.transcriptExcerpt ? `What is said:\n${input.transcriptExcerpt.slice(0, 6000)}` : "",
          input.context ? `Creator context: ${input.context.slice(0, 2000)}` : "",
          input.avoid?.length ? `Already used, write different ones:\n- ${input.avoid.join("\n- ")}` : "",
          "Write a fresh set of hooks and return the JSON payload.",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  });

  const text = await result.text;
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first === -1 || last === -1) throw new Error("The AI response could not be read.");
  const parsed = JSON.parse(trimmed.slice(first, last + 1)) as { titles?: unknown };

  const titles = (Array.isArray(parsed.titles) ? parsed.titles : [])
    .filter((title): title is string => typeof title === "string" && title.trim().length > 0)
    .map((title) => title.trim().replace(/^["']|["']$/g, "").slice(0, 60))
    .slice(0, 5);

  if (!titles.length) throw new Error("No new hooks came back. Try again.");
  return titles;
}
