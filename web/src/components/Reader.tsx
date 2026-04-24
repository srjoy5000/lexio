import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, AppSettings, FavoriteSite, ReadingHistory } from "../db";
import { shouldHighlightWord, tokenizeWords, isStopword, speakText } from "../lib/nlp";
import { LANGUAGES, PosEntry } from "../lib/types";
import { toGoogleLang, fromGoogleLang, fetchGoogleTranslate } from "../lib/translate";
import { detectLangFromUrl } from "../lib/utils";
import { useWordStatus } from "../hooks/useWordStatus";
import { useArticleLoader } from "../hooks/useArticleLoader";
import { useWordTranslation } from "../hooks/useWordTranslation";
import QuickTooltip from "./QuickTooltip";
import {
  Book,
  CheckSquare,
  ExternalLink,
  ChevronLeft,
  RefreshCw,
  Bookmark as BookmarkIcon,
  ExternalLink as OpenSiteIcon,
  ThumbsUp,
  EyeOff,
  Sun,
  Moon,
} from "lucide-react";

interface ReaderProps {
  articleUrl?: string;
  articleTitle?: string;
  initialManualText?: string;
  initialContent?: string;
  onBack: () => void;
  onArticleRead?: (url: string) => void;
  onNavigateToFlashcard?: (word: string) => void;
}


const hexToRgba = (hex: string, alpha: number): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};


/** Safely highlights `word` inside `text` — no HTML injection. */
const CJK_RE = /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7A3]/;

