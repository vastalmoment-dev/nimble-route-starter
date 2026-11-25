import { createFileRoute } from "@tanstack/react-router";
import { AnimeCatalogGrid } from "@/components/media/AnimeCatalogGrid";
import { SectionPage } from "@/components/media/SectionPage";

export const Route = createFileRoute("/anime")({
  head: () => ({
    meta: [
      { title: "Anime — SHADOW" },
      {
        name: "description",
        content:
          "Trending, newly released, top-rated and all anime with full episodes, Sub/Dub playback and downloads.",
      },
      { property: "og:title", content: "Anime — SHADOW" },
      {
        property: "og:description",
        content:
          "Trending, newly released, top-rated and all anime with full episodes, Sub/Dub playback and downloads.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <SectionPage
      section="anime"
      renderAfterShelves={(genres) => <AnimeCatalogGrid genres={genres} />}
    />
  ),
});
