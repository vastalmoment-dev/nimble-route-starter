import { createFileRoute } from "@tanstack/react-router";
import { SectionPage } from "@/components/media/SectionPage";

export const Route = createFileRoute("/hollywood")({
  head: () => ({
    meta: [
      { title: "Hollywood — SHADOW" },
      { name: "description", content: "Prestige series and blockbuster storytelling from Hollywood." },
      { property: "og:title", content: "Hollywood — SHADOW" },
      { property: "og:description", content: "Prestige series and blockbuster storytelling from Hollywood." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <SectionPage section="hollywood" />,
});
