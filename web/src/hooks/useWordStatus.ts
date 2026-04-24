import { useCallback } from "react";
import { db, AppSettings } from "../db";

/**
 * Manages vocabulary status actions: mark as known, vague, excluded, and undo.
 * Extracted from Reader.tsx to reduce god-component size.
 */
export function useWordStatus(
  sourceLang: string,
  selectedWord: string | null,
  settings: AppSettings | null,
  setSaveStatus: (msg: string | null) => void,
  scheduleSaveStatusClear: (ms: number) => void,
  setSettings: (s: AppSettings) => void,
) {
  /** Delete any flashcard for `word` in the current source language. */
  const deleteFlashcardIfExists = useCallback(async (word: string) => {
    const card = await db.flashcards
      .filter((f) => f.word === word && f.lang === sourceLang)
      .first();
    if (card) await db.flashcards.delete(card.id!);
  }, [sourceLang]);

  /** Mark the currently selected word as fully known (no-op if already known). */
  const handleMarkAsKnown = useCallback(async () => {
    if (!selectedWord) return;
    const word = selectedWord.toLowerCase();
    try {
      const existing = await db.knownWords.where("word").equals(word).first();
      if (!existing) {
        await db.knownWords.add({ lang: sourceLang, word, addedAt: Date.now() });
      }
      setSaveStatus("Marked as known — will no longer highlight this word.");
      scheduleSaveStatusClear(2500);
    } catch (e) {
      console.error("[Reader] handleMarkAsKnown:", e);
      setSaveStatus("Failed to update — please try again.");
      scheduleSaveStatusClear(3000);
    }
  }, [selectedWord, sourceLang, setSaveStatus, scheduleSaveStatusClear]);

  /** Toggle known status for a word (mark or undo). */
  const handleToggleKnown = useCallback(async (word: string) => {
    const cleaned = word.toLowerCase();
    try {
      const existing = await db.knownWords
        .where("word")
        .equals(cleaned)
        .and((k) => k.lang === sourceLang)
        .first();
      if (existing) {
        await db.knownWords.delete(existing.id!);
        setSaveStatus(`"${cleaned}" unmarked — will highlight again.`);
      } else {
        await db.knownWords.add({ lang: sourceLang, word: cleaned, addedAt: Date.now() });
        await deleteFlashcardIfExists(cleaned);
        setSaveStatus(`"${cleaned}" marked as known.`);
      }
      scheduleSaveStatusClear(2000);
    } catch (e) {
      console.error("[Reader] handleToggleKnown:", e);
      setSaveStatus("Failed to update — please try again.");
      scheduleSaveStatusClear(3000);
    }
  }, [sourceLang, setSaveStatus, scheduleSaveStatusClear, deleteFlashcardIfExists]);

  /** Toggle vague (passive / half-known) status for a word. */
  const handleToggleVague = useCallback(async (word: string) => {
    const cleaned = word.toLowerCase();
    try {
      // Remove any fully-known entry to avoid conflicts
      const known = await db.knownWords
        .filter((k) => k.word === cleaned && k.lang === sourceLang && k.confidence !== "vague")
        .first();
      if (known) await db.knownWords.delete(known.id!);

      const existing = await db.knownWords
        .filter((k) => k.word === cleaned && k.lang === sourceLang && k.confidence === "vague")
        .first();
      if (existing) {
        await db.knownWords.delete(existing.id!);
        setSaveStatus(`"${cleaned}" unmarked as vague.`);
      } else {
        await db.knownWords.add({
          lang: sourceLang,
          word: cleaned,
          addedAt: Date.now(),
          confidence: "vague",
        });
        await deleteFlashcardIfExists(cleaned);
        setSaveStatus(`"${cleaned}" marked as vague (orange).`);
      }
      scheduleSaveStatusClear(2000);
    } catch (e) {
      console.error("[Reader] handleToggleVague:", e);
      setSaveStatus("Failed to update — please try again.");
      scheduleSaveStatusClear(3000);
    }
  }, [sourceLang, setSaveStatus, scheduleSaveStatusClear, deleteFlashcardIfExists]);

  /** Add a word to the excluded words list (stop-words). */
  const handleAddToStopwords = useCallback(async (wordParam?: string) => {
    const word = (wordParam || selectedWord)?.toLowerCase();
    if (!word || !settings) return;
    const updated: AppSettings = {
      ...settings,
      excludedWords: [...new Set([...(settings.excludedWords || []), word])],
    };
    await db.appSettings.put(updated);
    setSettings(updated);
    await deleteFlashcardIfExists(word);
    setSaveStatus("Added to excluded words.");
    scheduleSaveStatusClear(2000);
  }, [selectedWord, settings, setSaveStatus, scheduleSaveStatusClear, deleteFlashcardIfExists, setSettings]);

  return {
    handleMarkAsKnown,
    handleToggleKnown,
    handleToggleVague,
    handleAddToStopwords,
    deleteFlashcardIfExists,
  };
}
