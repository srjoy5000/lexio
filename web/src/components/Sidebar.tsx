import { useState, useEffect } from "react";
import {
  Menu, X, Globe, Settings, Sun, Moon,
  Home, BookOpen, BarChart2, Save, FileText, BookMarked,
  ChevronUp, ChevronDown, LogOut, User, Timer,
} from "lucide-react";
import { LANGUAGES, Language, Page } from "../lib/types";
import { db, AppSettings } from "../db";

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onLanguageChange: (lang: Language) => void;
  currentLanguage: Language;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  userName?: string;
  onLogout?: () => void;
  onTogglePomodoro?: () => void;
  pomodoroActive?: boolean;
}

const ALL_LANG_CODES = Object.keys(LANGUAGES) as Language[];

export default function Sidebar({
  currentPage,
  onNavigate,
  onLanguageChange,
  currentLanguage,
  theme,
  onToggleTheme,
  userName,
  onLogout,
  onTogglePomodoro,
  pomodoroActive,
}: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [excludedWordsText, setExcludedWordsText] = useState("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [langOrder, setLangOrder] = useState<Language[]>(ALL_LANG_CODES);

  useEffect(() => {
    loadSettings();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSettings = async () => {
    const stored = await db.appSettings.toArray();
    if (stored.length > 0) {
      const next = stored[0];
      setSettings(next);
      setExcludedWordsText((next.excludedWords || []).join(", "));
      if (next.languageOrder && next.languageOrder.length > 0) {
        // Merge stored order with any new languages not yet in the list
        const stored = next.languageOrder as Language[];
        const merged = [...stored, ...ALL_LANG_CODES.filter((c) => !stored.includes(c))];
        setLangOrder(merged);
      }
    }
  };

  const saveSettings = async () => {
    if (!settings) return;
    const next: AppSettings = {
      ...settings,
      excludedWords: excludedWordsText.split(",").map((w) => w.trim()).filter(Boolean),
    };
    await db.appSettings.put(next);
    setSettings(next);
    setSaveMessage("Settings updated");
    setTimeout(() => setSaveMessage(null), 2000);
  };

  const handleLanguageChange = async (lang: Language) => {
    onLanguageChange(lang);
    const stored = await db.appSettings.toArray();
    if (stored.length > 0) {
      const next = { ...stored[0], targetLanguage: lang };
      await db.appSettings.put(next);
      setSettings(next);
    }
  };

  const moveLang = async (index: number, dir: -1 | 1) => {
    const next = [...langOrder];
    const swapIdx = index + dir;
    if (swapIdx < 0 || swapIdx >= next.length) return;
    [next[index], next[swapIdx]] = [next[swapIdx], next[index]];
    setLangOrder(next);
    if (settings) {
      const updated = { ...settings, languageOrder: next };
      await db.appSettings.put(updated);
      setSettings(updated);
    }
  };

  /** Update a single slot in translationTargets. */
  const setTranslationTarget = async (slotIdx: number, value: string) => {
    if (!settings) return;
    const targets = [...(settings.translationTargets || ["None", "None", "None"])];
    while (targets.length < 3) targets.push("None");
    targets[slotIdx] = value;
    const updated = { ...settings, translationTargets: targets };
    await db.appSettings.put(updated);
    setSettings(updated);
  };

  const setTranslationTargetCount = async (count: 1 | 2 | 3) => {
    if (!settings) return;
    const updated = { ...settings, translationTargetCount: count };
    await db.appSettings.put(updated);
    setSettings(updated);
  };

  const activeTargetCount = (settings?.translationTargetCount ?? 1) as 1 | 2 | 3;
  const translationTargets = settings?.translationTargets || ["None", "None", "None"];

  const navItems = [
    { id: "home" as const,       label: "Home",        icon: <Home size={18} /> },
    { id: "reader" as const,     label: "Practice",    icon: <BookOpen size={18} /> },
    { id: "stats" as const,      label: "Statistics",  icon: <BarChart2 size={18} /> },
    { id: "flashcards" as const, label: "Flashcards",  icon: <BookOpen size={18} /> },
    { id: "dictionary" as const, label: "Dictionary",  icon: <BookMarked size={18} /> },
    { id: "library" as const,    label: "Library",     icon: <FileText size={18} /> },
    { id: "export" as const,     label: "Export",      icon: <Save size={18} /> },
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="flex-1 space-y-8 pb-8">

        {/* Navigation */}
        <div>
          <h2 className="text-[10px] uppercase text-gray-500 dark:text-dark-muted mb-4 font-bold tracking-widest">
            Navigation
          </h2>
          <div className="space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => { onNavigate(item.id); setIsOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 ${
                  currentPage === item.id
                    ? "bg-green-600 text-white shadow-lg shadow-green-600/20"
                    : "hover:bg-gray-200 dark:hover:bg-dark-hover text-gray-700 dark:text-dark-text"
                }`}
              >
                {item.icon}
                <span className="font-medium">{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Target Language (reorderable) */}
        <div>
          <h2 className="text-[10px] uppercase text-gray-500 dark:text-dark-muted mb-4 font-bold tracking-widest flex items-center gap-2">
            <Globe size={14} /> Reading Language
          </h2>
          <div className="space-y-0.5">
            {langOrder.map((code, idx) => (
              <div key={code} className="flex items-center gap-1 group">
                <button
                  onClick={() => handleLanguageChange(code)}
                  className={`flex-1 text-left px-3 py-2 rounded-lg transition-colors text-sm ${
                    currentLanguage === code
                      ? "bg-blue-600/10 text-blue-600 dark:text-blue-400 font-bold border border-blue-600/20"
                      : "hover:bg-gray-200 dark:hover:bg-dark-hover text-gray-600 dark:text-dark-text"
                  }`}
                >
                  {LANGUAGES[code]}
                </button>
                <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => moveLang(idx, -1)}
                    disabled={idx === 0}
                    className="p-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-white disabled:opacity-20 transition-colors"
                  >
                    <ChevronUp size={12} />
                  </button>
                  <button
                    onClick={() => moveLang(idx, 1)}
                    disabled={idx === langOrder.length - 1}
                    className="p-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-white disabled:opacity-20 transition-colors"
                  >
                    <ChevronDown size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Translation Preferences */}
        <div>
          <h2 className="text-[10px] uppercase text-gray-500 dark:text-dark-muted mb-4 font-bold tracking-widest flex items-center gap-2">
            <Globe size={14} /> Translation Preferences
          </h2>
          <div className="space-y-3 rounded-3xl border border-gray-200 dark:border-dark-hover bg-white dark:bg-dark-surface p-4">
            <div>
              <label className="text-xs uppercase tracking-widest text-gray-400 dark:text-dark-muted block mb-1.5">
                Number of target languages
              </label>
              <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-dark-hover text-xs font-bold">
                {([1, 2, 3] as const).map((n) => (
                  <button
                    key={n}
                    onClick={() => setTranslationTargetCount(n)}
                    className={`flex-1 py-1.5 transition-colors ${
                      activeTargetCount === n
                        ? "bg-green-600 text-white"
                        : "bg-white dark:bg-dark-bg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-hover"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {Array.from({ length: activeTargetCount }, (_, i) => {
              const used = translationTargets.filter((_, j) => j !== i && translationTargets[j] !== "None");
              return (
                <div key={i}>
                  <label className="text-xs uppercase tracking-widest text-gray-400 dark:text-dark-muted block mb-1">
                    Target {i + 1}
                  </label>
                  <select
                    value={translationTargets[i] || "None"}
                    onChange={(e) => setTranslationTarget(i, e.target.value)}
                    className="w-full bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-hover rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="None">— None —</option>
                    {Object.entries(LANGUAGES)
                      .filter(([code]) => !used.includes(code))
                      .sort(([a], [b]) => langOrder.indexOf(a as Language) - langOrder.indexOf(b as Language))
                      .map(([code, name]) => (
                        <option key={code} value={code}>{name}</option>
                      ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>

        {/* Settings */}
        <div>
          <h2 className="text-[10px] uppercase text-gray-500 dark:text-dark-muted mb-4 font-bold tracking-widest flex items-center gap-2">
            <Settings size={14} /> Settings
          </h2>
          <div className="space-y-3 rounded-3xl border border-gray-200 dark:border-dark-hover bg-white dark:bg-dark-surface p-4">
            <label className="text-xs uppercase tracking-widest text-gray-400 dark:text-dark-muted">
              Excluded Words
            </label>
            <input
              value={excludedWordsText}
              onChange={(e) => setExcludedWordsText(e.target.value)}
              placeholder="Comma-separated list"
              className="w-full bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-hover rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white outline-none"
            />
            <button
              onClick={saveSettings}
              className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold transition-all"
            >
              Save Settings
            </button>
            {saveMessage && (
              <p className="text-xs text-green-600 dark:text-green-300">{saveMessage}</p>
            )}
          </div>
        </div>

      </div>

      {/* Pomodoro toggle */}
      {onTogglePomodoro && (
        <div className="pt-4 border-t border-gray-200 dark:border-dark-hover">
          <button
            onClick={onTogglePomodoro}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all group ${
              pomodoroActive
                ? "bg-green-600 text-white"
                : "bg-gray-200/50 dark:bg-dark-hover/50 hover:bg-gray-200 dark:hover:bg-dark-hover text-gray-700 dark:text-dark-text"
            }`}
          >
            <span className="text-sm font-medium">Pomodoro Timer</span>
            <Timer size={16} />
          </button>
        </div>
      )}

      {/* User + Logout */}
      {userName && (
        <div className="pt-4 border-t border-gray-200 dark:border-dark-hover flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="bg-green-600/10 p-1.5 rounded-lg flex-shrink-0">
              <User size={14} className="text-green-600" />
            </div>
            <span className="text-sm font-medium text-gray-700 dark:text-dark-text truncate">{userName}</span>
          </div>
          <button
            onClick={onLogout}
            title="Sign out"
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex-shrink-0"
          >
            <LogOut size={15} />
          </button>
        </div>
      )}

      {/* Theme Toggle */}
      <div className="pt-4 pb-6 border-t border-gray-200 dark:border-dark-hover">
        <button
          onClick={onToggleTheme}
          className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-gray-200/50 dark:bg-dark-hover/50 hover:bg-gray-200 dark:hover:bg-dark-hover transition-all group"
        >
          <span className="text-sm font-medium text-gray-700 dark:text-dark-text">
            {theme === "light" ? "Dark Mode" : "Light Mode"}
          </span>
          <div className="p-1.5 bg-white dark:bg-dark-surface rounded-lg shadow-sm group-hover:scale-110 transition-transform">
            {theme === "light" ? (
              <Moon size={16} className="text-blue-600" />
            ) : (
              <Sun size={16} className="text-yellow-400" />
            )}
          </div>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed md:hidden bottom-6 right-6 z-50 p-4 bg-green-600 text-white rounded-full shadow-2xl hover:bg-green-700 transition-transform active:scale-95"
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed md:hidden inset-0 bg-black/60 backdrop-blur-sm z-30 transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed md:sticky top-0 left-0 h-screen w-72 bg-gray-50 dark:bg-dark-surface border-r border-gray-200 dark:border-dark-hover p-6 overflow-y-auto z-40 transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <button
          onClick={() => { onNavigate("home"); setIsOpen(false); }}
          className="flex items-center gap-3 mb-10 px-2 hover:opacity-80 transition-opacity text-left w-full"
        >
          <div className="bg-green-600 p-2 rounded-lg text-white">
            <BookOpen size={24} />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">
            Lexio
          </h1>
        </button>
        {sidebarContent}
      </div>
    </>
  );
}
