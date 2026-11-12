import { createFileRoute } from "@tanstack/react-router";
import { SectionPage } from "@/components/media/SectionPage";

export const Route = createFileRoute("/anime")({
  head: () => ({
    meta: [
      { title: "Anime — SHADOW" },
      { name: "description", content: "Trending, top-rated and seasonal anime with episode lists and cover art from AniList." },
      { property: "og:title", content: "Anime — SHADOW" },
      { property: "og:description", content: "Trending, top-rated and seasonal anime with episode lists and cover art from AniList." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <SectionPage section="anime" />,
});
