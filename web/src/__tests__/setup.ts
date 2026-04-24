// Vitest global test setup
// Web Speech API is not available in jsdom — mock it so nlp.ts doesn't throw
Object.defineProperty(window, "speechSynthesis", {
  value: {
    speak: () => {},
    getVoices: () => [],
    addEventListener: () => {},
  },
  writable: true,
});
