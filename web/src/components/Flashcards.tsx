import { useEffect, useState, useRef, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, Flashcard } from "../db";
import {
  ChevronLeft, Trash2, BookOpen, ChevronRight, Shuffle, Pencil,
  CheckSquare, Square, Volume2,
} from "lucide-react";
import { LANGUAGE_NAMES } from "../lib/constants";
import { speakText } from "../lib/nlp";

type SortBy = "alphabetical" | "date" | "frequency" | "difficulty";
type SRSRating = "again" | "hard" | "good" | "easy";

const SRS_MIN_EASE = 1.3;
const SRS_MAX_EASE = 3.0;

/** SM-2 simplified: returns updated SRS fields after a rating. */
function computeSRS(
  card: Flashcard,
  rating: SRSRating,
): Pick<Flashcard, "difficulty" | "lastReviewed" | "nextReview" | "interval" | "easeFactor"> {
  const ef = card.easeFactor ?? 2.5;
  const interval = card.interval ?? 1;
  let newInterval: number;
  let newEf: number;
  switch (rating) {
    case "again": newInterval = 1;                              newEf = Math.max(SRS_MIN_EASE, ef - 0.2);  break;
    case "hard":  newInterval = Math.max(1, Math.round(interval * 1.2)); newEf = Math.max(SRS_MIN_EASE, ef - 0.15); break;
    case "good":  newInterval = Math.max(1, Math.round(interval * ef)); newEf = ef;                         break;
    case "easy":  newInterval = Math.max(1, Math.round(interval * ef * 1.3)); newEf = Math.min(SRS_MAX_EASE, ef + 0.15); break;
  }
  const now = Date.now();
  return {
    difficulty: rating,
    lastReviewed: now,
    nextReview: now + newInterval * 24 * 60 * 60 * 1000,
    interval: newInterval,
    easeFactor: newEf,
  };
}

interface EditingField {
  cardId: number;
  field: "word" | "sentence" | "translation";
  contextIdx: number;
  value: string;
}

interface FlashcardsProps {
  onBack: () => void;
  focusWord?: string | null;
  onFocused?: () => void;
}

const RATING_META: Record<SRSRating, { label: string; btnColor: string; badgeBg: string; badgeText: string }> = {
  again: { label: "Again", btnColor: "bg-red-500 hover:bg-red-600 shadow-red-500/20",    badgeBg: "bg-red-100 dark:bg-red-900/30",    badgeText: "text-red-600 dark:text-red-300" },
  hard:  { label: "Hard",  btnColor: "bg-orange-500 hover:bg-orange-600 shadow-orange-500/20", badgeBg: "bg-orange-100 dark:bg-orange-900/30", badgeText: "text-orange-600 dark:text-orange-300" },
  good:  { label: "Good",  btnColor: "bg-blue-500 hover:bg-blue-600 shadow-blue-500/20",  badgeBg: "bg-blue-100 dark:bg-blue-900/30",  badgeText: "text-blue-600 dark:text-blue-300" },
  easy:  { label: "Easy",  btnColor: "bg-green-500 hover:bg-green-600 shadow-green-500/20", badgeBg: "bg-green-100 dark:bg-green-900/30", badgeText: "text-green-600 dark:text-green-300" },
};

const CJK_RE = /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7A3]/;

