import { signMediaProxyUrl } from "./media-proxy";

const ANILAST_ORIGIN = "https://anilast.xyz";

const ANILAST_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Referer: `${ANILAST_ORIGIN}/`,
  Origin: ANILAST_ORIGIN,
  Accept: "application/vnd.apple.mpegurl,application/x-mpegurl,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
};

const ALLOWED_IMAGE_HOSTS = new Set([
  "s4.anilist.co",
  "anilist.co",
  "img1.ak.crunchyroll.com",
  "u.livechart.me",
  "cdn.myanimelist.net",
  "image.tmdb.org",
  "anilast.xyz",
]);

function isDisallowedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h === "::1") {
    return true;
  }
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  if (/^(fc|fd|fe80):/i.test(h)) return true;
  return false;
}

function isValidTargetParam(target: string | null): boolean {
  if (!target || target.length > 2048) return false;
  try {
    const parsed = new URL(target);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    return !isDisallowedHost(parsed.hostname);
  } catch {
    return false;
  }
}

function isAllowedImageUrl(target: string | null): boolean {
  if (!isValidTargetParam(target)) return false;
  try {
    const parsed = new URL(target!);
    return ALLOWED_IMAGE_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export function rewriteHlsPlaylist(body: string, playlistBaseUrl?: string): string {
  const rewriteUri = (uri: string): string => {
    if (uri.startsWith("/api/anilast/hls") || uri.startsWith("/api/media/segment")) {
      return uri;
    }
    if (uri.startsWith(`${ANILAST_ORIGIN}/api/proxy/hls`)) {
      return uri.replace(`${ANILAST_ORIGIN}/api/proxy/hls`, "/api/anilast/hls");
    }
    if (uri.startsWith("/api/proxy/hls")) {
      return uri.replace("/api/proxy/hls", "/api/anilast/hls");
    }
    if (playlistBaseUrl) {
      try {
        const abs = new URL(uri, playlistBaseUrl).toString();
        return signMediaProxyUrl(abs, `${ANILAST_ORIGIN}/`);
      } catch {
        return uri;
      }
    }
    return uri;
  };

  return body
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/g, (_m, uri: string) => `URI="${rewriteUri(uri)}"`);
      }
      return rewriteUri(trimmed);
    })
    .join("\n");
}

async function fetchWithRetry(
  url: string,
  init: Omit<RequestInit, "signal">,
  attempts = 2,
  timeoutMs = 9500,
): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if ((res.status === 500 || res.status === 502 || res.status === 504) && i + 1 < attempts) {
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error("Upstream request failed");
}

function proxyJsonError(
  message: string,
  upstreamStatus: number,
  extra?: Record<string, unknown>,
): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      error: message,
      upstreamStatus,
      blocked: upstreamStatus === 403 || upstreamStatus === 503 || upstreamStatus === 429,
      ...extra,
    }),
    {
      status: 502,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}

async function handleImageProxy(url: URL): Promise<Response> {
  const id = url.searchParams.get("id");
  const target = url.searchParams.get("url");
  const validId = id && /^\d+$/.test(id) ? id : null;
  const validUrl = isAllowedImageUrl(target) ? target : null;

  if (!validId && !validUrl) {
    return new Response("Invalid image parameters", { status: 400 });
  }

  const candidates: string[] = [];
  if (validUrl) {
    candidates.push(validUrl);
    candidates.push(`${ANILAST_ORIGIN}/api/proxy/image?url=${encodeURIComponent(validUrl)}`);
  }
  if (validId) {
    candidates.push(`${ANILAST_ORIGIN}/api/mirror/image/${validId}/cover.webp`);
  }

  for (const candidate of candidates) {
    try {
      const upstream = await fetch(candidate, {
        headers: { ...ANILAST_HEADERS, Accept: "image/*" },
        redirect: "follow",
        signal: AbortSignal.timeout(6000),
      });
      const ct = upstream.headers.get("content-type") ?? "";
      if (upstream.ok && ct.startsWith("image/")) {
        return new Response(upstream.body, {
          status: 200,
          headers: {
            "content-type": ct,
            "cache-control": "public, max-age=86400",
          },
        });
      }
    } catch {
      /* try next image candidate */
    }
  }

  return new Response("Image unavailable", { status: 404 });
}

