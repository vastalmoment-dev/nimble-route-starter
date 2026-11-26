import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { RouteFallback } from "@/components/layout/RouteFallback";

const LazySectionPage = lazy(() =>
  import("@/components/media/SectionPage").then((m) => ({ default: m.SectionPage })),
);

function BollywoodRoutePage() {
  return (
    <Suspense fallback={<RouteFallback label="Loading Bollywood…" />}>
      <LazySectionPage section="bollywood" />
    </Suspense>
  );
}

export const Route = createFileRoute("/bollywood")({
  head: () => ({
    meta: [
      { title: "Bollywood — SHADOW" },
      {
        name: "description",
        content: "Hindi, Tamil and Malayalam series and films — spectacle, family sagas and crime.",
      },
      { property: "og:title", content: "Bollywood — SHADOW" },
      {
        property: "og:description",
        content: "Hindi, Tamil and Malayalam series and films — spectacle, family sagas and crime.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BollywoodRoutePage,
});
