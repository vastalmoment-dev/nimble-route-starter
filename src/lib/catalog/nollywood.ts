import ruse from "@/assets/nollywood/3rNo06AZd-s.jpg.asset.json";
import selina from "@/assets/nollywood/WnPcQVAeiWY.jpg.asset.json";
import miles from "@/assets/nollywood/8sh6VFJMqJA.jpg.asset.json";
import lastStraw from "@/assets/nollywood/UCZz-qi4ORk.jpg.asset.json";
import unexpected from "@/assets/nollywood/InVf3C6-Gmo.jpg.asset.json";

// Curated uploads verified against YouTube oEmbed publisher metadata.
// Keep multi-part releases labelled accurately rather than promising a complete film.
export const NOLLYWOOD_MOVIES = [
  { youtubeId: "InVf3C6-Gmo", title: "Unexpected Places", genre: "Romance", format: "Full movie", channel: "Bimbo Ademoye TV", image: unexpected.url, synopsis: "A privileged young man and a determined woman from a different world cross paths in a love story full of surprising turns.", cast: "Bimbo Ademoye · Timini Egbuson" },
  { youtubeId: "3rNo06AZd-s", title: "Ruse", genre: "Comedy", format: "Full movie", channel: "Bimbo Ademoye TV", image: ruse.url, synopsis: "Ambition, money and a little deception collide in a comedy about making ends meet and keeping up appearances.", cast: "Bimbo Ademoye · Kunle Remi · Sophie Alakija" },
  { youtubeId: "8sh6VFJMqJA", title: "Miles Away from Home", genre: "Romance", format: "Full movie", channel: "Bimbo Ademoye TV", image: miles.url, synopsis: "Dreams of a better life pull a young man away from familiar comforts, testing love, family ties and his hopes for the future.", cast: "Bimbo Ademoye · Timini Egbuson · Sandra Okunzuwa" },
  { youtubeId: "UCZz-qi4ORk", title: "Last Straw", genre: "Drama", format: "Full movie", channel: "Bimbo Ademoye TV", image: lastStraw.url, synopsis: "A successful woman's carefully balanced marriage and career face mounting pressure in a drama about love and breaking points.", cast: "Bimbo Ademoye · Timini Egbuson · Shaffy Bello" },
  { youtubeId: "WnPcQVAeiWY", title: "Selina", genre: "Romantic comedy", format: "Part 1", channel: "Uduak Isong TV", image: selina.url, synopsis: "An unlikely connection sparks a romantic comedy with Bimbo Ademoye and Daniel Etim Effiong. The opening part of Selina's story.", cast: "Bimbo Ademoye · Daniel Etim Effiong" },
] as const;