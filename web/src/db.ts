import Dexie, { Table } from 'dexie';
import type { PosEntry } from './lib/types';

export interface Bookmark {
  id?: number;
  url: string;
  title: string;
  lang: string;
  addedAt: number;
}

export interface Flashcard {
  id?: number;
  lang: string;
  word: string;
  /** Dictionary/base form of the word (e.g. 食べる for 食べた). Populated for Japanese via kuromoji. */
  lemma?: string;
  /** Last SRS self-rating: "again" | "hard" | "good" | "easy" */
  difficulty?: string;
  lastReviewed?: number;
  /** Timestamp (ms) when this card is next due for review. */
  nextReview?: number;
  /** Current review interval in days. */
  interval?: number;
  /** SM-2 ease factor (default 2.5). */
  easeFactor?: number;
  contexts: Array<{
    sentence: string;
    translation: string;
    posData?: PosEntry[];
    sourceTitle: string;
    sourceUrl: string;
    genre: string;
  }>;
  addedAt: number;
}

export interface WordCount {
  langWord: string; // Primary key: lang + "|" + word (e.g., "en|hello")
  lang: string;
  word: string;
  count: number;
  lastEncountered: number;
}

export interface TranslationSetting {
  targetLang1?: string;
  targetLang2?: string;
}

export interface AppSettings {
  id?: number | string;
  targetLanguage: string;
  isAutoHighlightEnabled: boolean;
  lastFeedUrlPerLang: Record<string, string>;
  excludedWords: string[];
  isNonNegativeMode: boolean;
  globalGenre: string;
  translationTargets: string[];
  selectedGenres: string[];
  /** User-defined order of source languages in the sidebar (array of language codes). */
  languageOrder?: string[];
  /** How many translation targets to use in the Reader (1–3). */
  translationTargetCount?: 1 | 2 | 3;
  /** Words to filter out from feed article titles (case-insensitive). */
  feedFilterWords?: string[];
  /** Auto-translate the sentence when a word is clicked. */
  autoTranslate?: boolean;
  /** Per-language preferred TTS voice URI (lang code → voice URI/name). */
  ttsVoices?: Record<string, string>;
  /** Pomodoro work duration in minutes (default 25). */
  pomodoroDuration?: number;
  /** Pomodoro break duration in minutes (default 5). */
  pomodoroBreak?: number;
  /** Built-in stopwords the user has opted to track (removed from the ignore list). */
  stopwordExceptions?: string[];
}

export interface User {
  id?: number;
  email: string;
  name: string;
  passwordHash: string;
  salt: string;
  createdAt: number;
}

export interface CustomFeed {
  id?: number;
  name: string;
  url: string;
  lang: string;
  addedAt: number;
}

export interface ManualText {
  id?: number;
  title: string;
  url: string;
  body: string;
  lang: string;
  addedAt: number;
}

export interface FavoriteSite {
  id?: number;
  url: string;
  title: string;
  lang: string;
  addedAt: number;
}

export interface KnownWord {
  id?: number;
  lang: string;
  word: string;
  addedAt: number;
  /** undefined or "known" = fully known (no highlight); "vague" = passive/half-known (orange highlight) */
  confidence?: "known" | "vague";
}

export interface StudySession {
  id?: number;
  start: number;
  end: number;
  lang: string;
}

export interface TranslationCache {
  id?: number;
  cacheKey: string;    // `${targets.sort().join(',')}|${sourceText.slice(0,400)}`
  sourceText: string;
  translatedText: string;
  cachedAt: number;
}

export interface ReadingHistory {
  id?: number;
  url: string;
  title: string;
  lang: string;
  newWordsCount: number;
  readAt: number;
  /** Words per minute achieved while reading this article. */
  wpm?: number;
  /** Total reading time in seconds. */
  readingDuration?: number;
}

export interface CachedArticle {
  id?: number;
  url: string;
  title: string;
  content: string;
  excerpt: string;
  siteName: string;
  publishedTime: string;
  cachedAt: number;
}

