import crypto from "node:crypto";

const UPSTREAM_ORIGIN = "https://vidsrc.buzz";

const UPSTREAM_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Referer: `${UPSTREAM_ORIGIN}/`,
  Accept: "*/*",
};

const ALLOWED_IMAGE_HOSTS = new Set([
  "images.metahub.space",
  "m.media-amazon.com",
  "ia.media-imdb.com",
  "static.tvmaze.com",
  "image.tmdb.org",
  "s4.anilist.co",
  "i.ytimg.com",
]);

const STREAM_ID_RE = /^[a-zA-Z0-9_-]{8,128}$/;
const SUB_REF_RE = /^[A-Za-z0-9._~=-]{10,1024}$/;
const IMDB_ID_RE = /^tt\d{5,10}$/;

let fallbackSecret: Buffer | null = null;

function getSignSecret(): string | Buffer {
  const envSecret = process.env["MEDIA_PROXY_SECRET"] || process.env["SESSION_SECRET"];
  if (envSecret) return envSecret;
  if (!fallbackSecret) fallbackSecret = crypto.randomBytes(32);
  return fallbackSecret;
}

interface TokenPayload {
  u: string;
  ref?: string;
  exp: number;
}

export function signMediaProxyUrl(upstreamUrl: string, referer?: string): string {
  const payload: TokenPayload = {
    u: upstreamUrl,
    ...(referer ? { ref: referer } : {}),
    exp: Date.now() + 1000 * 60 * 60 * 6,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", getSignSecret()).update(body).digest("base64url");
  return `/api/media/segment?token=${encodeURIComponent(`${body}.${sig}`)}`;
}

export function verifyMediaProxyToken(token: string | null): TokenPayload | null {
  if (!token || token.length > 4096) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!body || !sig) return null;

  const expected = crypto.createHmac("sha256", getSignSecret()).update(body).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
    if (!parsed.u || typeof parsed.exp !== "number" || Date.now() > parsed.exp) return null;
    const u = new URL(parsed.u);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function rewriteMediaPlaylist(body: string, baseUrl: string): string {
  const toProxied = (rawUri: string) => {
    if (
      rawUri.startsWith("/api/media/hls") ||
      rawUri.startsWith("/api/media/segment") ||
      rawUri.startsWith("/api/anilast/")
    ) {
      return rawUri;
    }
    if (rawUri.startsWith(`${UPSTREAM_ORIGIN}/pl/_stream`)) {
      return rawUri.replace(`${UPSTREAM_ORIGIN}/pl/_stream`, "/api/media/hls");
    }
    if (rawUri.startsWith(`${UPSTREAM_ORIGIN}/_stream`)) {
      return rawUri.replace(`${UPSTREAM_ORIGIN}/_stream`, "/api/media/hls");
    }
    if (rawUri.startsWith("/pl/_stream")) {
      return rawUri.replace("/pl/_stream", "/api/media/hls");
    }
    if (rawUri.startsWith("/_stream")) {
      return rawUri.replace("/_stream", "/api/media/hls");
    }
    try {
      const abs = new URL(rawUri, baseUrl).toString();
      return signMediaProxyUrl(abs, UPSTREAM_ORIGIN + "/");
    } catch {
      return rawUri;
    }
  };

  return body
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/g, (_m, uri: string) => `URI="${toProxied(uri)}"`);
      }
      return toProxied(trimmed);
    })
    .join("\n");
}

async function fetchWithRetry(url: string, init: RequestInit, attempts = 2): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, init);
      if (res.status >= 500 && i + 1 < attempts) continue;
      return res;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error("Upstream request failed");
}

async function fetchImageResponse(url: string): Promise<Response | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UPSTREAM_HEADERS["User-Agent"]!,
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
    });
    const ct = res.headers.get("content-type") ?? "";
    if (res.ok && ct.startsWith("image/")) {
      return new Response(res.body, {
        status: 200,
        headers: {
          "content-type": ct,
          "cache-control": "public, max-age=86400, s-maxage=86400",
        },
      });
    }
  } catch {
    /* try next image candidate */
  }
  return null;
}

