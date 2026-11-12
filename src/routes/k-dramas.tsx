import { createFileRoute } from "@tanstack/react-router";
import { SectionPage } from "@/components/media/SectionPage";

export const Route = createFileRoute("/k-dramas")({
  head: () => ({
    meta: [
      { title: "K-Dramas — SHADOW" },
      { name: "description", content: "Romance, thrillers and survival hits from Korea, from Squid Game to Kingdom." },
      { property: "og:title", content: "K-Dramas — SHADOW" },
      { property: "og:description", content: "Romance, thrillers and survival hits from Korea, from Squid Game to Kingdom." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <SectionPage section="k-dramas" />,
});
