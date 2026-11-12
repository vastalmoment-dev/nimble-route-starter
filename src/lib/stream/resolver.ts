import type { Source } from "@/lib/catalog/types";

export type StreamType = "hls" | "mp4";

export interface ResolvedStream {
  url: string;
  type: StreamType;
  /** Human label, e.g. which resolver answered. */
  provider: string;
  /** True when the stream is a placeholder sample, not the licensed title. */
  isDemo: boolean;
}

export interface StreamRequest {
  source: Source;
  id: string;
  episode: number;
  title: string;
}

/** Any backend that can answer `{ url, type }` for a title plugs in here. */
export interface StreamResolver {
  name: string;
  resolve(req: StreamRequest): Promise<ResolvedStream | null>;
}

export function inferStreamType(url: string, hint?: string | null): StreamType {
  const h = hint?.toLowerCase();
  if (h === "hls" || h === "m3u8" || h === "application/x-mpegurl") return "hls";
  if (h === "mp4" || h === "video/mp4") return "mp4";
  return /\.m3u8(\?|#|$)/i.test(url) ? "hls" : "mp4";
}

/**
 * Endpoint resolver: set VITE_STREAM_RESOLVER_URL to an endpoint that returns JSON
 * `{ "url": "...", "type": "hls" | "mp4" }` for `?source=&id=&episode=`.
 */
export function endpointResolver(base: string): StreamResolver {
  return {
    name: "endpoint",
    async resolve(req) {
      const u = new URL(base);
      u.searchParams.set("source", req.source);
      u.searchParams.set("id", req.id);
      u.searchParams.set("episode", String(req.episode));
      const res = await fetch(u.toString(), { headers: { Accept: "application/json" } });
      if (!res.ok) return null;
      const body = (await res.json()) as { url?: string; type?: string };
      if (!body.url) return null;
      return { url: body.url, type: inferStreamType(body.url, body.type), provider: u.host, isDemo: false };
    },
  };
}

export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const RESOLVER_BASE = (import.meta.env as Record<string, string | undefined>)["VITE_STREAM_RESOLVER_URL"];

/** True only when a real (licensed) stream source is configured. */
export const hasStreamSource = Boolean(RESOLVER_BASE);

function configuredResolvers(): StreamResolver[] {
  return RESOLVER_BASE ? [endpointResolver(RESOLVER_BASE)] : [];
}

/** Tries each resolver in order; the first `{url, type}` wins. */
export async function resolveStream(req: StreamRequest, resolvers = configuredResolvers()): Promise<ResolvedStream> {
  for (const r of resolvers) {
    try {
      const out = await r.resolve(req);
      if (out) return out;
    } catch (error) {
      console.warn(`Stream resolver "${r.name}" failed`, error);
    }
  }
  throw new Error("No stream is available for this title.");
}
