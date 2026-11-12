import { createFileRoute } from "@tanstack/react-router";
import { SectionPage } from "@/components/media/SectionPage";

export const Route = createFileRoute("/cartoons")({
  head: () => ({
    meta: [
      { title: "Cartoons — SHADOW" },
      { name: "description", content: "Animated series for every age, from The Simpsons to Invincible." },
      { property: "og:title", content: "Cartoons — SHADOW" },
      { property: "og:description", content: "Animated series for every age, from The Simpsons to Invincible." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <SectionPage section="cartoons" />,
});
