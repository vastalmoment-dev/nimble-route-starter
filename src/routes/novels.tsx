import { createFileRoute } from "@tanstack/react-router";
import { NovelsPage } from "@/components/media/NovelsPage";

export const Route = createFileRoute("/novels")({
  head: () => ({
    meta: [
      { title: "Free novels to download — SHADOW" },
      {
        name: "description",
        content:
          "Download classic novels free on SHADOW: romance, mystery, adventure, horror and sci-fi in EPUB and Kindle formats.",
      },
      { property: "og:title", content: "Free novels to download — SHADOW" },
      {
        property: "og:description",
        content: "A free library of public-domain classics you can read or download.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NovelsPage,
});
