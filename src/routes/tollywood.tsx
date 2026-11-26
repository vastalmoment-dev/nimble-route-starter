import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { RouteFallback } from "@/components/layout/RouteFallback";

const LazySectionPage = lazy(() =>
  import("@/components/media/SectionPage").then((m) => ({ default: m.SectionPage })),
);

function TollywoodRoutePage() {
  return (
    <Suspense fallback={<RouteFallback label="Loading Tollywood…" />}>
      <LazySectionPage section="tollywood" />
    </Suspense>
  );
}

export const Route = createFileRoute("/tollywood")({
  head: () => ({
    meta: [
      { title: "Tollywood — SHADOW" },
      {
        name: "description",
        content: "Telugu cinema — blockbuster action, family epics and hit series.",
      },
      { property: "og:title", content: "Tollywood — SHADOW" },
      {
        property: "og:description",
        content: "Telugu cinema — blockbuster action, family epics and hit series.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TollywoodRoutePage,
});