/** Highlights `word` inside `text` safely in React. Works for CJK and Latin. */
const HighlightMatch = ({ text, word }: { text: string; word: string }) => {
  if (!word.trim() || !text) return <>{text}</>;
  const isCJK = CJK_RE.test(word);
  if (isCJK) {
    const idx = text.toLowerCase().indexOf(word.toLowerCase());
    if (idx === -1) return <>{text}</>;
    return (
      <>
        <span>{text.slice(0, idx)}</span>
        <mark style={{ background: "#10b981", color: "inherit", fontWeight: 700, borderRadius: "2px" }}>{text.slice(idx, idx + word.length)}</mark>
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
          <mark key={i} style={{ background: "#10b981", color: "inherit", fontWeight: 700, borderRadius: "2px" }}>
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
};

/** POS badges row from posData array. */
const PosBadges = ({ posData }: { posData: Array<{ pos: string; translations: string }> | undefined }) => {
  if (!posData || posData.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {posData.slice(0, 3).map((m, i) => (
        <div key={i} className="flex items-start gap-2 text-sm">
          {m.pos && (
            <span className="flex-shrink-0 px-1.5 py-0.5 bg-indigo-600 text-white rounded text-xs font-bold uppercase tracking-wide">
              {m.pos}
            </span>
          )}
          <span className="text-gray-800 dark:text-gray-200">{m.translations}</span>
        </div>
      ))}
    </div>
  );
};

/** Scale font size based on word length so it fits within the card. */
function autoFontSize(word: string, large = false): string {
  const maxPx = large ? 56 : 32;
  const minPx = large ? 16 : 10;
  const px = Math.max(minPx, Math.min(maxPx, maxPx * 8 / Math.max(word.length, 8)));
  return `${Math.round(px)}px`;
}

export default function Flashcards({ onBack, focusWord, onFocused }: FlashcardsProps) {
  const cardsQuery = useLiveQuery(() => db.flashcards.toArray(), []);
  const cards: Flashcard[] = cardsQuery ?? [];
  const [flipped, setFlipped] = useState<Record<number, boolean>>({});
  const [selectedLang, setSelectedLang] = useState<string>(() =>
    localStorage.getItem("flashcards.selectedLang") || "all",
  );
  const [sortBy, setSortBy] = useState<SortBy>(() =>
    (localStorage.getItem("flashcards.sortBy") as SortBy) || "date",
  );
  const [wordCountsMap, setWordCountsMap] = useState<Record<string, number>>({});
  const [quizMode, setQuizMode] = useState(false);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizFlipped, setQuizFlipped] = useState(false);
  const [quizComplete, setQuizComplete] = useState(false);
  const [ratingCounts, setRatingCounts] = useState<Record<SRSRating, number>>({ again: 0, hard: 0, good: 0, easy: 0 });
  const [editingField, setEditingField] = useState<EditingField | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedCards, setSelectedCards] = useState<Set<number>>(new Set());
  const [quizFilter, setQuizFilter] = useState<"all" | "due">("all");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(() =>
    (localStorage.getItem("flashcards.sortOrder") as "asc" | "desc") || "desc"
  );
  const [groupBySource, setGroupBySource] = useState<boolean>(() =>
    localStorage.getItem("flashcards.groupBySource") === "true"
  );
  const [languageOrder, setLanguageOrder] = useState<string[]>([]);

  const gridRef = useRef<HTMLDivElement>(null);
  const quizCardCountRef = useRef(0);

  useEffect(() => {
    db.wordCounts.toArray().then((counts) => {
      const map: Record<string, number> = {};
      counts.forEach((c) => { map[`${c.lang}|${c.word}`] = c.count; });
      setWordCountsMap(map);
    });
    db.appSettings.toArray().then((rows) => {
      if (rows[0]?.languageOrder) setLanguageOrder(rows[0].languageOrder);
    });
  }, []);

  useEffect(() => {
    if (!focusWord || !gridRef.current) return;
    setQuizMode(false);
    const timer = setTimeout(() => {
      const el = gridRef.current?.querySelector(`[data-word="${focusWord}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        (el as HTMLElement).classList.add("ring-4", "ring-amber-400");
        setTimeout(() => (el as HTMLElement).classList.remove("ring-4", "ring-amber-400"), 2000);
      }
      onFocused?.();
    }, 300);
    return () => clearTimeout(timer);
  }, [focusWord]);

  const changeSelectedLang = (lang: string) => { setSelectedLang(lang); localStorage.setItem("flashcards.selectedLang", lang); };
  const changeSortBy = (sort: SortBy) => { setSortBy(sort); localStorage.setItem("flashcards.sortBy", sort); };

  const toggleFlip = (id?: number) => {
    if (id === undefined) return;
    setFlipped((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleDelete = async (id?: number) => {
    if (!id) return;
    if (window.confirm("Delete this flashcard?")) {
      await db.flashcards.delete(id);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedCards.size === 0) return;
    if (!window.confirm(`Delete ${selectedCards.size} flashcard(s)?`)) return;
    await db.flashcards.bulkDelete(Array.from(selectedCards));
    setSelectedCards(new Set());
    setSelectMode(false);
  };

  const toggleCardSelection = (id: number) => {
    setSelectedCards((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const startEdit = (cardId: number, field: "word" | "sentence" | "translation", value: string, contextIdx = 0) => {
    setEditingField({ cardId, field, contextIdx, value });
  };

  const saveEdit = async () => {
    if (!editingField) return;
    const { cardId, field, contextIdx, value } = editingField;
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;
    const updated: Flashcard = field === "word"
      ? { ...card, word: value.trim() || card.word }
      : { ...card, contexts: card.contexts.map((ctx, i) => i === contextIdx ? { ...ctx, [field]: value } : ctx) };
    await db.flashcards.put(updated);
    setEditingField(null);
  };

  const DIFF_ORDER: Record<string, number> = { again: 0, hard: 1, good: 2, easy: 3 };

  const now = Date.now();
  const filteredCards = useMemo(
    () => cards.filter((card) => selectedLang === "all" || card.lang === selectedLang),
    [cards, selectedLang]
  );
  const dueCards = useMemo(
    () => filteredCards.filter((c) => !c.nextReview || c.nextReview <= now),
    [filteredCards]
  );
  const dueCount = dueCards.length;

  const sortedCards = useMemo(() => {
    const base = quizMode && quizFilter === "due" ? dueCards : filteredCards;
    const dir = sortOrder === "asc" ? 1 : -1;
    return [...base].sort((a, b) => {
      if (sortBy === "alphabetical") return dir * a.word.localeCompare(b.word);
      if (sortBy === "frequency") return dir * ((wordCountsMap[`${a.lang}|${a.word}`] || 0) - (wordCountsMap[`${b.lang}|${b.word}`] || 0));
      if (sortBy === "difficulty") return dir * ((DIFF_ORDER[a.difficulty ?? ""] ?? 4) - (DIFF_ORDER[b.difficulty ?? ""] ?? 4));
      return dir * (a.addedAt - b.addedAt);
    });
  }, [filteredCards, dueCards, sortBy, sortOrder, wordCountsMap, quizMode, quizFilter]);

  const groupedCards = useMemo(() => {
    if (!groupBySource) return null;
    const groups = new Map<string, Flashcard[]>();
    for (const card of sortedCards) {
      const source = card.contexts[0]?.sourceTitle || "Unknown";
      if (!groups.has(source)) groups.set(source, []);
      groups.get(source)!.push(card);
    }
    return groups;
  }, [sortedCards, groupBySource]);

  quizCardCountRef.current = sortedCards.length;
  const currentQuizCard = sortedCards[quizIndex] ?? null;

  const quizProgressKey = `flashcards.savedQuizIndex.${selectedLang}.${quizFilter}`;

  const handleSRSRate = async (rating: SRSRating) => {
    if (!currentQuizCard?.id) return;
    const srs = computeSRS(currentQuizCard, rating);
    const updated: Flashcard = { ...currentQuizCard, ...srs };
    await db.flashcards.put(updated);
    setRatingCounts((prev) => ({ ...prev, [rating]: prev[rating] + 1 }));
    if (quizIndex >= quizCardCountRef.current - 1) {
      setQuizComplete(true);
      localStorage.removeItem(quizProgressKey);
    } else {
      const next = quizIndex + 1;
      localStorage.setItem(quizProgressKey, String(next));
      setTimeout(() => { setQuizIndex(next); setQuizFlipped(false); }, 200);
    }
  };

  const advanceQuiz = () => {
    if (quizIndex >= quizCardCountRef.current - 1) { setQuizComplete(true); return; }
    setQuizIndex((p) => Math.min(p + 1, quizCardCountRef.current - 1));
    setQuizFlipped(false);
  };

  const restartQuiz = (fromSaved = false) => {
    const savedIdx = parseInt(localStorage.getItem(quizProgressKey) || "0", 10);
    const idx = fromSaved && savedIdx > 0 ? savedIdx : 0;
    if (!fromSaved) localStorage.removeItem(quizProgressKey);
    setQuizIndex(idx); setQuizFlipped(false);
    setQuizComplete(false); setRatingCounts({ again: 0, hard: 0, good: 0, easy: 0 });
  };

  const exitQuiz = () => {
    setQuizMode(false); setQuizComplete(false);
    setRatingCounts({ again: 0, hard: 0, good: 0, easy: 0 });
  };

  // Quiz keyboard shortcuts
  useEffect(() => {
    if (!quizMode) return;
    const handleKey = (e: KeyboardEvent) => {
      if (editingField) return;
      if (quizComplete) { if (e.key === "Enter") { e.preventDefault(); restartQuiz(); } return; }
      if (e.key === " ") { e.preventDefault(); setQuizFlipped((p) => !p); }
      else if (e.key === "Enter") { e.preventDefault(); quizFlipped ? advanceQuiz() : setQuizFlipped(true); }
      else if (e.key === "ArrowRight") { e.preventDefault(); setQuizIndex((p) => Math.min(p + 1, quizCardCountRef.current - 1)); setQuizFlipped(false); }
      else if (e.key === "ArrowLeft")  { e.preventDefault(); setQuizIndex((p) => Math.max(p - 1, 0)); setQuizFlipped(false); }
      else if (quizFlipped) {
        const map: Record<string, SRSRating> = { "1": "again", "2": "hard", "3": "good", "4": "easy" };
        if (map[e.key]) handleSRSRate(map[e.key]);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [quizMode, quizFlipped, quizIndex, editingField, quizComplete]);

  // ── Inline editable fields ──────────────────────────────────────────

  const renderWord = (card: Flashcard, large = false) => {
    if (editingField && editingField.cardId === card.id && editingField.field === "word") {
      return (
        <input
          value={editingField.value}
          onChange={(e) => setEditingField((p) => p ? { ...p, value: e.target.value } : null)}
          onBlur={saveEdit}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveEdit(); } if (e.key === "Escape") setEditingField(null); }}
          autoFocus
          className="w-full text-center font-black bg-gray-50 dark:bg-dark-bg border-2 border-green-500 rounded-xl px-3 py-2 outline-none text-gray-900 dark:text-white"
          style={{ fontSize: autoFontSize(editingField.value, large) }}
          onClick={(e) => e.stopPropagation()}
        />
      );
    }
    return (
      <div
        onDoubleClick={(e) => { e.stopPropagation(); startEdit(card.id!, "word", card.word); }}
        className="group/word relative text-center cursor-text select-none"
      >
        <span className="font-black text-gray-900 dark:text-white leading-none break-all"
          style={{ fontSize: autoFontSize(card.word, large) }}>
          {card.word}
        </span>
        <Pencil size={10} className="absolute top-0 right-0 text-gray-300 opacity-0 group-hover/word:opacity-100 transition-opacity" />
      </div>
    );
  };

  const renderSentence = (card: Flashcard) => {
    if (editingField && editingField.cardId === card.id && editingField.field === "sentence") {
      return (
        <textarea
          value={editingField.value}
          onChange={(e) => setEditingField((p) => p ? { ...p, value: e.target.value } : null)}
          onBlur={saveEdit}
          onKeyDown={(e) => { if (e.key === "Escape") setEditingField(null); }}
          autoFocus rows={3}
          className="w-full bg-gray-50 dark:bg-dark-bg border-2 border-green-500 rounded-lg p-3 text-sm outline-none resize-none"
          onClick={(e) => e.stopPropagation()}
        />
      );
    }
    return (
      <div className="group/sent relative">
        {card.contexts[0]?.sentence ? (
          <p onDoubleClick={(e) => { e.stopPropagation(); startEdit(card.id!, "sentence", card.contexts[0]?.sentence || ""); }}
            className="cursor-text text-sm leading-relaxed text-gray-700 dark:text-gray-300">
            <HighlightMatch text={card.contexts[0].sentence} word={card.word} />
          </p>
        ) : (
          <p onDoubleClick={(e) => { e.stopPropagation(); startEdit(card.id!, "sentence", ""); }}
            className="cursor-text text-sm text-gray-400 italic">
            No sentence — double-click to add
          </p>
        )}
        <Pencil size={10} className="absolute top-0 right-0 text-gray-300 opacity-0 group-hover/sent:opacity-100 transition-opacity" />
      </div>
    );
  };

  const renderTranslation = (card: Flashcard) => {
    if (editingField && editingField.cardId === card.id && editingField.field === "translation") {
      return (
        <textarea
          value={editingField.value}
          onChange={(e) => setEditingField((p) => p ? { ...p, value: e.target.value } : null)}
          onBlur={saveEdit}
          onKeyDown={(e) => { if (e.key === "Escape") setEditingField(null); }}
          autoFocus rows={3}
          className="w-full bg-gray-50 dark:bg-dark-bg border-2 border-green-500 rounded-lg p-3 text-sm outline-none resize-none"
          onClick={(e) => e.stopPropagation()}
        />
      );
    }
    return (
      <div className="group/trans relative">
        <p onDoubleClick={(e) => { e.stopPropagation(); startEdit(card.id!, "translation", card.contexts[0]?.translation || ""); }}
          className="cursor-text text-sm leading-relaxed text-gray-500 dark:text-gray-400 italic">
          {card.contexts[0]?.translation || <span className="text-gray-400">No translation — double-click to add</span>}
        </p>
        <Pencil size={10} className="absolute top-0 right-0 text-gray-300 opacity-0 group-hover/trans:opacity-100 transition-opacity" />
      </div>
    );
  };

  // ── Card faces ──────────────────────────────────────────────────────

  const CardFront = ({ card, isQuiz = false }: { card: Flashcard; isQuiz?: boolean }) => {
    const diff = card.difficulty as SRSRating | undefined;
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 pt-8 pb-5 gap-4">
        {/* Top row: difficulty badge (left) + audio buttons (right) */}
        <div className="w-full flex items-start justify-between">
          {diff ? (
            <span className={`text-[10px] px-2.5 py-1 rounded-full font-black uppercase tracking-widest ${RATING_META[diff].badgeBg} ${RATING_META[diff].badgeText}`}>
              {RATING_META[diff].label}
            </span>
          ) : <span />}
          {isQuiz && (
            <div className="flex gap-1.5">
              <button onClick={(e) => { e.stopPropagation(); speakText(card.word, card.lang); }}
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-100 dark:bg-dark-hover hover:bg-gray-200 transition-all"
                title="Pronounce word">
                <Volume2 size={14} className="text-gray-500 dark:text-gray-300" />
              </button>
              {card.contexts[0]?.sentence && (
                <button onClick={(e) => { e.stopPropagation(); speakText(card.contexts[0].sentence, card.lang); }}
                  className="flex h-8 items-center justify-center rounded-xl bg-gray-100 dark:bg-dark-hover hover:bg-gray-200 transition-all px-2 text-xs font-bold text-gray-500 dark:text-gray-300"
                  title="Pronounce sentence">
                  ¶
                </button>
              )}
            </div>
          )}
        </div>

        {/* Word */}
        {renderWord(card, isQuiz)}

        {/* Context sentence preview */}
        {card.contexts[0]?.sentence && (
          <p className="text-center text-sm leading-relaxed text-gray-500 dark:text-gray-400 max-w-[90%] line-clamp-3">
            <HighlightMatch text={card.contexts[0].sentence} word={card.word} />
          </p>
        )}

        <p className="text-[10px] uppercase tracking-widest text-gray-300 dark:text-dark-muted mt-auto">
          tap to reveal
        </p>
      </div>
    );
  };

  const CardBack = ({ card }: { card: Flashcard }) => {
    const posData = card.contexts[0]?.posData;
    const langLabel = LANGUAGE_NAMES[card.lang as keyof typeof LANGUAGE_NAMES] || card.lang.toUpperCase();
    const freq = wordCountsMap[`${card.lang}|${card.word}`] || 0;
    return (
      <div className="p-5 space-y-3 h-full overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-gray-100 dark:border-dark-hover">
          <span className="font-black text-gray-900 dark:text-white text-lg">{card.word}</span>
          <div className="flex gap-1.5 flex-wrap justify-end">
            <span className="text-[10px] bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 px-2 py-0.5 rounded-full font-black uppercase tracking-widest">{langLabel}</span>
            {freq > 0 && <span className="text-[10px] bg-gray-100 dark:bg-dark-hover text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full font-black">×{freq}</span>}
          </div>
        </div>

        {/* Meanings / POS */}
        {posData && posData.length > 0 ? (
          <PosBadges posData={posData} />
        ) : card.contexts[0]?.translation ? (
          <p className="text-sm text-gray-700 dark:text-gray-300 font-semibold">{card.contexts[0].translation.split("\n")[0]}</p>
        ) : null}

        {/* Context sentence */}
        {card.contexts[0]?.sentence && (
          <div className="rounded-2xl bg-gray-50 dark:bg-dark-bg p-3">
            <p className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-dark-muted mb-1">Context</p>
            {renderSentence(card)}
          </div>
        )}

        {/* Translation */}
        {card.contexts[0]?.translation && (
          <div className="rounded-2xl bg-gray-50 dark:bg-dark-bg p-3">
            <p className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-dark-muted mb-1">Translation</p>
            {renderTranslation(card)}
          </div>
        )}

        {/* Source */}
        {/* Next review date */}
        {card.nextReview && (
          <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-dark-hover">
            <span className="text-[10px] text-gray-400 dark:text-dark-muted">
              Next review: {card.nextReview <= Date.now()
                ? <span className="text-amber-600 dark:text-amber-400 font-bold">Due now</span>
                : new Date(card.nextReview).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
            {card.interval && (
              <span className="text-[10px] text-gray-400 dark:text-dark-muted">
                {card.interval}d interval
              </span>
            )}
          </div>
        )}

        {card.contexts[0]?.sourceTitle && (
          <p className="text-[10px] text-gray-400 dark:text-dark-muted truncate">
            {card.contexts[0].sourceTitle}
          </p>
        )}
      </div>
    );
  };

  // ── Main render ─────────────────────────────────────────────────────

  if (cardsQuery === undefined) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center bg-white dark:bg-dark-bg">
        <p className="text-gray-400 dark:text-dark-muted animate-pulse text-sm font-medium">Loading flashcards…</p>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen overflow-x-hidden bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text pb-16 transition-colors duration-200">

      {/* ── Header ── */}
      <div className="sticky top-0 z-40 bg-white dark:bg-dark-surface border-b border-gray-200 dark:border-dark-hover">
        <div className="w-full px-6 md:px-8 py-4 flex flex-wrap items-center gap-3">

          <button onClick={onBack}
            className="flex items-center gap-2 text-gray-600 dark:text-dark-muted hover:text-green-600 dark:hover:text-green-400 transition-colors font-medium mr-2">
            <ChevronLeft size={20} /> Back
          </button>

          <h1 className="text-xl font-bold mr-2">Flashcards</h1>

          {/* Lang + sort */}
          <select value={selectedLang} onChange={(e) => changeSelectedLang(e.target.value)}
            className="px-3 py-2 bg-gray-100 dark:bg-dark-hover border border-gray-200 dark:border-dark-muted rounded-lg text-sm text-gray-900 dark:text-white outline-none">
            <option value="all">All Languages</option>
            {(languageOrder.length > 0
              ? languageOrder.filter((c) => c in LANGUAGE_NAMES)
              : Object.keys(LANGUAGE_NAMES)
            ).map((code) => (
              <option key={code} value={code}>{(LANGUAGE_NAMES as Record<string, string>)[code]}</option>
            ))}
          </select>

          <div className="flex items-center gap-1">
            <select value={sortBy} onChange={(e) => changeSortBy(e.target.value as SortBy)}
              className="px-3 py-2 bg-gray-100 dark:bg-dark-hover border border-gray-200 dark:border-dark-muted rounded-lg text-sm text-gray-900 dark:text-white outline-none">
              <option value="date">Date Added</option>
              <option value="alphabetical">Alphabetical</option>
              <option value="frequency">Frequency</option>
              <option value="difficulty">Difficulty</option>
            </select>
            <button
              onClick={() => {
                const next = sortOrder === "asc" ? "desc" : "asc";
                setSortOrder(next);
                localStorage.setItem("flashcards.sortOrder", next);
              }}
              title={sortOrder === "asc" ? "Ascending" : "Descending"}
              className="px-2 py-2 bg-gray-100 dark:bg-dark-hover border border-gray-200 dark:border-dark-muted rounded-lg text-sm text-gray-700 dark:text-white hover:bg-gray-200 transition-colors"
            >
              {sortOrder === "asc" ? "↑" : "↓"}
            </button>
            <button
              onClick={() => {
                const next = !groupBySource;
                setGroupBySource(next);
                localStorage.setItem("flashcards.groupBySource", String(next));
              }}
              title="Group by source article"
              className={`px-2 py-2 rounded-lg text-sm font-bold border transition-colors ${
                groupBySource
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-gray-100 dark:bg-dark-hover border-gray-200 dark:border-dark-muted text-gray-700 dark:text-white hover:bg-gray-200"
              }`}
            >
              ⊞
            </button>
          </div>

          <div className="flex-1" />

          {/* Select mode controls */}
          {!quizMode && (
            <>
              <button onClick={() => { setSelectMode((p) => !p); setSelectedCards(new Set()); }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold text-sm transition-all ${
                  selectMode ? "bg-indigo-600 text-white" : "bg-gray-100 dark:bg-dark-hover text-gray-700 dark:text-white hover:bg-gray-200"
                }`}>
                <CheckSquare size={15} />{selectMode ? "Cancel" : "Select"}
              </button>

              {selectMode && (
                <>
                  <button onClick={() => {
                    const all = new Set(sortedCards.map((c) => c.id!).filter(Boolean));
                    setSelectedCards(selectedCards.size === all.size ? new Set() : all);
                  }} className="px-3 py-2 rounded-lg font-bold text-sm bg-gray-100 dark:bg-dark-hover text-gray-700 dark:text-white hover:bg-gray-200 flex items-center gap-1.5 transition-all">
                    <Square size={15} />{selectedCards.size === sortedCards.length ? "Deselect All" : "Select All"}
                  </button>
                  <button onClick={handleDeleteSelected} disabled={selectedCards.size === 0}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold text-sm bg-red-500 hover:bg-red-600 disabled:opacity-40 text-white transition-all">
                    <Trash2 size={15} /> Delete ({selectedCards.size})
                  </button>
                </>
              )}
            </>
          )}

          {/* Due count badge */}
          {dueCount > 0 && !quizMode && (
            <span className="flex items-center gap-1 px-2.5 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-lg text-xs font-black border border-amber-300 dark:border-amber-700">
              {dueCount} due
            </span>
          )}

          {/* Quiz filter toggle (only in quiz mode) */}
          {quizMode && !quizComplete && (
            <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-dark-hover text-xs font-bold">
              <button onClick={() => { setQuizFilter("all"); setQuizIndex(0); setQuizFlipped(false); }}
                className={`px-3 py-1.5 transition-colors ${quizFilter === "all" ? "bg-green-600 text-white" : "bg-white dark:bg-dark-bg text-gray-600 dark:text-gray-400 hover:bg-gray-100"}`}>
                All ({filteredCards.length})
              </button>
              <button onClick={() => { setQuizFilter("due"); setQuizIndex(0); setQuizFlipped(false); }}
                className={`px-3 py-1.5 transition-colors ${quizFilter === "due" ? "bg-amber-500 text-white" : "bg-white dark:bg-dark-bg text-gray-600 dark:text-gray-400 hover:bg-gray-100"}`}>
                Due ({dueCount})
              </button>
            </div>
          )}

          {/* Quiz mode */}
          <button onClick={() => {
            const savedIdx = parseInt(localStorage.getItem(quizProgressKey) || "0", 10);
            const startIdx = savedIdx > 0 ? savedIdx : 0;
            setQuizMode((p) => !p); setQuizIndex(startIdx); setQuizFlipped(false); setQuizComplete(false); setRatingCounts({ again: 0, hard: 0, good: 0, easy: 0 }); setSelectMode(false); setQuizFilter("all");
          }}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-sm transition-all ${
              quizMode ? "bg-green-600 text-white shadow-lg shadow-green-600/20" : "bg-gray-100 dark:bg-dark-hover text-gray-700 dark:text-white hover:bg-gray-200"
            }`}>
            <BookOpen size={15} />{quizMode ? "Exit Quiz" : "Quiz Mode"}
          </button>
        </div>

        {/* Sub-header hint */}
        {!quizMode && (
          <p className="px-6 md:px-8 pb-2 text-xs text-gray-400 dark:text-dark-muted">
            {selectMode
              ? `${selectedCards.size} selected — click cards to toggle selection`
              : "Click card to flip · Double-click word / sentence / translation to edit"}
          </p>
        )}
      </div>

      {/* ── Content ── */}
      <div className="w-full px-6 md:px-8 py-8">

        {sortedCards.length === 0 ? (
          <div className="rounded-3xl border border-gray-200 dark:border-dark-hover bg-gray-50 dark:bg-dark-surface p-12 text-center text-gray-500 dark:text-dark-muted">
            No flashcards yet. Save words from the Reader to start studying.
          </div>

        ) : quizMode ? (
          /* ── Quiz Mode ── */
          quizComplete ? (
            /* End screen */
            <div className="max-w-md mx-auto text-center animate-fade-in">
              <div className="rounded-[2rem] border border-gray-200 dark:border-dark-hover bg-white dark:bg-dark-surface shadow-lg p-10 space-y-6">
                <div>
                  <p className="text-5xl mb-3">🎉</p>
                  <h2 className="text-2xl font-black text-gray-900 dark:text-white">Quiz Complete!</h2>
                  <p className="text-sm text-gray-500 dark:text-dark-muted mt-1">
                    {Object.values(ratingCounts).reduce((a, b) => a + b, 0)} cards reviewed
                  </p>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {(["again", "hard", "good", "easy"] as SRSRating[]).map((r) => (
                    <div key={r} className={`rounded-xl py-3 ${RATING_META[r].badgeBg}`}>
                      <p className={`text-xl font-black ${RATING_META[r].badgeText}`}>{ratingCounts[r]}</p>
                      <p className={`text-[10px] font-bold uppercase tracking-widest ${RATING_META[r].badgeText}`}>{RATING_META[r].label}</p>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3 flex-wrap">
                  <button onClick={exitQuiz}
                    className="flex-1 py-3 bg-gray-100 dark:bg-dark-hover text-gray-700 dark:text-white rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-dark-surface transition-all">
                    Exit
                  </button>
                  <button onClick={() => restartQuiz(false)}
                    className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold shadow-lg shadow-green-600/20 transition-all">
                    Restart ↩
                  </button>
                </div>
                {parseInt(localStorage.getItem(quizProgressKey) || "0", 10) > 0 && (
                  <button onClick={() => restartQuiz(true)}
                    className="w-full py-2.5 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-xl font-bold text-sm border border-blue-200 dark:border-blue-800 transition-all">
                    Resume from card #{parseInt(localStorage.getItem(quizProgressKey) || "0", 10) + 1}
                  </button>
                )}
                <p className="text-[10px] text-gray-400 dark:text-dark-muted">Press Enter to restart</p>
              </div>
            </div>
          ) : (
            /* Active quiz */
            <div className="max-w-lg mx-auto">
              {/* Progress */}
              <div className="flex items-center gap-3 mb-5">
                <span className="text-sm font-bold text-gray-500 dark:text-dark-muted tabular-nums w-16">
                  {quizIndex + 1} / {sortedCards.length}
                </span>
                <div className="flex-1 h-1.5 bg-gray-200 dark:bg-dark-hover rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full transition-all duration-300"
                    style={{ width: `${((quizIndex + 1) / sortedCards.length) * 100}%` }} />
                </div>
                <button onClick={() => { setQuizIndex(Math.floor(Math.random() * sortedCards.length)); setQuizFlipped(false); }}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-green-600 transition-colors">
                  <Shuffle size={13} /> Shuffle
                </button>
              </div>

              {currentQuizCard && (
                <>
                  {/* 3D flip card */}
                  <div style={{ perspective: "1200px" }} onClick={() => { if (!editingField) setQuizFlipped((p) => !p); }}>
                    <div className="relative transition-transform duration-500 cursor-pointer"
                      style={{ transformStyle: "preserve-3d", transform: quizFlipped ? "rotateY(180deg)" : "rotateY(0deg)", minHeight: "300px" }}>

                      <div className="rounded-[2rem] border border-gray-200 dark:border-dark-hover bg-white dark:bg-dark-surface shadow-lg"
                        style={{ backfaceVisibility: "hidden", minHeight: "300px" }}>
                        <CardFront card={currentQuizCard} isQuiz />
                      </div>

                      <div className="absolute inset-0 rounded-[2rem] border border-gray-200 dark:border-dark-hover bg-white dark:bg-dark-surface shadow-lg overflow-auto"
                        style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)", minHeight: "300px" }}>
                        <CardBack card={currentQuizCard} />
                      </div>
                    </div>
                  </div>

                  {/* SRS buttons or hint */}
                  {quizFlipped ? (
                    <div className="mt-4 space-y-2">
                      <p className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-dark-muted text-center">How well did you know it? (1–4)</p>
                      <div className="grid grid-cols-4 gap-2">
                        {(["again", "hard", "good", "easy"] as SRSRating[]).map((key, i) => (
                          <button key={key} onClick={() => handleSRSRate(key)}
                            className={`py-2.5 rounded-xl text-white font-black text-xs shadow-lg transition-all ${RATING_META[key].btnColor}`}>
                            <span className="block text-[10px] opacity-50 font-normal">{i + 1}</span>
                            {RATING_META[key].label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-center text-xs text-gray-400 dark:text-dark-muted mt-3">
                      Click card or Space to flip · Enter to flip then advance
                    </p>
                  )}

                  {/* Prev / Next */}
                  <div className="flex items-center justify-between mt-4">
                    <button onClick={() => { setQuizIndex((p) => Math.max(p - 1, 0)); setQuizFlipped(false); }}
                      disabled={quizIndex === 0}
                      className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 dark:bg-dark-hover text-gray-700 dark:text-white rounded-xl font-bold disabled:opacity-30 hover:bg-gray-200 transition-all text-sm">
                      <ChevronLeft size={16} /> Prev
                    </button>
                    <p className="text-[10px] text-gray-400 dark:text-dark-muted">← → navigate</p>
                    <button onClick={advanceQuiz}
                      className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 dark:bg-dark-hover text-gray-700 dark:text-white rounded-xl font-bold hover:bg-gray-200 transition-all text-sm">
                      Next <ChevronRight size={16} />
                    </button>
                  </div>
                </>
              )}
            </div>
          )

        ) : (
          /* ── Grid Mode ── */
          <div ref={gridRef} className="space-y-8">
            {(groupedCards
              ? Array.from(groupedCards.entries())
              : [["", sortedCards] as [string, Flashcard[]]]
            ).map(([groupTitle, groupCards]) => (
              <div key={groupTitle}>
                {groupBySource && groupTitle && (
                  <h3 className="text-xs font-black uppercase tracking-widest text-gray-400 dark:text-dark-muted mb-3 border-b border-gray-200 dark:border-dark-hover pb-1">
                    {groupTitle}
                  </h3>
                )}
                <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 items-start">
            {groupCards.map((card, index) => {
              const isFlipped = flipped[card.id ?? 0] ?? false;
              const isSelected = card.id !== undefined && selectedCards.has(card.id);
              return (
                <div
                  key={card.id || index}
                  tabIndex={0}
                  data-word={card.word.toLowerCase()}
                  className={`flashcard-item relative group focus:outline-none animate-fade-in`}
                  style={{ animationDelay: `${Math.min(index * 40, 400)}ms`, animationFillMode: "both" }}
                  onKeyDown={(e) => {
                    if ((e.key === " " || e.key === "Enter") && !editingField && !selectMode) {
                      e.preventDefault(); toggleFlip(card.id);
                    }
                  }}
                >
                  {/* Delete button — shown on hover */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(card.id); }}
                    className="absolute top-2 right-2 z-10 flex h-7 w-7 items-center justify-center rounded-lg bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-hover text-gray-400 hover:text-red-500 hover:border-red-300 shadow-sm opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all"
                    title="Delete"
                  >
                    <Trash2 size={13} />
                  </button>

                  {/* Select checkbox — shown in select mode */}
                  {selectMode && (
                    <button
                      onClick={(e) => { e.stopPropagation(); if (card.id !== undefined) toggleCardSelection(card.id); }}
                      className={`absolute top-2 left-2 z-10 flex h-7 w-7 items-center justify-center rounded-lg border shadow-sm transition-all ${
                        isSelected
                          ? "bg-indigo-600 border-indigo-600 text-white"
                          : "bg-white dark:bg-dark-surface border-gray-300 dark:border-dark-hover text-gray-400"
                      }`}
                    >
                      {isSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                    </button>
                  )}

                  {/* 3D card */}
                  <div style={{ perspective: "1200px" }}
                    className="cursor-pointer"
                    onClick={() => {
                      if (selectMode && card.id !== undefined) { toggleCardSelection(card.id); return; }
                      if (!editingField) toggleFlip(card.id);
                    }}>
                    <div className={`relative transition-transform duration-500 rounded-[1.75rem] ring-2 ${
                      isSelected ? "ring-indigo-500" : "ring-transparent"
                    }`}
                      style={{ transformStyle: "preserve-3d", transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)", minHeight: "200px" }}>

                      {/* Front */}
                      <div className="rounded-[1.75rem] border border-gray-200 dark:border-dark-hover bg-white dark:bg-dark-surface shadow-sm group-hover:shadow-md group-hover:-translate-y-0.5 transition-all"
                        style={{ backfaceVisibility: "hidden", minHeight: "200px" }}>
                        <CardFront card={card} />
                      </div>

                      {/* Back */}
                      <div className="absolute inset-0 rounded-[1.75rem] border border-gray-200 dark:border-dark-hover bg-white dark:bg-dark-surface shadow-sm overflow-auto"
                        style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)", minHeight: "200px" }}>
                        <CardBack card={card} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
