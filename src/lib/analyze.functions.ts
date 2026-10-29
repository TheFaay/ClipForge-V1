import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  youtubeUrl: z.string().max(500).optional().default(""),
  durationSeconds: z.number().positive(),
  transcriptHint: z.string().max(8000).optional(),
  transcript: z.string().max(200_000).optional(),
  exclude: z.array(z.object({ start: z.number(), end: z.number() })).max(60).optional(),
  seed: z.string().max(40).optional(),
});

export const analyzeViralClips = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const { analyzeStreamForClips } = await import("./ai/analyze.server");
    const clips = await analyzeStreamForClips({
      youtubeUrl: data.youtubeUrl || "(local upload)",
      durationSeconds: data.durationSeconds,
      transcriptHint: data.transcriptHint,
      transcript: data.transcript,
      exclude: data.exclude,
      seed: data.seed,
    });
    return { clips: clips.slice(0, 10) };
  });

const titlesSchema = z.object({
  reason: z.string().max(400).optional().default(""),
  transcriptExcerpt: z.string().max(8000).optional(),
  context: z.string().max(4000).optional(),
  avoid: z.array(z.string().max(120)).max(20).optional(),
  durationSeconds: z.number().positive(),
});

export const regenerateTitles = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => titlesSchema.parse(data))
  .handler(async ({ data }) => {
    const { generateHookTitles } = await import("./ai/titles.server");
    const titles = await generateHookTitles({
      reason: data.reason,
      transcriptExcerpt: data.transcriptExcerpt,
      context: data.context,
      avoid: data.avoid,
      durationSeconds: data.durationSeconds,
    });
    return { titles };
  });
