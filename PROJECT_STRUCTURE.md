lexio/
│
├── 📄 package.json          # Root npm scripts (install-all, dev, build)
├── 📋 README.md             # Full documentation
├── 🚀 QUICKSTART.md         # 2-minute setup guide
├── 📝 PROJECT_STRUCTURE.md  # This file
├── 📋 to-do.md              # Roadmap (main / hosted / pro branches)
├── ⚖️  LICENSE               # MIT
├── .gitignore
│
├── 📂 server/               # Node.js / Express backend
│   ├── server.ts            # 3 endpoints: RSS proxy, Wikipedia, tokenizer
│   ├── package.json         # express, cors, rss-parser, kuromoji, natural
│   ├── tsconfig.json
│   └── .env.example         # PORT, ALLOWED_ORIGINS
│
└── 📂 web/                  # React / Vite frontend
    ├── index.html
    ├── package.json         # react, dexie, lucide-react, vite-plugin-pwa
    ├── vite.config.ts       # Vite + PWA (Service Worker, manifest)
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── tsconfig.json
    │
    └── 📂 src/
        ├── main.tsx
        ├── App.tsx              # Root: routing, session, theme
        ├── db.ts                # Dexie schema v15
        ├── styles.css
        │
        ├── 📂 components/
        │   ├── AuthScreen.tsx       # Local login / register (IndexedDB-backed)
        │   ├── HomePage.tsx         # RSS discover tab + Wikipedia search tab + bookmarks
        │   ├── Reader.tsx           # Article reader: word tracking, WPM timer, attribution
        │   ├── Dictionary.tsx       # Flashcard dictionary: search, filter, lemma grouping
        │   ├── Flashcards.tsx       # SRS flashcard grid + SM-2 quiz
        │   ├── FrequencyMap.tsx     # Word frequency heatmap + Anki TSV export
        │   ├── Library.tsx          # Saved manual texts + bookmarks
        │   ├── Sidebar.tsx          # Navigation + language picker + settings
        │   ├── PomodoroTimer.tsx    # Focus timer (configurable work/break)
        │   └── QuickTooltip.tsx     # Floating word-lookup tooltip
        │
        ├── 📂 hooks/
        │   ├── useArticleLoader.ts  # RSS content, Wikipedia fetch, offline cache
        │   ├── useWordStatus.ts     # Known / vague / excluded word state
        │   └── useWordTranslation.ts # Translation, flashcard save/undo, lemma fetch
        │
        ├── 📂 lib/
        │   ├── api.ts           # API_BASE constant (env-aware)
        │   ├── constants.ts     # RSS feed URLs, language display names
        │   ├── nlp.ts           # Intl.Segmenter tokenization, stopwords, TTS, heatmap colors
        │   ├── translate.ts     # Keyless Google Translate API (translateText, fetchGoogleTranslate)
        │   ├── types.ts         # Shared TypeScript interfaces (Language, Page, RSSItem, ...)
        │   └── utils.ts
        │
        └── 📂 __tests__/
            ├── nlp.test.ts
            └── translate.test.ts

══════════════════════════════════════════════════════════════

BACKEND ENDPOINTS (port 3001):

  GET /api/rss-feed?url=<feed_url>[&nonNegativeMode=true]
      → Fetches and parses RSS feed; returns items with title, link,
        source, pubDate, content (stripped HTML), excerpt.

  GET /api/wikipedia?lang=<code>&search=<query>
  GET /api/wikipedia?lang=<code>&title=<title>
      → Wikipedia article fetch or search (CC BY-SA 4.0).
        lang "pt-BR" maps to "pt". Returns plaintext via explaintext=true.

  GET /api/tokenize?text=<word>&lang=<code>
      → Morphological analysis / lemmatization.
        ja  → kuromoji (exact dictionary form, e.g. 食べた → 食べる)
        en  → Porter stemmer (running → run)
        fr  → French Porter stemmer
        es  → Spanish Porter stemmer
        pt-BR → Portuguese Porter stemmer
        ko  → pass-through (no pure-JS Korean analyzer)
        Returns { tokens: [...], lemma: string }

══════════════════════════════════════════════════════════════

DATABASE SCHEMA (IndexedDB via Dexie, version 15):

  flashcards      ++id, lang, word, nextReview, lemma
  wordCounts      langWord (PK), lang, count
  appSettings     id (singleton)
  knownWords      ++id, lang, word, confidence
  manualTexts     ++id, lang, addedAt
  bookmarks       ++id, url, lang
  readingHistory  ++id, lang, readAt          ← includes wpm, readingDuration
  cachedArticles  ++id, url                   ← max 30, auto-evicts oldest
  translationCache ++id, cacheKey
  customFeeds     ++id, lang
  favoriteSites   ++id, lang
  users           ++id, &email (unique)
  studySessions   ++id, lang, start

══════════════════════════════════════════════════════════════

KEY FEATURES:

✅ Content (legal)
   • RSS feed discovery + RSS-provided article text
   • Wikipedia full-text reader (CC BY-SA, all 6 languages)
   • Manual text paste mode

✅ Vocabulary
   • Click-to-translate (keyless Google Translate)
   • Save to flashcards with sentence context
   • Lemmatization for all 6 languages (kuromoji / Porter stemmers)
   • Dictionary page with lemma grouping

✅ Learning
   • SM-2 spaced repetition flashcard quiz
   • Word frequency heatmap + Anki TSV export
   • WPM tracker with live timer

✅ UX / Technical
   • PWA (Service Worker, installable, offline caching)
   • Dark mode
   • Pomodoro timer
   • Local auth (no server accounts needed)
   • Monorepo: shared types, single repo for portfolio

══════════════════════════════════════════════════════════════

DEPENDENCIES SUMMARY:

  Backend (server/package.json):
    express, cors, dotenv
    rss-parser
    kuromoji          ← Japanese morphological analysis
    natural           ← Porter stemmers (EN/FR/ES/PT)
    typescript, ts-node, @types/*

  Frontend (web/package.json):
    react 18, react-dom
    dexie, dexie-react-hooks
    lucide-react
    vite 7, @vitejs/plugin-react
    vite-plugin-pwa
    tailwindcss, postcss, autoprefixer
    typescript
    vitest, @testing-library/react (dev)
