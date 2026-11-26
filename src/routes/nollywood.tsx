import { createFileRoute } from "@tanstack/react-router";
import { NollywoodPage } from "@/components/media/NollywoodPage";

export const Route = createFileRoute("/nollywood")({
  head: () => ({
    meta: [
      { title: "Nollywood movies & series — SHADOW" },
      {
        name: "description",
        content:
          "Stream and download full Nollywood movies and Nigerian series on SHADOW. New releases appear automatically.",
      },
      { property: "og:title", content: "Nollywood movies & series — SHADOW" },
      {
        property: "og:description",
        content:
          "Discover Nigerian blockbusters, thrillers, romances and dramas ready to watch or download.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NollywoodPage,
});
