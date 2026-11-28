import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { GenreChipId } from "./catalog/genres";
import type { SectionId } from "./catalog/types";
import {
  detectInitialLanguage,
  siteLanguage,
  useSiteLanguage,
  type SiteLanguage,
} from "./i18n/language";

export type { SiteLanguage };

export interface LanguageContextValue {
  lang: SiteLanguage;
  setLang: (next: SiteLanguage) => void;
}

export const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<SiteLanguage>("en");

  useEffect(() => {
    const initial = detectInitialLanguage();
    setLangState(initial);
    if (siteLanguage.get() !== initial) {
      siteLanguage.set(initial);
    }
    const unsub = siteLanguage.subscribe(() => {
      setLangState(siteLanguage.get());
    });
    return () => {
      unsub();
    };
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang;
    }
  }, [lang]);

  const setLang = useCallback((next: SiteLanguage) => {
    siteLanguage.set(next);
    setLangState(next);
  }, []);

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);

  return createElement(LanguageContext.Provider, { value }, children);
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  const storeLang = useSiteLanguage();
  const fallbackSet = useCallback((next: SiteLanguage) => {
    siteLanguage.set(next);
  }, []);
  return ctx ?? { lang: storeLang, setLang: fallbackSet };
}

const EN = {
  // Navigation & Shell
  "nav.home": "Home",
  "nav.watchlist": "My Watchlist",
  "nav.anime": "Anime",
  "nav.kdramas": "K-Dramas",
  "nav.hollywood": "Hollywood",
  "nav.bollywood": "Bollywood",
  "nav.tollywood": "Tollywood",
  "nav.nollywood": "Nollywood",
  "nav.cartoons": "Cartoons",
  "nav.manga": "Manga",
  "nav.mood": "Get App",
  "nav.getApp": "Get App",
  "nav.settings": "Settings",
  "nav.search": "Search",
  "nav.mainAria": "Main",
  "nav.footerAria": "Footer",
  "shell.searchPlaceholder": "Search anime, cartoons, dramas, movies…",
  "shell.searchAria": "Search titles",
  "shell.clearSearch": "Clear search",
  "shell.closeSearch": "Close search",
  "shell.openMenu": "Open menu",
  "shell.collapse": "Collapse",
  "shell.expandSidebar": "Expand sidebar",
  "shell.collapseSidebar": "Collapse sidebar",
  "shell.joinDiscord": "Join Discord",
  "shell.discordShort": "Discord",
  "shell.policy": "Policy & DMCA",
  "shell.footerTagline":
    "Live streaming & free manga library for anime, cartoons, K-dramas, Hollywood, Bollywood, Tollywood and Nollywood. New releases appear automatically.",
  "shell.langFilter": "Language filter",

  // Common actions & states
  "common.watchNow": "Watch Now",
  "common.watchMovie": "Watch Movie",
  "common.resumeMovie": "Resume Movie",
  "common.moreInfo": "More Info",
  "common.backHome": "Back to Home",
  "common.backToSection": "Back to {section}",
  "common.back": "Back",
  "common.tryAgain": "Try again",
  "common.retry": "Retry",
  "common.loading": "Loading…",
  "common.loadingTitle": "Loading title…",
  "common.loadingEpisodes": "Loading seasons and episodes…",
  "common.all": "All",
  "common.saved": "Saved",
  "common.download": "Download",
  "common.downloadMovie": "Download Movie",
  "common.resume": "Resume",
  "common.goHome": "Go home",
  "common.goBack": "Go back",
  "common.notFoundTitle": "Page not found",
  "common.notFoundDesc": "The page you're looking for doesn't exist or has been moved.",
  "common.errorTitle": "This page didn't load",
  "common.errorDesc": "Something went wrong on our end. You can try refreshing or head back home.",

  // Sections & Genres
  "section.continueWatching": "Continue Watching",
  "continue.clearHistory": "Clear History",
  "continue.manageSettings": "History & Settings",
  "continue.removeAria": "Remove {title} from Continue Watching",
  "section.shelfErrorTitle": "This shelf went dark",
  "section.shelfErrorDesc":
    "We couldn't reach the catalog just now. Check your connection and try again.",
  "section.emptyGenres": "Nothing here matches those genres yet — try another mix.",
  "genre.filterAria": "Filter by genre",
  "genre.action": "Action",
  "genre.scifi": "Sci-Fi",
  "genre.horror": "Horror / Zombie",
  "genre.drama": "Drama",
  "genre.animation": "Animation",
  "genre.comedy": "Comedy",

  // Watchlist
  "watchlist.title": "My Watchlist",
  "watchlist.inWatchlist": "In Watchlist",
  "watchlist.add": "My Watchlist",
  "watchlist.emptySubtitle":
    "Save your favorite anime, cartoons, and movies here for instant playback.",
  "watchlist.titleSingular": "title",
  "watchlist.titlePlural": "titles",
  "watchlist.savedCountSuffix": "saved in this browser",
  "watchlist.clear": "Clear Watchlist",
  "watchlist.filterAria": "Filter watchlist",
  "watchlist.filterAll": "All Saved",
  "watchlist.filterAnime": "Anime",
  "watchlist.filterCartoons": "Cartoons",
  "watchlist.filterMovies": "Movies",
  "watchlist.filterSeries": "Shows & Dramas",
  "watchlist.filterOffline": "Saved Offline",
  "watchlist.offlineEmpty":
    "No episodes or movies saved offline yet. Hit Download on any title to store it in this browser.",
  "watchlist.offlineClear": "Clear Offline",
  "watchlist.playOffline": "Play Offline",
  "watchlist.exportFile": "Save File",
  "watchlist.removeOffline": "Remove",
  "watchlist.offlineStored": "saved locally for offline playback",
  "watchlist.emptyTitle": "Your watchlist is empty",
  "watchlist.emptyBody":
    "Tap the bookmark button on any anime, cartoon, or movie card to keep it handy right here.",
  "watchlist.browseAnime": "Browse Anime",
  "watchlist.browseCartoons": "Browse Cartoons",
  "watchlist.browseMovies": "Browse Movies",
  "watchlist.noFilterMatch": "No saved titles match that filter yet.",

  // Search
  "search.resultsFor": "Results for",
  "search.browseAll": "Browse everything",
  "search.searchingFull": "Searching full catalog…",
  "search.empty": "No titles match that yet. Try a different spelling or genre.",

  // Anime Catalog Grid
  "anime.allTitle": "All Anime",
  "anime.allSubtitleCount": "titles · Full seasons & episodes with Sub & Dub",
  "anime.allSubtitleDefault": "Browse the complete anime catalog with Sub & Dub playback",
  "anime.sortPopular": "Most Popular",
  "anime.sortTrending": "Trending",
  "anime.sortNewest": "Newest",
  "anime.sortTop": "Top Rated",
  "anime.sortAZ": "A–Z",
  "anime.emptyGenres": "No anime matched those genres yet — try clearing the genre chips above.",
  "anime.loadingMore": "Loading more anime…",
  "anime.loadMore": "Load more anime",
  "anime.shown": "shown",

  // Show Detail
  "detail.episodes": "Episodes",
  "detail.episode": "Episode",
  "detail.season": "Season",
  "detail.seasons": "Seasons",
  "detail.cast": "Cast",
  "detail.noSynopsis": "No synopsis available yet.",
  "detail.episodesUnavailable": "Episode list is unavailable right now.",
  "detail.upcomingSeasonStart": "Season",
  "detail.upcomingSeasonEnd":
    "is announced or upcoming — episodes will appear automatically once released.",
  "detail.featureMovieReady": "Full feature movie ready to watch or download offline.",
  "detail.featureMovie": "Feature movie",
  "detail.upcomingRelease": "Upcoming release",
  "detail.viewDetails": "View details",
  "detail.relationsAnime": "Season 2, Sequels & Future Seasons",
  "detail.relationsMovie": "Sequels, Future Releases & Series",
  "detail.relationsDefault": "More Seasons, Sequels & Related",
  "detail.downloadPlusSubs": "Download + Subs",
  "detail.noSubtitles": "No Subtitles",
  "detail.audioVersion": "Audio version",
  "detail.subsToggleHint": "Choose whether downloaded episodes include subtitle files",
  "detail.episodeLower": "episode",
  "detail.episodesLower": "episodes",
  "detail.selectEpisodes": "Select episodes",
  "detail.cancelSelect": "Done",
  "detail.selectAll": "Select all",
  "detail.clearSelection": "Clear",
  "detail.selectedCount": "{count} selected",
  "detail.downloadSelected": "Download selected ({count})",
  "detail.selectEpisodeAria": "Select episode {ep} for batch download",

  // Watch Page & Video Player
  "watch.discordPrompt": "Stream buffering or not loading?",
  "watch.discordCta": "Report it or request titles on our Discord",
  "watch.audioTrack": "Audio track",
  "watch.prevEpisode": "Previous episode",
  "watch.nextEpisode": "Next episode",
  "watch.episodeSelector": "Episode selector",
  "watch.closeEpisodes": "Close episodes",
  "watch.allSeasonsRelated": "All Seasons & Related",
  "watch.available": "available",
  "watch.episodesLower": "episodes",
  "watch.alternatePlayer": "Alternate Player",
  "watch.shadowPlayer": "SHADOW Player",
  "watch.switchAlternate": "Switch to alternate player",
  "watch.switchShadow": "Switch back to SHADOW player",
  "watch.plusSubs": "+ Subs",
  "watch.noSubs": "No Subs",
  "watch.fullMovie": "Full Movie",
  "watch.nowPlaying": "Now playing",
  "watch.officialTrailer": "Official trailer",
  "watch.noTrailer": "No trailer is available for this title yet.",
  "watch.retryStream": "Retry stream",
  "watch.loadingMovie": "Loading full movie stream…",
  "watch.streamUnavailable": "Stream temporarily unavailable for this episode.",
  "watch.switchTo": "Switch to",
  "watch.loadingAudioEp": "Loading {audio} stream for Episode {ep}…",
  "watch.loadingSeasonEp": "Loading Season {season} Episode {ep}…",
  "watch.server1": "Server 1",
  "watch.server2": "Server 2",
  "watch.server3Embed": "Server 3 · Direct Embed",
  "watch.directEmbed": "Direct Embed",
  "watch.embedNotice": "Direct browser player — switch providers below if one doesn't load:",
  "watch.nextServer": "Next server",
  "watch.switchingServer": "Server unavailable — switching to {server}…",
  "watch.vfUnavailable":
    "French dub (VF) is not available for this episode yet — try Sub (VOSTFR).",
  "watch.dubEnFrSubs": "DUB EN · FR Subs (VF unavailable)",
  "watch.watchingNow": "{count} watching now",
  "watch.watchingNowPlural": "{count} watching now",
  "watch.expandLandscape": "Expand landscape",
  "watch.offlineBadge": "Playing Offline",
  "watch.offlineUnavailable": "This offline copy is no longer stored on this device.",

  // VideoPlayer Controls
  "player.play": "Play",
  "player.pause": "Pause",
  "player.back10": "Back 10 seconds",
  "player.forward10": "Forward 10 seconds",
  "player.prevEpisode": "Previous episode",
  "player.nextEpisode": "Next episode",
  "player.skipIntro": "Skip Intro",
  "player.skippedIntro": "Skipped Intro",
  "player.mute": "Mute",
  "player.unmute": "Unmute",
  "player.muted": "Muted",
  "player.volume": "Volume",
  "player.jump": "Jump",
  "player.seek": "Seek",
  "player.autoNextOn": "Auto Next: On",
  "player.autoNextOff": "Auto Next: Off",
  "player.autoNextTitle": "Automatically play the next episode when this one finishes",
  "player.autoPlayNextMenu": "Auto-play next episode",
  "player.switchServer": "Switch server",
  "player.streamServers": "Stream Servers",
  "player.server": "Server",
  "player.quality": "Quality",
  "player.auto": "Auto",
  "player.subtitles": "Subtitles",
  "player.subtitlesOff": "Subtitles: Off",
  "player.noSubtitles": "No subtitles available",
  "player.off": "Off",
  "player.speed": "Speed",
  "player.settings": "Settings",
  "player.pip": "Picture in picture",
  "player.fullScreen": "Full screen",
  "player.exitFullScreen": "Exit full screen",
  "player.shortcuts": "Keyboard shortcuts",
  "player.audioTrack": "Audio Track",
  "player.original": "Original",
  "player.shortcutsTitle": "Keyboard Shortcuts",
  "player.closeShortcuts": "Close shortcuts",
  "player.shortcutPlayPause": "Play / Pause",
  "player.shortcutMute": "Mute / Unmute",
  "player.shortcutSeek": "Seek -10s / +10s",
  "player.shortcutArrows": "Seek Arrows",
  "player.shortcutVolume": "Volume",
  "player.shortcutFullscreen": "Full Screen",
  "player.shortcutSubtitles": "Subtitles",
  "player.shortcutSkipIntro": "Skip Intro",
  "player.shortcutJump": "Jump 0%–90%",
  "player.shortcutNext": "Next Episode",
  "player.upNextIn": "Up next in",
  "player.episodeFinished": "Episode finished",
  "player.playNext": "Play Next",
  "player.stay": "Stay",
  "player.errorTitle": "This stream couldn't be played.",
  "player.errorHint":
    "Try switching servers, switching to the alternate player, or picking another episode.",
  "player.retryStream": "Retry Stream",
  "player.tryNextServer": "Try Next Server",
  "player.switchingTo": "Switching to",
  "player.switchingBackup": "Switching to backup server",
  "player.racingBackups": "Primary server unresponsive — testing backup servers…",
  "player.switchingAlternate": "Switching to alternate player…",

  // Manga
  "manga.kicker": "Free Manga Library",
  "manga.title": "Manga",
  "manga.subtitle":
    "Read chapters online or download full chapters free as CBZ comic archives. New manga releases and freshly translated chapters appear here automatically.",
  "manga.feedLatest": "New Releases",
  "manga.feedPopular": "Popular",
  "manga.feedTop": "Top Rated",
  "manga.feedNewest": "Newly Added",
  "manga.feedsAria": "Manga feeds",
  "manga.searchPlaceholder": "Search manga by title or keyword…",
  "manga.searchAria": "Search manga",
  "manga.searchBtn": "Search",
  "manga.found": "found",
  "manga.in": "in",
  "manga.errorLoad": "Unable to load live manga catalog",
  "manga.emptyPrefix": "No manga matched",
  "manga.emptyFilters": "those filters",
  "manga.emptySuffix": "right now. Try another keyword or genre.",
  "manga.resetFilters": "Reset filters",
  "manga.freeDownload": "Free Download",
  "manga.chapters": "Chapters",
  "manga.prevPage": "Previous page",
  "manga.nextPage": "Next page",
  "manga.modalDescFallback": "Read chapters online or download CBZ archives free.",
  "manga.chaptersUnavailable": "Chapter list is temporarily unavailable.",
  "manga.noChapters": "No chapters available for this title yet.",
  "manga.read": "Read",
  "manga.freeCbz": "Free CBZ",
  "manga.prev": "Prev",
  "manga.next": "Next",
  "manga.prevChapterAria": "Previous chapter",
  "manga.nextChapterAria": "Next chapter",
  "manga.closeReaderAria": "Close reader",
  "manga.loadingPages": "Loading chapter pages…",
  "manga.pagesUnavailable": "Chapter pages unavailable right now.",
  "manga.tryCbz": "Try CBZ Download",
  "manga.pageFailed": "failed to load.",
  "manga.page": "Page",
  "manga.chapter": "Chapter",
  "manga.loadMorePages": "Load more pages",

  // Get App Page
  "getApp.kicker": "Mobile & TV Companion",
  "getApp.title": "Get the SHADOW App",
  "getApp.subtitle":
    "Dedicated iOS and Android apps are currently in development. Stream seamlessly, queue multi-episode offline packs, and resume across devices — coming soon.",
  "getApp.iosTitle": "iOS App",
  "getApp.iosPlatform": "iPhone & iPad · iOS 16+",
  "getApp.iosDesc":
    "Native Swift playback with hardware-accelerated HLS video, AirPlay casting, Picture-in-Picture, and offline episode downloads.",
  "getApp.iosFeat1": "Hardware-accelerated player with subtitle & audio switching",
  "getApp.iosFeat2": "Batch episode downloads saved cleanly for flights and commutes",
  "getApp.iosFeat3": "AirPlay, lock-screen controls, and instant resume sync",
  "getApp.androidTitle": "Android App",
  "getApp.androidPlatform": "Phones, Tablets & Android TV · Android 10+",
  "getApp.androidDesc":
    "Lightweight APK and Play release engineered for fast browsing, Chromecast support, background episode downloads, and TV remote navigation.",
  "getApp.androidFeat1": "Adaptive streaming and multi-episode background queue",
  "getApp.androidFeat2": "Chromecast and Android TV lean-back interface support",
  "getApp.androidFeat3": "Local watchlist storage with zero account sign-up",
  "getApp.comingSoon": "Coming Soon",
  "getApp.notifyMe": "Notify me on release",
  "getApp.notified": "Saved — release reminder enabled",
  "getApp.webReadyTitle": "Stream & Download on Mobile Today",
  "getApp.webReadyDesc":
    "While our iOS and Android apps finish testing, you can browse, watch, and batch-download episodes directly in your mobile browser right now.",
  "getApp.browseNow": "Browse Catalog",

  // Downloads Tray
  "downloads.title": "Downloads",
  "downloads.queued": "Queued…",
  "downloads.resolving": "Finding stream…",
  "downloads.saving": "Saving for offline",
  "downloads.done": "Saved to your device",
  "downloads.openOffline": "Offline Library",
  "downloads.cancelled": "Cancelled",
  "downloads.cancelAria": "Cancel download",
  "downloads.dismissAria": "Dismiss",

  // Policy Page
  "policy.kicker": "Privacy Policy, Legal & Service Guidelines",
  "policy.title": "Privacy Policy, DMCA & Acceptable Use",
  "policy.intro":
    "SHADOW is an independent web index and browser interface committed to transparency, user privacy, and strict respect for copyright law. Please review our technical architecture, non-hosting proof, and privacy commitments below.",
  "policy.s1Title": "01. Zero File Hosting & Technical Proof of Non-Storage",
  "policy.s1P1":
    "SHADOW does not host, upload, store, transcode, cache permanently, or distribute any video, audio, subtitle, comic archive, or media files on any server under our control. Our infrastructure contains zero video storage buckets, zero file-upload portals, zero proprietary content distribution servers, and zero peer-to-peer trackers or torrent files.",
  "policy.s1P2":
    "Every title card, synopsis, poster, and playback reference displayed on SHADOW functions solely as an automated directory pointer to material already published independently on external third-party hosts and public metadata directories. When playback starts, your browser communicates directly with or retrieves streams through standard web protocols from those separate external providers — proving SHADOW operates strictly as a neutral search and catalog interface, not a piracy host.",
  "policy.s1P3":
    "Because we neither create nor store media files, we cannot alter, edit, watermark, or permanently delete files residing on remote third-party servers. Any public-domain literature listed on the site points exclusively to verified out-of-copyright public editions.",
  "policy.s2Title": "02. Anti-Piracy Position & Third-Party Independence",
  "policy.s2P1":
    "SHADOW opposes unlawful piracy and does not endorse, incentivize, pay for, or collaborate with unauthorized uploaders. We exercise no administrative control over the uptime, regional licensing, content, or security practices of external third-party hosts.",
  "policy.s2P2":
    "We never bypass paywalls, crack DRM encryption, defeat subscriber authentication, or modify protected streams. If any external media provider uses digital rights protection or restricts access, SHADOW respects those technical boundaries and refuses to download or redistribute protected content.",
  "policy.s3Title": "03. Anti-Bot Warning & Server Protection",
  "policy.s3P1":
    "Do not use automated bots, scrapers, crawlers, download scripts, or high-frequency request tools to overwhelm or flood our servers. Automated traffic consumes bandwidth and degrades playback quality for genuine viewers.",
  "policy.s3P2":
    "Any user, script, automated client, or IP address detected attempting to scrape catalog endpoints, bypass rate limits, or overwhelm SHADOW servers with excessive requests will be permanently banned and blocked without prior notice.",
  "policy.s4Title": "04. Copyright & DMCA Removal Requests",
  "policy.s4P1":
    "We respect intellectual property rights and respond promptly to valid copyright notices. Because SHADOW does not host any media files on our servers, permanent deletion of an underlying media file must be requested directly with the independent third-party host storing that file.",
  "policy.s4P2":
    "If you are a copyright owner or authorized legal representative and wish for a catalog reference link to be removed from SHADOW, provide the exact SHADOW page URL, title name, proof of ownership, and a good-faith statement so the reference can be swiftly de-indexed.",
  "policy.s5Title": "05. Privacy Policy & Local-Only Viewer Data",
  "policy.s5P1":
    "SHADOW requires no user account, registration, email address, password, phone number, or payment method. Your watchlist, selected site language, app release reminder flag, and episode resume timestamps are stored exclusively inside your own browser's local storage and are never sold or shared with data brokers.",
  "policy.s5P2":
    "When your browser loads external third-party video players or public catalog feeds, standard HTTP request metadata (such as your IP address and browser user-agent) is handled directly by those independent third-party services under their respective privacy policies. You can wipe all SHADOW local preferences at any time through your browser settings or the Clear Watchlist button.",

  // Settings & Watch History (Browser-Local)
  "settings.kicker": "Browser-Only Storage",
  "settings.title": "Settings & Watch History",
  "settings.subtitle":
    "Customize anime Dub/Sub defaults, playback behavior, and manage your Continue Watching history.",
  "settings.localNoticeTitle": "Stored strictly in your browser — never on our servers",
  "settings.localNoticeDesc":
    "All preferences, Continue Watching timestamps, My Watchlist items, and offline downloads stay inside this browser's local storage and IndexedDB. Clearing your browser data or removing items below deletes them permanently.",
  "settings.playbackTitle": "Playback & Anime Preferences",
  "settings.defaultAnimeAudio": "Default Anime Audio",
  "settings.defaultAnimeAudioDesc":
    "Choose whether anime load in Japanese Sub or Dub first whenever you open any anime to watch.",
  "settings.animeSubOpt": "SUB · Load in Sub first",
  "settings.animeDubOpt": "DUB · Load in Dub first",
  "settings.autoPlayNext": "Auto-Play Next Episode",
  "settings.autoPlayNextDesc":
    "Automatically start the countdown for the next episode when the current one finishes.",
  "settings.autoShowSubtitles": "Auto-Enable Subtitles",
  "settings.autoShowSubtitlesDesc":
    "Show matching subtitles automatically on Subbed anime and native streams when available.",
  "settings.downloadIncludeSubs": "Include Subtitles on Download by Default",
  "settings.downloadIncludeSubsDesc":
    "Pre-select the + Subs option when downloading anime episodes for offline viewing.",
  "settings.skipIntro": "Skip Intro Jump",
  "settings.skipIntroDesc": "Set how many seconds the Skip Intro button jumps forward.",
  "settings.skipIntroOff": "Off",
  "settings.language": "Interface & Dub Language",
  "settings.languageDesc":
    "Switch between English (EN Dub / EN Sub) and French (VF Dub / VOSTFR Sub) across catalogs and players.",
  "settings.on": "On",
  "settings.off": "Off",
  "settings.resetPrefs": "Reset Preferences",
  "settings.resetDone": "Preferences restored to defaults",
  "settings.historyTitle": "Watch History & Continue Watching",
  "settings.historySubtitle":
    "Titles recently played in this browser. Delete an individual anime or clear your full watch history at any time.",
  "settings.historyFilterAll": "All History",
  "settings.historyFilterAnime": "Anime",
  "settings.historyFilterOther": "Movies & Series",
  "settings.clearAnimeHistory": "Clear Anime History",
  "settings.clearAllHistory": "Clear All History",
  "settings.historyEmpty":
    "No watch history recorded in this browser yet. Start any anime, cartoon, or movie and it will appear here and in Continue Watching.",
  "settings.historyNoMatch": "No history items match this filter.",
  "settings.deleteItem": "Delete",
  "settings.deleteItemAria": "Delete watch history for {title}",
  "settings.resumeItem": "Resume",
  "settings.storageOverview": "Local Browser Storage Summary",
  "settings.storageHistoryCount": "Continue Watching items",
  "settings.storageWatchlistCount": "Watchlist saved titles",
  "settings.storageOfflineCount": "Offline stored videos",
  "settings.openWatchlist": "Open Watchlist",
  "settings.openOffline": "Open Offline Library",
} as const;

