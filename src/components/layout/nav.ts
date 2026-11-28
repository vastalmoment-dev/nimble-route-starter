import {
  BookOpen,
  Bookmark,
  Clapperboard,
  Drama,
  Home,
  Popcorn,
  Settings,
  Smartphone,
  Smile,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { TranslationKey } from "@/lib/i18n";

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
    | "/get-app"
    | "/manga"
    | "/settings";
  labelKey: TranslationKey;
  label: string;
  icon: LucideIcon;
  accent: string;
}[] = [
  {
    to: "/",
    labelKey: "nav.home",
    label: "Home",
    icon: Home,
    accent: "group-data-[status=active]/nav:text-cerulean",
  },
  {
    to: "/watchlist",
    labelKey: "nav.watchlist",
    label: "My Watchlist",
    icon: Bookmark,
    accent: "group-data-[status=active]/nav:text-cerulean",
  },
  {
    to: "/anime",
    labelKey: "nav.anime",
    label: "Anime",
    icon: Sparkles,
    accent: "group-data-[status=active]/nav:text-genre-anime",
  },
  {
    to: "/k-dramas",
    labelKey: "nav.kdramas",
    label: "K-Dramas",
    icon: Drama,
    accent: "group-data-[status=active]/nav:text-genre-kdrama",
  },
  {
    to: "/hollywood",
    labelKey: "nav.hollywood",
    label: "Hollywood",
    icon: Clapperboard,
    accent: "group-data-[status=active]/nav:text-genre-hollywood",
  },
  {
    to: "/bollywood",
    labelKey: "nav.bollywood",
    label: "Bollywood",
    icon: Popcorn,
    accent: "group-data-[status=active]/nav:text-genre-bollywood",
  },
  {
    to: "/tollywood",
    labelKey: "nav.tollywood",
    label: "Tollywood",
    icon: Popcorn,
    accent: "group-data-[status=active]/nav:text-genre-bollywood",
  },
  {
    to: "/nollywood",
    labelKey: "nav.nollywood",
    label: "Nollywood",
    icon: Clapperboard,
    accent: "group-data-[status=active]/nav:text-cerulean",
  },
  {
    to: "/cartoons",
    labelKey: "nav.cartoons",
    label: "Cartoons",
    icon: Smile,
    accent: "group-data-[status=active]/nav:text-genre-cartoons",
  },
  {
    to: "/manga",
    labelKey: "nav.manga",
    label: "Manga",
    icon: BookOpen,
    accent: "group-data-[status=active]/nav:text-cerulean",
  },
  {
    to: "/get-app",
    labelKey: "nav.getApp",
    label: "Get App",
    icon: Smartphone,
    accent: "group-data-[status=active]/nav:text-cerulean",
  },
  {
    to: "/settings",
    labelKey: "nav.settings",
    label: "Settings",
    icon: Settings,
    accent: "group-data-[status=active]/nav:text-cerulean",
  },
];
