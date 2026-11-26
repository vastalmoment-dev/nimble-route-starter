import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { RouteFallback } from "@/components/layout/RouteFallback";

const LazySectionPage = lazy(() =>
  import("@/components/media/SectionPage").then((m) => ({ default: m.SectionPage })),
);

function KdramaRoutePage() {
  return (
    <Suspense fallback={<RouteFallback label="Loading K-Dramas…" />}>
      <LazySectionPage section="k-dramas" />
    </Suspense>
  );
}

export const Route = createFileRoute("/k-dramas")({
  head: () => ({
    meta: [
      { title: "K-Dramas — SHADOW" },
      {
        name: "description",
        content: "Romance, thrillers and survival hits from Korea, from Squid Game to Kingdom.",
      },
      { property: "og:title", content: "K-Dramas — SHADOW" },
      {
        property: "og:description",
        content: "Romance, thrillers and survival hits from Korea, from Squid Game to Kingdom.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: KdramaRoutePage,
});
