import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { RouteFallback } from "@/components/layout/RouteFallback";

const LazyMoodPage = lazy(() =>
  import("@/components/media/MoodPage").then((m) => ({ default: m.MoodPage })),
);

function MoodRoutePage() {
  return (
    <Suspense fallback={<RouteFallback label="Loading Mood Match…" />}>
      <LazyMoodPage />
    </Suspense>
  );
}

export const Route = createFileRoute("/mood")({
  head: () => ({
    meta: [
      { title: "Mood Match — SHADOW" },
      {
        name: "description",
        content: "Tell SHADOW how you feel and get anime picks matched to your mood.",
      },
      { property: "og:title", content: "Mood Match — SHADOW" },
      {
        property: "og:description",
        content: "Tell SHADOW how you feel and get anime picks matched to your mood.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MoodRoutePage,
});
