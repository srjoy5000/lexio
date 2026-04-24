import { useState, useCallback } from "react";
import { db, AppSettings, CachedArticle } from "../db";
import { API_BASE } from "../lib/api";
import { Article } from "../lib/types";
import { tokenizeWords, isStopword, shouldHighlightWord } from "../lib/nlp";

// Matches https://xx.wikipedia.org/wiki/Title
const WIKI_URL_RE = /^https?:\/\/([a-z-]+)\.wikipedia\.org\/wiki\/(.+)$/;

export function useArticleLoader(
  articleUrl: string | undefined,
  articleTitle: string | undefined,
  _sourceLang: string,
  settings: AppSettings | null,
  setIsFallbackMode: (v: boolean) => void,
  _onArticleRead?: (url: string) => void,
  initialContent?: string,
) {
  const [article, setArticle] = useState<(Article & { wordCount?: number }) | null>(null);
  const [loading, setLoading] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [servedFromCache, setServedFromCache] = useState(false);
  const [articleDifficulty, setArticleDifficulty] = useState<string | null>(null);

  const syncBookmarkState = useCallback(async (url?: string) => {
    if (!url) { setIsBookmarked(false); return; }
    const existing = await db.bookmarks.where("url").equals(url).first();
    setIsBookmarked(!!existing);
  }, []);

  const calculateDifficulty = useCallback(async (text: string, lang: string) => {
    try {
      const words = tokenizeWords(text, lang);
      const uniqueWords = new Set(words);
      const [flashcards, knownWordsList] = await Promise.all([
        db.flashcards.toArray(),
        db.knownWords.toArray(),
      ]);
      const flashcardSet = new Set(flashcards.map((f) => f.word.toLowerCase()));
      const knownSet = new Set(knownWordsList.map((k) => k.word.toLowerCase()));
      let unknown = 0;
      for (const word of uniqueWords) {
        if (
          !flashcardSet.has(word) &&
          !knownSet.has(word) &&
          !isStopword(word, lang) &&
          shouldHighlightWord(word, "", lang)
        ) {
          unknown++;
        }
      }
      const ratio = uniqueWords.size > 0 ? unknown / uniqueWords.size : 0;
      if (ratio < 0.15) setArticleDifficulty("Beginner");
      else if (ratio < 0.35) setArticleDifficulty("Intermediate");
      else setArticleDifficulty("Advanced");
    } catch (err) {
      console.error("[Reader] calculateDifficulty:", err);
    }
  }, []);

  const cacheArticle = useCallback(async (url: string, data: Article & { wordCount?: number }) => {
    const cached = await db.cachedArticles.where("url").equals(url).first();
    const cacheEntry: CachedArticle = {
      url,
      title: data.title,
      content: data.content,
      excerpt: data.excerpt,
      siteName: data.siteName,
      publishedTime: data.publishedTime,
      cachedAt: Date.now(),
    };
    if (cached?.id) {
      await db.cachedArticles.update(cached.id, cacheEntry);
    } else {
      await db.cachedArticles.add(cacheEntry);
      const all = await db.cachedArticles.orderBy("cachedAt").toArray();
      if (all.length > 30) {
        const toDelete = all.slice(0, all.length - 30).map((a) => a.id!);
        await db.cachedArticles.bulkDelete(toDelete);
      }
    }
  }, []);

  const loadArticle = useCallback(async (url: string) => {
    setLoading(true);
    setIsFallbackMode(false);
    setServedFromCache(false);
    const lang = settings?.targetLanguage || "en";

    try {
      // 1. If RSS content was pre-fetched and is substantial, use it directly
      if (initialContent && initialContent.length > 200) {
        const data: Article & { wordCount?: number } = {
          title: articleTitle || "",
          content: initialContent,
          excerpt: initialContent.slice(0, 300),
          siteName: "",
          publishedTime: "",
          url,
          wordCount: initialContent.split(/\s+/).length,
        };
        setArticle(data);
        await syncBookmarkState(url);
        calculateDifficulty(data.content, lang);
        await cacheArticle(url, data);
        return;
      }

      // 2. Wikipedia URL → fetch from our Wikipedia endpoint
      const wikiMatch = url.match(WIKI_URL_RE);
      if (wikiMatch) {
        const wikiLang = wikiMatch[1] === "pt" ? "pt-BR" : wikiMatch[1];
        const title = decodeURIComponent(wikiMatch[2].replace(/_/g, " "));
        const res = await fetch(`${API_BASE}/api/wikipedia?title=${encodeURIComponent(title)}&lang=${wikiLang}`);
        if (!res.ok) throw new Error(`Wikipedia fetch: HTTP ${res.status}`);
        const data = await res.json() as Article & { wordCount?: number; isWikipedia?: boolean };
        setArticle(data);
        setServedFromCache(false);
        await syncBookmarkState(url);
        calculateDifficulty(data.content, lang);
        await cacheArticle(url, data);
        return;
      }

      // 3. Try offline cache
      const cached = await db.cachedArticles.where("url").equals(url).first();
      if (cached) {
        setArticle({
          title: cached.title,
          content: cached.content,
          excerpt: cached.excerpt,
          siteName: cached.siteName,
          publishedTime: cached.publishedTime,
          url,
        });
        setServedFromCache(true);
        await syncBookmarkState(url);
        return;
      }

      // 4. No content available — prompt manual paste
      setIsFallbackMode(true);
      setArticle(null);
    } catch (err) {
      console.error("[Reader] loadArticle:", err);
      const cached = await db.cachedArticles.where("url").equals(url).first();
      if (cached) {
        setArticle({
          title: cached.title,
          content: cached.content,
          excerpt: cached.excerpt,
          siteName: cached.siteName,
          publishedTime: cached.publishedTime,
          url,
        });
        setServedFromCache(true);
        await syncBookmarkState(url);
      } else {
        setIsFallbackMode(true);
        setArticle(null);
      }
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleUrl, articleTitle, initialContent, settings?.targetLanguage, setIsFallbackMode, syncBookmarkState, cacheArticle]);

  const toggleBookmark = useCallback(async () => {
    const urlToSave = articleUrl || article?.url;
    if (!urlToSave) return;
    try {
      const currentSettings = await db.appSettings.toArray();
      const currentLang = currentSettings[0]?.targetLanguage || "en";
      const existing = await db.bookmarks.where("url").equals(urlToSave).first();
      if (existing && existing.id) {
        await db.bookmarks.delete(existing.id);
        setIsBookmarked(false);
      } else {
        await db.bookmarks.add({
          url: urlToSave,
          title: articleTitle || article?.title || "Saved Article",
          lang: currentLang,
          addedAt: Date.now(),
        });
        setIsBookmarked(true);
      }
    } catch (err) {
      console.error("Failed to toggle bookmark in Reader:", err);
    }
  }, [articleUrl, articleTitle, article]);

  return {
    article,
    setArticle,
    loading,
    isBookmarked,
    servedFromCache,
    articleDifficulty,
    loadArticle,
    syncBookmarkState,
    toggleBookmark,
    calculateDifficulty,
  };
}
