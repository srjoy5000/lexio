# API Documentation

All endpoints are served by the Express backend on `http://localhost:3001`.

The Vite dev server proxies `/api/*` to `http://localhost:3001`, so frontend code can call `/api/...` directly without the full origin.

---

## Endpoints

### 1. RSS Feed

**`GET /api/rss-feed`**

Fetches and parses an RSS feed URL. Returns RSS-provided content — no scraping; publishers include this text in their feeds for syndication.

**Query parameters**

| Parameter         | Required | Description                                              |
| ----------------- | -------- | -------------------------------------------------------- |
| `url`             | yes      | Full RSS feed URL                                        |
| `nonNegativeMode` | no       | `"true"` to filter out items containing violence/crisis keywords |

**Response**

```json
{
  "title": "NHK Web Easy",
  "items": [
    {
      "title": "記事のタイトル",
      "link": "https://www3.nhk.or.jp/...",
      "source": "NHK Web Easy",
      "pubDate": "Mon, 24 Apr 2026 10:00:00 GMT",
      "content": "Full text provided by the publisher in their RSS feed.",
      "excerpt": "Short summary (up to 300 chars)."
    }
  ]
}
```

`content` is the full text from `content:encoded`, `content`, or `contentSnippet` (whichever is longest), with HTML stripped. `excerpt` is either the raw `contentSnippet` or the first 300 characters of `content`.

Up to 15 items are returned per request.

**Example**

```bash
curl "http://localhost:3001/api/rss-feed?url=https://www3.nhk.or.jp/rss/news/cat0.xml"
curl "http://localhost:3001/api/rss-feed?url=https://feeds.bbci.co.uk/news/rss.xml&nonNegativeMode=true"
```

**Frontend usage**

```typescript
const res = await fetch(`/api/rss-feed?url=${encodeURIComponent(feedUrl)}`);
const data = await res.json(); // { title, items: RSSItem[] }
```

**Status codes**

| Code | Meaning                              |
| ---- | ------------------------------------ |
| 200  | Success                              |
| 400  | Missing `url` parameter              |
| 500  | Feed fetch or parse error            |

---

### 2. Wikipedia

**`GET /api/wikipedia`**

Searches for Wikipedia articles or fetches a specific article by title. Content is CC BY-SA 4.0 — attribution is shown in the Reader.

**Query parameters — search mode**

| Parameter | Required | Description                        |
| --------- | -------- | ---------------------------------- |
| `lang`    | yes      | Language code (see table below)    |
| `search`  | yes      | Search query string                |

**Query parameters — fetch mode**

| Parameter | Required | Description                            |
| --------- | -------- | -------------------------------------- |
| `lang`    | yes      | Language code                          |
| `title`   | yes      | Exact Wikipedia article title          |

**Language codes**

| App code | Wikipedia subdomain |
| -------- | ------------------- |
| `en`     | `en`                |
| `ja`     | `ja`                |
| `fr`     | `fr`                |
| `es`     | `es`                |
| `pt-BR`  | `pt`                |
| `ko`     | `ko`                |

**Search response**

```json
{
  "results": [
    {
      "title": "Tokyo",
      "snippet": "Capital and most populous city of Japan...",
      "pageid": 38099
    }
  ]
}
```

Up to 8 results are returned.

**Fetch response**

```json
{
  "title": "Tokyo",
  "content": "Tokyo is the capital and most populous city of Japan...\n\n== History ==\n...",
  "excerpt": "Tokyo is the capital and most populous city of Japan...",
  "url": "https://en.wikipedia.org/wiki/Tokyo",
  "siteName": "Wikipedia",
  "isWikipedia": true
}
```

`content` is plaintext (HTML stripped via `explaintext=true`). `excerpt` is the first non-empty paragraph longer than 30 characters.

**Examples**

```bash
# Search
curl "http://localhost:3001/api/wikipedia?lang=ja&search=東京"

# Fetch article
curl "http://localhost:3001/api/wikipedia?lang=en&title=Tokyo"

# Brazilian Portuguese (maps to pt subdomain)
curl "http://localhost:3001/api/wikipedia?lang=pt-BR&search=Brasil"
```

**Frontend usage**

