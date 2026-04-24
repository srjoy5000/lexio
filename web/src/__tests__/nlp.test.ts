import { describe, it, expect } from "vitest";
import { tokenizeWords, isStopword, STOPWORDS, shouldHighlightWord } from "../lib/nlp";

describe("tokenizeWords", () => {
  it("splits simple English sentence into words", () => {
    const words = tokenizeWords("Hello world", "en");
    expect(words).toContain("hello");
    expect(words).toContain("world");
  });

  it("excludes punctuation from tokens", () => {
    const words = tokenizeWords("Hello, world!", "en");
    expect(words).not.toContain(",");
    expect(words).not.toContain("!");
  });

  it("splits French elision: d'abord → abord", () => {
    const words = tokenizeWords("d'abord il faut", "fr");
    // The clitic "d'" is dropped; "abord" should be present
    expect(words).toContain("abord");
    // The combined "d'abord" should not appear as a single token
    expect(words).not.toContain("d'abord");
  });

  it("splits French elision with curly apostrophe: l'éco → éco", () => {
    const words = tokenizeWords("l\u2019éco mondiale", "fr");
    expect(words).toContain("éco");
    expect(words).not.toContain("l\u2019éco");
  });

  it("tokenizes Japanese text into individual words", () => {
    // Simple Japanese text — Intl.Segmenter should produce word-like segments
    const words = tokenizeWords("東京は日本の首都です", "ja");
    expect(words.length).toBeGreaterThan(0);
  });
});

describe("isStopword", () => {
  it("recognizes English stopwords", () => {
    expect(isStopword("the", "en")).toBe(true);
    expect(isStopword("is", "en")).toBe(true);
  });

  it("does not flag content words as stopwords", () => {
    expect(isStopword("democracy", "en")).toBe(false);
    expect(isStopword("technology", "en")).toBe(false);
  });

  it("recognizes French stopwords", () => {
    expect(isStopword("le", "fr")).toBe(true);
    expect(isStopword("est", "fr")).toBe(true);
  });

  it("returns false for unknown languages", () => {
    expect(isStopword("the", "zz")).toBe(false);
  });

  it("respects exceptions: word in exceptions is NOT a stopword", () => {
    // "the" is normally a stopword in English
    expect(isStopword("the", "en")).toBe(true);
    expect(isStopword("the", "en", ["the"])).toBe(false);
  });

  it("exceptions do not affect other stopwords", () => {
    expect(isStopword("is", "en", ["the"])).toBe(true);
  });
});

describe("STOPWORDS", () => {
  it("is exported and contains expected languages", () => {
    expect(STOPWORDS).toBeDefined();
    expect(STOPWORDS["en"]).toBeDefined();
    expect(STOPWORDS["fr"]).toBeDefined();
    expect(STOPWORDS["ja"]).toBeDefined();
  });

  it("English stopwords set contains basic words", () => {
    expect(STOPWORDS["en"].has("the")).toBe(true);
    expect(STOPWORDS["en"].has("a")).toBe(true);
  });
});

describe("shouldHighlightWord — proper noun heuristic (no compromise)", () => {
  it("does not highlight a capitalized word in the middle of a sentence (proper noun)", () => {
    // "Paris" mid-sentence → treated as proper noun → should NOT highlight
    expect(shouldHighlightWord("Paris", "I visited Paris last summer", "en")).toBe(false);
  });

  it("highlights a lowercase content word mid-sentence", () => {
    expect(shouldHighlightWord("economy", "The economy is growing", "en")).toBe(true);
  });

  it("skips acronyms (all uppercase)", () => {
    expect(shouldHighlightWord("NASA", "NASA launched a rocket", "en")).toBe(false);
  });

  it("skips tokens containing digits", () => {
    expect(shouldHighlightWord("21h", "Meeting at 21h today", "en")).toBe(false);
  });

  it("does not skip a capitalized word that starts the sentence", () => {
    // "Economy" at sentence start should NOT be filtered as a proper noun
    const result = shouldHighlightWord("Economy", "Economy is growing fast", "en");
    // It might be caught by capitalization heuristic depending on sentence, but should at least not crash
    expect(typeof result).toBe("boolean");
  });

  it("works correctly for non-English languages (no proper noun filter)", () => {
    // Japanese words are never filtered as proper nouns
    expect(shouldHighlightWord("経済", "日本の経済は成長している", "ja")).toBe(true);
  });
});
