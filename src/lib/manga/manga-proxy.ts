import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const MANGADEX_API = "https://api.mangadex.org";
const MANGADEX_UPLOADS = "https://uploads.mangadex.org";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COVER_FILE_RE = /^[a-zA-Z0-9._-]{3,120}$/;

let fallbackSecret: string | null = null;

function getSecret(): string {
  const envSecret =
    process.env["MANGA_PROXY_SECRET"] ||
    process.env["MEDIA_PROXY_SECRET"] ||
    process.env["SESSION_SECRET"];
  if (envSecret) return envSecret;
  if (!fallbackSecret) fallbackSecret = randomBytes(32).toString("hex");
  return fallbackSecret;
}

const USER_AGENT = "ShadowStreamingApp/1.0 (https://shadow.app)";

function signPageToken(url: string): string {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 6;
  const body = Buffer.from(JSON.stringify({ u: url, exp }), "utf8").toString("base64url");
  const sig = createHmac("sha256", getSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function buildSignedMangaPageUrl(upstreamUrl: string): string {
  return `/api/manga/page?token=${encodeURIComponent(signPageToken(upstreamUrl))}`;
}

export function isAllowedMangaImageHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === "uploads.mangadex.org" || h.endsWith(".mangadex.network") || h.endsWith(".mangadex.org")
  );
}

export function verifyPageToken(token: string | null): string | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!body || !sig) return null;
  const expected = createHmac("sha256", getSecret()).update(body).digest("base64url");
  const sigBuf = Buffer.from(sig, "utf8");
  const expBuf = Buffer.from(expected, "utf8");
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      u?: unknown;
      exp?: unknown;
    };
    if (typeof payload.u !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    const parsed = new URL(payload.u);
    if (parsed.protocol !== "https:" || !isAllowedMangaImageHost(parsed.hostname)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

// Precomputed CRC-32 lookup table for valid ZIP/CBZ archives.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** Builds a valid uncompressed ZIP (STORE method 0) buffer suitable for .cbz manga readers. */
export function buildCbzArchive(files: { name: string; data: Uint8Array }[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, "utf8");
    const dataBuf = Buffer.from(file.data.buffer, file.data.byteOffset, file.data.byteLength);
    const crc = crc32(dataBuf);
    const size = dataBuf.length;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // local file header signature
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
    localHeader.writeUInt16LE(0, 8); // compression method: STORE
    localHeader.writeUInt16LE(0, 10); // mod time
    localHeader.writeUInt16LE(0, 12); // mod date
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(size, 18);
    localHeader.writeUInt32LE(size, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra len

    localParts.push(localHeader, nameBuf, dataBuf);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // central dir signature
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0x0800, 8); // UTF-8
    centralHeader.writeUInt16LE(0, 10); // STORE
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(size, 20);
    centralHeader.writeUInt32LE(size, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += 30 + nameBuf.length + size;
  }

  const centralDirBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDirBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirBuf, eocd]);
}

function safeDownloadFilename(raw: string | null): string {
  const clean = (raw ?? "manga-chapter")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
  return `${clean || "manga-chapter"}.cbz`;
}

async function resolveDefaultChapterId(
  mangaId: string,
  which: "first" | "latest",
): Promise<{ chapterId: string; chLabel: string } | null> {
  const order = which === "first" ? "asc" : "desc";
  const url = `${MANGADEX_API}/manga/${mangaId}/feed?translatedLanguage[]=en&limit=20&order[chapter]=${order}&contentRating[]=safe&contentRating[]=suggestive&includeFuturePublishAt=0`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    data?: {
      id?: string;
      attributes?: { chapter?: string | null; pages?: number; externalUrl?: string | null };
    }[];
  };
  const valid = (json.data ?? []).find(
    (c) => c.id && !c.attributes?.externalUrl && (c.attributes?.pages ?? 0) > 0,
  );
  if (!valid?.id) return null;
  return {
    chapterId: valid.id,
    chLabel: valid.attributes?.chapter ? `Ch-${valid.attributes.chapter}` : "Ch-1",
  };
}

