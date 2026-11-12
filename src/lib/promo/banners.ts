/**
 * Promotional banners. Edit this list to swap partners, images or copy.
 * - Use `image` for a ready-made banner graphic (any https URL or imported asset).
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
    headline: "Welcome bonus for new players",
    body: "Sign up with our partner code to unlock your first-deposit bonus.",
    code: "SHADOW",
    ctaLabel: "Claim offer",
    href: "https://1xbet.com",
    disclaimer: "18+ only · T&Cs apply · Please gamble responsibly",
  },
];
