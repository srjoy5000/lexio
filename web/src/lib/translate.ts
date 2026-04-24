import type { PosEntry } from "./types";

/** Normalize app language codes to Google Translate codes (e.g. pt-BR → pt). */
export const toGoogleLang = (lang: string): string =>
  lang.startsWith("pt") ? "pt" : lang;

/** Reverse-map a Google Translate detected code back to the app language code (e.g. pt → pt-BR). */
export const fromGoogleLang = (lang: string): string =>
  lang === "pt" ? "pt-BR" : lang;

/** Translate a sentence or word using the keyless Google Translate API. */
export async function translateText(
  text: string,
  src: string,
  tgt: string,
): Promise<string> {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${src}&tl=${tgt}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const segments: string[] = (data?.[0] || [])
      .map((s: unknown[]) => s[0] as string)
      .filter(Boolean);
    return segments.join("") || "";
  } catch (err) {
    throw new Error("Translation failed", { cause: err });
  }
}

/**
 * Fetch POS-tagged dictionary data for a single word from Google Translate.
 * Returns up to 3 POS groups, each with up to 2 translations.
 * Returns null on network errors or unexpected API responses.
 */
export async function fetchGoogleTranslate(
  word: string,
  src: string,
  tgt: string,
): Promise<{ original: string; meanings: PosEntry[] } | null> {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${src}&tl=${tgt}&dt=t&dt=bd&q=${encodeURIComponent(word)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.[0]) return null;

    const primaryTranslation: string = data[0]?.[0]?.[0] ?? "";
    let meanings: PosEntry[] = [];

    if (Array.isArray(data[1]) && data[1].length > 0) {
      meanings = (data[1] as Array<Array<unknown>>).slice(0, 3).flatMap((posGroup) => {
        const pos = typeof posGroup[0] === "string" ? posGroup[0] : "";
        const translations = Array.isArray(posGroup[1])
          ? (posGroup[1] as string[]).slice(0, 2).join(", ")
          : "";
        if (!translations) return [];
        return [{ pos: pos ? pos.substring(0, 4) + "." : "", translations }];
      });
    }

    if (meanings.length === 0) {
      if (!primaryTranslation) return null;
      meanings.push({ pos: "", translations: primaryTranslation });
    }

    return { original: word, meanings };
  } catch {
    return null;
  }
}
