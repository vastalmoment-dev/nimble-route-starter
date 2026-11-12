import { Clapperboard, Drama, Home, Popcorn, Smile, Sparkles, Wand2, type LucideIcon } from "lucide-react";

export const NAV_ITEMS: { to: "/" | "/anime" | "/k-dramas" | "/hollywood" | "/bollywood" | "/cartoons" | "/mood"; label: string; icon: LucideIcon; accent: string }[] = [
  { to: "/", label: "Home", icon: Home, accent: "group-data-[status=active]/nav:text-cerulean" },
  { to: "/anime", label: "Anime", icon: Sparkles, accent: "group-data-[status=active]/nav:text-genre-anime" },
  { to: "/k-dramas", label: "K-Dramas", icon: Drama, accent: "group-data-[status=active]/nav:text-genre-kdrama" },
  { to: "/hollywood", label: "Hollywood", icon: Clapperboard, accent: "group-data-[status=active]/nav:text-genre-hollywood" },
  { to: "/bollywood", label: "Bollywood / Tollywood", icon: Popcorn, accent: "group-data-[status=active]/nav:text-genre-bollywood" },
  { to: "/cartoons", label: "Cartoons", icon: Smile, accent: "group-data-[status=active]/nav:text-genre-cartoons" },
  { to: "/mood", label: "Mood Match", icon: Wand2, accent: "group-data-[status=active]/nav:text-cerulean" },
];