export async function handleMangaProxyRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/manga/")) return null;
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });

  if (url.pathname === "/api/manga/cover") {
    const mangaId = url.searchParams.get("mangaId") ?? "";
    const file = url.searchParams.get("file") ?? "";
    if (!UUID_RE.test(mangaId) || !COVER_FILE_RE.test(file) || file.includes("..")) {
      return new Response("Invalid cover parameters", { status: 400 });
    }
    const candidates = [
      `${MANGADEX_UPLOADS}/covers/${mangaId}/${file}.512.jpg`,
      `${MANGADEX_UPLOADS}/covers/${mangaId}/${file}`,
    ];
    for (const candidate of candidates) {
      try {
        const up = await fetch(candidate, {
          headers: { "User-Agent": USER_AGENT, Referer: "https://mangadex.org/" },
          signal: AbortSignal.timeout(8000),
        });
        if (!up.ok) continue;
        return new Response(up.body, {
          status: 200,
          headers: {
            "Content-Type": up.headers.get("content-type") || "image/jpeg",
            "Cache-Control": "public, max-age=86400, s-maxage=86400",
          },
        });
      } catch {
        /* try fallback cover */
      }
    }
    return new Response("Cover not found", { status: 404 });
  }

  if (url.pathname === "/api/manga/page") {
    const targetUrl = verifyPageToken(url.searchParams.get("token"));
    if (!targetUrl) return new Response("Invalid or expired page token", { status: 403 });
    try {
      const up = await fetch(targetUrl, {
        headers: { "User-Agent": USER_AGENT, Referer: "https://mangadex.org/" },
        signal: AbortSignal.timeout(12000),
      });
      if (!up.ok) return new Response("Page image unavailable", { status: up.status });
      return new Response(up.body, {
        status: 200,
        headers: {
          "Content-Type": up.headers.get("content-type") || "image/jpeg",
          "Cache-Control": "public, max-age=86400, s-maxage=86400",
        },
      });
    } catch {
      return new Response("Page fetch failed", { status: 502 });
    }
  }

  if (url.pathname === "/api/manga/download") {
    let chapterId = url.searchParams.get("chapterId") ?? "";
    let chSuffix = "";
    if (!chapterId) {
      const mangaId = url.searchParams.get("mangaId") ?? "";
      const which = url.searchParams.get("which") === "first" ? "first" : "latest";
      if (!UUID_RE.test(mangaId)) {
        return new Response("Missing valid chapterId or mangaId", { status: 400 });
      }
      const resolved = await resolveDefaultChapterId(mangaId, which);
      if (!resolved) {
        return new Response("No downloadable chapter available yet", { status: 404 });
      }
      chapterId = resolved.chapterId;
      chSuffix = `-${resolved.chLabel}`;
    }

    if (!UUID_RE.test(chapterId)) {
      return new Response("Invalid chapter identifier", { status: 400 });
    }

    try {
      const atHomeRes = await fetch(`${MANGADEX_API}/at-home/server/${chapterId}`, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      });
      if (!atHomeRes.ok) {
        return new Response("Chapter source unavailable right now", { status: 502 });
      }
      const atHome = (await atHomeRes.json()) as {
        baseUrl?: string;
        chapter?: { hash?: string; data?: string[]; dataSaver?: string[] };
      };
      const baseUrl = atHome.baseUrl;
      const hash = atHome.chapter?.hash;
      const useSaver = !atHome.chapter?.data?.length;
      const pages = useSaver ? atHome.chapter?.dataSaver : atHome.chapter?.data;

      if (!baseUrl || !hash || !pages?.length) {
        return new Response("Chapter contains no downloadable pages", { status: 404 });
      }

      const parsedBase = new URL(baseUrl);
      if (parsedBase.protocol !== "https:" || !isAllowedMangaImageHost(parsedBase.hostname)) {
        return new Response("Disallowed image host", { status: 403 });
      }

      const folder = useSaver ? "data-saver" : "data";
      const selected = pages.slice(0, 120);
      const downloaded: ({ name: string; data: Uint8Array } | null)[] = new Array(
        selected.length,
      ).fill(null);

      // Fetch pages cleanly in bounded batches of 5.
      for (let i = 0; i < selected.length; i += 5) {
        const batch = selected.slice(i, i + 5);
        await Promise.all(
          batch.map(async (fileName, j) => {
            const idx = i + j;
            const pageUrl = `${parsedBase.origin}/${folder}/${hash}/${fileName}`;
            const imgRes = await fetch(pageUrl, {
              headers: { "User-Agent": USER_AGENT },
              signal: AbortSignal.timeout(12000),
            });
            if (!imgRes.ok) return;
            const arr = new Uint8Array(await imgRes.arrayBuffer());
            const extMatch = /\.(png|jpe?g|webp|gif)$/i.exec(fileName);
            const ext = extMatch ? extMatch[0].toLowerCase() : ".jpg";
            const padded = String(idx + 1).padStart(3, "0");
            downloaded[idx] = { name: `${padded}${ext}`, data: arr };
          }),
        );
      }

      const files = downloaded.filter((f): f is { name: string; data: Uint8Array } => f !== null);
      if (!files.length) {
        return new Response("Failed to retrieve chapter pages", { status: 502 });
      }

      const archive = buildCbzArchive(files);
      const rawName = (url.searchParams.get("title") ?? "manga") + chSuffix;
      const fileName = safeDownloadFilename(rawName);

      return new Response(new Uint8Array(archive), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.comicbook+zip",
          "Content-Disposition": `attachment; filename="${fileName}"`,
          "Content-Length": String(archive.length),
          "Cache-Control": "no-store",
        },
      });
    } catch (error) {
      console.error("Manga download failed", error);
      return new Response("Failed to bundle chapter download", { status: 502 });
    }
  }

  return null;
}