```typescript
// Search
const res = await fetch(`/api/wikipedia?lang=${lang}&search=${encodeURIComponent(query)}`);
const { results } = await res.json(); // WikipediaSearchResult[]

// Fetch article
const res = await fetch(`/api/wikipedia?lang=${lang}&title=${encodeURIComponent(title)}`);
const article = await res.json(); // { title, content, excerpt, url, siteName, isWikipedia }
```

**Status codes**

| Code | Meaning                                      |
| ---- | -------------------------------------------- |
| 200  | Success                                      |
| 400  | Missing `search` or `title` parameter        |
| 404  | Article not found on Wikipedia               |
| 500  | Wikimedia API error                          |

---

### 3. Tokenize / Lemmatize

**`GET /api/tokenize`**

Returns morphological analysis and the base/dictionary form (lemma) of a word. Used by the frontend when saving a flashcard to populate the `lemma` field.

**Query parameters**

| Parameter | Required | Description                             |
| --------- | -------- | --------------------------------------- |
| `text`    | yes      | Word or phrase to analyze               |
| `lang`    | no       | Language code (default: `"ja"`)         |

**Language behaviour**

| Language | Method              | Example                          |
| -------- | ------------------- | -------------------------------- |
| `ja`     | kuromoji (MeCab)    | `食べた` → `食べる` (exact dictionary form) |
| `en`     | Porter stemmer      | `running` → `run`                |
| `fr`     | French Porter       | `mangeons` → `mang`              |
| `es`     | Spanish Porter      | `corremos` → `corr`              |
| `pt-BR`  | Portuguese Porter   | `correndo` → `corr`              |
| `ko`     | pass-through        | `먹어요` → `먹어요` (unchanged)    |

Note: For Japanese, kuromoji returns exact inflected-form analysis (full `tokens` array). For other languages, `tokens` is empty and only `lemma` is returned.

**Response — Japanese**

```json
{
  "tokens": [
    { "surface": "食べ", "basic": "食べる", "reading": "タベ", "pos": "動詞" },
    { "surface": "た",   "basic": "た",     "reading": "タ",   "pos": "助動詞" }
  ],
  "lemma": "食べる"
}
```

**Response — other languages**

```json
{
  "tokens": [],
  "lemma": "run"
}
```

**Examples**

```bash
curl "http://localhost:3001/api/tokenize?text=食べた&lang=ja"
curl "http://localhost:3001/api/tokenize?text=running&lang=en"
curl "http://localhost:3001/api/tokenize?text=mangeons&lang=fr"
```

**Frontend usage**

```typescript
const res = await fetch(`/api/tokenize?text=${encodeURIComponent(word)}&lang=${lang}`);
const { lemma } = await res.json();
```

**Status codes**

| Code | Meaning                           |
| ---- | --------------------------------- |
| 200  | Success                           |
| 400  | Missing `text` parameter          |
| 503  | kuromoji dictionary not yet loaded (rare, retry) |
| 500  | Tokenization error                |

---

## CORS

The backend allows requests only from origins listed in the `ALLOWED_ORIGINS` environment variable (comma-separated). Default: `http://localhost:5173`.

```
# server/.env
ALLOWED_ORIGINS=http://localhost:5173,https://your-app.vercel.app
```

Requests without an `Origin` header (e.g. direct `curl`) are always allowed.

---

## Environment variables

```
# server/.env  (copy from server/.env.example)
PORT=3001
ALLOWED_ORIGINS=http://localhost:5173
NODE_ENV=development
```

No external API keys are required.

---

## Error response format

All errors return JSON:

```json
{ "error": "Human-readable message" }
```

---

## Vite proxy (development)

`web/vite.config.ts` proxies `/api/*` to `http://localhost:3001`:

```typescript
server: {
  proxy: {
    "/api": { target: "http://localhost:3001", changeOrigin: true }
  }
}
```

In production, set `VITE_API_BASE` to the deployed server origin. The frontend reads this via `web/src/lib/api.ts`:

```typescript
export const API_BASE = import.meta.env.VITE_API_BASE ?? "";
// Usage: fetch(`${API_BASE}/api/rss-feed?url=...`)
```
