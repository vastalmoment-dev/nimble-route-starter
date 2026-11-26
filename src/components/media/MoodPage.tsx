import { useServerFn } from "@tanstack/react-start";
import { Loader2, Wand2 } from "lucide-react";
import { useState } from "react";
import { MediaCard } from "@/components/media/MediaCard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { recommendAnime, type Recommendation } from "@/lib/ai/recommend.functions";
import { useT } from "@/lib/i18n";

const PROMPTS_EN = [
  "Cozy and wholesome, something to unwind after work",
  "Hyped up — epic fights and big emotions",
  "Dark, mind-bending mystery, no romance",
  "Want to laugh, short episodes",
];

const PROMPTS_FR = [
  "Doux et réconfortant, idéal pour décompresser",
  "Épique — des combats intenses et de grandes émotions",
  "Mystère sombre et psychologique, sans romance",
  "Envie de rire, épisodes courts",
];

export function MoodPage() {
  const { lang, t } = useT();
  const recommend = useServerFn(recommendAnime);
  const [mood, setMood] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picks, setPicks] = useState<Recommendation[]>([]);

  const prompts = lang === "fr" ? PROMPTS_FR : PROMPTS_EN;

  async function submit(text = mood) {
    if (text.trim().length < 3) return;
    setLoading(true);
    setError(null);
    setPicks([]);
    try {
      const r = await recommend({ data: { mood: text } });
      if (r.error) setError(r.error);
      else setPicks(r.picks);
    } catch {
      setError(t("mood.error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-12 pt-24 md:px-8">
      <h1 className="font-display text-3xl font-bold md:text-4xl">
        <span className="text-brand-gradient">{t("mood.title")}</span>
      </h1>
      <p className="mt-2 text-muted-foreground">{t("mood.subtitle")}</p>

      <form
        className="mt-6 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Textarea
          value={mood}
          onChange={(e) => setMood(e.target.value)}
          maxLength={800}
          rows={4}
          placeholder={t("mood.placeholder")}
        />
        <div className="flex flex-wrap gap-2">
          {prompts.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setMood(p);
                void submit(p);
              }}
              className="min-h-[44px] rounded-full border border-border bg-secondary/50 px-3.5 py-2 text-left text-xs text-muted-foreground hover:text-foreground sm:min-h-0 sm:py-1"
            >
              {p}
            </button>
          ))}
        </div>
        <Button type="submit" disabled={loading || mood.trim().length < 3}>
          {loading ? <Loader2 className="animate-spin" /> : <Wand2 />}{" "}
          {loading ? t("mood.finding") : t("mood.submit")}
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
