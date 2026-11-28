export const PRESENCE_TTL_MS = 45_000;

const SHOW_KEY_RE = /^[a-z0-9:_-]{2,140}$/i;
const SESSION_ID_RE = /^[a-z0-9_-]{6,96}$/i;

const rooms = new Map<string, Map<string, number>>();

function pruneRoom(showKey: string, now = Date.now()): Map<string, number> | null {
  const room = rooms.get(showKey);
  if (!room) return null;
  for (const [sid, expiresAt] of room.entries()) {
    if (expiresAt <= now) {
      room.delete(sid);
    }
  }
  if (room.size === 0) {
    rooms.delete(showKey);
    return null;
  }
  return room;
}

export function isValidShowKey(raw: unknown): raw is string {
  return typeof raw === "string" && SHOW_KEY_RE.test(raw);
}

export function isValidSessionId(raw: unknown): raw is string {
  return typeof raw === "string" && SESSION_ID_RE.test(raw);
}

export function touchWatcher(
  showKey: string,
  sessionId: string,
  now = Date.now(),
  ttlMs = PRESENCE_TTL_MS,
): number {
  let room = pruneRoom(showKey, now);
  if (!room) {
    room = new Map<string, number>();
    rooms.set(showKey, room);
  }
  room.set(sessionId, now + ttlMs);
  return room.size;
}

export function leaveWatcher(showKey: string, sessionId: string, now = Date.now()): number {
  const room = pruneRoom(showKey, now);
  if (!room) return 0;
  room.delete(sessionId);
  if (room.size === 0) {
    rooms.delete(showKey);
    return 0;
  }
  return room.size;
}

export function getWatcherCount(showKey: string, now = Date.now()): number {
  const room = pruneRoom(showKey, now);
  return room ? room.size : 0;
}

export function clearPresenceStore(): void {
  rooms.clear();
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function handlePresenceRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/presence") return null;

  if (request.method === "GET") {
    const showKey = url.searchParams.get("showKey");
    if (!isValidShowKey(showKey)) {
      return jsonResponse({ ok: false, error: "Invalid showKey parameter" }, 400);
    }
    return jsonResponse({ ok: true, showKey, count: getWatcherCount(showKey) });
  }

  if (request.method === "POST" || request.method === "DELETE") {
    let showKey: unknown = url.searchParams.get("showKey");
    let sessionId: unknown = url.searchParams.get("sessionId");
    let action: unknown = request.method === "DELETE" ? "leave" : "heartbeat";

    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json") || contentType.includes("text/plain")) {
      try {
        const text = await request.text();
        if (text) {
          const parsed = JSON.parse(text) as {
            showKey?: unknown;
            sessionId?: unknown;
            action?: unknown;
          };
          showKey = parsed.showKey ?? showKey;
          sessionId = parsed.sessionId ?? sessionId;
          action = parsed.action ?? action;
        }
      } catch {
        return jsonResponse({ ok: false, error: "Invalid presence payload" }, 400);
      }
    }

    if (!isValidShowKey(showKey) || !isValidSessionId(sessionId)) {
      return jsonResponse({ ok: false, error: "Invalid presence identifiers" }, 400);
    }

    const count =
      action === "leave" ? leaveWatcher(showKey, sessionId) : touchWatcher(showKey, sessionId);
    return jsonResponse({ ok: true, showKey, count });
  }

  return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
}
