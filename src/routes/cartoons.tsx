import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { RouteFallback } from "@/components/layout/RouteFallback";

const LazySectionPage = lazy(() =>
  import("@/components/media/SectionPage").then((m) => ({ default: m.SectionPage })),
);

function CartoonsRoutePage() {
  return (
    <Suspense fallback={<RouteFallback label="Loading Cartoons…" />}>
      <LazySectionPage section="cartoons" />
    </Suspense>
  );
}

export const Route = createFileRoute("/cartoons")({
  head: () => ({
    meta: [
      { title: "Cartoons — SHADOW" },
      {
        name: "description",
        content: "Animated series for every age, from The Simpsons to Invincible.",
      },
      { property: "og:title", content: "Cartoons — SHADOW" },
      {
        property: "og:description",
        content: "Animated series for every age, from The Simpsons to Invincible.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CartoonsRoutePage,
});