export type TranslationKey = keyof typeof EN;

const FR: Record<TranslationKey, string> = {
  // Navigation & Shell
  "nav.home": "Accueil",
  "nav.watchlist": "Ma Liste",
  "nav.anime": "Animés",
  "nav.kdramas": "K-Dramas",
  "nav.hollywood": "Hollywood",
  "nav.bollywood": "Bollywood",
  "nav.tollywood": "Tollywood",
  "nav.nollywood": "Nollywood",
  "nav.cartoons": "Dessins Animés",
  "nav.manga": "Manga",
  "nav.mood": "App Mobile",
  "nav.getApp": "App Mobile",
  "nav.settings": "Paramètres",
  "nav.search": "Recherche",
  "nav.mainAria": "Navigation principale",
  "nav.footerAria": "Pied de page",
  "shell.searchPlaceholder": "Rechercher animés, séries, films, dessins animés…",
  "shell.searchAria": "Rechercher des titres",
  "shell.clearSearch": "Effacer la recherche",
  "shell.closeSearch": "Réduire la recherche",
  "shell.openMenu": "Ouvrir le menu",
  "shell.collapse": "Réduire",
  "shell.expandSidebar": "Déplier la barre latérale",
  "shell.collapseSidebar": "Réduire la barre latérale",
  "shell.joinDiscord": "Rejoindre Discord",
  "shell.discordShort": "Discord",
  "shell.policy": "Politique & DMCA",
  "shell.footerTagline":
    "Streaming en direct et bibliothèque manga gratuite pour animés, dessins animés, K-dramas, Hollywood, Bollywood, Tollywood et Nollywood.",
  "shell.langFilter": "Sélecteur de langue",

  // Common actions & states
  "common.watchNow": "Regarder",
  "common.watchMovie": "Regarder le film",
  "common.resumeMovie": "Reprendre le film",
  "common.moreInfo": "Plus d'infos",
  "common.backHome": "Retour à l'accueil",
  "common.backToSection": "Retour vers {section}",
  "common.back": "Retour",
  "common.tryAgain": "Réessayer",
  "common.retry": "Réessayer",
  "common.loading": "Chargement…",
  "common.loadingTitle": "Chargement du titre…",
  "common.loadingEpisodes": "Chargement des saisons et épisodes…",
  "common.all": "Tout",
  "common.saved": "Enregistré",
  "common.download": "Télécharger",
  "common.downloadMovie": "Télécharger le film",
  "common.resume": "Reprendre",
  "common.goHome": "Aller à l'accueil",
  "common.goBack": "Retour",
  "common.notFoundTitle": "Page introuvable",
  "common.notFoundDesc": "La page que vous recherchez n'existe pas ou a été déplacée.",
  "common.errorTitle": "Cette page n'a pas pu se charger",
  "common.errorDesc":
    "Un problème est survenu de notre côté. Vous pouvez actualiser ou revenir à l'accueil.",

  // Sections & Genres
  "section.continueWatching": "Reprendre la lecture",
  "continue.clearHistory": "Effacer l'historique",
  "continue.manageSettings": "Historique & Paramètres",
  "continue.removeAria": "Retirer {title} de Reprendre la lecture",
  "section.shelfErrorTitle": "Ce catalogue est momentanément indisponible",
  "section.shelfErrorDesc":
    "Impossible de joindre le catalogue pour l'instant. Vérifiez votre connexion et réessayez.",
  "section.emptyGenres": "Aucun titre ne correspond à ces genres — essayez une autre sélection.",
  "genre.filterAria": "Filtrer par genre",
  "genre.action": "Action",
  "genre.scifi": "Science-Fiction",
  "genre.horror": "Horreur / Zombie",
  "genre.drama": "Drame",
  "genre.animation": "Animation",
  "genre.comedy": "Comédie",

  // Watchlist
  "watchlist.title": "Ma Liste",
  "watchlist.inWatchlist": "Dans Ma Liste",
  "watchlist.add": "Ma Liste",
  "watchlist.emptySubtitle":
    "Enregistrez vos animés, dessins animés et films préférés ici pour y accéder rapidement.",
  "watchlist.titleSingular": "titre",
  "watchlist.titlePlural": "titres",
  "watchlist.savedCountSuffix": "enregistré(s) dans ce navigateur",
  "watchlist.clear": "Vider Ma Liste",
  "watchlist.filterAria": "Filtrer Ma Liste",
  "watchlist.filterAll": "Tout",
  "watchlist.filterAnime": "Animés",
  "watchlist.filterCartoons": "Dessins Animés",
  "watchlist.filterMovies": "Films",
  "watchlist.filterSeries": "Séries & Dramas",
  "watchlist.filterOffline": "Hors ligne",
  "watchlist.offlineEmpty":
    "Aucun épisode ou film enregistré hors ligne. Cliquez sur Télécharger sur un titre pour le stocker localement.",
  "watchlist.offlineClear": "Tout supprimer",
  "watchlist.playOffline": "Lire hors ligne",
  "watchlist.exportFile": "Enregistrer le fichier",
  "watchlist.removeOffline": "Supprimer",
  "watchlist.offlineStored": "enregistré(s) localement pour lecture hors ligne",
  "watchlist.emptyTitle": "Votre liste est vide",
  "watchlist.emptyBody":
    "Appuyez sur le bouton signet sur n'importe quel animé, film ou série pour le garder sous la main ici.",
  "watchlist.browseAnime": "Explorer les Animés",
  "watchlist.browseCartoons": "Explorer les Dessins Animés",
  "watchlist.browseMovies": "Explorer les Films",
  "watchlist.noFilterMatch": "Aucun titre enregistré ne correspond à ce filtre.",

  // Search
  "search.resultsFor": "Résultats pour",
  "search.browseAll": "Tout parcourir",
  "search.searchingFull": "Recherche dans tout le catalogue…",
  "search.empty": "Aucun titre trouvé. Essayez une autre orthographe ou un autre genre.",

  // Anime Catalog Grid
  "anime.allTitle": "Tous les Animés",
  "anime.allSubtitleCount": "titres · Saisons complètes & épisodes en VOSTFR / VF / Sub / Dub",
  "anime.allSubtitleDefault": "Parcourez tout le catalogue d'animés en Sub & Dub",
  "anime.sortPopular": "Plus Populaires",
  "anime.sortTrending": "Tendances",
  "anime.sortNewest": "Nouveautés",
  "anime.sortTop": "Mieux Notés",
  "anime.sortAZ": "A–Z",
  "anime.emptyGenres": "Aucun animé ne correspond à ces genres — essayez d'effacer les filtres.",
  "anime.loadingMore": "Chargement d'autres animés…",
  "anime.loadMore": "Charger plus d'animés",
  "anime.shown": "affichés",

  // Show Detail
  "detail.episodes": "Épisodes",
  "detail.episode": "Épisode",
  "detail.season": "Saison",
  "detail.seasons": "Saisons",
  "detail.cast": "Distribution",
  "detail.noSynopsis": "Aucun synopsis disponible pour le moment.",
  "detail.episodesUnavailable": "La liste des épisodes est indisponible pour le moment.",
  "detail.upcomingSeasonStart": "La saison",
  "detail.upcomingSeasonEnd":
    "est annoncée ou à venir — les épisodes apparaîtront automatiquement dès leur sortie.",
  "detail.featureMovieReady": "Film complet prêt à être visionné ou téléchargé hors ligne.",
  "detail.featureMovie": "Long métrage",
  "detail.upcomingRelease": "Sortie à venir",
  "detail.viewDetails": "Voir les détails",
  "detail.relationsAnime": "Saison 2, Suites & Saisons à venir",
  "detail.relationsMovie": "Suites, Sorties à venir & Séries",
  "detail.relationsDefault": "Autres Saisons, Suites & Associés",
  "detail.downloadPlusSubs": "Télécharger + ST",
  "detail.noSubtitles": "Sans sous-titres",
  "detail.audioVersion": "Version audio",
  "detail.subsToggleHint": "Choisir si les épisodes téléchargés incluent les sous-titres",
  "detail.episodeLower": "épisode",
  "detail.episodesLower": "épisodes",
  "detail.selectEpisodes": "Sélectionner",
  "detail.cancelSelect": "Terminé",
  "detail.selectAll": "Tout sélectionner",
  "detail.clearSelection": "Effacer",
  "detail.selectedCount": "{count} sélectionné(s)",
  "detail.downloadSelected": "Télécharger la sélection ({count})",
  "detail.selectEpisodeAria": "Sélectionner l'épisode {ep} pour téléchargement groupé",

  // Watch Page & Video Player
  "watch.discordPrompt": "Le flux met en mémoire tampon ou ne charge pas ?",
  "watch.discordCta": "Signalez-le ou demandez des titres sur notre Discord",
  "watch.audioTrack": "Piste audio",
  "watch.prevEpisode": "Épisode précédent",
  "watch.nextEpisode": "Épisode suivant",
  "watch.episodeSelector": "Sélecteur d'épisodes",
  "watch.closeEpisodes": "Fermer les épisodes",
  "watch.allSeasonsRelated": "Toutes les saisons & associés",
  "watch.available": "disponibles",
  "watch.episodesLower": "épisodes",
  "watch.alternatePlayer": "Lecteur alternatif",
  "watch.shadowPlayer": "Lecteur SHADOW",
  "watch.switchAlternate": "Passer au lecteur alternatif",
  "watch.switchShadow": "Revenir au lecteur SHADOW",
  "watch.plusSubs": "+ ST",
  "watch.noSubs": "Sans ST",
  "watch.fullMovie": "Film complet",
  "watch.nowPlaying": "Lecture en cours",
  "watch.officialTrailer": "Bande-annonce officielle",
  "watch.noTrailer": "Aucune bande-annonce disponible pour ce titre pour le moment.",
  "watch.retryStream": "Réessayer le flux",
  "watch.loadingMovie": "Chargement du film complet…",
  "watch.streamUnavailable": "Flux temporairement indisponible pour cet épisode.",
  "watch.switchTo": "Passer en",
  "watch.loadingAudioEp": "Chargement du flux {audio} pour l'épisode {ep}…",
  "watch.loadingSeasonEp": "Chargement Saison {season} Épisode {ep}…",
  "watch.server1": "Serveur 1",
  "watch.server2": "Serveur 2",
  "watch.server3Embed": "Serveur 3 · Lecteur Direct",
  "watch.directEmbed": "Lecteur Direct",
  "watch.embedNotice": "Lecteur direct navigateur — changez de fournisseur ci-dessous si besoin :",
  "watch.nextServer": "Serveur suivant",
  "watch.switchingServer": "Serveur indisponible — passage vers {server}…",
  "watch.vfUnavailable":
    "Version française (VF) indisponible pour cet épisode — essayez Sub (VOSTFR).",
  "watch.dubEnFrSubs": "DUB EN · ST FR (VF indisponible)",
  "watch.watchingNow": "{count} spectateur en ligne",
  "watch.watchingNowPlural": "{count} spectateurs en ligne",
  "watch.expandLandscape": "Agrandir en paysage",
  "watch.offlineBadge": "Lecture hors ligne",
  "watch.offlineUnavailable": "Cette copie hors ligne n'est plus stockée sur cet appareil.",

  // VideoPlayer Controls
  "player.play": "Lecture",
  "player.pause": "Pause",
  "player.back10": "Reculer de 10 secondes",
  "player.forward10": "Avancer de 10 secondes",
  "player.prevEpisode": "Épisode précédent",
  "player.nextEpisode": "Épisode suivant",
  "player.skipIntro": "Passer l'intro",
  "player.skippedIntro": "Intro passée",
  "player.mute": "Couper le son",
  "player.unmute": "Rétablir le son",
  "player.muted": "Son coupé",
  "player.volume": "Volume",
  "player.jump": "Aller à",
  "player.seek": "Barre de progression",
  "player.autoNextOn": "Suite auto : Activé",
  "player.autoNextOff": "Suite auto : Désactivé",
  "player.autoNextTitle": "Lancer automatiquement l'épisode suivant à la fin de celui-ci",
  "player.autoPlayNextMenu": "Lecture auto de l'épisode suivant",
  "player.switchServer": "Changer de serveur",
  "player.streamServers": "Serveurs de lecture",
  "player.server": "Serveur",
  "player.quality": "Qualité",
  "player.auto": "Auto",
  "player.subtitles": "Sous-titres",
  "player.subtitlesOff": "Sous-titres : Désactivés",
  "player.noSubtitles": "Aucun sous-titre disponible",
  "player.off": "Désactivés",
  "player.speed": "Vitesse",
  "player.settings": "Paramètres",
  "player.pip": "Image dans l'image",
  "player.fullScreen": "Plein écran",
  "player.exitFullScreen": "Quitter le plein écran",
  "player.shortcuts": "Raccourcis clavier",
  "player.audioTrack": "Piste audio",
  "player.original": "Originale",
  "player.shortcutsTitle": "Raccourcis clavier",
  "player.closeShortcuts": "Fermer les raccourcis",
  "player.shortcutPlayPause": "Lecture / Pause",
  "player.shortcutMute": "Son / Muet",
  "player.shortcutSeek": "Avance/Recul 10s",
  "player.shortcutArrows": "Flèches de lecture",
  "player.shortcutVolume": "Volume",
  "player.shortcutFullscreen": "Plein écran",
  "player.shortcutSubtitles": "Sous-titres",
  "player.shortcutSkipIntro": "Passer l'intro",
  "player.shortcutJump": "Aller à 0%–90%",
  "player.shortcutNext": "Épisode suivant",
  "player.upNextIn": "Épisode suivant dans",
  "player.episodeFinished": "Épisode terminé",
  "player.playNext": "Épisode suivant",
  "player.stay": "Rester",
  "player.errorTitle": "Impossible de lire ce flux.",
  "player.errorHint":
    "Essayez de changer de serveur, d'utiliser le lecteur alternatif ou de choisir un autre épisode.",
  "player.retryStream": "Réessayer le flux",
  "player.tryNextServer": "Serveur suivant",
  "player.switchingTo": "Passage à",
  "player.switchingBackup": "Passage au serveur de secours",
  "player.racingBackups": "Serveur principal inactif — test des serveurs de secours…",
  "player.switchingAlternate": "Passage au lecteur alternatif…",

  // Manga
  "manga.kicker": "Bibliothèque Manga Gratuite",
  "manga.title": "Manga",
  "manga.subtitle":
    "Lisez des chapitres en ligne ou téléchargez-les gratuitement en archives CBZ. Les nouvelles sorties et traductions apparaissent automatiquement.",
  "manga.feedLatest": "Nouveautés",
  "manga.feedPopular": "Populaires",
  "manga.feedTop": "Mieux Notés",
  "manga.feedNewest": "Ajouts Récents",
  "manga.feedsAria": "Flux manga",
  "manga.searchPlaceholder": "Rechercher un manga par titre ou mot-clé…",
  "manga.searchAria": "Rechercher un manga",
  "manga.searchBtn": "Rechercher",
  "manga.found": "trouvé(s)",
  "manga.in": "dans",
  "manga.errorLoad": "Impossible de charger le catalogue manga en direct",
  "manga.emptyPrefix": "Aucun manga ne correspond à",
  "manga.emptyFilters": "ces filtres",
  "manga.emptySuffix": "pour le moment. Essayez un autre mot-clé ou genre.",
  "manga.resetFilters": "Réinitialiser les filtres",
  "manga.freeDownload": "Télécharger",
  "manga.chapters": "Chapitres",
  "manga.prevPage": "Page précédente",
  "manga.nextPage": "Page suivante",
  "manga.modalDescFallback":
    "Lisez les chapitres en ligne ou téléchargez des archives CBZ gratuitement.",
  "manga.chaptersUnavailable": "La liste des chapitres est temporairement indisponible.",
  "manga.noChapters": "Aucun chapitre disponible pour ce titre pour le moment.",
  "manga.read": "Lire",
  "manga.freeCbz": "CBZ Gratuit",
  "manga.prev": "Préc.",
  "manga.next": "Suiv.",
  "manga.prevChapterAria": "Chapitre précédent",
  "manga.nextChapterAria": "Chapitre suivant",
  "manga.closeReaderAria": "Fermer le lecteur",
  "manga.loadingPages": "Chargement des pages du chapitre…",
  "manga.pagesUnavailable": "Les pages du chapitre sont indisponibles pour le moment.",
  "manga.tryCbz": "Essayer le téléchargement CBZ",
  "manga.pageFailed": "n'a pas pu être chargée.",
  "manga.page": "Page",
  "manga.chapter": "Chapitre",
  "manga.loadMorePages": "Charger plus de pages",

  // Get App Page
  "getApp.kicker": "Application Mobile & TV",
  "getApp.title": "Télécharger l'app SHADOW",
  "getApp.subtitle":
    "Nos applications natives iOS et Android sont actuellement en cours de développement. Streaming fluide, téléchargements groupés hors ligne et reprise instantanée — bientôt disponibles.",
  "getApp.iosTitle": "Application iOS",
  "getApp.iosPlatform": "iPhone & iPad · iOS 16+",
  "getApp.iosDesc":
    "Lecteur natif Swift avec accélération matérielle HLS, diffusion AirPlay, Image dans l'Image et téléchargement d'épisodes hors ligne.",
  "getApp.iosFeat1": "Lecteur fluide avec changement rapide de langue et sous-titres",
  "getApp.iosFeat2": "Téléchargement groupé d'épisodes pour voyager hors ligne",
  "getApp.iosFeat3": "AirPlay, contrôles écran verrouillé et reprise automatique",
  "getApp.androidTitle": "Application Android",
  "getApp.androidPlatform": "Téléphones, Tablettes & Android TV · Android 10+",
  "getApp.androidDesc":
    "Application optimisée pour Android et Android TV avec Chromecast, file d'attente de téléchargement et navigation à la télécommande.",
  "getApp.androidFeat1": "Lecture adaptative et file de téléchargement multi-épisodes",
  "getApp.androidFeat2": "Compatibilité Chromecast et interface Android TV",
  "getApp.androidFeat3": "Ma Liste enregistrée localement sans création de compte",
  "getApp.comingSoon": "Bientôt disponible",
  "getApp.notifyMe": "M'avertir à la sortie",
  "getApp.notified": "Enregistré — rappel de sortie activé",
  "getApp.webReadyTitle": "Déjà disponible sur navigateur mobile",
  "getApp.webReadyDesc":
    "En attendant la sortie des applications iOS et Android, vous pouvez déjà regarder et télécharger plusieurs épisodes directement depuis votre navigateur.",
  "getApp.browseNow": "Parcourir le catalogue",

  // Downloads Tray
  "downloads.title": "Téléchargements",
  "downloads.queued": "En attente…",
  "downloads.resolving": "Recherche du flux…",
  "downloads.saving": "Enregistrement hors ligne",
  "downloads.done": "Enregistré sur votre appareil",
  "downloads.openOffline": "Hors ligne",
  "downloads.cancelled": "Annulé",
  "downloads.cancelAria": "Annuler le téléchargement",
  "downloads.dismissAria": "Fermer",

  // Policy Page
  "policy.kicker": "Confidentialité, Mentions Légales & Règlement",
  "policy.title": "Confidentialité, DMCA & Conditions d'Utilisation",
  "policy.intro":
    "SHADOW est un index web indépendant et une interface de navigation dédiée à la confidentialité des utilisateurs et au strict respect du droit d'auteur. Découvrez ci-dessous les preuves techniques de non-hébergement et notre politique de confidentialité.",
  "policy.s1Title": "01. Zéro Fichier Hébergé & Preuve Technique de Non-Stockage",
  "policy.s1P1":
    "SHADOW n'héberge, ne téléverse, ne stocke, ne transcode, ne met en cache de façon permanente et ne distribue aucun fichier vidéo, audio, sous-titre ou archive sur ses serveurs. Notre infrastructure ne contient aucun espace de stockage vidéo, aucun formulaire d'envoi de médias, aucun CDN de contenu propriétaire et aucun tracker peer-to-peer ou torrent.",
  "policy.s1P2":
    "Chaque fiche, synopsis, affiche et lien de lecture affiché sur SHADOW agit exclusivement comme un index automatisé pointant vers des contenus déjà publiés de manière indépendante par des hébergeurs tiers et des répertoires publics de métadonnées. Lors de la lecture, votre navigateur communique directement avec ces fournisseurs externes distincts — démontrant que SHADOW fonctionne uniquement comme un annuaire de recherche, et non comme un site d'hébergement ou de piratage.",
  "policy.s1P3":
    "Puisque nous ne créons ni ne conservons aucun fichier média, nous ne pouvons ni modifier ni supprimer définitivement des fichiers résidant sur des serveurs tiers distants. Les ouvrages du domaine public référencés pointent exclusivement vers des éditions libres de droits.",
  "policy.s2Title": "02. Position Anti-Piratage & Indépendance vis-à-vis des Tiers",
  "policy.s2P1":
    "SHADOW s'oppose au piratage commercial et ne rémunère, n'encourage ni ne collabore avec des téléverseurs non autorisés. Nous n'exerçons aucun contrôle éditorial ou administratif sur la disponibilité ou les pratiques de serveurs externes indépendants.",
  "policy.s2P2":
    "Nous ne contournons jamais de péages numériques, de protections DRM ou d'authentifications payantes. Lorsqu'un fournisseur externe applique un chiffrement protégé, SHADOW respecte cette barrière technique et bloque le téléchargement.",
  "policy.s3Title": "03. Protection Anti-Bot & Stabilité des Serveurs",
  "policy.s3P1":
    "N'utilisez pas de bots automatisés, scrapers, crawlers ou scripts de téléchargement massif pour surcharger nos serveurs. Le trafic automatisé consomme la bande passante et dégrade la qualité de lecture des spectateurs.",
  "policy.s3P2":
    "Tout utilisateur, script, client automatisé ou adresse IP détecté en train d'extraire nos points de terminaison ou de contourner nos limites de requêtes sera définitivement banni et bloqué sans préavis.",
  "policy.s4Title": "04. Droits d'Auteur & Demandes de Retrait DMCA",
  "policy.s4P1":
    "Nous respectons la propriété intellectuelle et traitons rapidement toute notification valide. Comme SHADOW n'héberge aucun fichier média sur ses serveurs, tout retrait définitif d'un fichier doit être demandé directement auprès de l'hébergeur tiers concerné.",
  "policy.s4P2":
    "Si vous êtes titulaire de droits ou représentant autorisé et souhaitez retirer une référence du catalogue SHADOW, indiquez l'URL exacte sur SHADOW, le titre et une déclaration de bonne foi afin qu'il soit rapidement désindexé.",
  "policy.s5Title": "05. Politique de Confidentialité & Données Locales",
  "policy.s5P1":
    "SHADOW ne demande ni compte personnel, ni adresse e-mail, ni mot de passe, ni numéro de téléphone ou carte bancaire. Votre liste de suivi, votre langue choisie, votre rappel d'application et vos positions de lecture sont enregistrés uniquement dans le stockage local de votre navigateur et ne sont jamais vendus à des courtiers en données.",
  "policy.s5P2":
    "Lorsque votre navigateur charge un lecteur vidéo externe ou un flux public, les métadonnées réseau standards (adresse IP, agent utilisateur) sont traitées directement par ces services tiers indépendants selon leurs propres politiques. Vous pouvez effacer toutes vos données locales à tout moment depuis votre navigateur.",

  // Settings & Watch History (Browser-Local)
  "settings.kicker": "Stockage local navigateur",
  "settings.title": "Paramètres & Historique",
  "settings.subtitle":
    "Choisissez l'audio anime par défaut (VF/Dub ou VOSTFR/Sub), les options du lecteur et gérez votre historique.",
  "settings.localNoticeTitle":
    "Enregistré uniquement dans votre navigateur — jamais sur nos serveurs",
  "settings.localNoticeDesc":
    "Tous vos réglages, votre historique de lecture, Ma Liste et vos vidéos hors ligne restent dans le stockage local et IndexedDB de votre navigateur. Aucune donnée personnelle n'est envoyée ni conservée sur un serveur.",
  "settings.playbackTitle": "Préférences de lecture & Animés",
  "settings.defaultAnimeAudio": "Audio animé par défaut",
  "settings.defaultAnimeAudioDesc":
    "Choisissez si les animés s'ouvrent d'abord en VOSTFR (Sub) ou en VF / Dub dès que vous lancez un titre.",
  "settings.animeSubOpt": "SUB · Charger en VOSTFR / Sub",
  "settings.animeDubOpt": "DUB · Charger en VF / Dub en premier",
  "settings.autoPlayNext": "Enchaîner l'épisode suivant",
  "settings.autoPlayNextDesc":
    "Lance automatiquement le compte à rebours vers l'épisode suivant à la fin de la lecture.",
  "settings.autoShowSubtitles": "Activer les sous-titres automatiquement",
  "settings.autoShowSubtitlesDesc":
    "Affiche automatiquement les sous-titres disponibles sur les animés VOSTFR et lecteurs natifs.",
  "settings.downloadIncludeSubs": "Inclure les sous-titres au téléchargement par défaut",
  "settings.downloadIncludeSubsDesc":
    "Pré-active l'option + ST lors du téléchargement d'épisodes d'animés hors ligne.",
  "settings.skipIntro": "Saut d'intro",
  "settings.skipIntroDesc": "Durée avancée lorsque vous cliquez sur Passer l'intro.",
  "settings.skipIntroOff": "Désactivé",
  "settings.language": "Langue de l'interface & du doublage",
  "settings.languageDesc":
    "Basculez entre Anglais (Dub EN / Sub EN) et Français (Dub VF / VOSTFR) sur tout le site.",
  "settings.on": "Activé",
  "settings.off": "Désactivé",
  "settings.resetPrefs": "Réinitialiser les réglages",
  "settings.resetDone": "Préférences réinitialisées par défaut",
  "settings.historyTitle": "Historique & Reprendre la lecture",
  "settings.historySubtitle":
    "Titres récemment lancés dans ce navigateur. Supprimez un animé précis ou effacez tout l'historique à tout moment.",
  "settings.historyFilterAll": "Tout l'historique",
  "settings.historyFilterAnime": "Animés",
  "settings.historyFilterOther": "Films & Séries",
  "settings.clearAnimeHistory": "Effacer l'historique animé",
  "settings.clearAllHistory": "Tout effacer",
  "settings.historyEmpty":
    "Aucun historique enregistré dans ce navigateur pour le moment. Lancez un animé ou un film pour le retrouver ici et dans Reprendre la lecture.",
  "settings.historyNoMatch": "Aucun élément ne correspond à ce filtre.",
  "settings.deleteItem": "Supprimer",
  "settings.deleteItemAria": "Supprimer l'historique pour {title}",
  "settings.resumeItem": "Reprendre",
  "settings.storageOverview": "Résumé du stockage local",
  "settings.storageHistoryCount": "Titres dans Reprendre la lecture",
  "settings.storageWatchlistCount": "Titres dans Ma Liste",
  "settings.storageOfflineCount": "Vidéos enregistrées hors ligne",
  "settings.openWatchlist": "Ouvrir Ma Liste",
  "settings.openOffline": "Bibliothèque hors ligne",
};