export class PolyglotDB extends Dexie {
  flashcards!: Table<Flashcard>;
  wordCounts!: Table<WordCount>;
  appSettings!: Table<AppSettings>;
  customFeeds!: Table<CustomFeed>;
  bookmarks!: Table<Bookmark>;
  manualTexts!: Table<ManualText>;
  favoriteSites!: Table<FavoriteSite>;
  translationCache!: Table<TranslationCache>;
  knownWords!: Table<KnownWord>;
  readingHistory!: Table<ReadingHistory>;
  cachedArticles!: Table<CachedArticle>;
  users!: Table<User>;
  studySessions!: Table<StudySession>;

  constructor() {
    super('PolyglotContextReaderDB');
    this.version(4).stores({
      flashcards: '++id, lang, word',
      wordCounts: 'langWord, lang, count',
      appSettings: 'id',
      customFeeds: '++id, lang',
      bookmarks: '++id, url, lang'
    });
    this.version(5).stores({
      flashcards: '++id, lang, word',
      wordCounts: 'langWord, lang, count',
      appSettings: 'id',
      customFeeds: '++id, lang',
      bookmarks: '++id, url, lang',
      manualTexts: '++id, lang, addedAt',
    });
    this.version(6).stores({
      flashcards: '++id, lang, word',
      wordCounts: 'langWord, lang, count',
      appSettings: 'id',
      customFeeds: '++id, lang',
      bookmarks: '++id, url, lang',
      manualTexts: '++id, lang, addedAt',
      favoriteSites: '++id, lang',
    });
    this.version(7).stores({
      flashcards: '++id, lang, word',
      wordCounts: 'langWord, lang, count',
      appSettings: 'id',
      customFeeds: '++id, lang',
      bookmarks: '++id, url, lang',
      manualTexts: '++id, lang, addedAt',
      favoriteSites: '++id, lang',
      translationCache: '++id, cacheKey',
    });
    this.version(8).stores({
      flashcards: '++id, lang, word',
      wordCounts: 'langWord, lang, count',
      appSettings: 'id',
      customFeeds: '++id, lang',
      bookmarks: '++id, url, lang',
      manualTexts: '++id, lang, addedAt',
      favoriteSites: '++id, lang',
      translationCache: '++id, cacheKey',
      knownWords: '++id, lang, word',
    });
    // Version 9: add readingHistory + migrate langWord separator from "enlang" → "en|lang"
    this.version(9).stores({
      flashcards: '++id, lang, word',
      wordCounts: 'langWord, lang, count',
      appSettings: 'id',
      customFeeds: '++id, lang',
      bookmarks: '++id, url, lang',
      manualTexts: '++id, lang, addedAt',
      favoriteSites: '++id, lang',
      translationCache: '++id, cacheKey',
      knownWords: '++id, lang, word',
      readingHistory: '++id, lang, readAt',
    }).upgrade(async (tx) => {
      const counts = await tx.table<WordCount>('wordCounts').toArray();
      const toMigrate = counts.filter((c) => !c.langWord.includes('|'));
      if (toMigrate.length === 0) return;
      await tx.table('wordCounts').bulkDelete(toMigrate.map((c) => c.langWord));
      await tx.table('wordCounts').bulkAdd(
        toMigrate.map((c) => ({ ...c, langWord: `${c.lang}|${c.word}` }))
      );
    });
    // Version 10: add languageOrder + translationTargetCount to AppSettings
    this.version(10).stores({
      flashcards: '++id, lang, word',
      wordCounts: 'langWord, lang, count',
      appSettings: 'id',
      customFeeds: '++id, lang',
      bookmarks: '++id, url, lang',
      manualTexts: '++id, lang, addedAt',
      favoriteSites: '++id, lang',
      translationCache: '++id, cacheKey',
      knownWords: '++id, lang, word',
      readingHistory: '++id, lang, readAt',
    }).upgrade(async (tx) => {
      const rows = await tx.table<AppSettings>('appSettings').toArray();
      for (const row of rows) {
        const updates: Partial<AppSettings> = {};
        if (!row.languageOrder) updates.languageOrder = ['ja','en','fr','pt-BR','es','ko'];
        if (!row.translationTargetCount) updates.translationTargetCount = 1;
        if (Object.keys(updates).length > 0) {
          await tx.table('appSettings').update(row.id!, updates);
        }
      }
    });
    // Version 11: index nextReview on flashcards + add cachedArticles table
    this.version(11).stores({
      flashcards: '++id, lang, word, nextReview',
      wordCounts: 'langWord, lang, count',
      appSettings: 'id',
      customFeeds: '++id, lang',
      bookmarks: '++id, url, lang',
      manualTexts: '++id, lang, addedAt',
      favoriteSites: '++id, lang',
      translationCache: '++id, cacheKey',
      knownWords: '++id, lang, word',
      readingHistory: '++id, lang, readAt',
      cachedArticles: '++id, url',
    });
    // Version 12: add users table for auth
    this.version(12).stores({
      flashcards: '++id, lang, word, nextReview',
      wordCounts: 'langWord, lang, count',
      appSettings: 'id',
      customFeeds: '++id, lang',
      bookmarks: '++id, url, lang',
      manualTexts: '++id, lang, addedAt',
      favoriteSites: '++id, lang',
      translationCache: '++id, cacheKey',
      knownWords: '++id, lang, word',
      readingHistory: '++id, lang, readAt',
      cachedArticles: '++id, url',
      users: '++id, &email',
    });
    // Version 13: confidence tier on knownWords + studySessions table
    this.version(13).stores({
      flashcards: '++id, lang, word, nextReview',
      wordCounts: 'langWord, lang, count',
      appSettings: 'id',
      customFeeds: '++id, lang',
      bookmarks: '++id, url, lang',
      manualTexts: '++id, lang, addedAt',
      favoriteSites: '++id, lang',
      translationCache: '++id, cacheKey',
      knownWords: '++id, lang, word, confidence',
      readingHistory: '++id, lang, readAt',
      cachedArticles: '++id, url',
      users: '++id, &email',
      studySessions: '++id, lang, start',
    });
    // Version 14: add stopwordExceptions to AppSettings
    this.version(14).stores({
      flashcards: '++id, lang, word, nextReview',
      wordCounts: 'langWord, lang, count',
      appSettings: 'id',
      customFeeds: '++id, lang',
      bookmarks: '++id, url, lang',
      manualTexts: '++id, lang, addedAt',
      favoriteSites: '++id, lang',
      translationCache: '++id, cacheKey',
      knownWords: '++id, lang, word, confidence',
      readingHistory: '++id, lang, readAt',
      cachedArticles: '++id, url',
      users: '++id, &email',
      studySessions: '++id, lang, start',
    }).upgrade(async (tx) => {
      const rows = await tx.table<AppSettings>('appSettings').toArray();
      for (const row of rows) {
        if (!row.stopwordExceptions) {
          await tx.table('appSettings').update(row.id!, { stopwordExceptions: [] });
        }
      }
    });
    // Version 15: add lemma index to flashcards (wpm/readingDuration on ReadingHistory are plain fields)
    this.version(15).stores({
      flashcards: '++id, lang, word, nextReview, lemma',
      wordCounts: 'langWord, lang, count',
      appSettings: 'id',
      customFeeds: '++id, lang',
      bookmarks: '++id, url, lang',
      manualTexts: '++id, lang, addedAt',
      favoriteSites: '++id, lang',
      translationCache: '++id, cacheKey',
      knownWords: '++id, lang, word, confidence',
      readingHistory: '++id, lang, readAt',
      cachedArticles: '++id, url',
      users: '++id, &email',
      studySessions: '++id, lang, start',
    });
  }
}

export const db = new PolyglotDB();

export async function initializeSettings() {
  const count = await db.appSettings.count();
  if (count === 0) {
    await db.appSettings.add({
      id: 'settings',
      targetLanguage: 'en',
      isAutoHighlightEnabled: true,
      lastFeedUrlPerLang: {},
      excludedWords: [],
      isNonNegativeMode: false,
      globalGenre: '',
      translationTargets: ['None', 'None', 'None'],
      selectedGenres: ['All'],
      languageOrder: ['ja', 'en', 'fr', 'pt-BR', 'es', 'ko'],
      translationTargetCount: 1,
      autoTranslate: false,
      ttsVoices: {},
      pomodoroDuration: 25,
      pomodoroBreak: 5,
      stopwordExceptions: [],
    });
  }
}
