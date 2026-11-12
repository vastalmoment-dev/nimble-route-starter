/**
 * Ad slot registry. Each slot renders an empty, sized container until a network key is set.
 * Adsterra: set VITE_ADSTERRA_<SLOT>_KEY (e.g. VITE_ADSTERRA_SIDEBAR_KEY) and optionally
 * VITE_ADSTERRA_HOST (defaults to www.highperformanceformat.com).
 */
export type AdSlotId = "sidebar" | "leaderboard" | "rectangle" | "player-companion";

export interface AdSlotConfig {
  width: number;
  height: number;
  label: string;
  envKey: string;
}

export const AD_SLOTS: Record<AdSlotId, AdSlotConfig> = {
  sidebar: { width: 160, height: 600, label: "Skyscraper", envKey: "VITE_ADSTERRA_SIDEBAR_KEY" },
  leaderboard: { width: 728, height: 90, label: "Leaderboard", envKey: "VITE_ADSTERRA_LEADERBOARD_KEY" },
  rectangle: { width: 300, height: 250, label: "Rectangle", envKey: "VITE_ADSTERRA_RECTANGLE_KEY" },
  "player-companion": { width: 300, height: 250, label: "Companion", envKey: "VITE_ADSTERRA_COMPANION_KEY" },
};

export function getAdKey(slot: AdSlotId): string | null {
  const env = import.meta.env as Record<string, string | undefined>;
  return env[AD_SLOTS[slot].envKey] || null;
}

export function getAdHost(): string {
  const env = import.meta.env as Record<string, string | undefined>;
  return env["VITE_ADSTERRA_HOST"] || "www.highperformanceformat.com";
}

/** Isolated iframe document for an Adsterra banner so network scripts never touch the app. */
export function adsterraDocument(key: string, width: number, height: number, host = getAdHost()) {
  const opts = JSON.stringify({ key, format: "iframe", height, width, params: {} });
  return `<!doctype html><html><head><style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}</style></head><body><script>atOptions=${opts};</script><script src="https://${host}/${encodeURIComponent(key)}/invoke.js"></script></body></html>`;
}
