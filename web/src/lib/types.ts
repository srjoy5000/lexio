export interface RSSItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  content: string;
  excerpt?: string;
}

export interface WikipediaSearchResult {
  title: string;
  snippet: string;
  pageid: number;
}

export interface FeedMeta {
  name: string;
  url: string;
  genre: string;
  difficulty: string;
}

export interface Article {
  title: string;
  content: string;
  excerpt: string;
  siteName: string;
  publishedTime: string;
  url?: string;
}

export type Language = "ja" | "en" | "fr" | "pt-BR" | "es" | "ko";

/** A single part-of-speech entry returned by Google Translate dictionary lookup. */
export interface PosEntry {
  pos: string;
  translations: string;
}

export type Page = "home" | "reader" | "stats" | "export" | "flashcards" | "library" | "dictionary";

export const LANGUAGES: { [key: string]: string } = {
  ja: "Japanese",
  en: "English",
  fr: "French",
  "pt-BR": "Brazilian Portuguese",
  es: "Spanish",
  ko: "Korean",
};

export const DEEPL_LANGUAGE_MAP: { [key: string]: string } = {
  ja: "JA",
  en: "EN-US",
  fr: "FR",
  "pt-BR": "PT-BR",
  es: "ES",
  ko: "KO",
};
