import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchAnimeShelves } from "@/lib/catalog/anilist";
import type { MediaItem } from "@/lib/catalog/types";

const Input = z.object({ mood: z.string().trim().min(3).max(800) });

export interface Recommendation { item: MediaItem; reason: string }
export type RecommendResult = { picks: Recommendation[]; error: null } | { picks: []; error: string };

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["picks"],
  properties: {
    picks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "reason"],
        properties: { id: { type: "string" }, reason: { type: "string" } },
      },
    },
  },
};

async function readStreamText(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "", out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const ev = JSON.parse(payload);
        if (ev.type === "response.output_text.delta") out += ev.delta;
        if (ev.type === "response.failed" || ev.type === "error") throw new Error("The recommender failed. Please try again.");
        if (ev.type === "response.refusal.delta") throw new Error("The recommender declined this request.");
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }
  return out;
}

export const recommendAnime = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<RecommendResult> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { picks: [], error: "Recommendations aren't configured yet." };

    const shelves = await fetchAnimeShelves();
    const pool = new Map<string, MediaItem>();
    for (const list of Object.values(shelves)) for (const it of list) pool.set(it.id, it);
    const catalog = [...pool.values()].map((it) => ({
      id: it.id, title: it.title, year: it.year, genres: it.genres,
      rating: it.rating, episodes: it.episodesCount, about: it.description.slice(0, 220),
    }));

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        stream: true,
        store: false,
        reasoning: { effort: "low" },
        instructions:
          "You are an anime recommender for a streaming app. Pick 6 titles that best match the viewer's mood and preferences, ONLY from the provided catalog, using the exact id. For each, write one warm, specific sentence (max 30 words) explaining why it fits their mood. Order best match first. Respect anything they say they want to avoid.",
        input: [{ role: "user", content: `Viewer: ${data.mood}\n\nCatalog:\n${JSON.stringify(catalog)}` }],
        text: { format: { type: "json_schema", name: "recommendations", strict: true, schema: SCHEMA } },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("AI gateway error", res.status, body);
      if (res.status === 429) return { picks: [], error: "Too many requests right now — try again in a moment." };
      if (res.status === 402) return { picks: [], error: "AI credits have run out for this app." };
      return { picks: [], error: "Couldn't get recommendations right now." };
    }

    try {
      const text = await readStreamText(res);
      const parsed = JSON.parse(text) as { picks: { id: string; reason: string }[] };
      const picks = parsed.picks
        .map((p) => ({ item: pool.get(p.id), reason: p.reason }))
        .filter((p): p is Recommendation => !!p.item);
      return { picks, error: null };
    } catch (e) {
      return { picks: [], error: e instanceof Error ? e.message : "Couldn't read recommendations." };
    }
  });
