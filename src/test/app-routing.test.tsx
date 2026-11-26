import { QueryClient } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
  rootRouteId,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("matches a page for / and /manga while /novels is removed", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    expect(router.matchRoutes("/").at(-1)?.routeId).not.toBe(rootRouteId);
    expect(router.matchRoutes("/manga").at(-1)?.routeId).toBe("/manga");
    expect(router.matchRoutes("/novels").some((m) => String(m.routeId) === "/novels")).toBe(false);
  });

  it("navigates cleanly to /search on search input and handles numeric queries safely", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const router = createRouter({
      routeTree,
      context: { queryClient },
      history: createMemoryHistory({ initialEntries: ["/watchlist"] }),
    });

    await router.load();
    render(<RouterProvider router={router} />);

    const input = await screen.findByLabelText("Search titles");
    fireEvent.focus(input);
    expect(router.state.location.pathname).toBe("/watchlist");
    expect(screen.queryByText(/This page didn't load/i)).toBeNull();

    fireEvent.change(input, { target: { value: "bad guys" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/search");
      expect((router.state.location.search as { q?: string }).q).toBe("bad guys");
    });
    expect(screen.queryByText(/This page didn't load/i)).toBeNull();
    expect(await screen.findByText(/Results for/i)).toBeTruthy();

    fireEvent.change(input, { target: { value: "1917" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => {
      expect((router.state.location.search as { q?: string }).q).toBe("1917");
    });
    expect(screen.queryByText(/This page didn't load/i)).toBeNull();
    vi.restoreAllMocks();
  });
});
