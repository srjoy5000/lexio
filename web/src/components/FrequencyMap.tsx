import { useEffect, useState, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, WordCount, ReadingHistory } from "../db";
import { CheckCircle } from "lucide-react";
import { getHeatmapColor, isStopword, STOPWORDS } from "../lib/nlp";
import { LANGUAGE_NAMES } from "../lib/constants";
import {
  DownloadCloud,
  Grid,
  List,
  TrendingUp,
  Calendar,
  ChevronLeft,
  Trash2,
  EyeOff,
  Check,
  X,
  AlertTriangle,
  BookOpen,
} from "lucide-react";

type SortBy = "alphabetical" | "frequency" | "date";
type FilterMode = "all" | "saved" | "known" | "vague" | "unfamiliar";

interface FrequencyMapProps {
  onBack: () => void;
}

interface FlashcardModal {
  word: string;
  lang: string;
  langWord: string;
}

function ExcludedWordsPanel({ lang }: { lang: string }) {
  const [excludedWords, setExcludedWords] = useState<string[]>([]);
  const [exceptions, setExceptions] = useState<string[]>([]);
  const [showStopwords, setShowStopwords] = useState(false);

  useEffect(() => {
    db.appSettings.toArray().then((rows) => {
      setExcludedWords(rows[0]?.excludedWords || []);
      setExceptions(rows[0]?.stopwordExceptions || []);
    }).catch((err) => console.error("[FrequencyMap] load excluded words:", err));
  }, []);

  const removeCustomWord = async (word: string) => {
    const rows = await db.appSettings.toArray();
    if (!rows[0]) return;
    const updated = { ...rows[0], excludedWords: rows[0].excludedWords.filter((w) => w !== word) };
    await db.appSettings.put(updated);
    setExcludedWords(updated.excludedWords);
  };

  const removeStopword = async (word: string) => {
    const rows = await db.appSettings.toArray();
    if (!rows[0]) return;
    const updated = { ...rows[0], stopwordExceptions: [...new Set([...(rows[0].stopwordExceptions || []), word])] };
    await db.appSettings.put(updated);
    setExceptions(updated.stopwordExceptions!);
  };

  const restoreStopword = async (word: string) => {
    const rows = await db.appSettings.toArray();
    if (!rows[0]) return;
    const updated = { ...rows[0], stopwordExceptions: (rows[0].stopwordExceptions || []).filter((w) => w !== word) };
    await db.appSettings.put(updated);
    setExceptions(updated.stopwordExceptions!);
  };

  const builtinStopwords = lang !== "all" ? Array.from(STOPWORDS[lang] || []).sort() : [];

  return (
    <div className="space-y-8">
      {/* Custom excluded words */}
      <div>
        <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">Custom Excluded Words</h3>
        <p className="text-xs text-gray-500 dark:text-dark-muted mb-4">Added via Shift+Alt+click in the Reader.</p>
        {excludedWords.length === 0 ? (
          <p className="text-gray-400 dark:text-dark-muted text-sm italic">No custom excluded words yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {excludedWords.map((word) => (
              <span key={word} className="flex items-center gap-1 px-3 py-1 bg-gray-100 dark:bg-dark-hover text-gray-700 dark:text-dark-text rounded-full text-sm font-medium">
                {word}
                <button onClick={() => removeCustomWord(word)} className="ml-1 text-gray-400 hover:text-red-500 transition-colors" title={`Remove "${word}" from excluded`}>×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Built-in stopwords */}
      {lang !== "all" && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">
              Built-in Stopwords ({LANGUAGE_NAMES[lang as keyof typeof LANGUAGE_NAMES] || lang})
            </h3>
            <button
              onClick={() => setShowStopwords((v) => !v)}
              className="text-xs px-3 py-1 bg-gray-100 dark:bg-dark-hover hover:bg-gray-200 dark:hover:bg-dark-surface rounded-full font-semibold text-gray-600 dark:text-gray-400 transition-colors"
            >
              {showStopwords ? "Hide" : "Show"} ({builtinStopwords.length})
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-dark-muted mb-4">
            These functional words are automatically excluded. Click × to start tracking a word.
          </p>
          {exceptions.length > 0 && (
            <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
              <p className="text-xs font-bold text-green-700 dark:text-green-300 mb-2">Now tracking ({exceptions.length}):</p>
              <div className="flex flex-wrap gap-1.5">
                {exceptions.map((word) => (
                  <span key={word} className="flex items-center gap-1 px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-xs font-medium">
                    {word}
                    <button onClick={() => restoreStopword(word)} className="ml-1 text-green-500 hover:text-red-500 transition-colors" title="Re-exclude">×</button>
                  </span>
                ))}
              </div>
            </div>
          )}
          {showStopwords && (
            <div className="flex flex-wrap gap-1.5 max-h-64 overflow-y-auto p-2 bg-gray-50 dark:bg-dark-bg rounded-xl border border-gray-200 dark:border-dark-hover">
              {builtinStopwords.map((word) => {
                const isException = exceptions.includes(word);
                return (
                  <span key={word} className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${isException ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 line-through opacity-50" : "bg-gray-200 dark:bg-dark-hover text-gray-600 dark:text-gray-400"}`}>
                    {word}
                    {!isException && (
                      <button onClick={() => removeStopword(word)} className="ml-0.5 text-gray-400 hover:text-green-600 transition-colors" title={`Start tracking "${word}"`}>+</button>
                    )}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}
      {lang === "all" && (
        <p className="text-xs text-gray-400 dark:text-dark-muted italic">Select a specific language above to view and edit built-in stopwords.</p>
      )}
    </div>
  );
}

export default function FrequencyMap({ onBack }: FrequencyMapProps) {
  const [wordCounts, setWordCounts] = useState<WordCount[]>([]);
  const [sortBy, setSortBy] = useState<SortBy>(
    () =>
      (localStorage.getItem("frequencyMap.sortBy") as SortBy) || "frequency",
  );
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    return (
      (localStorage.getItem("frequencyMap.viewMode") as "grid" | "list") ||
      "grid"
    );
  });
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>(() => {
    const saved = localStorage.getItem("frequencyMap.filterMode") as FilterMode | null;
    if (saved && ["all", "saved", "known", "vague", "unfamiliar"].includes(saved)) return saved;
    // Migrate from old boolean keys
    if (localStorage.getItem("frequencyMap.showOnlySaved") === "true") return "saved";
    if (localStorage.getItem("frequencyMap.showOnlyKnown") === "true") return "known";
    if (localStorage.getItem("frequencyMap.showOnlyVague") === "true") return "vague";
    if (localStorage.getItem("frequencyMap.showOnlyUnfamiliar") === "true") return "unfamiliar";
    return "all";
  });
  const [selectedLang, setSelectedLang] = useState<string>(
    () => localStorage.getItem("frequencyMap.selectedLang") || "all",
  );
  const [selectedWords, setSelectedWords] = useState<Set<string>>(new Set());
  const [flashcardModal, setFlashcardModal] = useState<FlashcardModal | null>(null);
  const [mainTab, setMainTab] = useState<"words" | "history" | "excluded">(
    () =>
      (localStorage.getItem("frequencyMap.mainTab") as
        | "words"
        | "history"
        | "excluded") || "words",
  );

  const readingHistory = useLiveQuery<ReadingHistory[]>(
    () => db.readingHistory.orderBy("readAt").reverse().limit(120).toArray(),
    [],
  );

  const knownWordsSet = useLiveQuery<Set<string>>(
    () =>
      db.knownWords
        .filter((k) => k.confidence !== "vague")
        .toArray()
        .then((kw) => new Set(kw.map((k) => k.word.toLowerCase()))),
    [],
  );
  const [fcTranslation, setFcTranslation] = useState("");
  const [fcSaveStatus, setFcSaveStatus] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(
    () => (localStorage.getItem("frequencyMap.sortDir") as "asc" | "desc") || "desc",
  );
  const [languageOrder, setLanguageOrder] = useState<string[]>([]);

  useEffect(() => {
    cleanupStopwords()
      .then(() => loadData())
      .catch((err) => console.error("[FrequencyMap] cleanupStopwords:", err));
    db.appSettings.toArray().then((rows) => {
      if (rows[0]?.languageOrder) setLanguageOrder(rows[0].languageOrder);
    }).catch((err) => console.error("[FrequencyMap] load language order:", err));
  }, []);

  useEffect(() => {
    loadData();
  }, [filterMode, selectedLang]);

  // Debounce the search input so filtering doesn't run on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const cleanupStopwords = async () => {
    const allCounts = await db.wordCounts.toArray();
    const flashcards = await db.flashcards.toArray();
    const savedWords = new Set(flashcards.map((c) => c.word.toLowerCase()));
    const toDelete = allCounts
      .filter(
        (wc) =>
          isStopword(wc.word, wc.lang) &&
          !savedWords.has(wc.word.toLowerCase()),
      )
      .map((wc) => wc.langWord);
    if (toDelete.length > 0) {
      await db.wordCounts.bulkDelete(toDelete);
    }
  };

  const loadData = async () => {
    const counts = await db.wordCounts.toArray();
    const flashcards = await db.flashcards.toArray();
    const savedWords = new Set(flashcards.map((c) => c.word.toLowerCase()));

    const knownWordsList = await db.knownWords.toArray();
    const knownSet = new Set(
      knownWordsList
        .filter((k) => k.confidence !== "vague")
        .map((k) => k.word.toLowerCase()),
    );
    const vagueSet = new Set(
      knownWordsList
        .filter((k) => k.confidence === "vague")
        .map((k) => k.word.toLowerCase()),
    );

    let filteredCounts: typeof counts;
    switch (filterMode) {
      case "saved":      filteredCounts = counts.filter((c) => savedWords.has(c.word.toLowerCase())); break;
      case "known":      filteredCounts = counts.filter((c) => knownSet.has(c.word.toLowerCase())); break;
      case "vague":      filteredCounts = counts.filter((c) => vagueSet.has(c.word.toLowerCase())); break;
      case "unfamiliar": filteredCounts = counts.filter((c) => !knownSet.has(c.word.toLowerCase()) && !vagueSet.has(c.word.toLowerCase()) && !savedWords.has(c.word.toLowerCase())); break;
      default:           filteredCounts = counts;
    }
    if (selectedLang !== "all") {
      filteredCounts = filteredCounts.filter((c) => c.lang === selectedLang);
    }
    setWordCounts(filteredCounts);
  };

  const filteredWords = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const filtered = q
      ? wordCounts.filter((w) => w.word.toLowerCase().includes(q))
      : [...wordCounts];
    filtered.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "alphabetical": cmp = a.word.localeCompare(b.word); break;
        case "frequency": cmp = b.count - a.count; break;
        case "date": cmp = b.lastEncountered - a.lastEncountered; break;
      }
      return sortDir === "asc" ? -cmp : cmp;
    });
    return filtered;
  }, [wordCounts, searchQuery, sortBy, sortDir]);

  const [colorMin, colorMax] = useMemo(() => {
    if (wordCounts.length === 0) return [0, 1];
    const counts = wordCounts.map((w) => w.count);
    return [Math.min(...counts), Math.max(...counts)];
  }, [wordCounts]);

  const getColorIntensity = (count: number) => {
    if (wordCounts.length === 0) return "hsl(120, 70%, 50%)";
    return getHeatmapColor(count, colorMin, colorMax);
  };

  const changeSelectedLang = (lang: string) => {
    setSelectedLang(lang);
    localStorage.setItem("frequencyMap.selectedLang", lang);
  };
  const changeSortBy = (sort: SortBy) => {
    setSortBy(sort);
    localStorage.setItem("frequencyMap.sortBy", sort);
  };
  const setViewModeAndPersist = (mode: "grid" | "list") => {
    setViewMode(mode);
    localStorage.setItem("frequencyMap.viewMode", mode);
  };

  const toggleSelectWord = (langWord: string) => {
    setSelectedWords((prev) => {
      const next = new Set(prev);
      if (next.has(langWord)) next.delete(langWord);
      else next.add(langWord);
      return next;
    });
  };

  const clearSelection = () => setSelectedWords(new Set());

  const handleDeleteSelected = async () => {
    if (!selectedWords.size) return;
    for (const langWord of selectedWords) {
      await db.wordCounts.delete(langWord);
    }
    clearSelection();
    await loadData();
  };

  const handleUntrackSelected = async () => {
    if (!selectedWords.size) return;
    const toExclude = filteredWords
      .filter((w) => selectedWords.has(w.langWord))
      .map((w) => w.word.toLowerCase());

    const appSettings = await db.appSettings.toArray();
    if (appSettings.length > 0) {
      const current = appSettings[0];
      const updated = {
        ...current,
        excludedWords: [
          ...new Set([...(current.excludedWords || []), ...toExclude]),
        ],
      };
      await db.appSettings.put(updated);
    }

    for (const langWord of selectedWords) {
      await db.wordCounts.delete(langWord);
    }
    clearSelection();
    await loadData();
  };

  const handleDeleteAll = async () => {
    const langLabel =
      selectedLang === "all"
        ? "ALL languages"
        : (LANGUAGE_NAMES as Record<string, string>)[selectedLang] ||
          selectedLang;
    if (
      !window.confirm(
        `Delete ALL frequency data for ${langLabel}?\n\nThis cannot be undone.`,
      )
    )
      return;
    if (selectedLang === "all") {
      await db.wordCounts.clear();
    } else {
      await db.wordCounts.where("lang").equals(selectedLang).delete();
    }
    clearSelection();
    await loadData();
  };

  const handleDeleteAllExceptSaved = async () => {
    const langLabel =
      selectedLang === "all"
        ? "ALL languages"
        : (LANGUAGE_NAMES as Record<string, string>)[selectedLang] ||
          selectedLang;
    if (
      !window.confirm(
        `Delete all non-flashcard words for ${langLabel}?\n\nWords saved as flashcards will be kept. This cannot be undone.`,
      )
    )
      return;
    const flashcards = await db.flashcards.toArray();
    const savedWords = new Set(flashcards.map((c) => c.word.toLowerCase()));
    const pool =
      selectedLang === "all"
        ? wordCounts
        : wordCounts.filter((w) => w.lang === selectedLang);
    const toDelete = pool
      .filter((w) => !savedWords.has(w.word.toLowerCase()))
      .map((w) => w.langWord);
    if (toDelete.length > 0) {
      await db.wordCounts.bulkDelete(toDelete);
    }
    clearSelection();
    await loadData();
  };

  const handleToggleKnown = async (wc: WordCount) => {
    const word = wc.word.toLowerCase();
    const existing = await db.knownWords
      .where("word")
      .equals(word)
      .and((k) => k.lang === wc.lang)
      .first();
    if (existing) {
      await db.knownWords.delete(existing.id!);
    } else {
      await db.knownWords.add({ lang: wc.lang, word, addedAt: Date.now() });
    }
  };

  const openFlashcardModal = (wc: WordCount) => {
    setFlashcardModal({ word: wc.word, lang: wc.lang, langWord: wc.langWord });
    setFcTranslation("");
    setFcSaveStatus(null);
  };

  const saveFlashcard = async () => {
    if (!flashcardModal) return;
    const { word, lang } = flashcardModal;

    const existing = await db.flashcards.where("word").equals(word).first();
    const context = {
      sentence: "",
      translation: fcTranslation.trim(),
      sourceTitle: "Frequency Map",
      sourceUrl: "",
      genre: "",
    };

    if (existing) {
      const isDuplicate = existing.contexts.some(
        (c) => c.translation === context.translation,
      );
      if (!isDuplicate) {
        existing.contexts.push(context);
        await db.flashcards.put(existing);
      }
    } else {
      await db.flashcards.add({
        lang,
        word,
        contexts: [context],
        addedAt: Date.now(),
      });
    }

    setFcSaveStatus("Saved to Flashcards!");
    setTimeout(() => {
      setFlashcardModal(null);
      setFcSaveStatus(null);
    }, 1200);
  };

  const handleExportAnki = () => {
    const tsvLines = ["Word\tFrequency\tSentence\tTranslation\tSource\tGenre"];

    db.flashcards.toArray().then((cards) => {
      cards.forEach((card) => {
        const wordCount = wordCounts.find(
          (w) => w.word === card.word && w.lang === card.lang,
        );
        const freq = wordCount?.count || 0;

        card.contexts.forEach((context) => {
          tsvLines.push(
            `${card.word}\t${freq}\t${context.sentence}\t${context.translation}\t${context.sourceTitle}\t${context.genre}`,
          );
        });
      });

      const tsv = tsvLines.join("\n");
      const blob = new Blob([tsv], { type: "text/tab-separated-values" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `anki-export-${new Date().toISOString().slice(0, 10)}.tsv`;
      link.click();
      URL.revokeObjectURL(url);
    });
  };

  const selectionCount = selectedWords.size;

  return (
    <div className="w-full h-full overflow-x-hidden bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text transition-colors duration-200">
      {/* Flashcard Modal */}
      {flashcardModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-gray-900 dark:text-white">
                Add to Flashcards
              </h3>
              <button
                onClick={() => setFlashcardModal(null)}
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-hover text-gray-500"
              >
                <X size={18} />
              </button>
            </div>
            <div className="text-3xl font-black text-center py-4 text-gray-900 dark:text-white">
              {flashcardModal.word}
            </div>
            <textarea
              value={fcTranslation}
              onChange={(e) => setFcTranslation(e.target.value)}
              placeholder="Enter translation / notes..."
              rows={3}
              className="w-full p-3 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-hover rounded-xl text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-green-500 resize-none"
              autoFocus
            />
            {fcSaveStatus && (
              <p className="text-sm text-green-600 dark:text-green-400 font-bold text-center">
                {fcSaveStatus}
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={saveFlashcard}
                className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-black transition-all"
              >
                Save
              </button>
              <button
                onClick={() => setFlashcardModal(null)}
                className="px-4 py-3 bg-gray-200 dark:bg-dark-hover hover:bg-gray-300 text-gray-700 dark:text-white rounded-xl font-bold transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="sticky top-0 z-40 bg-white dark:bg-dark-surface border-b border-gray-200 dark:border-dark-hover">
        <div className="w-full px-6 md:px-8 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-gray-600 dark:text-dark-muted hover:text-green-600 dark:hover:text-green-400 transition-colors"
            >
              <ChevronLeft size={20} />
              Back
            </button>
            <h1 className="text-2xl font-bold flex items-center gap-2 text-gray-900 dark:text-white">
              <TrendingUp size={24} /> Statistics
            </h1>

            {/* Main tabs */}
            <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-dark-hover text-sm font-bold">
              <button
                onClick={() => {
                  setMainTab("words");
                  localStorage.setItem("frequencyMap.mainTab", "words");
                }}
                className={`flex items-center gap-1.5 px-4 py-2 transition-colors ${mainTab === "words" ? "bg-green-600 text-white" : "bg-white dark:bg-dark-bg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-hover"}`}
              >
                <TrendingUp size={14} /> Words
              </button>
              <button
                onClick={() => {
                  setMainTab("history");
                  localStorage.setItem("frequencyMap.mainTab", "history");
                }}
                className={`flex items-center gap-1.5 px-4 py-2 transition-colors ${mainTab === "history" ? "bg-green-600 text-white" : "bg-white dark:bg-dark-bg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-hover"}`}
              >
                <Calendar size={14} /> History
              </button>
              <button
                onClick={() => {
                  setMainTab("excluded");
                  localStorage.setItem("frequencyMap.mainTab", "excluded");
                }}
                className={`flex items-center gap-1.5 px-4 py-2 transition-colors ${mainTab === "excluded" ? "bg-green-600 text-white" : "bg-white dark:bg-dark-bg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-hover"}`}
              >
                <EyeOff size={14} /> Excluded
              </button>
            </div>

            <button
              onClick={handleExportAnki}
              className="flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
            >
              <DownloadCloud size={18} />
              Export Anki
            </button>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap md:flex-row gap-4 items-start">
            <input
              type="text"
              placeholder="Search words..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="flex-1 px-4 py-2 bg-gray-100 dark:bg-dark-hover border border-gray-200 dark:border-dark-muted rounded focus:outline-none focus:border-green-400 text-gray-900 dark:text-white self-center"
            />

            {/* Sort + Language stacked vertically */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-gray-500 dark:text-dark-muted w-16">
                  Sort
                </label>
                <select
                  value={sortBy}
                  onChange={(e) => changeSortBy(e.target.value as SortBy)}
                  className="px-3 py-2 bg-gray-100 dark:bg-dark-hover border border-gray-200 dark:border-dark-muted rounded focus:outline-none focus:border-green-400 text-gray-900 dark:text-white"
                >
                  <option value="frequency">Frequency</option>
                  <option value="alphabetical">Alphabetical</option>
                  <option value="date">Date Added</option>
                </select>
                <button
                  onClick={() => {
                    const next = sortDir === "desc" ? "asc" : "desc";
                    setSortDir(next);
                    localStorage.setItem("frequencyMap.sortDir", next);
                  }}
                  className="px-2 py-2 bg-gray-100 dark:bg-dark-hover border border-gray-200 dark:border-dark-muted rounded hover:bg-gray-200 dark:hover:bg-dark-surface text-gray-700 dark:text-white font-bold text-sm transition-colors"
                  title={sortDir === "desc" ? "Descending — click for ascending" : "Ascending — click for descending"}
                >
                  {sortDir === "desc" ? "↓" : "↑"}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-gray-500 dark:text-dark-muted w-16">
                  Language
                </label>
                <select
                  value={selectedLang}
                  onChange={(e) => changeSelectedLang(e.target.value)}
                  className="px-3 py-2 bg-gray-100 dark:bg-dark-hover border border-gray-200 dark:border-dark-muted rounded focus:outline-none focus:border-green-400 text-gray-900 dark:text-white"
                >
                  <option value="all">All Languages</option>
                  {(languageOrder.length > 0
                    ? languageOrder.filter((c) => c in LANGUAGE_NAMES)
                    : Object.keys(LANGUAGE_NAMES)
                  ).map((code) => (
                    <option key={code} value={code}>
                      {(LANGUAGE_NAMES as Record<string, string>)[code]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              {(
                [
                  { mode: "saved" as FilterMode,      label: "Show only saved (flashcard)", accentClass: "accent-green-600",  accentStyle: undefined as React.CSSProperties | undefined },
                  { mode: "known" as FilterMode,      label: "Show only known",              accentClass: "accent-indigo-500", accentStyle: undefined },
                  { mode: "vague" as FilterMode,      label: "Show only vague",              accentClass: "",                  accentStyle: { accentColor: "#fb923c" } as React.CSSProperties },
                  { mode: "unfamiliar" as FilterMode, label: "Show only unfamiliar",         accentClass: "accent-amber-500",  accentStyle: undefined },
                ]
              ).map(({ mode, label, accentClass, accentStyle }) => (
                <label key={mode} className="flex items-center gap-2 text-sm text-gray-600 dark:text-dark-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filterMode === mode}
                    onChange={(e) => {
                      const next: FilterMode = e.target.checked ? mode : "all";
                      setFilterMode(next);
                      localStorage.setItem("frequencyMap.filterMode", next);
                    }}
                    className={`w-4 h-4 rounded ${accentClass}`}
                    style={accentStyle}
                  />
                  {label}
                </label>
              ))}
            </div>

            <div className="flex items-center gap-2 bg-gray-100 dark:bg-dark-hover rounded p-1">
              <button
                onClick={() => setViewModeAndPersist("grid")}
                className={`p-2 rounded transition-colors ${
                  viewMode === "grid"
                    ? "bg-green-600 text-white"
                    : "text-gray-600 dark:text-dark-muted hover:bg-gray-200 dark:hover:bg-dark-surface"
                }`}
              >
                <Grid size={18} />
              </button>
              <button
                onClick={() => setViewModeAndPersist("list")}
                className={`p-2 rounded transition-colors ${
                  viewMode === "list"
                    ? "bg-green-600 text-white"
                    : "text-gray-600 dark:text-dark-muted hover:bg-gray-200 dark:hover:bg-dark-surface"
                }`}
              >
                <List size={18} />
              </button>
            </div>
          </div>

          {/* Stats + bulk actions */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-gray-600 dark:text-dark-muted">
              <p>
                Total Unique Words: {wordCounts.length} | Total Encounters:{" "}
                {wordCounts.reduce((sum, w) => sum + w.count, 0)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDeleteAllExceptSaved}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-100 hover:bg-orange-200 dark:bg-orange-900/30 dark:hover:bg-orange-900/50 text-orange-700 dark:text-orange-300 border border-orange-300 dark:border-orange-700 rounded-lg text-xs font-bold transition-all"
                title="Delete all words not saved as flashcards"
              >
                <AlertTriangle size={13} /> Delete Non-Saved
              </button>
              <button
                onClick={handleDeleteAll}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700 rounded-lg text-xs font-bold transition-all"
                title="Delete all frequency data"
              >
                <Trash2 size={13} /> Delete All
              </button>
            </div>
          </div>
        </div>

        {/* Selection Action Bar */}
        {selectionCount > 0 && (
          <div className="px-6 md:px-8 py-3 bg-green-50 dark:bg-green-900/20 border-t border-green-200 dark:border-green-800 flex items-center gap-4">
            <span className="text-sm font-bold text-green-700 dark:text-green-300">
              {selectionCount} word{selectionCount > 1 ? "s" : ""} selected
            </span>
            <button
              onClick={handleDeleteSelected}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold transition-all"
            >
              <Trash2 size={14} /> Delete
            </button>
            <button
              onClick={handleUntrackSelected}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-bold transition-all"
            >
              <EyeOff size={14} /> Untrack
            </button>
            <button
              onClick={clearSelection}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-200 dark:bg-dark-hover hover:bg-gray-300 text-gray-700 dark:text-white rounded-lg text-sm font-bold transition-all"
            >
              <X size={14} /> Clear
            </button>
            <span className="text-xs text-gray-500 dark:text-dark-muted ml-auto">
              Ctrl+click to add flashcard · Alt+click to toggle known
            </span>
          </div>
        )}
      </div>

      {/* ── History Tab ── */}
      {mainTab === "history" && (
        <div className="w-full px-6 md:px-8 py-8 max-w-3xl space-y-8">
          {/* Calendar heatmap — last 28 days */}
          {(() => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const days: { date: Date; count: number }[] = [];
            for (let i = 27; i >= 0; i--) {
              const d = new Date(today);
              d.setDate(d.getDate() - i);
              days.push({ date: d, count: 0 });
            }
            (readingHistory || []).forEach((h) => {
              const d = new Date(h.readAt);
              d.setHours(0, 0, 0, 0);
              const idx = days.findIndex(
                (day) => day.date.getTime() === d.getTime(),
              );
              if (idx !== -1) days[idx].count++;
            });
            const maxCount = Math.max(1, ...days.map((d) => d.count));
            const weeks: (typeof days)[] = [];
            for (let i = 0; i < days.length; i += 7)
              weeks.push(days.slice(i, i + 7));
            return (
              <div>
                <h2 className="text-xs uppercase tracking-widest font-bold text-gray-500 dark:text-dark-muted mb-4 flex items-center gap-2">
                  <Calendar size={13} /> Last 28 Days
                </h2>
                <div className="flex gap-1.5">
                  {weeks.map((week, wi) => (
                    <div key={wi} className="flex flex-col gap-1.5">
                      {week.map((day, di) => {
                        const intensity =
                          day.count === 0
                            ? 0
                            : Math.max(0.2, day.count / maxCount);
                        const isToday = day.date.getTime() === today.getTime();
                        return (
                          <div
                            key={di}
                            title={`${day.date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}: ${day.count} session${day.count !== 1 ? "s" : ""}`}
                            className={`w-8 h-8 rounded-lg transition-all ${isToday ? "ring-2 ring-green-500" : ""}`}
                            style={{
                              background:
                                day.count === 0
                                  ? undefined
                                  : `rgba(16,185,129,${intensity})`,
                              backgroundColor:
                                day.count === 0
                                  ? "rgb(243 244 246)"
                                  : undefined,
                            }}
                          />
                        );
                      })}
                    </div>
                  ))}
                  <div className="flex flex-col justify-between ml-2">
                    {weeks[0]?.map((_day, di) => (
                      <span
                        key={di}
                        className="text-[10px] text-gray-400 dark:text-dark-muted h-8 flex items-center"
                      >
                        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][di]}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <span className="text-[10px] text-gray-400">Less</span>
                  {[0, 0.2, 0.5, 0.8, 1.0].map((op) => (
                    <div
                      key={op}
                      className="w-4 h-4 rounded"
                      style={{
                        background:
                          op === 0
                            ? "rgb(243 244 246)"
                            : `rgba(16,185,129,${op})`,
                      }}
                    />
                  ))}
                  <span className="text-[10px] text-gray-400">More</span>
                </div>
              </div>
            );
          })()}

          {/* Session list */}
          <div>
            <h2 className="text-xs uppercase tracking-widest font-bold text-gray-500 dark:text-dark-muted mb-4 flex items-center gap-2">
              <BookOpen size={13} /> Reading Sessions
            </h2>
            {!readingHistory || readingHistory.length === 0 ? (
              <p className="text-gray-400 dark:text-dark-muted text-sm">
                No reading sessions yet. Finish reading an article to record it.
              </p>
            ) : (
              <div className="space-y-2">
                {readingHistory.map((h) => (
                  <div
                    key={h.id}
                    className="flex items-center gap-4 p-4 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-hover rounded-xl"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-white truncate">
                        {h.title || "Untitled"}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-[10px] bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 px-2 py-0.5 rounded-full font-black uppercase tracking-widest">
                          {LANGUAGE_NAMES[
                            h.lang as keyof typeof LANGUAGE_NAMES
                          ] || h.lang}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-dark-muted">
                          {new Date(h.readAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-dark-muted">
                          {new Date(h.readAt).toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className="text-lg font-black text-green-600 dark:text-green-400">
                        {h.newWordsCount}
                      </p>
                      <p className="text-[10px] text-gray-400 uppercase tracking-widest">
                        words
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Excluded Tab ── */}
      {mainTab === "excluded" && (
        <div className="w-full px-6 md:px-8 py-8 max-w-3xl">
          <h2 className="text-lg font-black text-gray-900 dark:text-white mb-2">
            Excluded Words
          </h2>
          <p className="text-sm text-gray-500 dark:text-dark-muted mb-6">
            Words hidden from highlighting and tracking. Select a language above to view built-in stopwords.
          </p>
          <ExcludedWordsPanel lang={selectedLang} />
        </div>
      )}

      {/* ── Words Tab Content ── */}
      {mainTab === "words" && (
        <div className="w-full px-6 md:px-8 py-8">
          {filteredWords.length === 0 ? (
            <p className="text-center text-gray-600 dark:text-dark-muted py-12">
              No words yet. Start reading and saving words!
            </p>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {filteredWords.map((wordCount) => {
                const isSelected = selectedWords.has(wordCount.langWord);
                const color = getColorIntensity(wordCount.count);
                const isKnown =
                  knownWordsSet?.has(wordCount.word.toLowerCase()) ?? false;
                return (
                  <div
                    key={wordCount.langWord}
                    className={`relative rounded-2xl cursor-pointer hover:scale-[1.04] active:scale-95 transition-all duration-150 select-none overflow-hidden group ${
                      isSelected
                        ? "ring-2 ring-green-400 shadow-lg shadow-green-400/30"
                        : "shadow-sm hover:shadow-md"
                    }`}
                    style={{
                      background: `linear-gradient(135deg, ${color}ee, ${color}99)`,
                    }}
                    title={`${wordCount.word}: ×${wordCount.count} — click to select, Ctrl+click to add flashcard, Alt+click to toggle known`}
                    onClick={(e) => {
                      if (e.altKey) {
                        e.preventDefault();
                        handleToggleKnown(wordCount);
                        return;
                      }
                      if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        openFlashcardModal(wordCount);
                        return;
                      }
                      toggleSelectWord(wordCount.langWord);
                    }}
                  >
                    {/* Top accent line */}
                    <div
                      className="h-1 w-full"
                      style={{ background: color, filter: "brightness(1.3)" }}
                    />

                    <div className="p-3 flex flex-col items-center justify-center text-center min-h-[90px] gap-1">
                      {isSelected && (
                        <div className="absolute top-2 right-2">
                          <Check size={13} className="text-white drop-shadow" />
                        </div>
                      )}
                      {/* Known toggle button — visible on hover */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleKnown(wordCount);
                        }}
                        title={isKnown ? "Unmark as known" : "Mark as known"}
                        className={`absolute top-1.5 left-1.5 transition-opacity rounded-full p-0.5 ${
                          isKnown
                            ? "bg-emerald-500/90 text-white"
                            : "bg-white/80 text-gray-500 hover:bg-emerald-500/90 hover:text-white"
                        }`}
                      >
                        {<CheckCircle size={13} />}
                      </button>
                      <span className="text-[8px] font-black uppercase tracking-widest opacity-60 leading-none">
                        {wordCount.lang}
                      </span>
                      <span
                        className="text-sm font-black break-all leading-tight text-gray-900 dark:text-white group-hover:text-black dark:group-hover:text-white"
                        style={{ wordBreak: "break-word" }}
                      >
                        {wordCount.word}
                      </span>
                      <span className="text-xs font-bold opacity-70 bg-white/40 rounded-full px-2 py-0.5 leading-none">
                        ×{wordCount.count}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2 max-w-4xl">
              {filteredWords.map((wordCount) => {
                const isSelected = selectedWords.has(wordCount.langWord);
                const isKnown =
                  knownWordsSet?.has(wordCount.word.toLowerCase()) ?? false;
                return (
                  <div
                    key={wordCount.langWord}
                    className={`flex items-center justify-between p-4 bg-white dark:bg-dark-surface border-2 rounded-lg shadow-sm cursor-pointer select-none transition-colors group ${
                      isSelected
                        ? "border-green-500 bg-green-50 dark:bg-green-900/10"
                        : "border-gray-200 dark:border-dark-hover hover:bg-gray-50 dark:hover:bg-dark-hover"
                    }`}
                    onClick={(e) => {
                      if (e.altKey) {
                        e.preventDefault();
                        handleToggleKnown(wordCount);
                        return;
                      }
                      if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        openFlashcardModal(wordCount);
                        return;
                      }
                      toggleSelectWord(wordCount.langWord);
                    }}
                    title="Click to select, Ctrl+click to add flashcard, Alt+click to toggle known"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div
                        className="w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors"
                        style={{
                          borderColor: isSelected ? "#16a34a" : "#d1d5db",
                          backgroundColor: isSelected
                            ? "#16a34a"
                            : "transparent",
                        }}
                      >
                        {isSelected && (
                          <Check size={10} className="text-white" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-gray-900 dark:text-white">
                            {wordCount.word}
                          </h3>
                          <span className="text-[10px] bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 px-2 py-0.5 rounded-full font-black uppercase tracking-widest">
                            {wordCount.lang}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          <Calendar size={12} className="inline mr-1" />
                          {new Date(
                            wordCount.lastEncountered,
                          ).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleKnown(wordCount);
                        }}
                        title={isKnown ? "Unmark as known" : "Mark as known"}
                        className={`transition-opacity p-1 rounded-full ${
                          isKnown
                            ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                            : "bg-gray-100 dark:bg-dark-hover text-gray-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 hover:text-emerald-600"
                        }`}
                      >
                        {<CheckCircle size={15} />}
                      </button>
                      <div
                        className="px-3 py-1 rounded text-center font-bold"
                        style={{
                          backgroundColor: getColorIntensity(wordCount.count),
                          color: wordCount.count > 5 ? "white" : "#000",
                        }}
                      >
                        ×{wordCount.count}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {selectionCount === 0 && filteredWords.length > 0 && (
            <p className="text-center text-xs text-gray-400 dark:text-dark-muted mt-8">
              Click to select · Ctrl+click to add flashcard · Alt+click to
              toggle known · Hover for buttons
            </p>
          )}
        </div>
      )}
    </div>
  );
}
