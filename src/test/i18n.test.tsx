import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageToggle } from "@/components/media/LanguageToggle";
import VideoPlayer from "@/components/player/VideoPlayer";
import { cachedAsync } from "@/lib/cache/client-cache";
import { LanguageProvider, useT } from "@/lib/i18n";
import { detectInitialLanguage, siteLanguage } from "@/lib/i18n/language";
import { fetchMangaChaptersList } from "@/lib/manga/mangadex";

function BilingualProbe() {
  const { lang, t } = useT();
  return (
    <div>
      <LanguageToggle />
      <span data-testid="lang">{lang}</span>
      <span data-testid="nav-home">{t("nav.home")}</span>
      <span data-testid="nav-watchlist">{t("nav.watchlist")}</span>
      <span data-testid="watch-now">{t("common.watchNow")}</span>
      <span data-testid="discord">{t("shell.joinDiscord")}</span>
    </div>
  );
}

describe("Bilingual i18n context, persistence, subtitles, and API localization", () => {
  const origNavLang = Object.getOwnPropertyDescriptor(window.navigator, "language");

  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    siteLanguage.set("en");
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    if (origNavLang) {
      Object.defineProperty(window.navigator, "language", origNavLang);
    } else {
      Reflect.deleteProperty(window.navigator, "language");
    }
    window.localStorage.clear();
    siteLanguage.set("en");
  });

  it("auto-detects French from navigator.language on first visit and persists shadow_lang", () => {
    Object.defineProperty(window.navigator, "language", {
      configurable: true,
      value: "fr-FR",
    });

    expect(detectInitialLanguage()).toBe("fr");

    siteLanguage.set("en");
    expect(window.localStorage.getItem("shadow_lang")).toBe("en");
    expect(detectInitialLanguage()).toBe("en");

    siteLanguage.set("fr");
    expect(window.localStorage.getItem("shadow_lang")).toBe("fr");
    expect(detectInitialLanguage()).toBe("fr");
  });

  it("updates UI translation dictionary immediately when LanguageToggle is clicked", async () => {
    render(
      <LanguageProvider>
        <BilingualProbe />
      </LanguageProvider>,
    );

    expect(screen.getByTestId("nav-home").textContent).toBe("Home");
    expect(screen.getByTestId("nav-watchlist").textContent).toBe("My Watchlist");
    expect(screen.getByTestId("watch-now").textContent).toBe("Watch Now");
    expect(screen.getByTestId("discord").textContent).toBe("Join Discord");

    fireEvent.click(screen.getByRole("button", { name: "FR" }));

    await waitFor(() => {
      expect(screen.getByTestId("lang").textContent).toBe("fr");
    });
    expect(screen.getByTestId("nav-home").textContent).toBe("Accueil");
    expect(screen.getByTestId("nav-watchlist").textContent).toBe("Ma Liste");
    expect(screen.getByTestId("watch-now").textContent).toBe("Regarder");
    expect(screen.getByTestId("discord").textContent).toBe("Rejoindre Discord");
    expect(window.localStorage.getItem("shadow_lang")).toBe("fr");
  });

  it("auto-selects French subtitles when lang === 'fr' and translates player controls", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 200 }));

    siteLanguage.set("fr");

    const qc = new QueryClient();
    const { container } = render(
      <QueryClientProvider client={qc}>
        <LanguageProvider>
          <VideoPlayer
            stream={{
              url: "https://example.com/movie.mp4",
              type: "mp4",
              provider: "SHADOW",
              isDemo: false,
              subtitles: [
                { url: "https://example.com/en.vtt", lang: "en", label: "English" },
                { url: "https://example.com/fr.vtt", lang: "fr", label: "Français" },
              ],
            }}
            title="Inception"
            onBack={() => {}}
          />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      const tracks = container.querySelectorAll("track");
      expect(tracks).toHaveLength(2);
      expect(tracks[0]?.hasAttribute("default")).toBe(false);
      expect(tracks[1]?.hasAttribute("default")).toBe(true);
    });

    fireEvent.click(screen.getByRole("button", { name: "Paramètres" }));
    expect(await screen.findByText(/Sous-titres \(C\)/i)).toBeTruthy();
    expect(screen.getByText(/Vitesse/i)).toBeTruthy();
  });

  it("queries MangaDex French chapters first when lang === 'fr' and falls back to English when none exist", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                id: "ch-en-1",
                attributes: {
                  chapter: "1",
                  volume: "1",
                  title: "Chapter One",
                  pages: 20,
                  publishAt: "2026-01-01T00:00:00Z",
                },
                relationships: [],
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

    const chapters = await fetchMangaChaptersList("11111111-1111-4111-8111-111111111111", "fr");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("translatedLanguage%5B%5D=fr");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("translatedLanguage%5B%5D=en");
    expect(chapters).toHaveLength(1);
    expect(chapters[0]?.id).toBe("ch-en-1");
  });

  it("isolates EN and FR cached responses in client-cache using language-scoped keys", async () => {
    const enVal = await cachedAsync("test:catalog:en", 60_000, async () => ({ lang: "en" }));
    const frVal = await cachedAsync("test:catalog:fr", 60_000, async () => ({ lang: "fr" }));

    expect(enVal.lang).toBe("en");
    expect(frVal.lang).toBe("fr");
  });
});
