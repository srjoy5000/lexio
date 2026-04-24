import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, ManualText, FavoriteSite } from "../db";
import { API_BASE } from "../lib/api";
import { LANGUAGES } from "../lib/types";
import { LANGUAGE_NAMES } from "../lib/constants";
import { detectLangFromUrl } from "../lib/utils";
import {
  ChevronLeft, Trash2, Edit2, Check, X, Search,
  FileText, Globe, Plus, ExternalLink, RefreshCw,
} from "lucide-react";

interface LibraryProps {
  onBack: () => void;
  onOpenText: (body: string, title: string, url: string) => void;
  onAddText: () => void;
}

type Tab = "texts" | "websites";

interface EditState { title: string; url: string; body: string; }


export default function Library({ onBack, onOpenText, onAddText }: LibraryProps) {
  const [tab, setTab] = useState<Tab>(() => (localStorage.getItem("library.tab") as Tab) || "texts");
  const [searchQuery, setSearchQuery] = useState("");

  // ── Texts state ──────────────────────────────────────────────────────
  const [texts, setTexts] = useState<ManualText[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editState, setEditState] = useState<EditState>({ title: "", url: "", body: "" });

  useEffect(() => { loadTexts(); }, []);

  const loadTexts = async () => {
    const all = await db.manualTexts.orderBy("addedAt").reverse().toArray();
    setTexts(all);
  };

  const handleDeleteText = async (id?: number) => {
    if (!id) return;
    if (window.confirm("Delete this text?")) { await db.manualTexts.delete(id); await loadTexts(); }
  };

  const startEdit = (text: ManualText) => {
    setEditingId(text.id ?? null);
    setEditState({ title: text.title, url: text.url, body: text.body });
  };

  const saveEdit = async (id?: number) => {
    if (!id) return;
    await db.manualTexts.update(id, {
      title: editState.title.trim() || "Untitled",
      url: editState.url.trim(),
      body: editState.body.trim(),
    });
    setEditingId(null);
    await loadTexts();
  };

  const filteredTexts = texts.filter(
    (t) =>
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.body.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // ── Websites state ───────────────────────────────────────────────────
  const [newUrl, setNewUrl] = useState(() => localStorage.getItem("wb.newUrl") || "");
  const [newTitle, setNewTitle] = useState(() => localStorage.getItem("wb.newTitle") || "");
  const [newLang, setNewLang] = useState(() => localStorage.getItem("wb.newLang") || "en");
  const [fetchingTitle, setFetchingTitle] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
  const [showAddSite, setShowAddSite] = useState(false);

  const sites = useLiveQuery<FavoriteSite[]>(
    () => db.favoriteSites.toArray().then((all) => all.sort((a, b) => b.addedAt - a.addedAt)),
    [],
  );

  const persistUrl   = (v: string) => { setNewUrl(v);   localStorage.setItem("wb.newUrl",   v); };
  const persistTitle = (v: string) => { setNewTitle(v); localStorage.setItem("wb.newTitle", v); };
  const persistLang  = (v: string) => { setNewLang(v);  localStorage.setItem("wb.newLang",  v); };

  const handleUrlBlur = async () => {
    if (!newUrl.trim()) return;
    const detected = detectLangFromUrl(newUrl.trim());
    if (detected && detected !== "en") persistLang(detected);
    if (!newTitle.trim()) await handleFetchTitle();
  };

  const handleFetchTitle = async () => {
    if (!newUrl.trim()) return;
    setFetchingTitle(true); setAddError(null);
    try {
      const _res = await fetch(`${API_BASE}/api/extract-article`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: newUrl.trim() }),
      });
      if (!_res.ok) throw new Error(`HTTP ${_res.status}`);
      persistTitle(((await _res.json()) as { title: string }).title || new URL(newUrl.trim()).hostname);
    } catch {
      try { persistTitle(new URL(newUrl.trim()).hostname); } catch { setAddError("Invalid URL."); }
    } finally { setFetchingTitle(false); }
  };

  const handleAddSite = async () => {
    const url = newUrl.trim();
    if (!url) { setAddError("URL is required."); return; }
    const all = await db.favoriteSites.toArray();
    if (all.some((s) => s.url === url)) { setAddError("This URL is already saved."); return; }
    let title = newTitle.trim();
    if (!title) {
      setFetchingTitle(true);
      try {
        const _r = await fetch(`${API_BASE}/api/extract-article`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        if (!_r.ok) throw new Error(`HTTP ${_r.status}`);
        title = ((await _r.json()) as { title: string }).title || new URL(url).hostname;
      } catch { try { title = new URL(url).hostname; } catch { title = url; } }
      finally { setFetchingTitle(false); }
    }
    await db.favoriteSites.add({ url, title, lang: newLang, addedAt: Date.now() });
    persistUrl(""); persistTitle(""); persistLang("en");
    setAddError(null);
    setAddSuccess(`"${title}" added!`);
    setShowAddSite(false);
    setTimeout(() => setAddSuccess(null), 2500);
  };

  const handleDeleteSite = async (id?: number) => {
    if (!id) return;
    if (window.confirm("Remove this website?")) await db.favoriteSites.delete(id);
  };

  const filteredSites = (sites || []).filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.url.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const changeTab = (t: Tab) => { setTab(t); localStorage.setItem("library.tab", t); setSearchQuery(""); };

  return (
    <div className="w-full min-h-screen bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text pb-16 transition-colors duration-200">

      {/* Header */}
      <div className="sticky top-0 z-40 bg-white dark:bg-dark-surface border-b border-gray-200 dark:border-dark-hover">
        <div className="px-6 md:px-8 py-4 flex flex-wrap items-center gap-3">
          <button onClick={onBack}
            className="flex items-center gap-2 text-gray-600 dark:text-dark-muted hover:text-green-600 transition-colors font-medium">
            <ChevronLeft size={20} /> Back
          </button>

          <h1 className="text-xl font-bold">Library</h1>

          {/* Tabs */}
          <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-dark-hover text-sm font-bold">
            <button onClick={() => changeTab("texts")}
              className={`flex items-center gap-1.5 px-4 py-2 transition-colors ${tab === "texts" ? "bg-green-600 text-white" : "bg-white dark:bg-dark-bg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-hover"}`}>
              <FileText size={14} /> Texts ({texts.length})
            </button>
            <button onClick={() => changeTab("websites")}
              className={`flex items-center gap-1.5 px-4 py-2 transition-colors ${tab === "websites" ? "bg-green-600 text-white" : "bg-white dark:bg-dark-bg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-hover"}`}>
              <Globe size={14} /> Websites ({sites?.length ?? 0})
            </button>
          </div>

          <div className="flex-1" />

          {/* Action buttons */}
          {tab === "texts" ? (
            <button onClick={onAddText}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold text-sm transition-all shadow-md shadow-green-600/20">
              <Plus size={15} /> Add Text
            </button>
          ) : (
            <button onClick={() => setShowAddSite((p) => !p)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-sm transition-all ${showAddSite ? "bg-gray-200 dark:bg-dark-hover text-gray-700 dark:text-white" : "bg-green-600 hover:bg-green-700 text-white shadow-md shadow-green-600/20"}`}>
              <Plus size={15} /> Add Site
            </button>
          )}

          {/* Search */}
          <div className="relative w-full sm:w-60">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${tab}...`}
              className="w-full pl-8 pr-3 py-2 bg-gray-100 dark:bg-dark-hover border border-gray-200 dark:border-dark-muted rounded-lg text-sm text-gray-900 dark:text-white outline-none focus:border-green-400"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-6 md:px-8 py-8 max-w-4xl space-y-4">

        {/* ── Texts Tab ── */}
        {tab === "texts" && (
          filteredTexts.length === 0 ? (
            <div className="rounded-3xl border border-gray-200 dark:border-dark-hover bg-gray-50 dark:bg-dark-surface p-12 text-center text-gray-500 dark:text-dark-muted">
              {texts.length === 0
                ? "No saved texts. Use \"Add Text\" or paste in the Reader to save."
                : "No results."}
            </div>
          ) : (
            filteredTexts.map((text) => (
              <div key={text.id} className="rounded-2xl border border-gray-200 dark:border-dark-hover bg-white dark:bg-dark-surface shadow-sm overflow-hidden">
                {editingId === text.id ? (
                  <div className="p-6 space-y-3">
                    <input value={editState.title}
                      onChange={(e) => setEditState((p) => ({ ...p, title: e.target.value }))}
                      placeholder="Title"
                      className="w-full p-3 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-hover rounded-xl text-gray-900 dark:text-white font-semibold outline-none focus:ring-2 focus:ring-green-500"
                    />
                    <input value={editState.url}
                      onChange={(e) => setEditState((p) => ({ ...p, url: e.target.value }))}
                      placeholder="Source URL"
                      className="w-full p-3 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-hover rounded-xl text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-green-500"
                    />
                    <textarea value={editState.body}
                      onChange={(e) => setEditState((p) => ({ ...p, body: e.target.value }))}
                      rows={5}
                      className="w-full p-3 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-hover rounded-xl text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-green-500 resize-none"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => saveEdit(text.id)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold text-sm">
                        <Check size={15} /> Save
                      </button>
                      <button onClick={() => setEditingId(null)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-gray-200 dark:bg-dark-hover text-gray-700 dark:text-white rounded-lg font-bold text-sm">
                        <X size={15} /> Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="p-5 pb-3">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-lg text-gray-900 dark:text-white truncate">{text.title}</h3>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-[10px] bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 px-2 py-0.5 rounded-full font-black uppercase tracking-widest">
                              {LANGUAGE_NAMES[text.lang as keyof typeof LANGUAGE_NAMES] || text.lang}
                            </span>
                            <span className="text-xs text-gray-400 dark:text-dark-muted">
                              {new Date(text.addedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                            </span>
                            {text.url && (
                              <a href={text.url} target="_blank" rel="noopener noreferrer"
                                className="text-xs text-blue-500 hover:underline truncate max-w-[200px]">
                                {text.url}
                              </a>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1.5 flex-shrink-0">
                          <button onClick={() => startEdit(text)}
                            className="p-2 rounded-xl bg-gray-100 dark:bg-dark-hover text-gray-500 hover:text-gray-700 dark:hover:text-white transition-colors">
                            <Edit2 size={15} />
                          </button>
                          <button onClick={() => handleDeleteText(text.id)}
                            className="p-2 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-500 hover:text-red-700 transition-colors">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 leading-relaxed">{text.body}</p>
                    </div>
                    <div className="px-5 pb-4">
                      <button onClick={() => onOpenText(text.body, text.title, text.url)}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold text-sm transition-all shadow-sm shadow-green-600/20">
                        Open in Reader
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )
        )}

        {/* ── Websites Tab ── */}
        {tab === "websites" && (
          <>
            {/* Add form (collapsible) */}
            {showAddSite && (
              <div className="rounded-2xl border border-gray-200 dark:border-dark-hover bg-white dark:bg-dark-surface shadow-sm p-6 space-y-3">
                <h2 className="text-sm font-bold text-gray-700 dark:text-white uppercase tracking-widest">Add New Site</h2>
                <div className="flex gap-2">
                  <input type="url" value={newUrl}
                    onChange={(e) => persistUrl(e.target.value)}
                    onBlur={handleUrlBlur}
                    placeholder="https://example.com"
                    className="flex-1 p-3 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-hover rounded-xl text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <button onClick={handleFetchTitle} disabled={fetchingTitle || !newUrl.trim()}
                    className="px-3 py-2 bg-gray-100 dark:bg-dark-hover rounded-xl hover:bg-gray-200 text-gray-600 dark:text-white disabled:opacity-40 transition-all">
                    <RefreshCw size={15} className={fetchingTitle ? "animate-spin" : ""} />
                  </button>
                </div>
                <input type="text" value={newTitle}
                  onChange={(e) => persistTitle(e.target.value)}
                  placeholder="Title (auto-fetched if blank)"
                  className="w-full p-3 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-hover rounded-xl text-sm font-semibold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-green-500"
                />
                <div className="flex gap-3">
                  <select value={newLang} onChange={(e) => persistLang(e.target.value)}
                    className="flex-1 p-3 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-hover rounded-xl text-sm text-gray-900 dark:text-white outline-none">
                    {Object.entries(LANGUAGES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                  </select>
                  <button onClick={handleAddSite} disabled={fetchingTitle || !newUrl.trim()}
                    className="flex items-center gap-2 px-5 py-3 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white rounded-xl font-bold text-sm transition-all shadow-md shadow-green-600/20">
                    <Plus size={16} /> Add
                  </button>
                </div>
                {addError && <p className="text-sm text-red-600 dark:text-red-300 font-medium">{addError}</p>}
              </div>
            )}

            {addSuccess && (
              <p className="text-sm text-green-600 dark:text-green-400 font-bold px-2">{addSuccess}</p>
            )}

            {filteredSites.length === 0 ? (
              <div className="rounded-3xl border border-gray-200 dark:border-dark-hover bg-gray-50 dark:bg-dark-surface p-12 text-center text-gray-500 dark:text-dark-muted">
                <Globe size={40} className="mx-auto mb-3 opacity-20" />
                {(sites?.length ?? 0) === 0
                  ? "No saved sites. Add websites you regularly read for quick access in the Reader."
                  : "No results."}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredSites.map((site) => (
                  <div key={site.id}
                    className="flex items-center gap-4 p-4 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-hover rounded-xl shadow-sm group hover:border-green-300 dark:hover:border-green-700 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 rounded-full">
                          {site.lang}
                        </span>
                        <h3 className="font-bold text-gray-900 dark:text-white truncate">{site.title}</h3>
                      </div>
                      <p className="text-xs text-gray-400 dark:text-dark-muted truncate">{site.url}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <a href={site.url} target="_blank" rel="noopener noreferrer"
                        className="p-2 rounded-lg bg-gray-100 dark:bg-dark-hover hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-500 hover:text-blue-600 transition-all"
                        title="Open">
                        <ExternalLink size={15} />
                      </a>
                      <button onClick={() => handleDeleteSite(site.id)}
                        className="p-2 rounded-lg bg-gray-100 dark:bg-dark-hover hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-500 hover:text-red-600 transition-all"
                        title="Remove">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
