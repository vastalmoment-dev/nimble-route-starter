import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { RouteFallback } from "@/components/layout/RouteFallback";

const LazySectionPage = lazy(() =>
  import("@/components/media/SectionPage").then((m) => ({ default: m.SectionPage })),
);

function HollywoodRoutePage() {
  return (
    <Suspense fallback={<RouteFallback label="Loading Hollywood…" />}>
      <LazySectionPage section="hollywood" />
    </Suspense>
  );
}

export const Route = createFileRoute("/hollywood")({
  head: () => ({
    meta: [
      { title: "Hollywood — SHADOW" },
      {
        name: "description",
        content: "Prestige series and blockbuster storytelling from Hollywood.",
      },
      { property: "og:title", content: "Hollywood — SHADOW" },
      {
        property: "og:description",
        content: "Prestige series and blockbuster storytelling from Hollywood.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HollywoodRoutePage,
});
