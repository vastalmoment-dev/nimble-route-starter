import bannerImageUrl from "@/assets/1xbet-blue-bonus-banner.jpg";

/**
 * Promotional banners. Edit this list to swap partners, images or copy.
 * - Use `image` for a ready-made banner graphic (any https URL or imported asset pointer's `url`).
 * - Or leave `image` empty and the banner renders from the text fields.
 * - `html` (optional) replaces the text block with your own trusted markup.
 */
export interface PromoBanner {
  id: string;
  partner: string;
  headline: string;
  body?: string;
  code?: string;
  ctaLabel: string;
  href: string;
  image?: string;
  html?: string;
  /** Small print, e.g. "18+ · T&Cs apply · Play responsibly". */
  disclaimer?: string;
}

export const PROMO_BANNERS: PromoBanner[] = [
  {
    id: "partner-1xbet",
    partner: "1xBet",
    headline: "Get a 200% bonus on your first deposit",
    body: "Play smarter, win more — use promo code 1GOARIN when you sign up.",
    code: "1GOARIN",
    ctaLabel: "Join 1xBet now",
    href: "https://reffpa.com/L?tag=d_6269175m_97c_&site=6269175&ad=97",
    image: bannerImageUrl,
    disclaimer: "18+ only · T&Cs apply · Please gamble responsibly",
  },
];
