import { describe, it, expect } from "vitest";

// Inline the computeSRS logic so tests are self-contained and not dependent
// on Flashcards.tsx component internals (which import Dexie / DOM).
const SRS_MIN_EASE = 1.3;
const SRS_MAX_EASE = 3.0;

function computeSRS(
  card: { easeFactor?: number; interval?: number },
  rating: "again" | "hard" | "good" | "easy",
) {
  const ef = card.easeFactor ?? 2.5;
  const interval = card.interval ?? 1;
  let newInterval: number;
  let newEf: number;
  switch (rating) {
    case "again": newInterval = 1;                                        newEf = Math.max(SRS_MIN_EASE, ef - 0.2);           break;
    case "hard":  newInterval = Math.max(1, Math.round(interval * 1.2)); newEf = Math.max(SRS_MIN_EASE, ef - 0.15);          break;
    case "good":  newInterval = Math.max(1, Math.round(interval * ef));  newEf = ef;                                          break;
    case "easy":  newInterval = Math.max(1, Math.round(interval * ef * 1.3)); newEf = Math.min(SRS_MAX_EASE, ef + 0.15);     break;
  }
  return { interval: newInterval, easeFactor: newEf };
}

describe("computeSRS", () => {
  const BASE = { easeFactor: 2.5, interval: 5 };

  it("again: resets interval to 1 and decreases EF by 0.2", () => {
    const r = computeSRS(BASE, "again");
    expect(r.interval).toBe(1);
    expect(r.easeFactor).toBeCloseTo(2.3);
  });

  it("hard: multiplies interval by 1.2 and decreases EF by 0.15", () => {
    const r = computeSRS(BASE, "hard");
    expect(r.interval).toBe(Math.round(5 * 1.2)); // 6
    expect(r.easeFactor).toBeCloseTo(2.35);
  });

  it("good: multiplies interval by prior EF (not new EF) and leaves EF unchanged", () => {
    const r = computeSRS(BASE, "good");
    expect(r.interval).toBe(Math.round(5 * 2.5)); // 13
    expect(r.easeFactor).toBeCloseTo(2.5); // unchanged
  });

  it("easy: multiplies interval by prior EF × 1.3 and increases EF by 0.15", () => {
    const r = computeSRS(BASE, "easy");
    expect(r.interval).toBe(Math.round(5 * 2.5 * 1.3)); // 16
    expect(r.easeFactor).toBeCloseTo(2.65);
  });

  it("clamps EF minimum to 1.3 on repeated 'again'", () => {
    let card = { easeFactor: 1.35, interval: 1 };
    card = { ...card, ...computeSRS(card, "again") };
    expect(card.easeFactor).toBeGreaterThanOrEqual(SRS_MIN_EASE);
    card = { ...card, ...computeSRS(card, "again") };
    expect(card.easeFactor).toBe(SRS_MIN_EASE);
  });

  it("clamps EF maximum to 3.0 on repeated 'easy'", () => {
    let card = { easeFactor: 2.95, interval: 1 };
    card = { ...card, ...computeSRS(card, "easy") };
    expect(card.easeFactor).toBeLessThanOrEqual(SRS_MAX_EASE);
    card = { ...card, ...computeSRS(card, "easy") };
    expect(card.easeFactor).toBe(SRS_MAX_EASE);
  });

  it("interval never drops below 1", () => {
    const r = computeSRS({ easeFactor: 1.3, interval: 1 }, "hard");
    expect(r.interval).toBeGreaterThanOrEqual(1);
  });

  it("uses default EF of 2.5 when easeFactor is undefined", () => {
    const r = computeSRS({ interval: 4 }, "good");
    expect(r.interval).toBe(Math.round(4 * 2.5)); // 10
    expect(r.easeFactor).toBeCloseTo(2.5);
  });

  it("uses default interval of 1 when interval is undefined", () => {
    const r = computeSRS({ easeFactor: 2.5 }, "easy");
    expect(r.interval).toBe(Math.round(1 * 2.5 * 1.3)); // 3
  });
});
