import { useEffect, useRef, useState, memo } from "react";
import { API_BASE } from "../lib/api";
import {
  Rss,
  Plus,
  ExternalLink,
  RefreshCw,
  Trash2,
  Bookmark as BookmarkIcon,
  Shield,
  Filter,
  BookOpen,
  Search,
} from "lucide-react";
import { db, AppSettings, CustomFeed, Bookmark } from "../db";
import { Language, WikipediaSearchResult } from "../lib/types";
import { DEFAULT_FEEDS, LANGUAGE_NAMES } from "../lib/constants";

interface ArticleItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  content?: string;
  excerpt?: string;
}

interface ArticleCardProps {
  item: ArticleItem | Bookmark;
  type: "article" | "bookmark";
  difficulty?: string;
  locale?: string;
  onSelect: (url: string, title?: string, content?: string) => void;
  onBookmark: (url: string, title: string, id?: number) => void;
  isBookmarked: boolean;
  readStatus?: "reading" | "read";
}

const ArticleCard = memo(function ArticleCard({
  item,
  type,
  difficulty,
  locale,
  onSelect,
  onBookmark,
  isBookmarked,
  readStatus,
}: ArticleCardProps) {
  const isBookmark = type === "bookmark";
  const title = item.title;
  const url = isBookmark ? (item as Bookmark).url : (item as ArticleItem).link;
  const date = isBookmark ? (item as Bookmark).addedAt : (item as ArticleItem).pubDate;
  const source = isBookmark ? "BOOKMARK" : (item as ArticleItem).source;
  const content = isBookmark ? undefined : (item as ArticleItem).content;

  const dateObj = new Date(date);
  const isValidDate = !isNaN(dateObj.getTime());
  let dateDisplay: string;
  if (isValidDate) {
    dateDisplay = dateObj.toLocaleDateString(locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } else {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const todayStr = today.toLocaleDateString(locale, { month: "short", day: "numeric" });
    const yesterdayStr = yesterday.toLocaleDateString(locale, { month: "short", day: "numeric" });
    dateDisplay = `${yesterdayStr} – ${todayStr}`;
  }

  return (
    <div className="group bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-hover rounded-2xl overflow-hidden hover:shadow-2xl hover:shadow-green-600/10 transition-all duration-300 flex flex-col shadow-sm">
      <div className="p-6 flex-1 flex flex-col">
        <div className="flex justify-between items-start mb-4 gap-2">
          <span className="text-[10px] bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 px-3 py-1 rounded-full font-black uppercase tracking-widest">
            {source}
          </span>
          <div className="flex items-center gap-2">
            {readStatus === "read" && (
              <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-3 py-1 rounded-full font-black uppercase tracking-widest">
                READ
              </span>
            )}
            {readStatus === "reading" && (
              <span className="text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-3 py-1 rounded-full font-black uppercase tracking-widest">
                READING
              </span>
            )}
            {difficulty && (
              <span className="text-[10px] bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-full font-black uppercase tracking-widest">
                {difficulty}
              </span>
            )}
          </div>
        </div>
        <h3
          className="text-xl font-bold leading-tight mb-6 text-gray-900 dark:text-white group-hover:text-green-600 transition-colors line-clamp-3 cursor-pointer"
          onClick={() => onSelect(url, title, content)}
        >
          {title}
        </h3>
        <div className="mt-auto pt-4 flex items-center text-[11px] font-bold text-gray-400 dark:text-dark-muted uppercase tracking-tighter">
          <span>{dateDisplay}</span>
        </div>
      </div>
      <div className="p-4 bg-gray-50 dark:bg-dark-bg/30 border-t border-gray-100 dark:border-dark-hover flex gap-2">
        <button
          onClick={() => onSelect(url, title, content)}
          className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-black transition-all active:scale-95 shadow-md shadow-green-600/10"
        >
          Learn Now
        </button>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onBookmark(
              url,
              title,
              isBookmark ? (item as Bookmark).id : undefined,
            );
          }}
          className={`p-3 rounded-xl transition-all ${isBookmarked ? "bg-green-600 text-white" : "bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-hover text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-50"}`}
          title={isBookmarked ? "Remove bookmark" : "Bookmark this article"}
        >
          <BookmarkIcon size={18} />
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="p-3 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-hover rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-50 transition-all shadow-sm"
          title="Source Link"
        >
          <ExternalLink size={18} />
        </a>
      </div>
    </div>
  );
});

