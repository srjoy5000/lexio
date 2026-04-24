import { useState, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, Flashcard } from "../db";
import { LANGUAGES, Language } from "../lib/types";
import { BookMarked, Search, ChevronDown, ChevronUp } from "lucide-react";

const DIFF_COLOR: Record<string, string> = {
  easy:  "bg-green-100  dark:bg-green-900/30  text-green-700  dark:text-green-300",
  good:  "bg-blue-100   dark:bg-blue-900/30   text-blue-700   dark:text-blue-300",
  hard:  "bg-amber-100  dark:bg-amber-900/30  text-amber-700  dark:text-amber-300",
  again: "bg-red-100    dark:bg-red-900/30    text-red-700    dark:text-red-300",
};

interface WordCardProps {
  card: Flashcard;
  isExpanded: boolean;
  onToggle: () => void;
}

function WordCard({ card, isExpanded, onToggle }: WordCardProps) {
  const firstContext = card.contexts[0];
  const translation = firstContext?.translation?.split("\n")[0] ?? "";
  const diffClass = card.difficulty ? (DIFF_COLOR[card.difficulty] ?? "") : "";
  const showLemma = card.lemma && card.lemma !== card.word;

  return (
    <div
      className="bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-hover rounded-xl overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
      onClick={onToggle}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex-1 min-w-0">
            <span className="text-lg font-bold text-gray-900 dark:text-white break-all">
              {showLemma ? card.lemma : card.word}
            </span>
            {showLemma && (
              <span className="ml-2 text-sm text-gray-400 dark:text-dark-muted font-normal">
                {"{" + card.word + "}"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="text-[10px] font-black uppercase tracking-widest text-green-600 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full">
              {card.lang}
            </span>
            {card.difficulty && (
              <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${diffClass}`}>
                {card.difficulty}
              </span>
            )}
          </div>
        </div>
        {translation && (
          <p className="text-sm text-gray-500 dark:text-dark-muted line-clamp-1">{translation}</p>
        )}
        <div className="flex items-center justify-between mt-2 text-xs text-gray-300 dark:text-dark-muted">
          <span>{card.contexts.length} context{card.contexts.length !== 1 ? "s" : ""}</span>
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-gray-100 dark:border-dark-hover bg-gray-50 dark:bg-dark-bg/40 p-4 space-y-3">
          {card.contexts.slice(0, 3).map((ctx, i) => (
            <div key={i} className="text-sm space-y-1">
              <p className="text-gray-800 dark:text-white italic leading-relaxed">{ctx.sentence}</p>
              <p className="text-gray-500 dark:text-dark-muted">{ctx.translation?.split("\n")[0]}</p>
              {ctx.sourceTitle && (
                <p className="text-[11px] text-gray-300 dark:text-dark-muted">{ctx.sourceTitle}</p>
              )}
            </div>
          ))}
          {card.contexts.length > 3 && (
            <p className="text-xs text-gray-400">+{card.contexts.length - 3} more contexts</p>
          )}
        </div>
      )}
    </div>
  );
}

interface DictionaryProps {
  onBack: () => void;
}

export default function Dictionary({ onBack: _onBack }: DictionaryProps) {
  const [search, setSearch] = useState("");
  const [langFilter, setLangFilter] = useState<Language | "all">("all");
  const [sortBy, setSortBy] = useState<"date" | "alpha" | "difficulty">("date");
  const [groupByLemma, setGroupByLemma] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const allCards = useLiveQuery(() => db.flashcards.toArray(), []) ?? [];

  const filtered = useMemo(() => {
    let cards = allCards;
    if (langFilter !== "all") cards = cards.filter((c) => c.lang === langFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      cards = cards.filter(
        (c) =>
          c.word.toLowerCase().includes(q) ||
          (c.lemma ?? "").toLowerCase().includes(q) ||
          c.contexts.some((ctx) => ctx.translation?.toLowerCase().includes(q))
      );
    }
    switch (sortBy) {
      case "alpha":
        cards = [...cards].sort((a, b) => (a.lemma ?? a.word).localeCompare(b.lemma ?? b.word));
        break;
      case "difficulty": {
        const order: Record<string, number> = { again: 0, hard: 1, good: 2, easy: 3, "": 4 };
        cards = [...cards].sort((a, b) => (order[a.difficulty ?? ""] ?? 4) - (order[b.difficulty ?? ""] ?? 4));
        break;
      }
      default:
        cards = [...cards].sort((a, b) => b.addedAt - a.addedAt);
    }
    return cards;
  }, [allCards, langFilter, search, sortBy]);

  // Group by lemma: merge cards with the same lemma into one display entry
  const displayCards = useMemo(() => {
    if (!groupByLemma) return filtered;
    const seen = new Map<string, Flashcard>();
    for (const card of filtered) {
      const key = `${card.lang}:${card.lemma ?? card.word}`;
      if (!seen.has(key)) {
        seen.set(key, card);
      } else {
        // Merge contexts into the first card found
        const existing = seen.get(key)!;
        const merged = { ...existing, contexts: [...existing.contexts, ...card.contexts] };
        seen.set(key, merged);
      }
    }
    return Array.from(seen.values());
  }, [filtered, groupByLemma]);

  const langOptions = useMemo(
    () => ["all", ...Array.from(new Set(allCards.map((c) => c.lang))).sort()],
    [allCards]
  );

  const hasJapanese = allCards.some((c) => c.lang === "ja");

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-4xl font-black flex items-center gap-3 text-gray-900 dark:text-white mb-2">
          <BookMarked size={32} className="text-green-600" />
          Dictionary
        </h1>
        <p className="text-gray-500 dark:text-dark-muted font-medium">
          {allCards.length} saved word{allCards.length !== 1 ? "s" : ""}
          {filtered.length !== allCards.length && ` · ${displayCards.length} shown`}
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search words or translations…"
            className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-hover rounded-xl text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <select
          value={langFilter}
          onChange={(e) => setLangFilter(e.target.value as Language | "all")}
          className="px-3 py-2.5 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-hover rounded-xl text-sm font-semibold text-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="all">All Languages</option>
          {langOptions.filter((l) => l !== "all").map((l) => (
            <option key={l} value={l}>{(LANGUAGES as Record<string, string>)[l] ?? l.toUpperCase()}</option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="px-3 py-2.5 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-hover rounded-xl text-sm font-semibold text-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="date">Newest first</option>
          <option value="alpha">A → Z</option>
          <option value="difficulty">By difficulty</option>
        </select>
        {hasJapanese && (
          <button
            onClick={() => setGroupByLemma((v) => !v)}
            className={`px-4 py-2.5 rounded-xl text-sm font-bold border transition-all ${
              groupByLemma
                ? "bg-green-600 text-white border-green-600"
                : "bg-white dark:bg-dark-surface border-gray-200 dark:border-dark-hover text-gray-700 dark:text-white"
            }`}
            title="Group inflected forms under their dictionary form"
          >
            Group by lemma
          </button>
        )}
      </div>

      {/* Grid */}
      {displayCards.length === 0 ? (
        <div className="text-center py-24 text-gray-400">
          <BookMarked size={64} className="mx-auto mb-6 opacity-20" />
          <p className="text-xl font-black">
            {allCards.length === 0 ? "No words saved yet" : "No words match your filter"}
          </p>
          {allCards.length === 0 && (
            <p className="text-sm mt-2 opacity-60">
              Click any word in the Reader and save it to flashcards to see it here.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {displayCards.map((card) => (
            <WordCard
              key={card.id}
              card={card}
              isExpanded={expandedId === card.id}
              onToggle={() => setExpandedId(expandedId === card.id ? null : (card.id ?? null))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
