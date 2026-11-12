import { createFileRoute } from "@tanstack/react-router";
import { SectionPage } from "@/components/media/SectionPage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SHADOW — Stream anime, K-dramas, Hollywood & more" },
      { name: "description", content: "Trending anime, K-dramas, Hollywood, Bollywood/Tollywood and cartoons in one cinematic streaming hub." },
      { property: "og:title", content: "SHADOW — Stream anime, K-dramas, Hollywood & more" },
      { property: "og:description", content: "Trending anime, K-dramas, Hollywood, Bollywood/Tollywood and cartoons in one cinematic streaming hub." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <SectionPage section="home" />,
});