function HighlightInSentence({ text, word, color = "#10b981" }: { text: string; word: string; color?: string }) {
  if (!word.trim() || !text) return <>{text}</>;
  const isCJK = CJK_RE.test(word);
  if (isCJK) {
    const idx = text.toLowerCase().indexOf(word.toLowerCase());
    if (idx === -1) return <>{text}</>;
    return (
      <>
        <span>{text.slice(0, idx)}</span>
        <mark style={{ background: color, color: "inherit", fontWeight: 700 }}>{text.slice(idx, idx + word.length)}</mark>
        <span>{text.slice(idx + word.length)}</span>
      </>
    );
  }
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(\\b${escaped}\\b)`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} style={{ background: color, color: "inherit", fontWeight: 700 }}>
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

/** Per-language reading typography overrides */
const LANG_TEXT_STYLE: Record<string, React.CSSProperties> = {
  ja: { fontFamily: '"Hiragino Sans", "Noto Sans JP", sans-serif', lineHeight: 2.1, letterSpacing: "0.04em" },
  ko: { fontFamily: '"Apple SD Gothic Neo", "Noto Sans KR", sans-serif', lineHeight: 2.1 },
  "zh-TW": { fontFamily: '"PingFang TC", "Noto Sans TC", sans-serif', lineHeight: 2.1 },
  "zh-CN": { fontFamily: '"PingFang SC", "Noto Sans SC", sans-serif', lineHeight: 2.1 },
  fr: { lineHeight: 1.85 },
  es: { lineHeight: 1.85 },
  "pt-BR": { lineHeight: 1.85 },
  en: { lineHeight: 1.85 },
};

export default function Reader({
  articleUrl,
  articleTitle,
  initialManualText,
  initialContent,
  onBack,
  onArticleRead,
  onNavigateToFlashcard,
}: ReaderProps) {
  const [manualText, setManualText] = useState(() => localStorage.getItem("reader.manualText") || "");
  const [manualTitle, setManualTitle] = useState(() => localStorage.getItem("reader.manualTitle") || "");
  const [manualUrl, setManualUrl] = useState(() => localStorage.getItem("reader.manualUrl") || "");
  const [manualLang, setManualLang] = useState<string>(() => localStorage.getItem("reader.manualLang") || "");
  const [fontSize, setFontSize] = useState<number>(() => parseInt(localStorage.getItem("reader.fontSize") || "21", 10));
  const [isFallbackMode, setIsFallbackMode] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [autoHighlightEnabled, setAutoHighlightEnabled] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(
    document.documentElement.classList.contains("dark"),
  );

  // Auto-detected language flash indicator
  const [langAutoDetected, setLangAutoDetected] = useState(false);

  // Floating word/selection tooltip
  const [quickTooltipVisible, setQuickTooltipVisible] = useState(false);
  const [quickTooltipLoading, setQuickTooltipLoading] = useState(false);
  const [quickTooltipPos, setQuickTooltipPos] = useState({ x: 0, y: 0 });
  const [quickTooltipData, setQuickTooltipData] = useState<{
    original: string;
    meanings: PosEntry[];
  } | null>(null);
  const [quickTooltipError, setQuickTooltipError] = useState<string | null>(null);

  // Favorite site selection — persisted to localStorage
  const [selectedFavoriteSite, setSelectedFavoriteSite] = useState<string>(
    () => localStorage.getItem("reader.selectedFavoriteSite") || ""
  );

  // Known words (confidence: "known" or undefined = fully known)
  const knownWordsSet = useLiveQuery<Set<string>>(
    () => db.knownWords.filter((k) => k.confidence !== "vague").toArray()
      .then((kw) => new Set(kw.map((k) => k.word.toLowerCase()))),
    []
  );

  // Vaguely-known words (passive vocabulary)
  const vagueWordsSet = useLiveQuery<Set<string>>(
    () => db.knownWords.filter((k) => k.confidence === "vague").toArray()
      .then((kw) => new Set(kw.map((k) => k.word.toLowerCase()))),
    []
  );

  // Reactive settings — syncs immediately when Sidebar saves
  const liveSettings = useLiveQuery(() => db.appSettings.toArray().then((a) => a[0] ?? null), []);
  // Merge live settings into local state (keeps local overrides like excludedWords during a session)
  useEffect(() => {
    if (liveSettings && (!settings || liveSettings.targetLanguage !== settings.targetLanguage ||
        liveSettings.autoTranslate !== settings.autoTranslate ||
        liveSettings.ttsVoices !== settings.ttsVoices)) {
      setSettings(liveSettings);
    }
  }, [liveSettings]);

  // Words learned today
  const learnedTodayCount = useLiveQuery<number>(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    return db.flashcards.filter((c) => c.addedAt >= start.getTime()).count();
  }, []);

  const contentAreaRef = useRef<HTMLDivElement | null>(null);
  const translationSectionRef = useRef<HTMLDivElement | null>(null);

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const quickTooltipRef = useRef<HTMLDivElement>(null);
  const lsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detectLangTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const langAutoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Prevents the mouseup selection-tooltip from firing after a word click
  const wordClickedRef = useRef(false);
  // WPM tracking: set when article finishes loading, used in handleFinishReading
  const readStartTimeRef = useRef<number>(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  /** Schedule setSaveStatus(null) after `ms` ms, cancelling any pending clear. */
  const scheduleSaveStatusClear = useCallback((ms: number, extra?: () => void) => {
    if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
    saveStatusTimerRef.current = setTimeout(() => {
      setSaveStatus(null);
      saveStatusTimerRef.current = null;
      extra?.();
    }, ms);
  }, []);

  const sourceLang = isFallbackMode
    ? (manualLang || settings?.targetLanguage || "en")
    : (settings?.targetLanguage || "en");

  const {
    article, setArticle,
    loading,
    isBookmarked,
    servedFromCache,
    articleDifficulty,
    loadArticle,
    toggleBookmark,
  } = useArticleLoader(articleUrl, articleTitle, sourceLang, settings, setIsFallbackMode, onArticleRead, initialContent);

  const {
    selectedWord, setSelectedWord,
    selectedSentence, setSelectedSentence,
    translatedText, setTranslatedText,
    translating,
    translationError, setTranslationError,
    wordPosData,
    wordPosLoading,
    lastSavedCardId,
    handleWordClick,
    handleDoubleClickWord,
    handleTranslateOnly,
    handleSaveToFlashcard,
    handleUndoFlashcard,
    isTranslationEnabled,
    getTranslationTargets,
    evictTranslationCache,
  } = useWordTranslation(
    sourceLang,
    settings,
    isFallbackMode,
    manualLang,
    { article, articleUrl, articleTitle, manualTitle, manualUrl },
    setSaveStatus,
    scheduleSaveStatusClear,
    wordClickedRef,
    translationSectionRef,
    {
      setVisible: setQuickTooltipVisible,
      setLoading: setQuickTooltipLoading,
      setPos: setQuickTooltipPos,
      setData: setQuickTooltipData,
      setError: setQuickTooltipError,
    },
  );

  const {
    handleMarkAsKnown,
    handleToggleKnown,
    handleToggleVague,
    handleAddToStopwords,
  } = useWordStatus(
    sourceLang,
    selectedWord,
    settings,
    setSaveStatus,
    scheduleSaveStatusClear,
    setSettings,
  );

  const debouncedLsSet = (key: string, value: string) => {
    if (lsTimerRef.current) clearTimeout(lsTimerRef.current);
    lsTimerRef.current = setTimeout(() => localStorage.setItem(key, value), 500);
  };

  const wordCounts = useLiveQuery(() => {
    const lang = isFallbackMode ? manualLang : settings?.targetLanguage || "en";
    if (!lang) return Promise.resolve({} as Record<string, number>);
    return db.wordCounts
      .where("lang")
      .equals(lang)
      .toArray()
      .then((counts) => {
        const map: Record<string, number> = {};
        counts.forEach((item) => { map[item.langWord] = item.count; });
        return map;
      });
  }, [settings?.targetLanguage, isFallbackMode, manualLang]);

  const highlightedWords = useLiveQuery(() => {
    return db.flashcards
      .toArray()
      .then((cards) => new Set(cards.map((c) => c.word.toLowerCase())));
  }, []);

  const favoriteSites = useLiveQuery<FavoriteSite[]>(() => db.favoriteSites.toArray(), []);

  // Cleanup pending timers on unmount
  useEffect(() => {
    return () => {
      if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
      if (langAutoTimerRef.current) clearTimeout(langAutoTimerRef.current);
    };
  }, []);

  // Dark mode observer
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDarkMode(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // Initialise reader on URL change
  useEffect(() => {
    initializeReader();
  }, [articleUrl]);

  // Start WPM timer when article finishes loading
  useEffect(() => {
    if (!loading && (article || (isFallbackMode && manualText))) {
      readStartTimeRef.current = Date.now();
      setElapsedSeconds(0);
    }
  }, [loading, article, isFallbackMode, manualText]);

  // Tick elapsed timer every second while reading
  useEffect(() => {
    if (!readStartTimeRef.current) return;
    const id = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - readStartTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [readStartTimeRef.current]);

  // Resize drag
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizing && wrapperRef.current) {
        const rect = wrapperRef.current.getBoundingClientRect();
        const newWidth = Math.max(200, Math.min(600, rect.right - e.clientX));
        if (sidebarRef.current) sidebarRef.current.style.width = `${newWidth}px`;
      }
    };
    const handleMouseUp = () => {
      setIsResizing(false);
      if (sidebarRef.current) {
        setSidebarWidth(parseInt(sidebarRef.current.style.width || "320", 10));
      }
    };
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);


  // Auto-detect language when text is pasted in manual mode (debounced)
  useEffect(() => {
    if (!isFallbackMode || manualText.length <= 5) return;
    if (detectLangTimerRef.current) clearTimeout(detectLangTimerRef.current);
    detectLangTimerRef.current = setTimeout(() => {
      autoDetectLanguage(manualText.substring(0, 150));
    }, 800);
    return () => {
      if (detectLangTimerRef.current) clearTimeout(detectLangTimerRef.current);
    };
  }, [manualText, isFallbackMode]);

  // Auto-translate: fire translation whenever selectedWord changes (if enabled)
  useEffect(() => {
    if (settings?.autoTranslate && selectedWord) {
      handleTranslateOnly();
    }
  }, [selectedWord, settings?.autoTranslate]);

  // Close quick tooltip when clicking outside of it
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (quickTooltipRef.current && !quickTooltipRef.current.contains(e.target as Node)) {
        setQuickTooltipVisible(false);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);


  // Highlight filter: "all" | "new" | "saved" — persisted to localStorage
  const [highlightFilter, setHighlightFilter] = useState<"all" | "new" | "saved">(
    () => (localStorage.getItem("reader.highlightFilter") as "all" | "new" | "saved") || "all",
  );

  // Large-text pagination for manual mode
  const [visibleParaCount, setVisibleParaCount] = useState(100);

  // Arrow-key word traversal — built after sourceLang and highlightFilter are available
  // (populated later via closure; keep refs here so the effect can reference stable values)
  const navigableWordsRef = useRef<Array<{ word: string; sentence: string }>>([]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const words = navigableWordsRef.current;
      if (!words.length) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Escape") return;
      e.preventDefault();
      if (e.key === "Escape") { setSelectedWord(null); return; }
      const currentIdx = selectedWord ? words.findIndex((w) => w.word.toLowerCase() === selectedWord.toLowerCase()) : -1;
      const next =
        e.key === "ArrowRight"
          ? Math.min(currentIdx + 1, words.length - 1)
          : Math.max(currentIdx - 1, 0);
      const entry = words[next];
      if (entry) {
        handleWordClick(entry.word, entry.sentence, 0, 0);
        requestAnimationFrame(() => {
          const el = contentAreaRef.current?.querySelector(`[data-word="${CSS.escape(entry.word)}"]`);
          el?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWord]);

  const initializeReader = async () => {
    const appSettings = (await db.appSettings.toArray())[0] || null;
    if (appSettings) {
      setSettings(appSettings);
      setAutoHighlightEnabled(appSettings.isAutoHighlightEnabled);
    }
    setIsFallbackMode(false);
    setSelectedWord(null);
    setSelectedSentence(null);
    setTranslatedText("");
    setTranslationError(null);
    setSaveStatus(null);
    setQuickTooltipVisible(false);
    setQuickTooltipData(null);
    setLangAutoDetected(false);

    if (articleUrl) {
      // URL-based article mode: clear manual state
      setManualText("");
      await loadArticle(articleUrl);
    } else {
      setIsFallbackMode(true);
      setArticle(null);
      // Restore manual text: prefer initialManualText (from sessionMap), else localStorage
      if (initialManualText) {
        setManualText(initialManualText);
        localStorage.setItem("reader.manualText", initialManualText);
      }
      // manualTitle/url/lang are already initialized from localStorage via useState
    }

    // Purge translation cache entries older than 30 days
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const staleKeys = await db.translationCache
      .filter((c) => c.cachedAt < cutoff)
      .primaryKeys();
    if (staleKeys.length > 0) await db.translationCache.bulkDelete(staleKeys);
    // Also cap by count: keep at most 200 newest
    await evictTranslationCache();
  };

  const autoDetectLanguage = async (sampleText: string) => {
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(sampleText)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data?.[2]) return;
      const detected = fromGoogleLang(data[2].toLowerCase().split("-")[0] === "pt" ? "pt" : data[2].toLowerCase());
      const supported = Object.keys(LANGUAGES);
      if (!supported.includes(detected) || detected === manualLang) return;
      setManualLang(detected);
      localStorage.setItem("reader.manualLang", detected);
      setLangAutoDetected(true);
      if (langAutoTimerRef.current) clearTimeout(langAutoTimerRef.current);
      langAutoTimerRef.current = setTimeout(() => setLangAutoDetected(false), 2500);
    } catch (err) { console.error("[Reader] autoDetectLanguage:", err); }
  };

  const toggleTheme = () => {
    const isDark = document.documentElement.classList.toggle("dark");
    setIsDarkMode(isDark);
  };

  const handleReaderMouseUp = (e: { clientX: number; clientY: number }) => {
    const clientX = e.clientX;
    const clientY = e.clientY;
    setTimeout(async () => {
      // Skip if a word span was just clicked (it handles its own tooltip)
      if (wordClickedRef.current) return;

      const selection = window.getSelection();
      const text = selection?.toString().trim() || "";
      // Only trigger for drag-selected multi-char phrases (not single clicks)
      if (!text || text.includes("\n") || text.length > 30) {
        setQuickTooltipVisible(false);
        return;
      }
      const targets = getTranslationTargets();
      const tgt = toGoogleLang(targets.length > 0 ? targets[0] : "en");
      const src = toGoogleLang(sourceLang);
      if (src === tgt) return;

      // Position tooltip, clamped to viewport
      const tooltipX = Math.min(clientX + 10, window.innerWidth - 300);
      const tooltipY = Math.min(clientY + 15, window.innerHeight - 220);
      setQuickTooltipPos({ x: tooltipX, y: tooltipY });
      setQuickTooltipVisible(true);
      setQuickTooltipLoading(true);
      setQuickTooltipData(null);
      setQuickTooltipError(null);

      try {
        const data = await fetchGoogleTranslate(text, src, tgt);
        setQuickTooltipData(data);
      } catch (err) {
        console.error("[Reader] quickTooltip lookup:", err);
        setQuickTooltipError("Lookup failed.");
      } finally {
        setQuickTooltipLoading(false);
      }
    }, 50);
  };

  const handleSaveManualText = async () => {
    if (!manualText.trim() || !settings) return;
    if (isFallbackMode && !manualLang) {
      setSaveStatus("Please select a Source Language before saving.");
      scheduleSaveStatusClear(3000);
      return;
    }
    await db.manualTexts.add({
      title: manualTitle.trim() || "Untitled",
      url: manualUrl.trim(),
      body: manualText.trim(),
      lang: sourceLang,
      addedAt: Date.now(),
    });
    setSaveStatus("Text saved to My Texts!");
    scheduleSaveStatusClear(2500);
  };

  const handleFinishReading = async () => {
    if (!settings) { onBack(); return; }

    // Language guard: prevent saving under wrong language in manual mode
    if (isFallbackMode && !manualLang) {
      setSaveStatus("Please select a Source Language before finishing.");
      scheduleSaveStatusClear(3000);
      return;
    }

    const lang = sourceLang;
    const textToProcess = isFallbackMode
      ? manualText
      : [article?.title, article?.content].filter(Boolean).join(" ");

    if (!textToProcess.trim()) { onBack(); return; }

    // Only save highlighted words: skip stopwords + excluded words
    const savedFlashcardWords = new Set(
      (await db.flashcards.toArray()).map((c) => c.word.toLowerCase())
    );
    const excludedWords = new Set((settings.excludedWords || []).map((w) => w.toLowerCase()));

    const words = tokenizeWords(textToProcess, lang);
    const freqMap: Record<string, number> = {};
    for (const word of words) {
      if (!word) continue;
      if (isStopword(word, lang) && !savedFlashcardWords.has(word)) continue;
      if (excludedWords.has(word)) continue;
      if (!shouldHighlightWord(word, "", lang) && !savedFlashcardWords.has(word)) continue;
      freqMap[word] = (freqMap[word] || 0) + 1;
    }

    const now = Date.now();
    for (const [word, count] of Object.entries(freqMap)) {
      const langWord = `${lang}|${word}`;
      const existing = await db.wordCounts.where("langWord").equals(langWord).first();
      if (existing) {
        existing.count += count;
        existing.lastEncountered = now;
        await db.wordCounts.put(existing);
      } else {
        await db.wordCounts.add({ langWord, lang, word, count, lastEncountered: now });
      }
    }

    // Auto-save manual text
    if (isFallbackMode && manualText.trim()) {
      const titleToSave = manualTitle.trim() || "Untitled";
      const existing = await db.manualTexts
        .filter((t) => t.body === manualText.trim() && t.title === titleToSave)
        .first();
      if (!existing) {
        await db.manualTexts.add({
          title: titleToSave,
          url: manualUrl.trim(),
          body: manualText.trim(),
          lang: manualLang || sourceLang,
          addedAt: Date.now(),
        });
      }
    }

    // Clear persisted manual state after finish
    if (isFallbackMode) {
      localStorage.removeItem("reader.manualText");
      localStorage.removeItem("reader.manualTitle");
      localStorage.removeItem("reader.manualUrl");
    }

    // Compute WPM
    const totalWords = article
      ? (article.wordCount ?? article.content.split(/\s+/).length)
      : (textToProcess.split(/\s+/).length);
    const readingDurationSec = readStartTimeRef.current
      ? Math.max(1, Math.round((Date.now() - readStartTimeRef.current) / 1000))
      : 0;
    const wpm = readingDurationSec > 0
      ? Math.round(totalWords / (readingDurationSec / 60))
      : undefined;

    // Record reading history
    const historyEntry: ReadingHistory = {
      url: articleUrl || article?.url || manualUrl || "",
      title: article?.title || articleTitle || manualTitle || "Manual Text",
      lang,
      newWordsCount: Object.keys(freqMap).length,
      readAt: Date.now(),
      wpm,
      readingDuration: readingDurationSec || undefined,
    };
    await db.readingHistory.add(historyEntry);

    // Mark article as read
    const readUrl = articleUrl || article?.url;
    if (readUrl) onArticleRead?.(readUrl);

    onBack();
  };

  const handleOpenFavoriteSite = () => {
    if (selectedFavoriteSite) window.open(selectedFavoriteSite, "_blank", "noopener,noreferrer");
  };

  const getDisplayStyle = (word: string, sentence: string) => {
    const cleanWord = word.replace(/[^A-Za-zÀ-ž\u3040-\u30FF\uAC00-\uD7A3一-鿿0-9'-]/g, "").toLowerCase();
    if (!cleanWord) return { style: {}, shouldHighlight: false };

    const isSavedWord = highlightedWords ? highlightedWords.has(cleanWord) : false;
    const isVague = vagueWordsSet ? vagueWordsSet.has(cleanWord) : false;

    // Saved flashcard words are ALWAYS highlighted regardless of other suppression rules
    if (!isSavedWord && !isVague) {
      const isExcluded = (settings?.excludedWords || []).some((w) => w.toLowerCase() === cleanWord);
      const isKnown = knownWordsSet ? knownWordsSet.has(cleanWord) : false;
      const isStop = isStopword(cleanWord, sourceLang);

      if (
        isExcluded ||
        isKnown ||
        isStop ||
        (isFallbackMode && !manualLang) ||
        !autoHighlightEnabled ||
        !shouldHighlightWord(word, sentence, sourceLang)
      ) {
        return { style: {}, shouldHighlight: false };
      }
    }

    // Apply highlight filter (saved/new) — vague words always show
    if (highlightFilter === "new" && isSavedWord) return { style: {}, shouldHighlight: false };
    if (highlightFilter === "saved" && !isSavedWord && !isVague) return { style: {}, shouldHighlight: false };

    const count = settings && wordCounts ? wordCounts[`${sourceLang}|${cleanWord}`] || 0 : 0;
    const baseColor = "#10b981";
    const isActive = selectedWord?.toLowerCase() === cleanWord;

    let bgColor: string;
    let opacity: number;

    if (isSavedWord) {
      bgColor = "#6366f1";
      opacity = isDarkMode ? 0.35 : 0.28;
    } else if (isVague) {
      bgColor = "#fb923c"; // warm orange
      opacity = isDarkMode ? 0.40 : 0.35;
    } else if (count === 0) {
      bgColor = "#f59e0b";
      opacity = isDarkMode ? 0.50 : 0.40;
    } else {
      bgColor = baseColor;
      opacity = Math.max(0.12, 0.55 - count * 0.07);
    }

    const textColor = isDarkMode ? "#f3f4f6" : "#111827";

    // Use box-shadow instead of border so the highlight never shifts line height
    let boxShadow: string | undefined;
    if (isActive) {
      boxShadow = "inset 0 0 0 2px rgba(16,185,129,0.95)";
    } else if (isSavedWord) {
      boxShadow = "inset 0 0 0 1.5px rgba(99,102,241,0.8)";
    } else if (isVague) {
      boxShadow = "inset 0 0 0 1px rgba(251,146,60,0.7)";
    }

    return {
      style: {
        backgroundColor: hexToRgba(bgColor, opacity),
        color: textColor,
        boxShadow,
        borderRadius: "3px",
      },
      shouldHighlight: true,
      isSavedWord,
    };
  };

  /** Tokenises `text` into sentence/word segments and returns interactive highlighted spans. */
  const renderHighlighted = (text: string, context = text, isTitle = false, isFirstCall = false) => {
    // Reset the navigable word list on the first (body) call so arrow-key nav stays in sync
    if (isFirstCall) navigableWordsRef.current = [];
    const lang = sourceLang || "en";

    let sentenceSegs: Array<{ segment: string }>;
    try {
      const sentSeg = new Intl.Segmenter(lang, { granularity: "sentence" });
      sentenceSegs = Array.from(sentSeg.segment(text)).map((s) => ({ segment: s.segment }));
    } catch {
      sentenceSegs = [{ segment: text }];
    }

    return sentenceSegs.map(({ segment: sentText }, sentIdx) => {
      let wordSegs: Array<{ segment: string; isWordLike: boolean }>;
      try {
        const wordSeg = new Intl.Segmenter(lang, { granularity: "word" });
        wordSegs = Array.from(wordSeg.segment(sentText)).map((s) => ({
          segment: s.segment,
          isWordLike: s.isWordLike ?? false,
        }));
      } catch {
        const parts = sentText.split(/([A-Za-zÀ-ž\u3040-\u30FF\uAC00-\uD7A3一-鿿0-9'-]+)/g);
        wordSegs = parts.map((p) => ({
          segment: p,
          isWordLike: /^[A-Za-zÀ-ž\u3040-\u30FF\uAC00-\uD7A3一-鿿0-9'-]+$/.test(p),
        }));
      }

      // Merge hyphenated compounds: "well" + "-" + "known" → "well-known"
      const mergedSegs: Array<{ segment: string; isWordLike: boolean }> = [];
      let wi = 0;
      while (wi < wordSegs.length) {
        if (
          wi + 2 < wordSegs.length &&
          wordSegs[wi].isWordLike &&
          !wordSegs[wi + 1].isWordLike && wordSegs[wi + 1].segment === "-" &&
          wordSegs[wi + 2].isWordLike
        ) {
          mergedSegs.push({ segment: wordSegs[wi].segment + "-" + wordSegs[wi + 2].segment, isWordLike: true });
          wi += 3;
        } else {
          mergedSegs.push(wordSegs[wi]);
          wi++;
        }
      }

      // Elision handling: split "l'homme" → ["l'", "homme"] for French
      // Matches straight apostrophe (U+0027) and right single quotation mark (U+2019)
      const ELISION_RE = /['\u2019]/;
      const elisionSegs: Array<{ segment: string; isWordLike: boolean }> = [];
      for (const seg of mergedSegs) {
        if (seg.isWordLike) {
          const apIdx = seg.segment.search(ELISION_RE);
          if (apIdx > 0 && apIdx < seg.segment.length - 1) {
            // pre-apostrophe clitic → plain text (not tracked)
            elisionSegs.push({ segment: seg.segment.slice(0, apIdx + 1), isWordLike: false });
            // post-apostrophe part → word to track
            elisionSegs.push({ segment: seg.segment.slice(apIdx + 1), isWordLike: true });
            continue;
          }
        }
        elisionSegs.push(seg);
      }

      const clickSentence = isTitle ? text : sentText;

      const wordEls = elisionSegs.map((seg, wordIdx) => {
        if (!seg.isWordLike) return <span key={wordIdx}>{seg.segment}</span>;
        const token = seg.segment;
        const { style, shouldHighlight } = getDisplayStyle(token, context);
        if (shouldHighlight && !isTitle && isFirstCall) {
          navigableWordsRef.current.push({ word: token, sentence: clickSentence });
        }
        return (
          <span key={wordIdx} className="inline">
            <span
              data-word={token}
              className={`word-hover transition-colors rounded cursor-pointer ${isTitle ? "px-[1px]" : "px-0.5"} ${
                shouldHighlight
                  ? "hover:opacity-90"
                  : "hover:bg-gray-100 dark:hover:bg-dark-hover"
              }`}
              style={{
                ...style,
                lineHeight: "inherit",
                verticalAlign: "baseline",
              }}
              onMouseDown={(e) => {
                // Prevent browser text selection highlight on shift+click
                if (e.shiftKey) e.preventDefault();
              }}
              onClick={(e) => {
                const cleaned = token.replace(/[.,!?;:()]/g, "").trim();
                if (e.shiftKey && e.altKey) {
                  e.preventDefault();
                  if (cleaned) handleAddToStopwords(cleaned);
                  return;
                }
                if (e.altKey) {
                  e.preventDefault();
                  if (cleaned) handleToggleKnown(cleaned);
                  return;
                }
                if (e.shiftKey) {
                  e.preventDefault();
                  if (cleaned) handleToggleVague(cleaned);
                  return;
                }
                if (e.ctrlKey || e.metaKey) {
                  e.preventDefault();
                  if (cleaned) handleDoubleClickWord(cleaned, clickSentence);
                  return;
                }
                handleWordClick(token, clickSentence, e.clientX, e.clientY);
              }}
            >
              {token}
            </span>
          </span>
        );
      });

      return <span key={sentIdx} className="inline">{wordEls}</span>;
    });
  };

  // Lift manual-text pagination out of JSX so useMemo can depend on stable values
  const manualParagraphs = useMemo(() => manualText.split(/\n\n+/), [manualText]);
  const isManualLarge = manualText.length > 50000;
  const visibleManualParas = isManualLarge ? manualParagraphs.slice(0, visibleParaCount) : manualParagraphs;
  const visibleText = visibleManualParas.join("\n\n");

  /**
   * Memoized renders — prevent re-tokenizing the article on every render triggered by
   * unrelated state changes (tooltip visibility, sidebar width, translation in-progress, etc.).
   * Re-runs only when article content, word sets, or rendering settings change.
   */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const renderedArticleTitle = useMemo(() =>
    article?.title ? renderHighlighted(article.title, article.title, true) : null,
    [article?.title, sourceLang, knownWordsSet, vagueWordsSet, highlightedWords,
     wordCounts, autoHighlightEnabled, highlightFilter, selectedWord, settings, isDarkMode]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const renderedArticleBody = useMemo(() =>
    article?.content ? renderHighlighted(article.content, article.content, false, true) : null,
    [article?.content, sourceLang, knownWordsSet, vagueWordsSet, highlightedWords,
     wordCounts, autoHighlightEnabled, highlightFilter, selectedWord, settings, isDarkMode]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const renderedManualBody = useMemo(() =>
    manualText ? renderHighlighted(visibleText, visibleText, false, true) : null,
    [visibleText, sourceLang, knownWordsSet, vagueWordsSet, highlightedWords,
     wordCounts, autoHighlightEnabled, highlightFilter, selectedWord, settings, isDarkMode,
     isFallbackMode, manualLang]);

  return (
    <div className="min-h-screen bg-white dark:bg-dark-bg transition-colors duration-200 relative">
      {isResizing && <div className="fixed inset-0 z-50 cursor-col-resize select-none" />}

      {/* Top bar */}
      <div className="sticky top-0 z-40 bg-white/90 dark:bg-dark-surface/90 border-b border-gray-200 dark:border-dark-hover backdrop-blur-md shadow-sm">
        <div className="w-full px-6 py-4 flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-black dark:text-white hover:text-green-600 transition-colors font-medium"
          >
            <ChevronLeft size={20} /> Back to Feeds
          </button>
          <div className="flex items-center gap-4">
            <button
              onClick={toggleBookmark}
              className={`p-3 rounded-full transition-all ${isBookmarked ? "bg-green-600 text-white" : "bg-gray-100 text-black dark:bg-dark-hover dark:text-white hover:bg-gray-200"}`}
              title={isBookmarked ? "Remove bookmark" : "Bookmark this article"}
            >
              <BookmarkIcon size={18} />
            </button>
            <label className="hidden sm:flex items-center gap-2 text-sm font-semibold text-black dark:text-white" title="Text size">
              <span className="text-xs">A</span>
              <input
                type="range"
                min={14}
                max={32}
                value={fontSize}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  setFontSize(v);
                  localStorage.setItem("reader.fontSize", String(v));
                }}
                className="w-20 accent-green-600"
              />
              <span className="text-base">A</span>
            </label>
            {learnedTodayCount !== undefined && learnedTodayCount !== null && learnedTodayCount > 0 && (
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-300 dark:border-emerald-700 rounded-lg text-xs font-bold text-emerald-700 dark:text-emerald-300">
                <ThumbsUp size={13} /> {learnedTodayCount} learned today
              </div>
            )}
            <button
              onClick={handleFinishReading}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold shadow-lg shadow-green-600/20 transition-all active:scale-95"
            >
              <CheckSquare size={18} /> Finish Reading
            </button>
          </div>
        </div>
      </div>

      <div
        ref={wrapperRef}
        className="w-full py-0 lg:flex lg:gap-0 lg:h-[calc(100vh-80px)] lg:overflow-hidden"
      >
        {/* Article content area */}
        <div className="lg:flex-1 lg:h-full overflow-y-auto px-8 lg:px-16 pt-8 pb-24 relative" ref={contentAreaRef} onMouseUp={handleReaderMouseUp}>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 text-black dark:text-white">
              <RefreshCw className="animate-spin mb-4 text-green-500" size={48} />
              <p className="text-lg font-medium animate-pulse">Deep cleaning the article text...</p>
            </div>
          ) : isFallbackMode ? (
            <div className="animate-fade-in max-w-3xl mx-auto">
              <div className="mb-10 p-8 bg-gray-50 dark:bg-dark-surface border border-gray-200 dark:border-dark-hover rounded-2xl shadow-xl">
                <h2 className="text-3xl font-black mb-4 tracking-tight text-black dark:text-white">
                  {articleTitle || "Manual Reading Mode"}
                </h2>

                {articleUrl && (
                  <div className="mb-8 bg-blue-50 dark:bg-blue-900/20 p-6 rounded-xl border-l-4 border-blue-500">
                    <p className="text-blue-700 dark:text-blue-300 font-bold mb-4">
                      Article text is not available for this source.
                    </p>
                    <a
                      href={articleUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-all shadow-md shadow-blue-600/20"
                    >
                      <ExternalLink size={18} /> Open Original Article
                    </a>
                    <p className="mt-4 text-black dark:text-white text-sm leading-relaxed">
                      1. Copy the text from the original site.<br />
                      2. Paste it in the box below to start learning.
                    </p>
                  </div>
                )}

                <textarea
                  value={manualText}
                  onChange={(e) => { setManualText(e.target.value); debouncedLsSet("reader.manualText", e.target.value); }}
                  placeholder="Paste the text here to analyze..."
                  className="w-full h-72 p-6 bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-hover rounded-xl focus:ring-2 focus:ring-green-500 outline-none text-xl leading-relaxed font-serif shadow-inner resize-none"
                />
                {manualText.trim() && (
                  <button
                    onClick={handleSaveManualText}
                    className="mt-3 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold text-sm transition-all shadow-md shadow-green-600/20"
                  >
                    Save Text to My Texts
                  </button>
                )}
                {saveStatus && (
                  <p className="mt-2 text-sm text-green-600 dark:text-green-400 font-semibold">{saveStatus}</p>
                )}
              </div>

              {manualText && (() => {
                return (
                  <div className="mt-12">
                    <h3 className="text-xs uppercase tracking-widest font-black text-black dark:text-white mb-6 flex items-center gap-2">
                      <Book size={16} /> Interactive Reader Enabled
                      {isManualLarge && (
                        <span className="ml-2 text-xs font-normal text-gray-400">
                          (showing {visibleManualParas.length}/{manualParagraphs.length} paragraphs)
                        </span>
                      )}
                    </h3>
                    <div
                      className="font-serif antialiased pb-24"
                      style={{ fontSize: `${fontSize}px`, whiteSpace: "pre-wrap", wordBreak: "break-word", ...LANG_TEXT_STYLE[sourceLang] }}
                    >
                      {renderedManualBody}
                    </div>
                    {isManualLarge && visibleParaCount < manualParagraphs.length && (
                      <button
                        onClick={() => setVisibleParaCount((n) => n + 100)}
                        className="mt-6 px-6 py-2.5 bg-gray-100 dark:bg-dark-hover hover:bg-gray-200 dark:hover:bg-dark-surface text-black dark:text-white rounded-xl text-sm font-bold transition-all"
                      >
                        Load more paragraphs ({Math.min(100, manualParagraphs.length - visibleParaCount)} remaining)
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : article ? (
            <article className="animate-fade-in max-w-3xl mx-auto">
              {servedFromCache && (
                <div className="mb-6 px-4 py-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-xl flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300 font-semibold">
                  ⚠ Offline — showing cached version
                </div>
              )}
              <div className="mb-12 border-b border-gray-100 dark:border-dark-hover pb-10">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between text-[10px] font-black tracking-[0.2em] text-green-600 dark:text-green-400 mb-6">
                  <span className="uppercase text-black dark:text-white">{article.siteName}</span>
                  <span className="bg-gray-100 dark:bg-dark-hover px-3 py-1 rounded-full text-black dark:text-white">
                    {article.wordCount || article.content.split(/\s+/).length} WORDS
                  </span>
                  {elapsedSeconds > 0 && (
                    <span className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-full text-xs font-bold">
                      ⏱ {Math.floor(elapsedSeconds / 60)}:{String(elapsedSeconds % 60).padStart(2, "0")}
                    </span>
                  )}
                  {articleDifficulty && (
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                      articleDifficulty === "Beginner" ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300" :
                      articleDifficulty === "Intermediate" ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300" :
                      "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                    }`}>
                      {articleDifficulty.toUpperCase()}
                    </span>
                  )}
                </div>
                <h2 className="text-4xl md:text-5xl font-serif font-black leading-tight mb-8 text-black dark:text-white">
                  {renderedArticleTitle}
                </h2>
                <div className="flex items-center gap-4 flex-wrap">
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 py-2 px-4 bg-gray-100 dark:bg-dark-hover hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 text-black dark:text-white rounded-full transition-all text-sm font-bold"
                  >
                    <ExternalLink size={16} /> {article.url?.includes("wikipedia.org") ? "View on Wikipedia" : "View Original Site"}
                  </a>
                  {article.url?.includes("wikipedia.org") && (
                    <span className="text-xs text-gray-400 dark:text-dark-muted">
                      Source: Wikipedia · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer" className="underline hover:text-green-600">CC BY-SA 4.0</a>
                    </span>
                  )}
                </div>
              </div>
              <div
                className="font-serif antialiased pb-24"
                style={{ fontSize: `${fontSize}px`, whiteSpace: "pre-wrap", wordBreak: "break-word", ...LANG_TEXT_STYLE[sourceLang] }}
              >
                {renderedArticleBody}
              </div>
            </article>
          ) : null}
        </div>

        {/* Resize handle */}
        <div
          className="hidden lg:block w-1.5 cursor-col-resize bg-gray-100 hover:bg-gray-300 dark:bg-dark-surface dark:hover:bg-dark-muted transition-colors active:bg-green-500"
          onMouseDown={() => setIsResizing(true)}
        />

        {/* Right sidebar */}
        <aside
          ref={sidebarRef}
          className="hidden lg:block lg:h-full overflow-y-auto border-l border-gray-200 dark:border-dark-hover bg-white dark:bg-dark-surface p-6 shadow-lg shadow-black/5"
          style={{ width: sidebarWidth }}
        >
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-black text-black dark:text-white">Settings</h2>
              <p className="text-sm text-black dark:text-white/80 mt-2">
                Configure translation targets.
              </p>
            </div>

            <div className="space-y-4">
              {/* Highlight filter */}
              <div>
                <p className="text-xs uppercase tracking-widest text-black dark:text-white/70 mb-1.5 font-semibold">Show Highlights</p>
                <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-dark-hover text-xs font-bold">
                  {(["all", "new", "saved"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => { setHighlightFilter(f); localStorage.setItem("reader.highlightFilter", f); }}
                      className={`flex-1 py-1.5 transition-colors capitalize ${
                        highlightFilter === f
                          ? "bg-green-600 text-white"
                          : "bg-white dark:bg-dark-bg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-hover"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {/* Auto-Highlight toggle */}
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm font-semibold text-black dark:text-white">Auto-Highlight</span>
                <input
                  type="checkbox"
                  checked={autoHighlightEnabled}
                  onChange={(e) => setAutoHighlightEnabled(e.target.checked)}
                  className="w-4 h-4 accent-green-600 rounded"
                />
              </label>

              {/* Auto-Translate toggle */}
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm font-semibold text-black dark:text-white">Auto-Translate</span>
                <input
                  type="checkbox"
                  checked={settings?.autoTranslate ?? false}
                  onChange={async (e) => {
                    if (!settings) return;
                    const updated = { ...settings, autoTranslate: e.target.checked };
                    await db.appSettings.put(updated);
                    setSettings(updated);
                  }}
                  className="w-4 h-4 accent-green-600 rounded"
                />
              </label>

              {/* Theme toggle */}
              <button
                onClick={toggleTheme}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-gray-100 dark:bg-dark-hover hover:bg-gray-200 dark:hover:bg-dark-surface transition-all group"
              >
                <span className="text-sm font-semibold text-gray-700 dark:text-white">
                  {isDarkMode ? "Light Mode" : "Dark Mode"}
                </span>
                <div className="p-1.5 bg-white dark:bg-dark-surface rounded-lg shadow-sm group-hover:scale-110 transition-transform">
                  {isDarkMode ? (
                    <Sun size={16} className="text-yellow-400" />
                  ) : (
                    <Moon size={16} className="text-blue-600" />
                  )}
                </div>
              </button>

              {/* Manual mode: Title, URL, Source Language */}
              {isFallbackMode && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-black dark:text-white/70 uppercase tracking-widest mb-1">Title</label>
                    <input
                      value={manualTitle}
                      onChange={(e) => { setManualTitle(e.target.value); debouncedLsSet("reader.manualTitle", e.target.value); }}
                      placeholder="Title (optional)"
                      className="w-full p-2.5 bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-hover rounded-xl focus:ring-2 focus:ring-green-500 outline-none text-sm font-semibold text-black dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-black dark:text-white/70 uppercase tracking-widest mb-1">Source URL</label>
                    <input
                      value={manualUrl}
                      onChange={(e) => { setManualUrl(e.target.value); debouncedLsSet("reader.manualUrl", e.target.value); }}
                      onBlur={(e) => {
                        const detected = detectLangFromUrl(e.target.value);
                        if (detected && !manualLang) {
                          setManualLang(detected);
                          localStorage.setItem("reader.manualLang", detected);
                        }
                      }}
                      placeholder="URL (optional)"
                      className="w-full p-2.5 bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-hover rounded-xl focus:ring-2 focus:ring-green-500 outline-none text-xs text-black dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="flex items-center justify-between text-sm font-semibold text-black dark:text-white mb-2">
                      Source Language
                      {langAutoDetected && (
                        <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded animate-pulse">
                          auto-detected
                        </span>
                      )}
                    </label>
                    <select
                      value={manualLang}
                      onChange={(e) => {
                        setManualLang(e.target.value);
                        localStorage.setItem("reader.manualLang", e.target.value);
                      }}
                      className="w-full p-2.5 bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-hover rounded-xl focus:ring-2 focus:ring-green-500 outline-none text-black dark:text-white text-sm"
                    >
                      <option value="">— Select Language —</option>
                      {Object.entries(LANGUAGES).map(([code, name]) => (
                        <option key={code} value={code}>{name}</option>
                      ))}
                    </select>
                  </div>

                  {favoriteSites && favoriteSites.length > 0 && (
                    <div className="p-3 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-hover rounded-xl space-y-2">
                      <label className="block text-xs font-semibold text-black dark:text-white uppercase tracking-widest">
                        Quick Access Sites
                      </label>
                      <select
                        value={selectedFavoriteSite}
                        onChange={(e) => {
                          const url = e.target.value;
                          setSelectedFavoriteSite(url);
                          localStorage.setItem("reader.selectedFavoriteSite", url);
                          if (url && !manualLang) {
                            const detected = detectLangFromUrl(url);
                            if (detected) {
                              setManualLang(detected);
                              localStorage.setItem("reader.manualLang", detected);
                            }
                          }
                        }}
                        className="w-full p-2 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-hover rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-black dark:text-white text-xs"
                      >
                        <option value="">— None —</option>
                        {favoriteSites.map((site) => (
                          <option key={site.id} value={site.url}>
                            [{site.lang.toUpperCase()}] {site.title}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={handleOpenFavoriteSite}
                        disabled={!selectedFavoriteSite}
                        className="w-full flex items-center justify-center gap-2 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 dark:disabled:bg-dark-hover text-white disabled:text-gray-400 rounded-lg transition-all text-xs font-bold"
                      >
                        <OpenSiteIcon size={13} /> Open this site
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Active translation targets (configured in left sidebar Settings) */}
              <div>
                <p className="text-xs uppercase tracking-widest text-black dark:text-white/70 mb-1.5 font-semibold">Translating to</p>
                {getTranslationTargets().length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {getTranslationTargets().map((t) => (
                      <span key={t} className="px-2.5 py-1 bg-blue-600/10 text-blue-600 dark:text-blue-300 border border-blue-600/20 rounded-full text-xs font-bold">
                        {LANGUAGES[t as keyof typeof LANGUAGES] || t}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 dark:text-dark-muted italic">
                    None — configure in Settings (left sidebar)
                  </p>
                )}
              </div>
            </div>

            {/* Color legend + shortcuts */}
            <div className="p-3 bg-gray-50 dark:bg-dark-bg rounded-xl text-xs space-y-1.5">
              <p className="font-bold text-gray-700 dark:text-gray-300 mb-1">Word Colors</p>
              <div className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded" style={{background:"rgba(245,158,11,0.4)"}}></span><span className="text-gray-500">New word</span></div>
              <div className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded" style={{background:"rgba(16,185,129,0.45)"}}></span><span className="text-gray-500">Seen before (fades)</span></div>
              <div className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded border-dashed border border-indigo-400" style={{background:"rgba(99,102,241,0.28)"}}></span><span className="text-gray-500">Saved flashcard</span></div>
              <div className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded border-dashed border border-orange-400" style={{background:"rgba(251,146,60,0.35)"}}></span><span className="text-gray-500">Vaguely known</span></div>
              <hr className="border-gray-200 dark:border-dark-hover my-1.5" />
              <p className="font-bold text-gray-700 dark:text-gray-300 mb-1">Shortcuts</p>
              <div className="space-y-0.5 text-gray-500">
                <div><kbd className="bg-gray-200 dark:bg-dark-hover px-1 rounded text-[10px]">click</kbd> View / translate</div>
                <div><kbd className="bg-gray-200 dark:bg-dark-hover px-1 rounded text-[10px]">Alt+click</kbd> Toggle known</div>
                <div><kbd className="bg-gray-200 dark:bg-dark-hover px-1 rounded text-[10px]">Shift+click</kbd> Toggle vague</div>
                <div><kbd className="bg-gray-200 dark:bg-dark-hover px-1 rounded text-[10px]">Ctrl+click</kbd> Save flashcard</div>
                <div><kbd className="bg-gray-200 dark:bg-dark-hover px-1 rounded text-[10px]">Shift+Alt+click</kbd> Exclude word</div>
                <div><kbd className="bg-gray-200 dark:bg-dark-hover px-1 rounded text-[10px]">← →</kbd> Navigate words</div>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-black text-black dark:text-white">Translation</h2>
              <p className="text-sm text-black dark:text-white/80 mt-2">
                Click a word to look up. Ctrl+click to save directly.
              </p>
            </div>

            {selectedWord ? (
              <div className="space-y-4">
                {/* Selected word */}
                <div className="rounded-3xl border border-gray-100 dark:border-dark-hover bg-gray-50 dark:bg-dark-bg p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-black dark:text-white/70 mb-2">Selected Word</p>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-2xl font-black text-black dark:text-white">{selectedWord}</p>
                    <button
                      onClick={() => speakText(selectedWord, sourceLang, settings?.ttsVoices?.[sourceLang])}
                      title="Pronounce"
                      className="p-2 rounded-xl bg-gray-200 dark:bg-dark-hover hover:bg-gray-300 dark:hover:bg-dark-surface text-gray-600 dark:text-gray-300 transition-all flex-shrink-0"
                    >
                      🔊
                    </button>
                  </div>
                </div>

                {/* Context sentence */}
                {selectedSentence && (
                  <div className="rounded-3xl border border-gray-100 dark:border-dark-hover bg-white dark:bg-dark-surface p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs uppercase tracking-[0.2em] text-black dark:text-white/70">Context</p>
                      <button
                        onClick={() => speakText(selectedSentence, sourceLang, settings?.ttsVoices?.[sourceLang])}
                        title="Pronounce sentence"
                        className="p-1.5 rounded-lg bg-gray-100 dark:bg-dark-hover hover:bg-gray-200 dark:hover:bg-dark-surface text-gray-500 dark:text-gray-400 transition-all flex-shrink-0 text-sm"
                      >
                        🔊
                      </button>
                    </div>
                    <div className="text-sm leading-relaxed text-black dark:text-white">
                      <HighlightInSentence text={selectedSentence} word={selectedWord || ""} color="#10b981" />
                    </div>
                  </div>
                )}

                {/* POS / dictionary section */}
                {wordPosLoading && (
                  <div className="rounded-3xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50 dark:bg-indigo-900/20 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300 mb-2 animate-pulse">Looking up…</p>
                  </div>
                )}
                {!wordPosLoading && wordPosData && wordPosData.length > 0 && (
                  <div className="rounded-3xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50 dark:bg-indigo-900/20 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300 mb-3">Dictionary</p>
                    <div className="space-y-2">
                      {wordPosData.map((m, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm">
                          {m.pos && (
                            <span className="flex-shrink-0 px-1.5 py-0.5 bg-indigo-600 text-white rounded text-xs font-bold uppercase tracking-wide">
                              {m.pos}
                            </span>
                          )}
                          <span className="text-black dark:text-white">{m.translations}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Translation result */}
                {translationError && (
                  <p className="text-sm text-red-600 dark:text-red-300">{translationError}</p>
                )}

                {!settings?.autoTranslate && (
                  <button
                    onClick={handleTranslateOnly}
                    disabled={translating || !isTranslationEnabled()}
                    className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-600/30"
                  >
                    {translating ? "Translating…" : "See Translation"}
                  </button>
                )}

                {translating && settings?.autoTranslate && (
                  <p className="text-xs text-center text-gray-400 animate-pulse">Translating…</p>
                )}

                {translatedText && (
                  <div ref={translationSectionRef} className="rounded-3xl border border-gray-100 dark:border-dark-hover bg-green-50 dark:bg-green-900/20 p-4">
                    <p className="text-sm font-semibold text-black dark:text-white mb-1">Translation</p>
                    <pre className="whitespace-pre-wrap text-black dark:text-white text-sm">{translatedText}</pre>
                  </div>
                )}

                {/* Action row */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleSaveToFlashcard}
                    disabled={translating}
                    title="Save to flashcards"
                    className="flex-1 flex items-center justify-center gap-1 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all"
                  >
                    <Book size={12} /> Save
                  </button>
                  {lastSavedCardId && saveStatus?.startsWith("Saved") && (
                    <button
                      onClick={handleUndoFlashcard}
                      title="Undo save"
                      className="px-3 py-2 bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded-lg text-xs font-bold transition-all"
                    >
                      Undo
                    </button>
                  )}
                </div>

                {saveStatus && (
                  <div className="text-center text-green-600 dark:text-green-300 font-bold text-sm">{saveStatus}</div>
                )}

                {selectedWord && !translating && (
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => handleToggleVague(selectedWord)}
                      title="Mark as vaguely known (passive vocabulary)"
                      className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        vagueWordsSet?.has(selectedWord.toLowerCase())
                          ? "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-300 hover:bg-orange-200"
                          : "bg-gray-100 dark:bg-dark-hover hover:bg-orange-50 text-gray-600 dark:text-gray-300"
                      }`}
                    >
                      〜 {vagueWordsSet?.has(selectedWord.toLowerCase()) ? "Unmark Vague" : "Mark Vague"}
                    </button>
                    <button
                      onClick={handleMarkAsKnown}
                      title="Mark as a word you already know — removes highlight"
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-gray-100 dark:bg-dark-hover hover:bg-gray-200 dark:hover:bg-dark-surface text-gray-600 dark:text-gray-300 rounded-lg text-xs font-bold transition-all"
                    >
                      <ThumbsUp size={12} /> Mark Known
                    </button>
                    <button
                      onClick={() => handleAddToStopwords()}
                      title="Exclude this word from highlighting and tracking"
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-gray-100 dark:bg-dark-hover hover:bg-gray-200 dark:hover:bg-dark-surface text-gray-600 dark:text-gray-300 rounded-lg text-xs font-bold transition-all"
                    >
                      <EyeOff size={12} /> Exclude
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-3xl border border-gray-100 dark:border-dark-hover bg-gray-50 dark:bg-dark-bg p-6 text-black dark:text-white/80">
                Select a word to see translation.
              </div>
            )}
          </div>
        </aside>
      </div>

      <QuickTooltip
        ref={quickTooltipRef}
        visible={quickTooltipVisible}
        pos={quickTooltipPos}
        loading={quickTooltipLoading}
        error={quickTooltipError}
        data={quickTooltipData}
        hasFlashcard={quickTooltipData ? (highlightedWords?.has(quickTooltipData.original) ?? false) : false}
        isKnown={quickTooltipData ? (knownWordsSet?.has(quickTooltipData.original.toLowerCase()) ?? false) : false}
        onToggleKnown={() => {
          if (quickTooltipData?.original) handleToggleKnown(quickTooltipData.original);
        }}
        onViewFlashcard={() => {
          setQuickTooltipVisible(false);
          if (quickTooltipData?.original) onNavigateToFlashcard?.(quickTooltipData.original);
        }}
      />
    </div>
  );
}
