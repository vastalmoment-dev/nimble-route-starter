const ANILAST_ORIGIN = "https://anilast.xyz";

const ANILAST_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Referer: `${ANILAST_ORIGIN}/`,
  Origin: ANILAST_ORIGIN,
  Accept: "*/*",
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

function isValidTargetParam(target: string | null): boolean {
  if (!target || target.length > 2048) return false;
  try {
    const parsed = new URL(target);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
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

export function rewriteHlsPlaylist(body: string): string {
  return body
    .replaceAll(`${ANILAST_ORIGIN}/api/proxy/hls`, "/api/anilast/hls")
    .replaceAll("/api/proxy/hls", "/api/anilast/hls");
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
  if (validId) {
    candidates.push(`${ANILAST_ORIGIN}/api/mirror/image/${validId}/cover.webp`);
  }
  if (validUrl) {
    candidates.push(`${ANILAST_ORIGIN}/api/proxy/image?url=${encodeURIComponent(validUrl)}`);
  }

  for (const candidate of candidates) {
    try {
      const upstream = await fetch(candidate, {
        headers: { ...ANILAST_HEADERS, Accept: "image/*" },
        redirect: "follow",
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
  const isImage = url.pathname === "/api/anilast/image";
  if (!isHls && !isSub && !isImage) return null;

  if (request.method !== "GET") {
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
  const upstreamPath = isHls ? "/api/proxy/hls" : "/api/proxy/subtitle";
  const upstreamUrl = `${ANILAST_ORIGIN}${upstreamPath}${url.search}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: ANILAST_HEADERS,
      redirect: "follow",
    });

    if (!upstream.ok) {
      return new Response(`Upstream error (${upstream.status})`, {
        status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502,
      });
    }

    const contentType = upstream.headers.get("content-type") ?? "";
    const looksLikePlaylist =
      isHls && (/mpegurl|m3u8/i.test(contentType) || /\.m3u8(\?|#|$)/i.test(target ?? ""));

    if (looksLikePlaylist) {
      const text = await upstream.text();
      const rewritten = text.includes("#EXTM3U") ? rewriteHlsPlaylist(text) : text;
      return new Response(rewritten, {
        status: 200,
        headers: {
          "content-type": "application/vnd.apple.mpegurl; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }

    const fallbackType = isSub ? "text/vtt; charset=utf-8" : "application/octet-stream";
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "content-type": contentType || fallbackType,
        "cache-control": isSub ? "public, max-age=3600" : "public, max-age=300",
      },
    });
  } catch (error) {
    console.error("AniLast proxy error", error);
    return new Response("Failed to fetch stream data", { status: 502 });
  }
}
