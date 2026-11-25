import {
  BookOpen,
  Bookmark,
  Clapperboard,
  Drama,
  Home,
  Popcorn,
  Smile,
  Sparkles,
  Wand2,
  type LucideIcon,
} from "lucide-react";

export const NAV_ITEMS: {
  to:
    | "/"
    | "/watchlist"
    | "/anime"
    | "/k-dramas"
    | "/hollywood"
    | "/bollywood"
    | "/tollywood"
    | "/nollywood"
    | "/cartoons"
    | "/mood"
    | "/novels";
  label: string;
  icon: LucideIcon;
  accent: string;
}[] = [
  { to: "/", label: "Home", icon: Home, accent: "group-data-[status=active]/nav:text-cerulean" },
  {
    to: "/watchlist",
    label: "My Watchlist",
    icon: Bookmark,
    accent: "group-data-[status=active]/nav:text-cerulean",
  },
  {
    to: "/anime",
    label: "Anime",
    icon: Sparkles,
    accent: "group-data-[status=active]/nav:text-genre-anime",
  },
  {
    to: "/k-dramas",
    label: "K-Dramas",
    icon: Drama,
    accent: "group-data-[status=active]/nav:text-genre-kdrama",
  },
  {
    to: "/hollywood",
    label: "Hollywood",
    icon: Clapperboard,
    accent: "group-data-[status=active]/nav:text-genre-hollywood",
  },
  {
    to: "/bollywood",
    label: "Bollywood",
    icon: Popcorn,
    accent: "group-data-[status=active]/nav:text-genre-bollywood",
  },
  {
    to: "/tollywood",
    label: "Tollywood",
    icon: Popcorn,
    accent: "group-data-[status=active]/nav:text-genre-bollywood",
  },
  {
    to: "/nollywood",
    label: "Nollywood",
    icon: Clapperboard,
    accent: "group-data-[status=active]/nav:text-cerulean",
  },
  {
    to: "/cartoons",
    label: "Cartoons",
    icon: Smile,
    accent: "group-data-[status=active]/nav:text-genre-cartoons",
  },
  {
    to: "/novels",
    label: "Novels",
    icon: BookOpen,
    accent: "group-data-[status=active]/nav:text-cerulean",
  },
  {
    to: "/mood",
    label: "Mood Match",
    icon: Wand2,
    accent: "group-data-[status=active]/nav:text-cerulean",
  },
];