async function handleMediaImageProxy(url: URL): Promise<Response> {
  const imdbId = url.searchParams.get("imdbId");
  const target = url.searchParams.get("url");

  const candidates: string[] = [];
  if (target) {
    try {
      const parsed = new URL(target);
      if (
        (parsed.protocol === "https:" || parsed.protocol === "http:") &&
        ALLOWED_IMAGE_HOSTS.has(parsed.hostname)
      ) {
        candidates.push(target);
      }
    } catch {
      /* ignore invalid target */
    }
  }

  const validImdb = imdbId && IMDB_ID_RE.test(imdbId) ? imdbId : null;
  if (validImdb) {
    candidates.push(`https://images.metahub.space/poster/medium/${validImdb}/img`);
    candidates.push(`https://images.metahub.space/poster/small/${validImdb}/img`);
  }

  for (const c of candidates) {
    const hit = await fetchImageResponse(c);
    if (hit) return hit;
  }

  if (validImdb) {
    try {
      const tvRes = await fetch(`https://api.tvmaze.com/lookup/shows?imdb=${validImdb}`, {
        signal: AbortSignal.timeout(4500),
      });
      if (tvRes.ok) {
        const show = (await tvRes.json()) as { image?: { medium?: string; original?: string } };
        const imgUrl = show.image?.medium || show.image?.original;
        if (imgUrl) {
          const hit = await fetchImageResponse(imgUrl);
          if (hit) return hit;
        }
      }
    } catch {
      /* try IMDb suggestion next */
    }

    try {
      const imdbRes = await fetch(
        `https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(validImdb)}.json`,
        { signal: AbortSignal.timeout(4500) },
      );
      if (imdbRes.ok) {
        const json = (await imdbRes.json()) as {
          d?: { id?: string; i?: { imageUrl?: string } }[];
        };
        const exact = json.d?.find((entry) => entry.id === validImdb);
        const imgUrl = exact?.i?.imageUrl;
        if (imgUrl) {
          const hit = await fetchImageResponse(imgUrl);
          if (hit) return hit;
        }
      }
    } catch {
      /* ignore */
    }
  }

  return new Response("Image unavailable", { status: 404 });
}

export async function handleMediaProxyRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const isHls = url.pathname === "/api/media/hls";
  const isSub = url.pathname === "/api/media/sub";
  const isSeg = url.pathname === "/api/media/segment";
  const isImg = url.pathname === "/api/media/image";
  if (!isHls && !isSub && !isSeg && !isImg) return null;

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (isImg) {
    return handleMediaImageProxy(url);
  }

  let upstreamUrl: string;
  let customHeaders: Record<string, string> = { ...UPSTREAM_HEADERS };

  if (isHls) {
    const id = url.searchParams.get("id");
    if (!id || !STREAM_ID_RE.test(id)) {
      return new Response("Invalid stream identifier", { status: 400 });
    }
    upstreamUrl = `${UPSTREAM_ORIGIN}/_stream?id=${encodeURIComponent(id)}`;
  } else if (isSub) {
    const ref = url.searchParams.get("ref");
    if (!ref || !SUB_REF_RE.test(ref)) {
      return new Response("Invalid subtitle reference", { status: 400 });
    }
    upstreamUrl = `${UPSTREAM_ORIGIN}/pl/api.php?a=sub&ref=${encodeURIComponent(ref)}`;
  } else {
    const payload = verifyMediaProxyToken(url.searchParams.get("token"));
    if (!payload) {
      return new Response("Invalid or expired stream token", { status: 403 });
    }
    upstreamUrl = payload.u;
    customHeaders = {
      "User-Agent": UPSTREAM_HEADERS["User-Agent"]!,
      Accept: "*/*",
      ...(payload.ref ? { Referer: payload.ref } : {}),
    };
    const range = request.headers.get("range");
    if (range) customHeaders["Range"] = range;
  }

  try {
    const upstream = await fetchWithRetry(upstreamUrl, {
      headers: customHeaders,
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });

    if (!upstream.ok) {
      return new Response(`Stream proxy error (${upstream.status})`, {
        status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502,
      });
    }

    const contentType = upstream.headers.get("content-type") ?? "";
    const looksLikePlaylist =
      isHls ||
      /mpegurl|m3u8/i.test(contentType) ||
      /\.m3u8(\?|#|$)/i.test(upstreamUrl) ||
      /master\.txt(\?|#|$)/i.test(upstreamUrl);

    if (looksLikePlaylist) {
      const text = await upstream.text();
      if (text.includes("#EXTM3U")) {
        const rewritten = rewriteMediaPlaylist(text, upstream.url || upstreamUrl);
        return new Response(rewritten, {
          status: 200,
          headers: {
            "content-type": "application/vnd.apple.mpegurl; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      }
      return new Response(text, {
        status: 200,
        headers: {
          "content-type": contentType || "text/plain; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }

    const headers = new Headers({
      "content-type":
        contentType || (isSub ? "text/vtt; charset=utf-8" : "application/octet-stream"),
      "cache-control": isSub ? "public, max-age=3600" : "public, max-age=300",
    });
    const cl = upstream.headers.get("content-length");
    if (cl) headers.set("content-length", cl);
    const cr = upstream.headers.get("content-range");
    if (cr) headers.set("content-range", cr);
    const ar = upstream.headers.get("accept-ranges");
    if (ar) headers.set("accept-ranges", ar);

    return new Response(upstream.body, {
      status: upstream.status === 206 ? 206 : 200,
      headers,
    });
  } catch (error) {
    console.error("Media proxy error", error);
    return new Response("Failed to fetch stream data", { status: 502 });
  }
}
