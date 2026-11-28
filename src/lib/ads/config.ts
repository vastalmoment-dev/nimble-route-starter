/**
 * Ad slot registry. Each slot defines dimensions and optional network keys.
 */
export type AdSlotId = "sidebar" | "leaderboard" | "rectangle" | "player-companion";

export interface AdSlotConfig {
  width: number;
  height: number;
  label: string;
  envKey: string;
}

export const BAUVAL_SIDEBAR_BANNER = {
  key: "2a31814008f1846b736fd03f471f4beb",
  format: "iframe" as const,
  width: 160,
  height: 300,
  params: {},
  scriptSrc: "https://bauval.org/22/2a31814008f1846b736fd03f471f4beb",
} as const;

export const AD_SLOTS: Record<AdSlotId, AdSlotConfig> = {
  sidebar: {
    width: BAUVAL_SIDEBAR_BANNER.width,
    height: BAUVAL_SIDEBAR_BANNER.height,
    label: "Sidebar Banner",
    envKey: "VITE_ADSTERRA_SIDEBAR_KEY",
  },
  leaderboard: {
    width: 728,
    height: 90,
    label: "Leaderboard",
    envKey: "VITE_ADSTERRA_LEADERBOARD_KEY",
  },
  rectangle: { width: 300, height: 250, label: "Rectangle", envKey: "VITE_ADSTERRA_RECTANGLE_KEY" },
  "player-companion": {
    width: 300,
    height: 250,
    label: "Companion",
    envKey: "VITE_ADSTERRA_COMPANION_KEY",
  },
};

export function getAdKey(slot: AdSlotId): string | null {
  const env = import.meta.env as Record<string, string | undefined>;
  if (slot === "sidebar") return env[AD_SLOTS[slot].envKey] || BAUVAL_SIDEBAR_BANNER.key;
  return env[AD_SLOTS[slot].envKey] || null;
}

export function getAdHost(): string {
  const env = import.meta.env as Record<string, string | undefined>;
  return env["VITE_ADSTERRA_HOST"] || "www.highperformanceformat.com";
}

/** Isolated iframe document for an external banner script so atOptions stays scoped cleanly. */
export function adsterraDocument(
  key: string = BAUVAL_SIDEBAR_BANNER.key,
  width: number = BAUVAL_SIDEBAR_BANNER.width,
  height: number = BAUVAL_SIDEBAR_BANNER.height,
  scriptSrc: string = BAUVAL_SIDEBAR_BANNER.scriptSrc,
) {
  const opts = JSON.stringify({ key, format: "iframe", height, width, params: {} });
  return `<!doctype html><html><head><style>html,body{margin:0;padding:0;background:transparent;overflow:hidden;display:flex;align-items:center;justify-content:center;width:${width}px;height:${height}px;}</style></head><body><script>atOptions=${opts};</script><script data-cfasync="false" src="${scriptSrc}"></script></body></html>`;
}
