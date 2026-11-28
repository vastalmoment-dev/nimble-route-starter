import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { RouteFallback } from "@/components/layout/RouteFallback";

const LazyPolicyPage = lazy(() =>
  import("@/components/layout/PolicyPage").then((m) => ({ default: m.PolicyPage })),
);

function PolicyRoutePage() {
  return (
    <Suspense fallback={<RouteFallback label="Loading Privacy Policy…" />}>
      <LazyPolicyPage />
    </Suspense>
  );
}

export const Route = createFileRoute("/policy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy, DMCA & Acceptable Use — SHADOW" },
      {
        name: "description",
        content:
          "Read SHADOW's privacy policy, technical proof of zero file hosting, anti-piracy stance, DMCA removal procedure, and anti-bot server rules.",
      },
      { property: "og:title", content: "Privacy Policy, DMCA & Acceptable Use — SHADOW" },
      {
        property: "og:description",
        content:
          "SHADOW does not host, store, or upload any media files on its servers. All content links to independent third-party hosts, with local-only browser preferences.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: PolicyRoutePage,
});
