import { createFileRoute } from "@tanstack/react-router";
import { SectionPage } from "@/components/media/SectionPage";

export const Route = createFileRoute("/bollywood")({
  head: () => ({
    meta: [
      { title: "Bollywood & Tollywood — SHADOW" },
      { name: "description", content: "Hindi, Telugu, Tamil and Malayalam series and films — spectacle, family sagas and crime." },
      { property: "og:title", content: "Bollywood & Tollywood — SHADOW" },
      { property: "og:description", content: "Hindi, Telugu, Tamil and Malayalam series and films — spectacle, family sagas and crime." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <SectionPage section="bollywood" />,
});
