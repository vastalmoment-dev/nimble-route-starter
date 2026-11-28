import crypto from "node:crypto";

const UPSTREAM_ORIGIN = "https://vidsrc.buzz";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function buildBrowserProxyHeaders(options: {
  referer?: string;
  origin?: string;
  accept?: string;
  range?: string | null;
  sameOrigin?: boolean;
}): Record<string, string> {
  // Build a fresh header map so incoming cf-* / x-forwarded-* / cookie headers are never leaked upstream.
  const headers: Record<string, string> = {
    "User-Agent": BROWSER_UA,
    Accept: options.accept ?? "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": options.sameOrigin ? "same-origin" : "cross-site",
  };
  if (options.referer) headers["Referer"] = options.referer;
  if (options.origin) headers["Origin"] = options.origin;
  if (options.range) headers["Range"] = options.range;
  return headers;
}

const UPSTREAM_HEADERS: Record<string, string> = buildBrowserProxyHeaders({
  referer: `${UPSTREAM_ORIGIN}/`,
  origin: UPSTREAM_ORIGIN,
  sameOrigin: true,
});

function isDisallowedUpstreamHost(hostname: string): boolean {
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

function isHtmlOrChallengeBody(text: string, contentType: string): boolean {
  if (/text\/html/i.test(contentType)) return true;
  const head = text.slice(0, 600).toLowerCase();
  return (
    head.includes("<!doctype") ||
    head.includes("<html") ||
    head.includes("just a moment") ||
    head.includes("cf-browser-verification") ||
    head.includes("attention required")
  );
}

function proxyJsonError(
  message: string,
  upstreamStatus: number,
  status = 502,
  extra?: Record<string, unknown>,
  retryAfter?: string | null,
): Response {
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  };
  if (retryAfter) {
    headers["retry-after"] = retryAfter;
  }
  return new Response(
    JSON.stringify({
      ok: false,
      error: message,
      upstreamStatus,
      blocked: upstreamStatus === 403 || upstreamStatus === 503 || upstreamStatus === 429,
      ...extra,
    }),
    {
      status,
      headers,
    },
  );
}

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
  kind?: "segment" | "sub";
  exp: number;
}

