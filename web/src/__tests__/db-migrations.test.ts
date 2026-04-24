import { describe, it, expect } from "vitest";

/**
 * DB migration logic tests.
 *
 * Rather than running Dexie against a real IndexedDB (which requires fake-indexeddb
 * setup), we extract the migration logic into testable pure functions and verify
 * the transform rules directly. This gives confidence that the upgrade callbacks
 * in db.ts compute the correct new values.
 */

// ---------------------------------------------------------------------------
// v9: langWord key format migration
// Old format: "<lang><word>" (e.g. "enhello")
// New format: "<lang>|<word>" (e.g. "en|hello")
// ---------------------------------------------------------------------------
interface WordCountRow {
  langWord: string;
  lang: string;
  word: string;
  count: number;
  lastEncountered: number;
}

/** Mirrors the filter + transform logic in the v9 upgrade callback. */
function applyV9Migration(rows: WordCountRow[]): {
  toDelete: string[];
  toAdd: WordCountRow[];
} {
  const toMigrate = rows.filter((c) => !c.langWord.includes("|"));
  return {
    toDelete: toMigrate.map((c) => c.langWord),
    toAdd: toMigrate.map((c) => ({ ...c, langWord: `${c.lang}|${c.word}` })),
  };
}

describe("v9 migration: langWord separator 'enlang' → 'en|lang'", () => {
  const oldRows: WordCountRow[] = [
    { langWord: "enhello", lang: "en", word: "hello", count: 5, lastEncountered: 1000 },
    { langWord: "jaこんにちは", lang: "ja", word: "こんにちは", count: 3, lastEncountered: 2000 },
  ];

  it("identifies rows missing the pipe separator for migration", () => {
    const { toDelete } = applyV9Migration(oldRows);
    expect(toDelete).toContain("enhello");
    expect(toDelete).toContain("jaこんにちは");
  });

  it("generates new rows with the pipe-separated key format", () => {
    const { toAdd } = applyV9Migration(oldRows);
    expect(toAdd[0].langWord).toBe("en|hello");
    expect(toAdd[1].langWord).toBe("ja|こんにちは");
  });

  it("preserves all other fields (count, lang, word, lastEncountered) during migration", () => {
    const { toAdd } = applyV9Migration(oldRows);
    const enRow = toAdd.find((r) => r.lang === "en")!;
    expect(enRow.count).toBe(5);
    expect(enRow.word).toBe("hello");
    expect(enRow.lastEncountered).toBe(1000);
  });

  it("skips rows that already have the pipe separator", () => {
    const alreadyMigrated: WordCountRow[] = [
      { langWord: "en|hello", lang: "en", word: "hello", count: 1, lastEncountered: 3000 },
    ];
    const { toDelete, toAdd } = applyV9Migration(alreadyMigrated);
    expect(toDelete).toHaveLength(0);
    expect(toAdd).toHaveLength(0);
  });

  it("handles an empty table gracefully (no-op)", () => {
    const { toDelete, toAdd } = applyV9Migration([]);
    expect(toDelete).toHaveLength(0);
    expect(toAdd).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// v10: AppSettings defaults migration
// Adds languageOrder and translationTargetCount when absent.
// ---------------------------------------------------------------------------
interface PartialSettings {
  id?: string;
  languageOrder?: string[];
  translationTargetCount?: number;
}

/** Mirrors the per-row update logic in the v10 upgrade callback. */
function applyV10RowMigration(row: PartialSettings): Partial<PartialSettings> {
  const updates: Partial<PartialSettings> = {};
  if (!row.languageOrder) updates.languageOrder = ["ja", "en", "fr", "pt-BR", "es", "ko"];
  if (!row.translationTargetCount) updates.translationTargetCount = 1;
  return updates;
}

describe("v10 migration: add languageOrder and translationTargetCount defaults", () => {
  it("adds default languageOrder when missing", () => {
    const updates = applyV10RowMigration({ id: "settings" });
    expect(updates.languageOrder).toEqual(["ja", "en", "fr", "pt-BR", "es", "ko"]);
  });

  it("adds translationTargetCount: 1 when missing", () => {
    const updates = applyV10RowMigration({ id: "settings" });
    expect(updates.translationTargetCount).toBe(1);
  });

  it("does not overwrite existing languageOrder", () => {
    const updates = applyV10RowMigration({
      id: "settings",
      languageOrder: ["en", "fr"],
      translationTargetCount: 2,
    });
    expect(Object.keys(updates)).toHaveLength(0); // no updates needed
  });

  it("only adds missing fields, leaves present fields untouched", () => {
    const updates = applyV10RowMigration({
      id: "settings",
      languageOrder: ["en", "ja"],
      // translationTargetCount missing
    });
    expect(updates.languageOrder).toBeUndefined(); // not overwritten
    expect(updates.translationTargetCount).toBe(1);
  });

  it("languageOrder default contains all 6 supported languages", () => {
    const updates = applyV10RowMigration({});
    const defaultOrder = updates.languageOrder!;
    expect(defaultOrder).toContain("ja");
    expect(defaultOrder).toContain("en");
    expect(defaultOrder).toContain("fr");
    expect(defaultOrder).toContain("pt-BR");
    expect(defaultOrder).toContain("es");
    expect(defaultOrder).toContain("ko");
    expect(defaultOrder).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// v14: AppSettings stopwordExceptions migration
// Adds stopwordExceptions: [] when absent.
// ---------------------------------------------------------------------------
interface PartialSettingsV14 {
  id?: string;
  stopwordExceptions?: string[];
}

/** Mirrors the per-row logic in the v14 upgrade callback. */
function needsV14Update(row: PartialSettingsV14): boolean {
  return !row.stopwordExceptions;
}

function applyV14RowMigration(row: PartialSettingsV14): Partial<PartialSettingsV14> {
  if (!row.stopwordExceptions) return { stopwordExceptions: [] };
  return {};
}

describe("v14 migration: add stopwordExceptions default", () => {
  it("identifies rows that need the update (missing stopwordExceptions)", () => {
    expect(needsV14Update({ id: "settings" })).toBe(true);
  });

  it("does not flag rows that already have stopwordExceptions", () => {
    expect(needsV14Update({ id: "settings", stopwordExceptions: [] })).toBe(false);
    expect(needsV14Update({ id: "settings", stopwordExceptions: ["bien"] })).toBe(false);
  });

  it("applies an empty array as the default", () => {
    const updates = applyV14RowMigration({ id: "settings" });
    expect(updates.stopwordExceptions).toEqual([]);
  });

  it("does not change rows that already have the field", () => {
    const updates = applyV14RowMigration({ id: "settings", stopwordExceptions: ["bien"] });
    expect(Object.keys(updates)).toHaveLength(0);
  });

  it("preserves existing non-empty stopwordExceptions", () => {
    const row = { id: "settings", stopwordExceptions: ["bien", "molto"] };
    const updates = applyV14RowMigration(row);
    expect(Object.keys(updates)).toHaveLength(0);
    expect(row.stopwordExceptions).toEqual(["bien", "molto"]); // unchanged
  });
});
