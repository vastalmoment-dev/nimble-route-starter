import { createFileRoute } from "@tanstack/react-router";
import { SectionPage } from "@/components/media/SectionPage";

export const Route = createFileRoute("/tollywood")({
  head: () => ({
    meta: [
      { title: "Tollywood — SHADOW" },
      {
        name: "description",
        content: "Telugu cinema — blockbuster action, family epics and hit series.",
      },
      { property: "og:title", content: "Tollywood — SHADOW" },
      {
        property: "og:description",
        content: "Telugu cinema — blockbuster action, family epics and hit series.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <SectionPage section="tollywood" />,
});
