import { useState, useEffect, lazy, Suspense } from "react";
import Sidebar from "./components/Sidebar";
const HomePage = lazy(() => import("./components/HomePage"));
const Reader = lazy(() => import("./components/Reader"));
const FrequencyMap = lazy(() => import("./components/FrequencyMap"));
const Flashcards = lazy(() => import("./components/Flashcards"));
const Library = lazy(() => import("./components/Library"));
const Dictionary = lazy(() => import("./components/Dictionary"));
import AuthScreen from "./components/AuthScreen";
import PomodoroTimer from "./components/PomodoroTimer";
import { db, initializeSettings } from "./db";
import { Language, Page } from "./lib/types";

type ReadStatus = "reading" | "read";
const loadReadStatuses = (): Record<string, ReadStatus> => {
  try { return JSON.parse(localStorage.getItem("readStatuses") || "{}"); } catch { return {}; }
};

type Theme = "light" | "dark";

const loadSession = () => {
  const id = localStorage.getItem("lexio.session");
  const name = localStorage.getItem("lexio.userName");
  if (id && name) return { userId: Number(id), userName: name };
  return null;
};

export default function App() {
  const [session, setSession] = useState(loadSession);
  const [currentPage, setCurrentPage] = useState<Page>("home");
  const [currentLanguage, setCurrentLanguage] = useState<Language>("ja");
  const [theme, setTheme] = useState<Theme>("light");
  const [tabPerLang, setTabPerLang] = useState<Record<string, "discover" | "bookmarks" | "wikipedia">>({});
  const [readStatuses, setReadStatuses] = useState<Record<string, ReadStatus>>(loadReadStatuses);
  const [focusFlashcardWord, setFocusFlashcardWord] = useState<string | null>(null);
  const [showPomodoro, setShowPomodoro] = useState(false);
  const [pomodoroSettings, setPomodoroSettings] = useState({ work: 25, break: 5 });

  const markArticleRead = (url: string, status: ReadStatus) => {
    setReadStatuses((prev) => {
      const next = { ...prev, [url]: status };
      localStorage.setItem("readStatuses", JSON.stringify(next));
      return next;
    });
  };

  const [sessionMap, setSessionMap] = useState<
    Record<Language, { url: string; title?: string; body?: string; content?: string } | null>
  >({
    en: null,
    ja: null,
    fr: null,
    es: null,
    "pt-BR": null,
    ko: null,
  });

  useEffect(() => {
    initializeApp();
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);

  const initializeApp = async () => {
    await initializeSettings();
    const settings = await db.appSettings.toArray();
    if (settings.length > 0) {
      setCurrentLanguage((settings[0].targetLanguage || "ja") as Language);
      setPomodoroSettings({
        work: settings[0].pomodoroDuration ?? 25,
        break: settings[0].pomodoroBreak ?? 5,
      });
    }
  };

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  const handleLogout = () => {
    localStorage.removeItem("lexio.session");
    localStorage.removeItem("lexio.userName");
    setSession(null);
  };

  const handleSelectArticle = (url: string, title?: string, content?: string) => {
    setSessionMap((prev) => ({
      ...prev,
      [currentLanguage]: { url, title, content },
    }));
    if (url) markArticleRead(url, "reading");
    setCurrentPage("reader");
  };

  const handleAddManualText = () => {
    setSessionMap((prev) => ({ ...prev, [currentLanguage]: null }));
    setCurrentPage("reader");
  };

  const handleOpenSavedText = (body: string, title: string, url: string) => {
    setSessionMap((prev) => ({
      ...prev,
      [currentLanguage]: { url: url || "", title, body },
    }));
    setCurrentPage("reader");
  };

  const handleNavigate = (page: Page) => {
    if (page === "reader") {
      setSessionMap((prev) => ({
        ...prev,
        [currentLanguage]: null,
      }));
    }
    setCurrentPage(page);
  };

  const handleLanguageChange = (lang: Language) => {
    setCurrentLanguage(lang);
    if (sessionMap[lang]) {
      setCurrentPage("reader");
    } else {
      setCurrentPage("home");
    }
  };

  if (!session) {
    return (
      <AuthScreen
        onAuthenticated={(userId, userName) => setSession({ userId, userName })}
      />
    );
  }

  return (
    <div className="flex w-full h-screen overflow-hidden bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text transition-colors duration-200">
      <Sidebar
        currentPage={currentPage}
        onNavigate={handleNavigate}
        onLanguageChange={handleLanguageChange}
        currentLanguage={currentLanguage}
        theme={theme}
        onToggleTheme={toggleTheme}
        userName={session.userName}
        onLogout={handleLogout}
        onTogglePomodoro={() => setShowPomodoro((p) => !p)}
        pomodoroActive={showPomodoro}
      />

      <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-dark-bg">
        <Suspense fallback={
          <div className="flex items-center justify-center h-screen text-gray-400 dark:text-gray-600">
            Loading...
          </div>
        }>
        {currentPage === "home" && (
          <HomePage
            key={currentLanguage}
            currentLanguage={currentLanguage}
            onSelectArticle={handleSelectArticle}
            initialTab={tabPerLang[currentLanguage] || "discover"}
            onTabChange={(tab) =>
              setTabPerLang((prev) => ({ ...prev, [currentLanguage]: tab }))
            }
            onViewLangChange={handleLanguageChange}
            readStatuses={readStatuses}
          />
        )}

        {currentPage === "reader" && (
          <Reader
            articleUrl={sessionMap[currentLanguage]?.url || undefined}
            articleTitle={sessionMap[currentLanguage]?.title}
            initialManualText={sessionMap[currentLanguage]?.body}
            initialContent={sessionMap[currentLanguage]?.content}
            onBack={() => handleNavigate("home")}
            onArticleRead={(url) => markArticleRead(url, "read")}
            onNavigateToFlashcard={(word) => {
              setFocusFlashcardWord(word);
              setCurrentPage("flashcards");
            }}
          />
        )}

        {currentPage === "stats" && (
          <FrequencyMap onBack={() => handleNavigate("home")} />
        )}

        {currentPage === "flashcards" && (
          <Flashcards
            onBack={() => handleNavigate("home")}
            focusWord={focusFlashcardWord}
            onFocused={() => setFocusFlashcardWord(null)}
          />
        )}

        {currentPage === "library" && (
          <Library
            onBack={() => handleNavigate("home")}
            onOpenText={handleOpenSavedText}
            onAddText={handleAddManualText}
          />
        )}

        {currentPage === "dictionary" && (
          <Dictionary onBack={() => handleNavigate("home")} />
        )}

        {currentPage === "export" && (
          <div className="min-h-screen p-8 bg-gray-50 dark:bg-dark-bg">
            <div className="w-full">
              <h1 className="text-3xl font-bold mb-6">Export & Settings</h1>
              <div className="w-full bg-white dark:bg-dark-surface p-6 rounded-xl border border-gray-200 dark:border-dark-hover shadow-sm">
                <p className="text-gray-600 dark:text-dark-muted mb-6">
                  Your progress is saved locally. To study these words in Anki,
                  please use the export button in the Frequency Map.
                </p>
                <button
                  onClick={() => handleNavigate("stats")}
                  className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold transition-all shadow-lg shadow-green-600/20"
                >
                  Go to Frequency Map
                </button>
              </div>
            </div>
          </div>
        )}
        </Suspense>
        <footer className="text-center text-[10px] text-gray-300 dark:text-dark-muted py-2 px-4 border-t border-gray-100 dark:border-dark-hover">
          RSS summaries © respective publishers · Wikipedia content: <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer" className="underline">CC BY-SA 4.0</a> · Non-commercial portfolio project
        </footer>
      </main>
      {showPomodoro && (
        <PomodoroTimer
          workMinutes={pomodoroSettings.work}
          breakMinutes={pomodoroSettings.break}
          lang={currentLanguage}
        />
      )}
    </div>
  );
}
