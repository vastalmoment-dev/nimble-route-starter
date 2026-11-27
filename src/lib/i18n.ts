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
  "nav.mood": "Mood Match",
  "nav.mainAria": "Main",
  "nav.footerAria": "Footer",
  "shell.searchPlaceholder": "Search anime, cartoons, dramas, movies…",
  "shell.searchAria": "Search titles",
  "shell.clearSearch": "Clear search",
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

  // Mood Page
  "mood.title": "Mood Match",
  "mood.subtitle": "Describe how you feel and what you're into — we'll find anime that fits.",
  "mood.placeholder":
    "e.g. Feeling nostalgic, want a heartfelt story with great music, nothing too gory",
  "mood.finding": "Finding matches…",
  "mood.submit": "Recommend anime",
  "mood.error": "Couldn't get recommendations right now.",

  // Downloads Tray
  "downloads.title": "Downloads",
  "downloads.resolving": "Finding stream…",
  "downloads.saving": "Saving for offline",
  "downloads.done": "Saved to your device",
  "downloads.cancelled": "Cancelled",
  "downloads.cancelAria": "Cancel download",
  "downloads.dismissAria": "Dismiss",

  // Policy Page
  "policy.kicker": "Legal & Service Guidelines",
  "policy.title": "Policy, DMCA & Acceptable Use",
  "policy.intro":
    "Please read these terms carefully before browsing or streaming on SHADOW. By using this site, you agree to respect third-party copyright rules and protect server stability for every viewer.",
  "policy.s1Title": "01. No Hosted Files & Third-Party Content Disclaimer",
  "policy.s1P1":
    "SHADOW does not host, upload, store, or distribute any video, audio, subtitle, or media files on our own servers. All streams, episodes, movies, and media embeds accessible through this site originate exclusively from independent third-party websites and external media providers.",
  "policy.s1P2":
    "SHADOW functions solely as an informational catalog and playback interface that locates and displays content already publicly available on third-party sites. We have no control over, and assume no responsibility for, the availability, legality, or uptime of files hosted by external sources.",
  "policy.s2Title": "02. Anti-Bot Warning & Server Protection",
  "policy.s2P1":
    "Do not use automated bots, scrapers, crawlers, download scripts, or high-frequency request tools to overwhelm or flood our servers. Automated traffic consumes bandwidth and degrades playback quality for genuine viewers.",
  "policy.s2P2":
    "Any user, script, automated client, or IP address detected attempting to scrape catalog endpoints, bypass rate limits, or overwhelm SHADOW servers with excessive requests will be permanently banned and blocked without prior notice.",
  "policy.s3Title": "03. Copyright & DMCA Removal Requests",
  "policy.s3P1":
    "We respect intellectual property rights. Because SHADOW does not host any media files on our servers, permanent file removal must be requested directly with the third-party host storing the file.",
  "policy.s3P2":
    "If you are a copyright owner or authorized representative and wish for a catalog reference link to be removed from SHADOW, identify the exact page URL and title so it can be promptly de-indexed.",
  "policy.s4Title": "04. Viewer Privacy & Browser Preferences",
  "policy.s4P1":
    "Your watchlist, language selection, and playback resume timestamps are saved locally inside your own browser storage so you can continue shows where you left off across sessions. No personal account registration is required to browse or stream.",
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
  "nav.mood": "Humeur",
  "nav.mainAria": "Navigation principale",
  "nav.footerAria": "Pied de page",
  "shell.searchPlaceholder": "Rechercher animés, séries, films, dessins animés…",
  "shell.searchAria": "Rechercher des titres",
  "shell.clearSearch": "Effacer la recherche",
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

  // Mood Page
  "mood.title": "Accord d'Humeur",
  "mood.subtitle":
    "Décrivez votre humeur et vos envies — nous trouverons les animés parfaits pour vous.",
  "mood.placeholder":
    "ex. Envie de nostalgie, une histoire touchante avec une belle musique, sans trop de violence",
  "mood.finding": "Recherche en cours…",
  "mood.submit": "Recommander des animés",
  "mood.error": "Impossible d'obtenir des recommandations pour le moment.",

  // Downloads Tray
  "downloads.title": "Téléchargements",
  "downloads.resolving": "Recherche du flux…",
  "downloads.saving": "Enregistrement hors ligne",
  "downloads.done": "Enregistré sur votre appareil",
  "downloads.cancelled": "Annulé",
  "downloads.cancelAria": "Annuler le téléchargement",
  "downloads.dismissAria": "Fermer",

  // Policy Page
  "policy.kicker": "Mentions Légales & Règlement",
  "policy.title": "Politique, DMCA & Conditions d'Utilisation",
  "policy.intro":
    "Veuillez lire attentivement ces conditions avant de naviguer ou de regarder du contenu sur SHADOW. En utilisant ce site, vous acceptez de respecter les droits d'auteur tiers et la stabilité des serveurs.",
  "policy.s1Title": "01. Aucun fichier hébergé & Contenu tiers",
  "policy.s1P1":
    "SHADOW n'héberge, ne téléverse, ne stocke et ne distribue aucun fichier vidéo, audio, sous-titre ou média sur ses propres serveurs. Tous les flux, épisodes, films et lecteurs proviennent exclusivement de fournisseurs externes indépendants.",
  "policy.s1P2":
    "SHADOW agit uniquement comme un catalogue informatif et une interface de lecture affichant du contenu déjà disponible publiquement sur des sites tiers. Nous n'avons aucun contrôle sur la disponibilité ou la légalité des fichiers hébergés par des sources externes.",
  "policy.s2Title": "02. Protection Anti-Bot & Stabilité des Serveurs",
  "policy.s2P1":
    "N'utilisez pas de bots automatisés, scrapers, crawlers ou scripts de téléchargement massif pour surcharger nos serveurs. Le trafic automatisé consomme la bande passante et dégrade la qualité de lecture des spectateurs.",
  "policy.s2P2":
    "Tout utilisateur, script, client automatisé ou adresse IP détecté en train d'extraire nos points de terminaison ou de contourner nos limites de requêtes sera définitivement banni et bloqué sans préavis.",
  "policy.s3Title": "03. Droits d'Auteur & Demandes de Retrait DMCA",
  "policy.s3P1":
    "Nous respectons la propriété intellectuelle. Comme SHADOW n'héberge aucun fichier média sur ses serveurs, tout retrait définitif doit être demandé directement auprès de l'hébergeur tiers concerné.",
  "policy.s3P2":
    "Si vous êtes titulaire de droits ou représentant autorisé et souhaitez retirer une référence du catalogue SHADOW, indiquez l'URL exacte de la page et le titre afin qu'il soit désindexé rapidement.",
  "policy.s4Title": "04. Confidentialité & Préférences Locales",
  "policy.s4P1":
    "Votre liste de suivi, votre langue choisie et vos positions de reprise de lecture sont enregistrées localement dans votre navigateur. Aucune création de compte personnel n'est requise pour naviguer ou regarder.",
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
