import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

function getAllowedHosts(request: Request): Set<string> {
  const hosts = new Set<string>();
  try {
    hosts.add(new URL(request.url).host.toLowerCase());
  } catch {
    /* ignore invalid request URL */
  }
  const host = request.headers.get("host")?.trim().toLowerCase();
  if (host) hosts.add(host);
  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();
  if (forwardedHost) hosts.add(forwardedHost);
  return hosts;
}

function isSameHostUrl(raw: string | null, request: Request): boolean {
  if (!raw) return false;
  try {
    return getAllowedHosts(request).has(new URL(raw).host.toLowerCase());
  } catch {
    return false;
  }
}

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests while allowing embedded preview iframes whose
// Origin/Referer matches the app host.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
  origin: (origin, ctx) => isSameHostUrl(origin, ctx.request),
  secFetchSite: (fetchSite, ctx) => {
    if (fetchSite === "same-origin") return true;
    if (fetchSite === "cross-site") {
      const origin = ctx.request.headers.get("origin");
      if (origin !== null) return isSameHostUrl(origin, ctx.request);
      const referer = ctx.request.headers.get("referer");
      if (referer !== null) return isSameHostUrl(referer, ctx.request);
    }
    return false;
  },
});

// requestMiddleware runs on every request; functionMiddleware only on server functions, where
// client sendContext is unvalidated input. Append to these arrays, never replace them.
// Enabling Lovable Cloud adds functionMiddleware: [attachSupabaseAuth], the bearer token that
// requireSupabaseAuth server functions need. Add it by hand only if Lovable Cloud or a
// user-managed Supabase project is connected, no middleware here sets Authorization, and the
// project did not intentionally replace it.
export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware, csrfMiddleware],
}));
