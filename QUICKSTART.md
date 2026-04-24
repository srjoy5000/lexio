# Lexio — Quick Start

## Setup (2 minutes)

### 1. Install dependencies

```bash
npm run install-all
```

This installs packages for the root, `server/`, and `web/` in one command.

### 2. Start development servers

```bash
npm run dev
```

- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:3001

No `.env` file or API keys needed.

---

## First steps

1. Open http://localhost:5173
2. Create a local account (stored only in your browser)
3. Pick a language from the sidebar
4. Browse RSS headlines on the **Discover** tab, or search **Wikipedia** for any topic
5. Click a word to translate it — click **Save to Flashcards** to keep it
6. Visit **Dictionary** to review saved words grouped by base form
7. Visit **Flashcards** for spaced-repetition review (SM-2)
8. Visit **Stats** to see your word frequency heatmap

---

## Key endpoints

| Service   | URL                           |
| --------- | ----------------------------- |
| Frontend  | http://localhost:5173         |
| RSS proxy | `GET /api/rss-feed?url=...`   |
| Wikipedia | `GET /api/wikipedia?lang=&search=` |
| Tokenizer | `GET /api/tokenize?text=&lang=` |

---

## All commands

From the repo root:

```bash
npm run install-all   # install all dependencies
npm run dev           # start server + web together
npm run dev:server    # server only (port 3001)
npm run dev:web       # web only (port 5173)
npm run build         # production build (server + web)
```

From `web/`:

```bash
npm run lint          # ESLint (zero warnings)
npm run test          # Vitest unit tests
npm run test:watch    # watch mode
npx tsc --noEmit      # type check only
```

---

## Common issues

**`vite: command not found`**
```bash
cd web && npm install
```

**Port 5173 already in use**
```bash
lsof -ti:5173 | xargs kill -9
```

**Server not starting / port 3001 busy**
```bash
lsof -ti:3001 | xargs kill -9
```

**TypeScript errors after pulling**
```bash
npm run install-all
```
