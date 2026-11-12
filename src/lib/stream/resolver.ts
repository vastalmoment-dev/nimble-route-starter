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

/** Royalty-free sample streams so the player and downloads work out of the box. */
export const DEMO_STREAMS: { url: string; type: StreamType; name: string }[] = [
  { name: "Big Buck Bunny", type: "hls", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" },
  {
    name: "Tears of Steel",
    type: "hls",
    url: "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8",
  },
  { name: "Tears of Steel (fMP4)", type: "hls", url: "https://test-streams.mux.dev/tos_ismc/main.m3u8" },
  {
    name: "Apple BipBop",
    type: "hls",
    url: "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8",
  },
];

export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const demoResolver: StreamResolver = {
  name: "demo",
  async resolve(req) {
    const pick = DEMO_STREAMS[hashString(`${req.source}:${req.id}:${req.episode}`) % DEMO_STREAMS.length]!;
    return { url: pick.url, type: pick.type, provider: `Sample stream · ${pick.name}`, isDemo: true };
  },
};

function configuredResolvers(): StreamResolver[] {
  const base = (import.meta.env as Record<string, string | undefined>)["VITE_STREAM_RESOLVER_URL"];
  return base ? [endpointResolver(base), demoResolver] : [demoResolver];
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
