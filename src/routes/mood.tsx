import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MediaCard } from "@/components/media/MediaCard";
import { recommendAnime, type Recommendation } from "@/lib/ai/recommend.functions";

export const Route = createFileRoute("/mood")({
  head: () => ({
    meta: [
      { title: "Mood Match — SHADOW" },
      { name: "description", content: "Tell SHADOW how you feel and get anime picks matched to your mood." },
      { property: "og:title", content: "Mood Match — SHADOW" },
      { property: "og:description", content: "Tell SHADOW how you feel and get anime picks matched to your mood." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MoodPage,
});

const PROMPTS = [
  "Cozy and wholesome, something to unwind after work",
  "Hyped up — epic fights and big emotions",
  "Dark, mind-bending mystery, no romance",
  "Want to laugh, short episodes",
];

function MoodPage() {
  const recommend = useServerFn(recommendAnime);
  const [mood, setMood] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picks, setPicks] = useState<Recommendation[]>([]);

  async function submit(text = mood) {
    if (text.trim().length < 3) return;
    setLoading(true); setError(null); setPicks([]);
    try {
      const r = await recommend({ data: { mood: text } });
      if (r.error) setError(r.error); else setPicks(r.picks);
    } catch {
      setError("Couldn't get recommendations right now.");
    } finally { setLoading(false); }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-8">
      <h1 className="font-display text-3xl font-bold md:text-4xl">
        <span className="text-gradient">Mood Match</span>
      </h1>
      <p className="mt-2 text-muted-foreground">Describe how you feel and what you're into — we'll find anime that fits.</p>

      <form className="mt-6 space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <Textarea value={mood} onChange={(e) => setMood(e.target.value)} maxLength={800} rows={4}
          placeholder="e.g. Feeling nostalgic, want a heartfelt story with great music, nothing too gory" />
        <div className="flex flex-wrap gap-2">
          {PROMPTS.map((p) => (
            <button key={p} type="button" onClick={() => { setMood(p); void submit(p); }}
              className="rounded-full border border-border bg-secondary/50 px-3 py-1 text-xs text-muted-foreground hover:text-foreground">
              {p}
            </button>
          ))}
        </div>
        <Button type="submit" disabled={loading || mood.trim().length < 3}>
          {loading ? <Loader2 className="animate-spin" /> : <Wand2 />} {loading ? "Finding matches…" : "Recommend anime"}
        </Button>
      </form>

      {error && <p className="mt-6 text-sm text-destructive">{error}</p>}

      {picks.length > 0 && (
        <div className="mt-10 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">
          {picks.map(({ item, reason }) => (
            <div key={item.key} className="space-y-2">
              <MediaCard item={item} className="w-full" />
              <p className="text-xs leading-snug text-muted-foreground">{reason}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
