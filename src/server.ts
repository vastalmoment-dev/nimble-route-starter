import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { handleAniLastProxyRequest } from "./lib/stream/anilast-proxy";
import { handleMangaProxyRequest } from "./lib/manga/manga-proxy";
import { handleMediaProxyRequest } from "./lib/stream/media-proxy";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

const EDGE_CACHED_IMAGE_PATHS = new Set([
  "/api/manga/cover",
  "/api/manga/page",
  "/api/media/image",
]);

function withEdgeImageCache(request: Request, response: Response): Response {
  if (!response.ok) return response;
  if (request.method !== "GET" && request.method !== "HEAD") return response;
  const pathname = new URL(request.url).pathname;
  if (!EDGE_CACHED_IMAGE_PATHS.has(pathname)) return response;

  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "public, max-age=86400, s-maxage=86400");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function syncRuntimeEnv(env: unknown) {
  if (!env || typeof env !== "object" || typeof process === "undefined" || !process.env) return;
  const target = process.env;
  const source = env as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    const val = source[key];
    if (typeof val === "string" && val.length > 0 && !target[key]) {
      target[key] = val;
    }
  }
}

// Hosting compresses every response at the edge. Never compress a body (gzip, brotli,
// CompressionStream) or set content-encoding here or in a server route: the body gets encoded
// twice and renders garbled.
export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    syncRuntimeEnv(env);
    try {
      const proxiedAnime = await handleAniLastProxyRequest(request);
      if (proxiedAnime) return proxiedAnime;
      const proxiedMedia = await handleMediaProxyRequest(request);
      if (proxiedMedia) return withEdgeImageCache(request, proxiedMedia);
      const proxiedManga = await handleMangaProxyRequest(request);
      if (proxiedManga) return withEdgeImageCache(request, proxiedManga);
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
