import { describe, it, expect } from "vitest";
import { toGoogleLang, fromGoogleLang } from "../lib/translate";

describe("toGoogleLang", () => {
  it("normalizes pt-BR to pt", () => {
    expect(toGoogleLang("pt-BR")).toBe("pt");
  });

  it("passes through standard language codes unchanged", () => {
    expect(toGoogleLang("en")).toBe("en");
    expect(toGoogleLang("ja")).toBe("ja");
    expect(toGoogleLang("fr")).toBe("fr");
    expect(toGoogleLang("es")).toBe("es");
    expect(toGoogleLang("ko")).toBe("ko");
  });
});

describe("fromGoogleLang", () => {
  it("maps pt back to pt-BR", () => {
    expect(fromGoogleLang("pt")).toBe("pt-BR");
  });

  it("passes through other codes unchanged", () => {
    expect(fromGoogleLang("en")).toBe("en");
    expect(fromGoogleLang("ja")).toBe("ja");
    expect(fromGoogleLang("fr")).toBe("fr");
  });
});
