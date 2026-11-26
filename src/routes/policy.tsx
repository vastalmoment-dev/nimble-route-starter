import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { RouteFallback } from "@/components/layout/RouteFallback";

const LazyPolicyPage = lazy(() =>
  import("@/components/layout/PolicyPage").then((m) => ({ default: m.PolicyPage })),
);

function PolicyRoutePage() {
  return (
    <Suspense fallback={<RouteFallback label="Loading Policy…" />}>
      <LazyPolicyPage />
    </Suspense>
  );
}

export const Route = createFileRoute("/policy")({
  head: () => ({
    meta: [
      { title: "Policy, DMCA & Acceptable Use — SHADOW" },
      {
        name: "description",
        content:
          "Read the SHADOW content disclaimer, third-party hosting policy, DMCA removal procedure, and strict anti-bot server protection rules.",
      },
      { property: "og:title", content: "Policy, DMCA & Acceptable Use — SHADOW" },
      {
        property: "og:description",
        content:
          "SHADOW does not host any files on its servers. All media is indexed from third-party sites. Automated bots and server flooding are strictly prohibited.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: PolicyRoutePage,
});