export async function handleAniLastProxyRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const isHls = url.pathname === "/api/anilast/hls";
  const isSub = url.pathname === "/api/anilast/subtitle";
  const isStream = url.pathname === "/api/anilast/stream";
  const isImage = url.pathname === "/api/anilast/image";
  if (!isHls && !isSub && !isStream && !isImage) return null;

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (isImage) {
    return handleImageProxy(url);
  }

  const target = url.searchParams.get("url");
  if (!isValidTargetParam(target)) {
    return new Response("Invalid media URL parameter", { status: 400 });
  }

  // Pin outbound requests strictly to https://anilast.xyz/api/proxy/* to avoid open-proxy SSRF.
  const upstreamPath = isHls
    ? "/api/proxy/hls"
    : isStream
      ? "/api/proxy/stream"
      : "/api/proxy/subtitle";
  const upstreamUrl = `${ANILAST_ORIGIN}${upstreamPath}${url.search}`;
  const reqHeaders: Record<string, string> = { ...ANILAST_HEADERS };
  if (isStream) {
    reqHeaders["Accept"] = "*/*";
    const range = request.headers.get("range");
    if (range) reqHeaders["Range"] = range;
  }

  try {
    const upstream = await fetchWithRetry(upstreamUrl, {
      headers: reqHeaders,
      redirect: "follow",
    });

    if (!upstream.ok && upstream.status !== 206) {
      return proxyJsonError(
        `Upstream anime host returned HTTP ${upstream.status}`,
        upstream.status,
      );
    }

    const contentType = upstream.headers.get("content-type") ?? "";
    const isBinarySegment =
      /^(video|audio|application\/octet-stream)/i.test(contentType) &&
      !/\.m3u8(\?|#|$)/i.test(target ?? "");
    const looksLikePlaylist =
      isHls &&
      (!isBinarySegment ||
        /mpegurl|m3u8|text\/|json/i.test(contentType) ||
        /\.m3u8(\?|#|$)/i.test(target ?? ""));

    if (looksLikePlaylist) {
      const text = await upstream.text();
      if (text.includes("#EXTM3U")) {
        const rewritten = rewriteHlsPlaylist(text, target ?? upstreamUrl);
        return new Response(rewritten, {
          status: 200,
          headers: {
            "content-type": "application/vnd.apple.mpegurl; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      }
      return proxyJsonError(
        "Upstream returned a challenge or non-playlist response",
        upstream.status,
        { blocked: true },
      );
    }

    if (/text\/html/i.test(contentType)) {
      return proxyJsonError("Upstream returned an HTML error or challenge page", upstream.status, {
        blocked: true,
      });
    }

    const fallbackType = isSub
      ? "text/vtt; charset=utf-8"
      : isStream
        ? "video/mp4"
        : "application/octet-stream";
    const respHeaders = new Headers({
      "content-type": contentType || fallbackType,
      "cache-control": isSub ? "public, max-age=3600" : "public, max-age=300",
    });
    const cl = upstream.headers.get("content-length");
    if (cl) respHeaders.set("content-length", cl);
    const cr = upstream.headers.get("content-range");
    if (cr) respHeaders.set("content-range", cr);
    const ar = upstream.headers.get("accept-ranges");
    if (ar) respHeaders.set("accept-ranges", ar);

    return new Response(upstream.body, {
      status: upstream.status === 206 ? 206 : 200,
      headers: respHeaders,
    });
  } catch (error) {
    console.error("AniLast proxy error", error);
    return proxyJsonError("Failed to fetch upstream anime stream", 504, { blocked: true });
  }
}
