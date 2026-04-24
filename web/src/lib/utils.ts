/**
 * Detect the likely source language from a URL's hostname.
 * Returns a language code (e.g. "ja", "fr") or "" if unknown.
 */
export function detectLangFromUrl(url: string): string {
  try {
    const h = new URL(url).hostname.toLowerCase();
    if (/\.jp$|\.co\.jp$|nhk|japantimes|asahi|yomiuri|mainichi/.test(h)) return "ja";
    if (/\.fr$|lemonde|lefigaro|liberation|leparisien/.test(h)) return "fr";
    if (/\.com\.br$|\.br$|globo|uol\.com|folha|g1\./.test(h)) return "pt-BR";
    if (/\.es$|elpais|elmundo|abc\.es|lavanguardia/.test(h)) return "es";
    if (/\.co\.kr$|\.kr$|naver|daum|chosun|joongang/.test(h)) return "ko";
  } catch { /* ignore invalid URLs */ }
  return "";
}
