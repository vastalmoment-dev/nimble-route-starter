import { createFileRoute } from "@tanstack/react-router";
import { NollywoodPage } from "@/components/media/NollywoodPage";

export const Route = createFileRoute("/nollywood")({
  head: () => ({
    meta: [
      { title: "Nollywood movies — SHADOW" },
      { name: "description", content: "Watch Nigerian romance, comedy and drama from Bimbo Ademoye TV and Uduak Isong TV, with official YouTube movies on SHADOW." },
      { property: "og:title", content: "Nollywood movies — SHADOW" },
      { property: "og:description", content: "Discover Nigerian stories with official full-movie YouTube uploads from Nollywood creators." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NollywoodPage,
});