interface HomePageProps {
  currentLanguage: Language;
  onSelectArticle: (url: string, title?: string, content?: string) => void;
  initialTab?: "discover" | "bookmarks" | "wikipedia";
  onTabChange?: (tab: "discover" | "bookmarks" | "wikipedia") => void;
  onViewLangChange?: (lang: Language) => void;
  readStatuses?: Record<string, "reading" | "read">;
}

export default function HomePage({
  currentLanguage,
  onSelectArticle,
  initialTab = "discover",
  onTabChange,
  onViewLangChange,
  readStatuses = {},
}: HomePageProps) {
  const [articles, setArticles] = useState<ArticleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customFeeds, setCustomFeeds] = useState<CustomFeed[]>([]);
  const [viewLang, setViewLang] = useState<Language | "all">(currentLanguage);
  const [activeFeedUrl, setActiveFeedUrl] = useState<string>("");
  const [isAddingFeed, setIsAddingFeed] = useState(false);
  const [newFeedName, setNewFeedName] = useState("");
  const [newFeedUrl, setNewFeedUrl] = useState("");
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [currentTab, setCurrentTab] = useState<"discover" | "bookmarks" | "wikipedia">(initialTab);
  const [wikiQuery, setWikiQuery] = useState("");
  const [wikiResults, setWikiResults] = useState<WikipediaSearchResult[]>([]);
  const [wikiLoading, setWikiLoading] = useState(false);
  const [wikiError, setWikiError] = useState<string | null>(null);

  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [localGenre, setLocalGenre] = useState<string>("All");
  const [localNonNegative, setLocalNonNegative] = useState<boolean>(false);
  const [feedFilterText, setFeedFilterText] = useState<string>("");
  const feedFilterDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadBookmarks = async (lang: Language | "all" = viewLang) => {
    const all = await db.bookmarks.toArray();
    const filtered = (lang === "all" ? all : all.filter((b) => b.lang === lang))
      .sort((a, b) => b.addedAt - a.addedAt);
    setBookmarks(filtered);
  };

  const bookmarkedUrls = new Set(bookmarks.map((b) => b.url));

  // Cache key includes genre + nonNegativeMode so stale data isn't returned on filter change
  const cacheRef = useRef<
    Record<string, { articles: any[]; fetchedAt: number; feedUrl: string }>
  >({});
  const CACHE_TTL = 1000 * 60 * 30; // 30 minutes
  const makeCacheKey = (lang: string, feedUrl: string, genre: string, nonNeg: boolean) =>
    `${lang}:${feedUrl}:${genre}:${nonNeg}`;

  useEffect(() => {
    setArticles([]);
    loadFeedsAndArticles();
  }, [currentLanguage, viewLang]);

  useEffect(() => {
    loadBookmarks(viewLang);
  }, [currentLanguage, viewLang]);

  useEffect(() => {
    if (!activeFeedUrl || !settings) return;

    const cacheKey = makeCacheKey(currentLanguage, activeFeedUrl, localGenre, localNonNegative);
    const cachedEntry = cacheRef.current[cacheKey];
    if (cachedEntry && Date.now() - cachedEntry.fetchedAt < CACHE_TTL) {
      setArticles(cachedEntry.articles);
      setLoading(false);
      return;
    }

    fetchArticles(activeFeedUrl);
  }, [activeFeedUrl, currentLanguage, settings]);

  useEffect(() => {
    if (!settings || !activeFeedUrl) return;
    const currentSticky = settings.lastFeedUrlPerLang?.[currentLanguage];
    if (currentSticky !== activeFeedUrl) {
      const nextSettings = {
        ...settings,
        lastFeedUrlPerLang: {
          ...settings.lastFeedUrlPerLang,
          [currentLanguage]: activeFeedUrl,
        },
      };
      db.appSettings.put(nextSettings);
      setSettings(nextSettings);
    }
  }, [activeFeedUrl, currentLanguage, settings]);

  const handleBookmark = async (url: string, title: string, id?: number) => {
    try {
      if (id) {
        await db.bookmarks.delete(id);
      } else {
        const all = await db.bookmarks.toArray();
        const existing = all.find(
          (b) => b.url === url && b.lang === currentLanguage,
        );

        if (existing && existing.id) {
          await db.bookmarks.delete(existing.id);
        } else {
          await db.bookmarks.add({
            url,
            title,
            lang: currentLanguage,
            addedAt: Date.now(),
          });
        }
      }
      await loadBookmarks();
    } catch (err: any) {
      console.error("Bookmark toggle failed:", err);
      setError("Failed to toggle bookmark: " + err.message);
      setTimeout(() => setError(null), 3000);
    }
  };

  const loadFeedsAndArticles = async () => {
    const userFeeds = await db.customFeeds
      .where("lang")
      .equals(currentLanguage)
      .toArray();
    const appSettings = (await db.appSettings.toArray())[0] || null;

    setCustomFeeds(userFeeds);
    setSettings(appSettings);

    // Sync local filter state from DB (only on initial load)
    if (appSettings) {
      const dbNonNeg = appSettings.isNonNegativeMode || false;
      const dbGenre = appSettings.selectedGenres?.includes("All") || !appSettings.selectedGenres
        ? "All"
        : (appSettings.selectedGenres.find(g => g !== "None") || "All");
      setLocalNonNegative(dbNonNeg);
      setLocalGenre(dbGenre);
      setFeedFilterText((appSettings.feedFilterWords || []).join(", "));
    }

    const baseLang = viewLang === "all" ? currentLanguage : viewLang;
    const defaultFeedsForLang = DEFAULT_FEEDS[baseLang] || [];
    const activeGenre = settings ? localGenre : (
      appSettings?.selectedGenres?.includes("All") || !appSettings?.selectedGenres ? "All"
        : (appSettings.selectedGenres.find(g => g !== "None") || "All")
    );
    const localVisible =
      activeGenre === "All"
        ? defaultFeedsForLang
        : defaultFeedsForLang.filter((feed) => feed.genre === activeGenre);

    const candidateUrls = [
      ...localVisible.map((feed) => feed.url),
      ...userFeeds.map((feed) => feed.url),
    ];

    const stickyUrl = appSettings?.lastFeedUrlPerLang?.[currentLanguage];
    const initialUrl =
      stickyUrl && candidateUrls.includes(stickyUrl)
        ? stickyUrl
        : candidateUrls[0] || "";

    if (initialUrl) {
      const initNonNeg = appSettings?.isNonNegativeMode || false;
      const initGenre = appSettings?.selectedGenres?.includes("All") || !appSettings?.selectedGenres
        ? "All" : (appSettings.selectedGenres.find(g => g !== "None") || "All");
      const cacheKey = makeCacheKey(currentLanguage, initialUrl, initGenre, initNonNeg);
      const cachedEntry = cacheRef.current[cacheKey];
      if (cachedEntry && Date.now() - cachedEntry.fetchedAt < CACHE_TTL) {
        setArticles(cachedEntry.articles);
      }
    }

    setActiveFeedUrl(initialUrl);
  };

  const fetchArticles = async (url: string, nonNeg?: boolean) => {
    setLoading(true);
    setError(null);

    try {
      const useNonNeg = nonNeg !== undefined ? nonNeg : localNonNegative;
      const params = new URLSearchParams({ url });
      if (useNonNeg) params.set("nonNegativeMode", "true");
      const _res = await fetch(`${API_BASE}/api/rss-feed?${params}`);
      if (!_res.ok) throw new Error(`HTTP ${_res.status}`);
      const incomingArticles = ((await _res.json()).items as typeof articles) || [];
      setArticles(incomingArticles);
      const cacheKey = makeCacheKey(currentLanguage, url, useNonNeg ? localGenre : localGenre, useNonNeg);
      cacheRef.current[cacheKey] = {
        articles: incomingArticles,
        fetchedAt: Date.now(),
        feedUrl: url,
      };
    } catch (_err) {
      setError("Unable to load the RSS feed at this time.");
      setArticles([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddFeed = async () => {
    if (!newFeedName.trim() || !newFeedUrl.trim()) {
      setError("Feed name and URL are required.");
      return;
    }

    try {
      await db.customFeeds.add({
        name: newFeedName.trim(),
        url: newFeedUrl.trim(),
        lang: currentLanguage,
        addedAt: Date.now(),
      });
      setIsAddingFeed(false);
      setNewFeedName("");
      setNewFeedUrl("");
      setError(null);
      await loadFeedsAndArticles();
    } catch (_err) {
      setError("Unable to save the new channel.");
    }
  };

  const handleGenreChange = async (genre: string) => {
    setLocalGenre(genre);
    const appSettings = (await db.appSettings.toArray())[0];
    if (appSettings) {
      const updated = { ...appSettings, selectedGenres: genre === "All" ? ["All"] : [genre] };
      await db.appSettings.put(updated);
      setSettings(updated);
    }
    // Re-fetch with new genre filter applied to visible feeds
    const baseLang = viewLang === "all" ? currentLanguage : viewLang;
    const feeds = viewLang === "all"
      ? Object.values(DEFAULT_FEEDS).flat()
      : (DEFAULT_FEEDS[baseLang] || []);
    const visible = genre === "All" ? feeds : feeds.filter(f => f.genre === genre);
    if (visible.length > 0 && !visible.some(f => f.url === activeFeedUrl)) {
      setActiveFeedUrl(visible[0].url);
    } else {
      fetchArticles(activeFeedUrl);
    }
  };

  const handleNonNegativeChange = async (value: boolean) => {
    setLocalNonNegative(value);
    const appSettings = (await db.appSettings.toArray())[0];
    if (appSettings) {
      const updated = { ...appSettings, isNonNegativeMode: value };
      await db.appSettings.put(updated);
      setSettings(updated);
    }
    fetchArticles(activeFeedUrl, value);
  };

  const handleDeleteFeed = async (id?: number) => {
    if (!id) return;
    if (window.confirm("Remove this custom feed?")) {
      await db.customFeeds.delete(id);
      await loadFeedsAndArticles();
    }
  };

  const searchWikipedia = async (query: string) => {
    if (!query.trim()) return;
    setWikiLoading(true);
    setWikiError(null);
    try {
      const lang = viewLang === "all" ? currentLanguage : viewLang;
      const res = await fetch(`${API_BASE}/api/wikipedia?search=${encodeURIComponent(query)}&lang=${lang}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setWikiResults(data.results || []);
      if ((data.results || []).length === 0) setWikiError("No results found. Try a different search.");
    } catch {
      setWikiError("Unable to search Wikipedia at this time.");
      setWikiResults([]);
    } finally {
      setWikiLoading(false);
    }
  };

  const handleWikiSelect = (result: WikipediaSearchResult) => {
    const lang = viewLang === "all" ? currentLanguage : viewLang;
    const wikiLang = lang === "pt-BR" ? "pt" : lang;
    const url = `https://${wikiLang}.wikipedia.org/wiki/${encodeURIComponent(result.title.replace(/ /g, "_"))}`;
    onSelectArticle(url, result.title);
  };

  const allDefaultFeeds =
    viewLang === "all"
      ? Object.entries(DEFAULT_FEEDS).flatMap(([lang, feeds]) =>
          feeds.map((f) => ({ ...f, lang: lang as Language })),
        )
      : (DEFAULT_FEEDS[viewLang] || []).map((f) => ({
          ...f,
          lang: viewLang as Language,
        }));

  const visibleDefaultFeeds =
    viewLang === "all" || localGenre === "All"
      ? allDefaultFeeds
      : allDefaultFeeds.filter((feed) => feed.genre === localGenre);

  const selectedFeedMeta = visibleDefaultFeeds.find(
    (feed) => feed.url === activeFeedUrl,
  );

  const availableGenres = ["All", ...Array.from(new Set(allDefaultFeeds.map(f => f.genre))).sort()];

  return (
    <div className="p-8 max-w-6xl mx-auto transition-colors duration-200">
      <div className="flex flex-wrap items-center justify-between border-b border-gray-200 dark:border-dark-hover mb-6 gap-2">
        <div className="flex">
          <button
            onClick={() => { setCurrentTab("discover"); onTabChange?.("discover"); }}
            className={`px-6 py-3 font-semibold transition-colors ${
              currentTab === "discover"
                ? "text-green-600 border-b-2 border-green-600"
                : "text-gray-500 dark:text-dark-muted hover:text-gray-700 dark:hover:text-white"
            }`}
          >
            Discover
          </button>
          <button
            onClick={() => { setCurrentTab("wikipedia"); onTabChange?.("wikipedia"); setWikiResults([]); setWikiQuery(""); setWikiError(null); }}
            className={`px-6 py-3 font-semibold transition-colors flex items-center gap-1.5 ${
              currentTab === "wikipedia"
                ? "text-green-600 border-b-2 border-green-600"
                : "text-gray-500 dark:text-dark-muted hover:text-gray-700 dark:hover:text-white"
            }`}
          >
            <BookOpen size={15} /> Wikipedia
          </button>
          <button
            onClick={() => { setCurrentTab("bookmarks"); onTabChange?.("bookmarks"); }}
            className={`px-6 py-3 font-semibold transition-colors ${
              currentTab === "bookmarks"
                ? "text-green-600 border-b-2 border-green-600"
                : "text-gray-500 dark:text-dark-muted hover:text-gray-700 dark:hover:text-white"
            }`}
          >
            Bookmarks
          </button>
        </div>
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          {/* Genre filter */}
          <div className="flex items-center gap-1.5">
            <Filter size={14} className="text-gray-400 dark:text-dark-muted flex-shrink-0" />
            <select
              value={localGenre}
              onChange={(e) => handleGenreChange(e.target.value)}
              className="px-2 py-1.5 bg-gray-100 dark:bg-dark-hover border border-gray-200 dark:border-dark-muted rounded-lg text-sm font-semibold text-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
              title="Filter by genre"
            >
              {availableGenres.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
          {/* Non-negative toggle */}
          <button
            onClick={() => handleNonNegativeChange(!localNonNegative)}
            title={localNonNegative ? "Non-Negative Mode: ON" : "Non-Negative Mode: OFF"}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-sm font-semibold transition-all ${
              localNonNegative
                ? "bg-green-600 text-white border-green-600 shadow-sm"
                : "bg-gray-100 dark:bg-dark-hover text-gray-500 dark:text-dark-muted border-gray-200 dark:border-dark-muted hover:bg-gray-200 dark:hover:bg-dark-surface"
            }`}
          >
            <Shield size={14} />
            <span className="hidden sm:inline">Safe</span>
          </button>
          {/* Language select */}
          <select
            value={viewLang}
            onChange={(e) => {
              const val = e.target.value as Language | "all";
              setViewLang(val);
              if (val !== "all") onViewLangChange?.(val as Language);
            }}
            className="px-3 py-1.5 bg-gray-100 dark:bg-dark-hover border border-gray-200 dark:border-dark-muted rounded-lg text-sm font-semibold text-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="all">All Languages</option>
            {(settings?.languageOrder?.length
              ? settings.languageOrder.filter((c) => c in LANGUAGE_NAMES)
              : Object.keys(LANGUAGE_NAMES)
            ).map((code) => (
              <option key={code} value={code}>{(LANGUAGE_NAMES as Record<string, string>)[code]}</option>
            ))}
          </select>
          {/* Feed title filter */}
          <input
            value={feedFilterText}
            onChange={(e) => {
              const val = e.target.value;
              setFeedFilterText(val);
              if (feedFilterDebounceRef.current) clearTimeout(feedFilterDebounceRef.current);
              feedFilterDebounceRef.current = setTimeout(async () => {
                const stored = await db.appSettings.toArray();
                if (stored.length > 0) {
                  const words = val.split(",").map(w => w.trim()).filter(Boolean);
                  const updated = { ...stored[0], feedFilterWords: words };
                  await db.appSettings.put(updated);
                  setSettings(updated);
                }
              }, 600);
            }}
            placeholder="Filter titles…"
            title="Hide articles whose title contains these words (comma-separated)"
            className="px-3 py-1.5 bg-gray-100 dark:bg-dark-hover border border-gray-200 dark:border-dark-muted rounded-lg text-sm text-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500 w-36"
          />
        </div>
      </div>

      {currentTab === "discover" ? (
        <>
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 border-b border-gray-200 dark:border-dark-hover pb-6 gap-4">
            <div>
              <h1 className="text-4xl font-black flex items-center gap-3 text-gray-900 dark:text-white">
                <Rss size={32} className="text-green-600" />
                Discover
              </h1>
              <p className="text-gray-500 dark:text-dark-muted mt-2 font-medium">
                Learn{" "}
                <span className="text-green-600 font-bold uppercase">
                  {viewLang === "all" ? "ALL LANGUAGES" : LANGUAGE_NAMES[viewLang]}
                </span>{" "}
                through real-world news.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => onSelectArticle("")}
                className="text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline px-4 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg"
              >
                Paste Text Manually
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 dark:border-red-700/40 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-200">
              {error}
            </div>
          )}

          <div className="flex flex-wrap gap-4 mb-10 items-center">
            <select
              value={activeFeedUrl}
              onChange={(e) => setActiveFeedUrl(e.target.value)}
              className="bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-hover text-gray-900 dark:text-white rounded-xl px-4 py-3 text-lg flex-1 min-w-[280px] shadow-sm outline-none focus:ring-2 focus:ring-green-500 font-bold transition-all"
            >
              <optgroup label="Recommended Sources">
                {visibleDefaultFeeds.map((feed) => (
                  <option key={feed.url} value={feed.url}>
                    {viewLang === "all" && "lang" in feed ? `[${(feed.lang as string).toUpperCase()}] ` : ""}{feed.name} — {feed.genre} [{feed.difficulty}]
                  </option>
                ))}
              </optgroup>

              {customFeeds.length > 0 && (
                <optgroup label="My Channels">
                  {customFeeds.map((feed) => (
                    <option key={feed.id} value={feed.url}>
                      {feed.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>

            <button
              onClick={() => fetchArticles(activeFeedUrl)}
              className="p-3.5 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-hover rounded-xl hover:bg-gray-50 dark:hover:bg-dark-hover transition-all shadow-sm group"
              title="Refresh"
            >
              <RefreshCw
                size={22}
                className={`${loading ? "animate-spin text-green-500" : "text-gray-400 group-hover:text-gray-600 dark:group-hover:text-white"}`}
              />
            </button>

            <button
              onClick={() => setIsAddingFeed(!isAddingFeed)}
              className="flex items-center gap-2 px-5 py-3.5 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-hover rounded-xl hover:bg-gray-50 dark:hover:bg-dark-hover transition-all shadow-sm font-bold text-gray-700 dark:text-white"
            >
              <Plus size={20} /> Add Channel
            </button>
          </div>

          {isAddingFeed && (
            <div className="mb-10 p-8 bg-gray-50 dark:bg-dark-surface border border-gray-200 dark:border-dark-hover rounded-2xl shadow-inner animate-fade-in">
              <h3 className="text-xl font-black mb-6 text-gray-900 dark:text-white">
                New RSS Source
              </h3>
              <div className="flex flex-col md:flex-row gap-4">
                <input
                  type="text"
                  placeholder="Source Name (e.g. TechCrunch)"
                  value={newFeedName}
                  onChange={(e) => setNewFeedName(e.target.value)}
                  className="flex-1 bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-hover p-4 rounded-xl text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-green-500 shadow-sm"
                />
                <input
                  type="url"
                  placeholder="RSS Link (https://...)"
                  value={newFeedUrl}
                  onChange={(e) => setNewFeedUrl(e.target.value)}
                  className="flex-2 bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-hover p-4 rounded-xl text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-green-500 shadow-sm"
                />
                <button
                  onClick={handleAddFeed}
                  className="px-8 py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-black shadow-lg shadow-green-600/20 transition-all active:scale-95"
                >
                  Connect
                </button>
              </div>
              {customFeeds.length > 0 && (
                <div className="mt-8 pt-6 border-t border-gray-200 dark:border-dark-hover">
                  <h4 className="text-xs uppercase tracking-widest text-gray-400 font-black mb-4">
                    Saved Channels
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {customFeeds.map((feed) => (
                      <div
                        key={feed.id}
                        className="flex items-center gap-3 bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-hover px-4 py-2 rounded-full shadow-sm"
                      >
                        <span className="text-sm font-bold text-gray-700 dark:text-white">
                          {feed.name}
                        </span>
                        <button
                          onClick={() => handleDeleteFeed(feed.id)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {loading ? (
            /* Skeleton grid — above-the-fold placeholder while articles load */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-hover rounded-2xl overflow-hidden shadow-sm animate-pulse">
                  <div className="p-6 flex flex-col gap-3">
                    <div className="h-3 w-24 bg-gray-200 dark:bg-dark-hover rounded-full" />
                    <div className="h-5 w-full bg-gray-200 dark:bg-dark-hover rounded-full" />
                    <div className="h-5 w-4/5 bg-gray-200 dark:bg-dark-hover rounded-full" />
                    <div className="h-5 w-3/5 bg-gray-200 dark:bg-dark-hover rounded-full" />
                    <div className="mt-4 h-3 w-20 bg-gray-100 dark:bg-dark-bg rounded-full" />
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-dark-bg/30 border-t border-gray-100 dark:border-dark-hover">
                    <div className="h-10 bg-gray-200 dark:bg-dark-hover rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          ) : articles.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {articles
                .filter((article) => {
                  const filterWords = settings?.feedFilterWords || [];
                  if (filterWords.length === 0) return true;
                  const title = article.title.toLowerCase();
                  return !filterWords.some((w) => w && title.includes(w.toLowerCase()));
                })
                .map((article, index) => (
                <ArticleCard
                  key={`${article.link}-${index}`}
                  item={article as ArticleItem}
                  type="article"
                  difficulty={selectedFeedMeta?.difficulty}
                  locale={currentLanguage}
                  onSelect={onSelectArticle}
                  onBookmark={handleBookmark}
                  isBookmarked={bookmarkedUrls.has(article.link)}
                  readStatus={readStatuses[article.link]}
                />
              ))}
            </div>
          ) : (
            !loading &&
            !error && (
              <div className="text-center py-24 text-gray-400">
                <Rss size={64} className="mx-auto mb-6 opacity-20" />
                <p className="text-xl font-black">
                  No feeds active for {currentLanguage}
                </p>
              </div>
            )
          )}
        </>
      ) : currentTab === "wikipedia" ? (
        <>
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 border-b border-gray-200 dark:border-dark-hover pb-6 gap-4">
            <div>
              <h1 className="text-4xl font-black flex items-center gap-3 text-gray-900 dark:text-white">
                <BookOpen size={32} className="text-green-600" />
                Wikipedia
              </h1>
              <p className="text-gray-500 dark:text-dark-muted mt-2 font-medium">
                Search articles in{" "}
                <span className="text-green-600 font-bold uppercase">
                  {viewLang === "all" ? currentLanguage.toUpperCase() : LANGUAGE_NAMES[viewLang as Language]}
                </span>
                . Content is freely licensed under{" "}
                <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer" className="underline hover:text-green-600">CC BY-SA 4.0</a>.
              </p>
            </div>
          </div>

          <div className="flex gap-3 mb-8">
            <input
              type="text"
              value={wikiQuery}
              onChange={(e) => setWikiQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchWikipedia(wikiQuery)}
              placeholder="Search Wikipedia…"
              className="flex-1 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-hover rounded-xl px-5 py-3.5 text-lg font-medium text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-green-500 shadow-sm"
            />
            <button
              onClick={() => searchWikipedia(wikiQuery)}
              disabled={wikiLoading}
              className="flex items-center gap-2 px-6 py-3.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-black transition-all shadow-md shadow-green-600/20 active:scale-95 disabled:opacity-60"
            >
              <Search size={18} /> {wikiLoading ? "Searching…" : "Search"}
            </button>
          </div>

          {wikiError && (
            <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 dark:border-red-700/40 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-200">
              {wikiError}
            </div>
          )}

          {wikiResults.length > 0 && (
            <div className="flex flex-col gap-4">
              {wikiResults.map((result) => (
                <div
                  key={result.pageid}
                  className="group bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-hover rounded-2xl p-6 hover:shadow-xl hover:shadow-green-600/10 transition-all cursor-pointer"
                  onClick={() => handleWikiSelect(result)}
                >
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white group-hover:text-green-600 transition-colors mb-2">
                    {result.title}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-dark-muted leading-relaxed">
                    {result.snippet}
                  </p>
                  <div className="mt-4 flex items-center gap-2 text-xs font-black text-green-600 uppercase tracking-widest">
                    <BookOpen size={12} /> Learn Now
                  </div>
                </div>
              ))}
            </div>
          )}

          {!wikiLoading && wikiResults.length === 0 && !wikiError && (
            <div className="text-center py-24 text-gray-400">
              <BookOpen size={64} className="mx-auto mb-6 opacity-20" />
              <p className="text-xl font-black">Search Wikipedia to find articles</p>
              <p className="text-sm mt-2 opacity-60">Articles are legally licensed for free use (CC BY-SA 4.0)</p>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 border-b border-gray-200 dark:border-dark-hover pb-6 gap-4">
            <div>
              <h1 className="text-4xl font-black flex items-center gap-3 text-gray-900 dark:text-white">
                <Rss size={32} className="text-green-600" />
                Saved {viewLang === "all" ? "All Languages'" : LANGUAGE_NAMES[viewLang as Language]} Articles
              </h1>
              <p className="text-gray-500 dark:text-dark-muted mt-2 font-medium">
                Your bookmarked articles for learning.
              </p>
            </div>
          </div>

          {bookmarks && bookmarks.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {bookmarks.map((bookmark) => (
                <ArticleCard
                  key={bookmark.id}
                  item={bookmark}
                  type="bookmark"
                  locale={currentLanguage}
                  onSelect={onSelectArticle}
                  onBookmark={handleBookmark}
                  isBookmarked={true}
                  readStatus={readStatuses[bookmark.url]}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-24 text-gray-400">
              <Rss size={64} className="mx-auto mb-6 opacity-20" />
              <p className="text-xl font-black">
                No bookmarks yet for {LANGUAGE_NAMES[currentLanguage]}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
