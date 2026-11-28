import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { RouteFallback } from "@/components/layout/RouteFallback";

const LazyGetAppPage = lazy(() =>
  import("@/components/media/GetAppPage").then((m) => ({ default: m.GetAppPage })),
);

function GetAppRoutePage() {
  return (
    <Suspense fallback={<RouteFallback label="Loading Get App…" />}>
      <LazyGetAppPage />
    </Suspense>
  );
}

export const Route = createFileRoute("/get-app")({
  head: () => ({
    meta: [
      { title: "Get App — SHADOW" },
      {
        name: "description",
        content:
          "SHADOW mobile apps for iOS and Android are coming soon with offline episode packs and fast mobile streaming.",
      },
      { property: "og:title", content: "Get App — SHADOW" },
      {
        property: "og:description",
        content:
          "SHADOW iOS App and Android App coming soon. Stream or batch-download episodes on mobile today.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GetAppRoutePage,
});