export const TRANSLATIONS: Record<SiteLanguage, Record<TranslationKey, string>> = {
  en: EN,
  fr: FR,
};

export function t(lang: SiteLanguage, key: TranslationKey): string {
  return TRANSLATIONS[lang][key] ?? EN[key];
}

export function useT() {
  const { lang, setLang } = useLanguage();
  const translate = useCallback((key: TranslationKey) => t(lang, key), [lang]);
  return { lang, setLang, t: translate };
}

const SECTION_TRANSLATIONS_FR: Record<SectionId, { label: string; tagline: string }> = {
  anime: {
    label: "Animés",
    tagline: "Classiques shōnen, hits de la saison et pépites cultes.",
  },
  "k-dramas": {
    label: "K-Dramas",
    tagline: "Séoul la nuit — romance, vengeance et survie.",
  },
  hollywood: {
    label: "Hollywood",
    tagline: "Séries prestigieuses et grands blockbusters.",
  },
  bollywood: {
    label: "Bollywood",
    tagline: "Grand spectacle, sagas familiales et polars indiens.",
  },
  tollywood: {
    label: "Tollywood",
    tagline: "Blockbusters télougous, sagas d'action et fresques épiques.",
  },
  nollywood: {
    label: "Nollywood",
    tagline: "Succès nigérians, drames captivants et longs métrages.",
  },
  cartoons: {
    label: "Dessins Animés",
    tagline: "Des mondes animés pour tous les âges.",
  },
};

export function getSectionMeta(section: SectionId, lang: SiteLanguage) {
  if (lang === "fr") return SECTION_TRANSLATIONS_FR[section];
  return null;
}

export function translateGenreChip(id: GenreChipId, lang: SiteLanguage): string {
  return t(lang, `genre.${id}` as TranslationKey);
}

const MANGA_GENRE_FR: Record<string, string> = {
  All: "Tout",
  Action: "Action",
  Adventure: "Aventure",
  Comedy: "Comédie",
  Drama: "Drame",
  Fantasy: "Fantaisie",
  Horror: "Horreur",
  Mystery: "Mystère",
  Romance: "Romance",
  "Sci-Fi": "Science-Fiction",
  "Slice of Life": "Tranche de vie",
  Sports: "Sports",
  Thriller: "Thriller",
};

export function translateMangaGenre(genre: string, lang: SiteLanguage): string {
  if (lang === "fr") return MANGA_GENRE_FR[genre] ?? genre;
  return genre;
}
