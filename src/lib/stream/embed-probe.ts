export interface ProbeableEmbed {
  label: string;
  url: string;
  available?: boolean;
}

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function blocksFraming(res: Response): boolean {
  const xfo = (res.headers.get("x-frame-options") ?? "").toUpperCase();
  if (xfo.includes("DENY") || xfo.includes("SAMEORIGIN")) return true;
  const csp = (res.headers.get("content-security-policy") ?? "").toLowerCase();
  const fa = /frame-ancestors\s+([^;]+)/.exec(csp)?.[1];
  if (fa && (fa.includes("'none'") || fa.includes("'self'")) && !fa.includes("*")) {
    return true;
  }
  return false;
}

function looksLikeUnavailableHtml(text: string): boolean {
  const lower = text.slice(0, 16000).toLowerCase();
  if (
    lower.includes("just a moment") ||
    lower.includes("cf-browser-verification") ||
    lower.includes("attention required")
  ) {
    return true;
  }
  if (
    lower.includes("sandbox not allowed") ||
    lower.includes("sandbox is not allowed") ||
    lower.includes("remove sandbox from") ||
    lower.includes("remove the sandbox attribute") ||
    lower.includes("/assets/sbx.js")
  ) {
    return true;
  }
  if (
    lower.includes("video is restricted") ||
    lower.includes("this video is restricted") ||
    lower.includes("cette vidéo a été supprimée") ||
    lower.includes("cette video a ete supprimee") ||
    lower.includes("cette vidéo n'est plus disponible") ||
    lower.includes("vidéo supprimée") ||
    lower.includes("vidéo indisponible") ||
    lower.includes("removed due to a copyright violation") ||
    lower.includes("removed due to copyright") ||
    lower.includes("file was deleted") ||
    lower.includes("deleted by the owner") ||
    lower.includes("domain not allowed") ||
    lower.includes("embedding has been disabled") ||
    lower.includes("video has been removed") ||
    lower.includes("this video has been deleted") ||
    lower.includes("error code: <span>410") ||
    lower.includes("error code: 410")
  ) {
    return true;
  }
  const titleMatch = /<title[^>]*>([^<]{0,200})<\/title>/i.exec(lower)?.[1] ?? "";
  if (
    /\b(404|410|not found|page introuvable|media unavailable|video unavailable|forbidden|file not found)\b/i.test(
      titleMatch,
    ) ||
    /^error\s*[-–|]/i.test(titleMatch.trim())
  ) {
    return true;
  }
  return false;
}

export async function probeSingleEmbed(url: string, timeoutMs = 2600): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,fr;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return false;
    if (blocksFraming(res)) return false;
    const text = await res.text();
    if (text.length < 120) return false;
    if (looksLikeUnavailableHtml(text)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Probes candidate embed servers in parallel and removes unavailable ones.
 * If every probe fails (e.g. strict edge bot protection), falls back to the
 * original non-empty list marked `available: false` so client auto-failover can try them.
 */
export async function filterAvailableEmbeds<T extends ProbeableEmbed>(
  embeds: T[],
  maxProbe = 10,
): Promise<(T & { available: boolean })[]> {
  if (embeds.length === 0) return [];
  const head = embeds.slice(0, maxProbe);
  const tail = embeds.slice(maxProbe).map((e) => ({ ...e, available: false }));

  const results = await Promise.all(
    head.map(async (item) => ({
      ...item,
      available: await probeSingleEmbed(item.url),
    })),
  );

  const working = results.filter((r) => r.available);
  if (working.length > 0) {
    return working;
  }
  return [...results, ...tail];
}
