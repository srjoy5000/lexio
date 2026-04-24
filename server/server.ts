import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import Parser from "rss-parser";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const kuromoji = require("kuromoji");
const { PorterStemmer, PorterStemmerFr, PorterStemmerEs, PorterStemmerPt } = require('natural');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim());

// ─── NG words (non-negative mode filter) ──────────────────────────────────────
const NG_WORDS = [
  // English
  "war", "death", "murder", "kill", "attack", "crash", "accident", "dead",
  "crisis", "fatal", "shooting", "explosion", "massacre", "terror", "hostage",
  "casualties", "bombing", "riot", "conflict", "violence",
  // Japanese
  "死", "事故", "殺人", "戦争", "崩壊", "爆発", "テロ", "犯罪", "被害", "危機",
  // French
  "guerre", "mort", "meurtre", "tuer", "attaque", "accident", "crise", "violence",
  "terrorisme", "explosion", "catastrophe", "victime",
  // Spanish
  "guerra", "muerte", "asesinato", "matar", "ataque", "accidente", "crisis",
  "violencia", "terrorismo", "explosión", "víctima", "tragedia",
  // Portuguese
  "guerra", "morte", "assassinato", "matar", "ataque", "acidente", "crise",
  "violência", "terrorismo", "explosão", "vítima", "tragédia",
  // Korean
  "전쟁", "사망", "살인", "공격", "사고", "위기", "폭발", "테러", "폭력", "재난",
];

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin '${origin}' is not allowed`));
  },
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"],
}));
app.use(express.json());

const parser = new Parser({
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  },
  customFields: {
    item: [["content:encoded", "content:encoded"]],
  },
});

// 1. RSS Feed Endpoint — returns RSS-provided content (legally provided by publishers for syndication)
app.get("/api/rss-feed", async (req: Request, res: Response) => {
  try {
    const feedUrl = req.query.url as string;
    if (!feedUrl) return res.status(400).json({ error: "RSS URL is required" });

    const feed = await parser.parseURL(feedUrl);
    const nonNegativeMode = req.query.nonNegativeMode === "true";
    const items = feed.items
      .slice(0, 15)
      .filter((item) => {
        if (!nonNegativeMode) return true;
        const text = `${item.title || ""} ${item.contentSnippet || item.content || item.summary || ""}`.toLowerCase();
        return !NG_WORDS.some((word) => text.includes(word.toLowerCase()));
      })
      .map((item) => {
        const rawContent = (item as any)["content:encoded"] || item.content || item.contentSnippet || "";
        const strippedContent = stripHtml(rawContent);
        return {
          title: item.title,
          link: item.link,
          source: feed.title || "Unknown Source",
          pubDate: item.pubDate,
          content: strippedContent,
          excerpt: item.contentSnippet ? stripHtml(item.contentSnippet) : strippedContent.slice(0, 300),
        };
      });

    res.json({ title: feed.title, items });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch RSS feed" });
  }
});

// 2. Wikipedia Endpoint — CC BY-SA licensed content, free to display with attribution
app.get("/api/wikipedia", async (req: Request, res: Response) => {
  const rawLang = (req.query.lang as string) || "en";
  const wikiLang = rawLang === "pt-BR" ? "pt" : rawLang;
  const title = req.query.title as string;
  const search = req.query.search as string;

  const WIKI_HEADERS = { "User-Agent": "Lexio/1.0 (https://github.com/srjoy5000; portfolio educational app)" };

  try {
    if (search) {
      const url = `https://${wikiLang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(search)}&format=json&srlimit=8&formatversion=2`;
      const response = await fetch(url, { headers: WIKI_HEADERS });
      const data = await response.json() as any;
      const results = (data.query?.search || []).map((r: any) => ({
        title: r.title,
        snippet: r.snippet.replace(/<[^>]+>/g, ""),
        pageid: r.pageid,
      }));
      return res.json({ results });
    }

    if (title) {
      const url = `https://${wikiLang}.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&explaintext=true&titles=${encodeURIComponent(title)}&redirects=1&formatversion=2`;
      const response = await fetch(url, { headers: WIKI_HEADERS });
      if (!response.ok) throw new Error(`Wikipedia API: ${response.status}`);
      const data = await response.json() as any;
      const page = data.query?.pages?.[0];
      if (!page || page.missing) {
        return res.status(404).json({ error: "Article not found on Wikipedia" });
      }
      const content = (page.extract || "").trim();
      return res.json({
        title: page.title,
        content,
        excerpt: content.split("\n").find((l: string) => l.trim().length > 30) || content.slice(0, 300),
        url: `https://${wikiLang}.wikipedia.org/wiki/${encodeURIComponent((page.title as string).replace(/ /g, "_"))}`,
        siteName: "Wikipedia",
        isWikipedia: true,
      });
    }

    res.status(400).json({ error: "Provide 'search' or 'title' query parameter" });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch from Wikipedia" });
  }
});

// 3. Japanese Tokenizer — kuromoji singleton (loads dictionary once on first use)
type KuromojiToken = {
  surface_form: string;
  basic_form: string;
  reading: string;
  pos: string;
  pos_detail_1: string;
};

type KuromojiTokenizer = { tokenize: (text: string) => KuromojiToken[] };

let _kuromojiTokenizer: KuromojiTokenizer | null = null;
const _tokenizerReady: Promise<KuromojiTokenizer | null> = new Promise((resolve) => {
  kuromoji.builder({ dicPath: "node_modules/kuromoji/dict" }).build(
    (err: Error | null, tokenizer: KuromojiTokenizer) => {
      if (err) { console.error("[kuromoji] Failed to load dictionary:", err); resolve(null); }
      else { _kuromojiTokenizer = tokenizer; resolve(tokenizer); }
    }
  );
});

// Content POS tags that carry meaning (skip particles, auxiliary verbs, punctuation)
const CONTENT_POS = new Set(["名詞", "動詞", "形容詞", "副詞", "感動詞"]);

app.get("/api/tokenize", async (req: Request, res: Response) => {
  const text = req.query.text as string;
  const lang = (req.query.lang as string) || "ja";

  if (!text) return res.status(400).json({ error: "text parameter required" });
  if (lang !== "ja") {
    let lemma = text;
    switch (lang) {
      case 'en':    lemma = PorterStemmer.stem(text) || text; break;
      case 'fr':    lemma = PorterStemmerFr.stem(text) || text; break;
      case 'es':    lemma = PorterStemmerEs.stem(text) || text; break;
      case 'pt-BR': lemma = PorterStemmerPt.stem(text) || text; break;
      // ko: no pure-JS Korean morphological analyzer; pass through
    }
    return res.json({ tokens: [], lemma });
  }

  try {
    const tokenizer = await _tokenizerReady;
    if (!tokenizer) return res.status(503).json({ error: "Tokenizer not ready" });

    const tokens: KuromojiToken[] = tokenizer.tokenize(text);
    const simplified = tokens.map((t) => ({
      surface: t.surface_form,
      basic: t.basic_form === "*" ? t.surface_form : t.basic_form,
      reading: t.reading === "*" ? t.surface_form : t.reading,
      pos: t.pos,
    }));

    // Pick the primary content word for the lemma
    const mainToken = simplified.find((t) => CONTENT_POS.has(t.pos)) ?? simplified[0];
    const lemma = mainToken ? mainToken.basic : text;

    return res.json({ tokens: simplified, lemma });
  } catch (error) {
    res.status(500).json({ error: "Tokenization failed" });
  }
});

app.listen(PORT, () => {});
