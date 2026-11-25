const UPSTREAM_ORIGIN = "https://vidsrc.buzz";

const UPSTREAM_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Referer: `${UPSTREAM_ORIGIN}/`,
  Origin: UPSTREAM_ORIGIN,
  Accept: "*/*",
};

const STREAM_ID_RE = /^[a-zA-Z0-9_-]{8,128}$/;
const SUB_REF_RE = /^[A-Za-z0-9._~=-]{10,1024}$/;

export function rewriteMediaPlaylist(body: string): string {
  return body
    .replaceAll(`${UPSTREAM_ORIGIN}/pl/_stream`, "/api/media/hls")
    .replaceAll(`${UPSTREAM_ORIGIN}/_stream`, "/api/media/hls")
    .replaceAll("/pl/_stream", "/api/media/hls")
    .replaceAll("/_stream", "/api/media/hls");
}

export async function handleMediaProxyRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const isHls = url.pathname === "/api/media/hls";
  const isSub = url.pathname === "/api/media/sub";
  if (!isHls && !isSub) return null;

  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  let upstreamUrl: string;
  if (isHls) {
    const id = url.searchParams.get("id");
    if (!id || !STREAM_ID_RE.test(id)) {
      return new Response("Invalid stream identifier", { status: 400 });
    }
    // Pin strictly to the upstream stream endpoint using validated token id (no arbitrary URLs).
    upstreamUrl = `${UPSTREAM_ORIGIN}/_stream?id=${encodeURIComponent(id)}`;
  } else {
    const ref = url.searchParams.get("ref");
    if (!ref || !SUB_REF_RE.test(ref)) {
      return new Response("Invalid subtitle reference", { status: 400 });
    }
    upstreamUrl = `${UPSTREAM_ORIGIN}/pl/api.php?a=sub&ref=${encodeURIComponent(ref)}`;
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: UPSTREAM_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });

    if (!upstream.ok) {
      return new Response(`Stream proxy error (${upstream.status})`, {
        status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502,
      });
    }

    const contentType = upstream.headers.get("content-type") ?? "";
    if (isHls) {
      const text = await upstream.text();
      const rewritten = text.includes("#EXTM3U") ? rewriteMediaPlaylist(text) : text;
      return new Response(rewritten, {
        status: 200,
        headers: {
          "content-type": "application/vnd.apple.mpegurl; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "content-type": contentType || "text/vtt; charset=utf-8",
        "cache-control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Media proxy error", error);
    return new Response("Failed to fetch stream data", { status: 502 });
  }
}
