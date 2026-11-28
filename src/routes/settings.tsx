import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { RouteFallback } from "@/components/layout/RouteFallback";

const LazySettingsPage = lazy(() =>
  import("@/components/settings/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);

function SettingsRoutePage() {
  return (
    <Suspense fallback={<RouteFallback label="Loading Settings…" />}>
      <LazySettingsPage />
    </Suspense>
  );
}

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings & Watch History — SHADOW" },
      {
        name: "description",
        content:
          "Configure browser-only anime Sub/Dub defaults, playback controls, and delete individual or complete Continue Watching history on SHADOW.",
      },
      { property: "og:title", content: "Settings & Watch History — SHADOW" },
      {
        property: "og:description",
        content:
          "Browser-only playback preferences and watch history management. Nothing leaves your browser.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: SettingsRoutePage,
});