export function signMediaProxyUrl(upstreamUrl: string, referer?: string): string {
  const payload: TokenPayload = {
    u: upstreamUrl,
    ...(referer ? { ref: referer } : {}),
    kind: "segment",
    exp: Date.now() + 1000 * 60 * 60 * 6,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", getSignSecret()).update(body).digest("base64url");
  return `/api/media/segment?token=${encodeURIComponent(`${body}.${sig}`)}`;
}

export function signSubtitleProxyUrl(upstreamUrl: string, referer?: string): string {
  const payload: TokenPayload = {
    u: upstreamUrl,
    ...(referer ? { ref: referer } : {}),
    kind: "sub",
    exp: Date.now() + 1000 * 60 * 60 * 6,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", getSignSecret()).update(body).digest("base64url");
  return `/api/media/sub?token=${encodeURIComponent(`${body}.${sig}`)}`;
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
    if (isDisallowedUpstreamHost(u.hostname)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function rewriteMediaPlaylist(
  body: string,
  baseUrl: string,
  referer = `${UPSTREAM_ORIGIN}/`,
): string {
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
      return signMediaProxyUrl(abs, referer);
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

const DISGUISED_SEG_TYPE_RE = /(text\/html|text\/css|text\/plain|javascript|ecmascript|image\/)/i;
const STRIP_PREFIX_HOST_RE = /\b(ibyteimg\.com|tiktokcdn\.com|ipstatp\.com|yoot\.akirax\.buzz)\b/i;

function prependChunkStream(
  firstChunk: Uint8Array,
  restReader: ReadableStreamDefaultReader<Uint8Array> | null,
): ReadableStream<Uint8Array> {
  let sentFirst = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!sentFirst) {
        sentFirst = true;
        if (firstChunk.byteLength > 0) {
          controller.enqueue(firstChunk);
          return;
        }
      }
      if (!restReader) {
        controller.close();
        return;
      }
      const { done, value } = await restReader.read();
      if (done) {
        controller.close();
        return;
      }
      if (value) controller.enqueue(value);
    },
    cancel() {
      void restReader?.cancel().catch(() => {});
    },
  });
}

async function readInitialChunk(
  res: Response,
  minBytes = 512,
): Promise<{ first: Uint8Array; reader: ReadableStreamDefaultReader<Uint8Array> | null }> {
  if (!res.body) {
    const ab = await res.arrayBuffer();
    return { first: new Uint8Array(ab), reader: null };
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let readerDone = false;
  while (total < minBytes) {
    const { done, value } = await reader.read();
    if (done) {
      readerDone = true;
      break;
    }
    if (value && value.byteLength > 0) {
      chunks.push(value);
      total += value.byteLength;
    }
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return { first: merged, reader: readerDone ? null : reader };
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
  let segmentReferer: string | undefined;
  let customHeaders: Record<string, string> = { ...UPSTREAM_HEADERS };

  if (isHls) {
    const id = url.searchParams.get("id");
    if (!id || !STREAM_ID_RE.test(id)) {
      return new Response("Invalid stream identifier", { status: 400 });
    }
    upstreamUrl = `${UPSTREAM_ORIGIN}/_stream?id=${encodeURIComponent(id)}`;
    customHeaders = buildBrowserProxyHeaders({
      referer: `${UPSTREAM_ORIGIN}/`,
      origin: UPSTREAM_ORIGIN,
      accept: "application/vnd.apple.mpegurl,application/x-mpegurl,*/*;q=0.8",
      sameOrigin: true,
    });
  } else if (isSub) {
    const token = url.searchParams.get("token");
    if (token) {
      const payload = verifyMediaProxyToken(token);
      if (!payload || (payload.kind && payload.kind !== "sub")) {
        return new Response("Invalid or expired subtitle token", { status: 403 });
      }
      upstreamUrl = payload.u;
      customHeaders = buildBrowserProxyHeaders({
        ...(payload.ref ? { referer: payload.ref } : {}),
        accept: "text/vtt,text/plain,*/*;q=0.8",
      });
    } else {
      const ref = url.searchParams.get("ref");
      if (!ref || !SUB_REF_RE.test(ref)) {
        return new Response("Invalid subtitle reference", { status: 400 });
      }
      upstreamUrl = `${UPSTREAM_ORIGIN}/pl/api.php?a=sub&ref=${encodeURIComponent(ref)}`;
    }
  } else {
    const payload = verifyMediaProxyToken(url.searchParams.get("token"));
    if (!payload) {
      return new Response("Invalid or expired stream token", { status: 403 });
    }
    upstreamUrl = payload.u;
    segmentReferer = payload.ref;
    let originHeader: string | undefined;
    let sameOrigin = false;
    try {
      const uOrigin = new URL(upstreamUrl).origin;
      if (payload.ref && new URL(payload.ref).origin === uOrigin) {
        originHeader = uOrigin;
        sameOrigin = true;
      } else if (payload.ref) {
        originHeader = new URL(payload.ref).origin;
      }
    } catch {
      /* ignore */
    }
    customHeaders = buildBrowserProxyHeaders({
      ...(payload.ref ? { referer: payload.ref } : {}),
      ...(originHeader ? { origin: originHeader } : {}),
      range: request.headers.get("range"),
      sameOrigin,
    });
  }

  try {
    const upstream = await fetchWithRetry(upstreamUrl, {
      headers: customHeaders,
      redirect: "follow",
    });

    if (!upstream.ok) {
      return proxyJsonError(
        `Upstream stream host returned HTTP ${upstream.status}`,
        upstream.status,
        upstream.status === 429 ? 429 : 502,
        undefined,
        upstream.headers.get("retry-after"),
      );
    }

    const contentType = upstream.headers.get("content-type") ?? "";
    const looksLikePlaylist =
      !isSub &&
      (isHls ||
        /mpegurl|m3u8/i.test(contentType) ||
        /\.m3u8(\?|#|$)/i.test(upstreamUrl) ||
        /master\.txt(\?|#|$)/i.test(upstreamUrl));

    if (looksLikePlaylist) {
      const text = await upstream.text();
      if (text.includes("#EXTM3U")) {
        const rewritten = rewriteMediaPlaylist(
          text,
          upstream.url || upstreamUrl,
          segmentReferer ?? `${UPSTREAM_ORIGIN}/`,
        );
        return new Response(rewritten, {
          status: 200,
          headers: {
            "content-type": "application/vnd.apple.mpegurl; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      }
      return proxyJsonError(
        isHtmlOrChallengeBody(text, contentType)
          ? "Upstream stream host returned a challenge/HTML page instead of an HLS playlist"
          : "Upstream returned an invalid HLS playlist",
        upstream.status,
        502,
        { blocked: true },
      );
    }

    if (
      isSeg &&
      (DISGUISED_SEG_TYPE_RE.test(contentType) || STRIP_PREFIX_HOST_RE.test(upstreamUrl))
    ) {
      const { first, reader } = await readInitialChunk(upstream);
      const isTsDirect = first.byteLength > 0 && first[0] === 0x47;
      const hasStripPrefix =
        first.byteLength > 252 &&
        first[0] !== 0x47 &&
        first[252] === 0x47 &&
        (STRIP_PREFIX_HOST_RE.test(upstreamUrl) ||
          (first[0] === 0x89 && first[1] === 0x50 && first[2] === 0x4e && first[3] === 0x47));

      if (!isTsDirect && !hasStripPrefix && /text\/html/i.test(contentType)) {
        const headText = new TextDecoder().decode(first.subarray(0, 600));
        if (first.byteLength === 0 || isHtmlOrChallengeBody(headText, "")) {
          void reader?.cancel().catch(() => {});
          return proxyJsonError(
            "Upstream segment host returned an HTML challenge instead of media data",
            upstream.status,
            502,
            { blocked: true },
          );
        }
      }

      const payloadFirst = hasStripPrefix ? first.subarray(252) : first;
      const isMpegTs = payloadFirst.byteLength > 0 && payloadFirst[0] === 0x47;
      const headers = new Headers({
        "content-type": isMpegTs ? "video/mp2t" : "application/octet-stream",
        "cache-control": "public, max-age=300",
      });
      if (!hasStripPrefix) {
        const cl = upstream.headers.get("content-length");
        if (cl) headers.set("content-length", cl);
      }
      const cr = upstream.headers.get("content-range");
      if (cr && !hasStripPrefix) headers.set("content-range", cr);
      const ar = upstream.headers.get("accept-ranges");
      if (ar && !hasStripPrefix) headers.set("accept-ranges", ar);

      return new Response(prependChunkStream(payloadFirst, reader), {
        status: upstream.status === 206 && !hasStripPrefix ? 206 : 200,
        headers,
      });
    }

    if (isSub && url.searchParams.get("token")) {
      const rawText = await upstream.text();
      const normalized = rawText.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
      const vttBody = normalized.trimStart().startsWith("WEBVTT")
        ? normalized
        : `WEBVTT\n\n${normalized.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")}`;
      return new Response(vttBody, {
        status: 200,
        headers: {
          "content-type": "text/vtt; charset=utf-8",
          "cache-control": "public, max-age=3600",
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
    return proxyJsonError("Failed to fetch upstream stream data", 504, 502, { blocked: true });
  }
}
