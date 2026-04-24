import { useState, useCallback, useRef } from "react";
import { db, AppSettings } from "../db";
import { PosEntry } from "../lib/types";
import {
  toGoogleLang,
  translateText,
  fetchGoogleTranslate,
} from "../lib/translate";
import { API_BASE } from "../lib/api";

async function fetchLemma(word: string, lang: string): Promise<string> {
  try {
    const res = await fetch(`${API_BASE}/api/tokenize?text=${encodeURIComponent(word)}&lang=${lang}`);
    if (!res.ok) return word;
    const data = await res.json();
    return (data.lemma as string) || word;
  } catch {
    return word;
  }
}

interface ArticleContext {
  title?: string;
  url?: string;
}

interface TooltipCallbacks {
  setVisible: (v: boolean) => void;
  setLoading: (v: boolean) => void;
  setPos: (pos: { x: number; y: number }) => void;
  setData: (data: { original: string; meanings: PosEntry[] } | null) => void;
  setError: (err: string | null) => void;
}

/**
 * Manages word selection, translation, and flashcard save/undo logic.
 * Extracted from Reader.tsx to reduce god-component size.
 */
export function useWordTranslation(
  sourceLang: string,
  settings: AppSettings | null,
  isFallbackMode: boolean,
  manualLang: string,
  /** Contextual metadata for flashcard source info */
  articleContext: {
    article: ArticleContext | null;
    articleUrl?: string;
    articleTitle?: string;
    manualTitle: string;
    manualUrl: string;
  },
  setSaveStatus: (msg: string | null) => void,
  scheduleSaveStatusClear: (ms: number, extra?: () => void) => void,
  wordClickedRef: React.MutableRefObject<boolean>,
  translationSectionRef: React.RefObject<HTMLElement | null>,
  tooltip: TooltipCallbacks,
) {
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [selectedSentence, setSelectedSentence] = useState<string | null>(null);
  const [translatedText, setTranslatedText] = useState<string>("");
  const [translating, setTranslating] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [wordPosData, setWordPosData] = useState<PosEntry[] | null>(null);
  const [wordPosLoading, setWordPosLoading] = useState(false);
  const [lastSavedCardId, setLastSavedCardId] = useState<number | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const evictTranslationCache = useCallback(async (max = 200) => {
    const count = await db.translationCache.count();
    if (count <= max) return;
    const all = await db.translationCache
      .orderBy("cachedAt")
      .limit(count - max)
      .primaryKeys();
    if (all.length > 0) await db.translationCache.bulkDelete(all);
  }, []);

  const isTranslationEnabled = useCallback(() =>
    settings?.translationTargets?.some((t) => t !== "None") || false,
    [settings]);

  const getTranslationTargets = useCallback(() => {
    const src = toGoogleLang(sourceLang);
    const all = settings?.translationTargets?.filter(
      (t) => t !== "None" && toGoogleLang(t) !== src,
    ) || [];
    const count = settings?.translationTargetCount ?? 1;
    return all.slice(0, count);
  }, [sourceLang, settings]);

  const handleWordClick = useCallback((
    word: string,
    sentence: string,
    clientX = 0,
    clientY = 0,
  ) => {
    if (!word) return;
    const cleaned = word.replace(/[.,!?;:()]/g, "").trim().toLowerCase();
    const newSentence = sentence || "";
    const sameSentence =
      newSentence.trim() !== "" &&
      newSentence.trim() === (selectedSentence || "").trim();
    setSelectedWord(cleaned);
    setSelectedSentence(newSentence);
    if (!sameSentence) setTranslatedText("");
    setSaveStatus(null);
    setTranslationError(null);
    setWordPosData(null);
    tooltip.setVisible(false);

    // Mark that a word click occurred so mouseup selection-tooltip is skipped
    wordClickedRef.current = true;
    setTimeout(() => { wordClickedRef.current = false; }, 100);

    const targets = getTranslationTargets();
    if (targets.length === 0 || !cleaned) return;
    const src = toGoogleLang(sourceLang);
    const tgt = toGoogleLang(targets[0]);
    if (src === tgt) return;

    // Show floating tooltip at click position
    if (clientX > 0) {
      const tx = Math.min(clientX + 10, window.innerWidth - 300);
      const ty = Math.min(clientY + 15, window.innerHeight - 220);
      tooltip.setPos({ x: tx, y: ty });
      tooltip.setVisible(true);
      tooltip.setLoading(true);
      tooltip.setData(null);
      tooltip.setError(null);
    }

    setWordPosLoading(true);
    fetchGoogleTranslate(cleaned, src, tgt)
      .then((data) => {
        setWordPosData(data?.meanings ?? null);
        if (clientX > 0) tooltip.setData(data);
      })
      .catch(() => {
        if (clientX > 0) tooltip.setError("Lookup failed.");
      })
      .finally(() => {
        setWordPosLoading(false);
        if (clientX > 0) tooltip.setLoading(false);
      });
  }, [selectedSentence, sourceLang, settings, setSaveStatus, getTranslationTargets, wordClickedRef, tooltip]);

  /** Ctrl+click: toggle flashcard (add or remove). */
  const handleDoubleClickWord = useCallback(async (word: string, sentence: string) => {
    const cleaned = word.replace(/[.,!?;:()]/g, "").trim().toLowerCase();
    if (!cleaned || !settings) return;

    const existingCard = await db.flashcards
      .filter((f) => f.word === cleaned && f.lang === sourceLang)
      .first();
    if (existingCard) {
      await db.flashcards.delete(existingCard.id!);
      setSaveStatus(`"${cleaned}" removed from flashcards.`);
      scheduleSaveStatusClear(2000);
      return;
    }

    const targets = getTranslationTargets();
    if (targets.length === 0) return;
    const src = toGoogleLang(sourceLang);
    const textToTranslate = sentence.trim() || cleaned;
    try {
      const cacheKey = `gt|${[...targets].sort().join(",")}|${textToTranslate.substring(0, 400)}`;
      const cached = await db.translationCache.where("cacheKey").equals(cacheKey).first();
      let translationResult: string;
      if (cached) {
        translationResult = cached.translatedText;
      } else {
        const results = await Promise.all(
          targets.map(async (tgt) => {
            const text = await translateText(textToTranslate, src, toGoogleLang(tgt));
            return { lang: tgt, text };
          }),
        );
        translationResult = results.map((t) => `${t.lang}: ${t.text}`).join("\n\n");
        await db.translationCache.add({
          cacheKey,
          sourceText: textToTranslate,
          translatedText: translationResult,
          cachedAt: Date.now(),
        });
        evictTranslationCache();
      }
      const context = {
        sentence: textToTranslate,
        translation: translationResult,
        posData: wordPosData || undefined,
        sourceTitle:
          articleContext.article?.title ||
          articleContext.articleTitle ||
          articleContext.manualTitle ||
          "Manual Text",
        sourceUrl:
          articleContext.article?.url ||
          articleContext.articleUrl ||
          articleContext.manualUrl ||
          "",
        genre: settings.globalGenre || "News",
      };
      const lemma = await fetchLemma(cleaned, sourceLang);
      const existing = await db.flashcards.where("word").equals(cleaned).first();
      if (existing) {
        const dup = existing.contexts.some(
          (c) => c.sentence === context.sentence && c.translation === context.translation,
        );
        if (!dup) {
          existing.contexts.push(context);
          if (!existing.lemma && lemma !== cleaned) existing.lemma = lemma;
          await db.flashcards.put(existing);
        }
      } else {
        await db.flashcards.add({ lang: sourceLang, word: cleaned, lemma: lemma !== cleaned ? lemma : undefined, contexts: [context], addedAt: Date.now() });
      }
      const langWord = `${sourceLang}|${cleaned}`;
      const ec = await db.wordCounts.where("langWord").equals(langWord).first();
      if (ec) { ec.count += 1; ec.lastEncountered = Date.now(); await db.wordCounts.put(ec); }
      else await db.wordCounts.add({ langWord, lang: sourceLang, word: cleaned, count: 1, lastEncountered: Date.now() });
      setSaveStatus(`"${cleaned}" saved!`);
      scheduleSaveStatusClear(2000);
    } catch (err) {
      console.error("[Reader] handleDoubleClickWord (add flashcard):", err);
      setSaveStatus("Failed to save — please try again.");
      scheduleSaveStatusClear(3000);
    }
  }, [sourceLang, settings, wordPosData, articleContext, setSaveStatus, scheduleSaveStatusClear,
      getTranslationTargets, evictTranslationCache]);

  /** Fetch translation only — no DB write. Used by auto-translate + "See Translation" button. */
  const handleTranslateOnly = useCallback(async () => {
    if (!selectedWord || !settings) return;
    if (isFallbackMode && !manualLang) {
      setTranslationError("Please select a Source Language before translating.");
      return;
    }
    if (!isTranslationEnabled()) {
      setTranslationError("Set a target language in Settings to translate.");
      return;
    }
    const targets = getTranslationTargets();
    if (targets.length === 0) {
      setTranslationError("Set a target language in Settings to translate.");
      return;
    }
    const textToTranslate =
      selectedSentence && selectedSentence.trim().length > 0
        ? selectedSentence
        : selectedWord;

    setTranslationError(null);
    setTranslating(true);
    try {
      const cacheKey = `gt|${targets.sort().join(",")}|${textToTranslate.substring(0, 400)}`;
      const cached = await db.translationCache.where("cacheKey").equals(cacheKey).first();
      let translationResult: string;
      if (cached) {
        translationResult = cached.translatedText;
      } else {
        const src = toGoogleLang(sourceLang);
        const translations = await Promise.all(
          targets.map(async (targetLang) => {
            const text = await translateText(textToTranslate, src, toGoogleLang(targetLang));
            return { lang: targetLang, text };
          }),
        );
        translationResult = translations.map((t) => `${t.lang}: ${t.text}`).join("\n\n");
        await db.translationCache.add({
          cacheKey,
          sourceText: textToTranslate,
          translatedText: translationResult,
          cachedAt: Date.now(),
        });
        evictTranslationCache();
      }
      setTranslatedText(translationResult);
      setTimeout(() => translationSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 150);
    } catch (err) {
      console.error("[Reader] handleTranslateOnly:", err);
      setTranslationError("Translation failed. Check your network connection.");
    } finally {
      setTranslating(false);
    }
  }, [selectedWord, selectedSentence, sourceLang, settings, isFallbackMode, manualLang,
      isTranslationEnabled, getTranslationTargets, evictTranslationCache, translationSectionRef]);

  /** Save the current word + translation to flashcards DB. */
  const handleSaveToFlashcard = useCallback(async () => {
    if (!selectedWord || !settings) return;
    const finalWord = selectedWord.replace(/[.,!?;:()]/g, "").trim().toLowerCase();
    if (!finalWord) return;

    const textToTranslate =
      selectedSentence && selectedSentence.trim().length > 0
        ? selectedSentence
        : selectedWord;

    let translation = translatedText;
    if (!translation) {
      if (!isTranslationEnabled()) {
        setTranslationError("Set a target language in Settings to translate.");
        return;
      }
      const targets = getTranslationTargets();
      if (targets.length === 0) {
        setTranslationError("Set a target language in Settings to translate.");
        return;
      }
      setTranslating(true);
      try {
        const cacheKey = `gt|${targets.sort().join(",")}|${textToTranslate.substring(0, 400)}`;
        const cached = await db.translationCache.where("cacheKey").equals(cacheKey).first();
        if (cached) {
          translation = cached.translatedText;
        } else {
          const src = toGoogleLang(sourceLang);
          const results = await Promise.all(
            targets.map(async (tgt) => {
              const text = await translateText(textToTranslate, src, toGoogleLang(tgt));
              return { lang: tgt, text };
            }),
          );
          translation = results.map((t) => `${t.lang}: ${t.text}`).join("\n\n");
          await db.translationCache.add({
            cacheKey,
            sourceText: textToTranslate,
            translatedText: translation,
            cachedAt: Date.now(),
          });
          evictTranslationCache();
        }
        setTranslatedText(translation);
      } catch (err) {
        console.error("[Reader] handleSaveToFlashcard (translate):", err);
        setTranslationError("Translation failed. Check your network connection.");
        setTranslating(false);
        return;
      }
      setTranslating(false);
    }

    const context = {
      sentence: textToTranslate,
      translation,
      posData: wordPosData || undefined,
      sourceTitle:
        articleContext.article?.title ||
        articleContext.articleTitle ||
        articleContext.manualTitle ||
        "Manual Text",
      sourceUrl:
        articleContext.article?.url ||
        articleContext.articleUrl ||
        articleContext.manualUrl ||
        "",
      genre: settings.globalGenre || "News",
    };

    try {
      const lemma = await fetchLemma(finalWord, sourceLang);
      const existing = await db.flashcards.where("word").equals(finalWord).first();
      let savedId: number;
      if (existing) {
        const isDuplicate = existing.contexts.some(
          (c) => c.sentence === context.sentence && c.translation === context.translation,
        );
        if (!isDuplicate) {
          existing.contexts.push(context);
          if (!existing.lemma && lemma !== finalWord) existing.lemma = lemma;
          await db.flashcards.put(existing);
        }
        savedId = existing.id!;
      } else {
        savedId = (await db.flashcards.add({
          lang: sourceLang,
          word: finalWord,
          lemma: lemma !== finalWord ? lemma : undefined,
          contexts: [context],
          addedAt: Date.now(),
        })) as number;
      }

      const langWord = `${sourceLang}|${finalWord}`;
      const existingCount = await db.wordCounts.where("langWord").equals(langWord).first();
      if (existingCount) {
        existingCount.count += 1;
        existingCount.lastEncountered = Date.now();
        await db.wordCounts.put(existingCount);
      } else {
        await db.wordCounts.add({
          langWord,
          lang: sourceLang,
          word: finalWord,
          count: 1,
          lastEncountered: Date.now(),
        });
      }

      setLastSavedCardId(savedId);
      setSaveStatus("Saved to Flashcards!");
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      scheduleSaveStatusClear(5000, () => setLastSavedCardId(null));
      undoTimerRef.current = setTimeout(() => {
        setLastSavedCardId(null);
        undoTimerRef.current = null;
      }, 5000);
    } catch (err) {
      console.error("[Reader] handleSaveToFlashcard:", err);
      setTranslationError("Failed to save flashcard.");
    }
  }, [selectedWord, selectedSentence, translatedText, sourceLang, settings, wordPosData,
      articleContext, setSaveStatus, scheduleSaveStatusClear, isTranslationEnabled,
      getTranslationTargets, evictTranslationCache]);

  /** Undo the last flashcard save. */
  const handleUndoFlashcard = useCallback(async () => {
    if (!lastSavedCardId) return;
    try {
      await db.flashcards.delete(lastSavedCardId);
      setLastSavedCardId(null);
      if (undoTimerRef.current) { clearTimeout(undoTimerRef.current); undoTimerRef.current = null; }
      setSaveStatus("Flashcard removed.");
      scheduleSaveStatusClear(2000);
    } catch (err) {
      console.error("[Reader] handleUndoFlashcard:", err);
      setSaveStatus("Undo failed — please try again.");
      scheduleSaveStatusClear(3000);
    }
  }, [lastSavedCardId, setSaveStatus, scheduleSaveStatusClear]);

  return {
    selectedWord,
    setSelectedWord,
    selectedSentence,
    setSelectedSentence,
    translatedText,
    setTranslatedText,
    translating,
    translationError,
    setTranslationError,
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
  };
}
