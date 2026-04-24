import { describe, it, expect } from "vitest";

// Inline the pure security functions from AuthScreen.tsx so tests don't import
// the component (which depends on Dexie and DOM elements).

async function generateSalt(): Promise<string> {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

describe("generateSalt", () => {
  it("generates a 32-character hex string (16 bytes → 32 hex chars)", async () => {
    const salt = await generateSalt();
    expect(salt).toHaveLength(32);
    expect(/^[0-9a-f]+$/.test(salt)).toBe(true);
  });

  it("generates a different salt each call (probabilistically unique)", async () => {
    const s1 = await generateSalt();
    const s2 = await generateSalt();
    expect(s1).not.toBe(s2);
  });
});

describe("hashPassword", () => {
  it("returns a 64-character hex SHA-256 hash (32 bytes → 64 hex chars)", async () => {
    const hash = await hashPassword("password123", "abc123");
    expect(hash).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
  });

  it("same password + same salt always produces the same hash (deterministic)", async () => {
    const salt = "fixedsalt0000000";
    const h1 = await hashPassword("mypassword", salt);
    const h2 = await hashPassword("mypassword", salt);
    expect(h1).toBe(h2);
  });

  it("same password + different salt produces different hashes", async () => {
    const h1 = await hashPassword("mypassword", "salt_one_xxxxxxx");
    const h2 = await hashPassword("mypassword", "salt_two_xxxxxxx");
    expect(h1).not.toBe(h2);
  });

  it("different passwords + same salt produce different hashes", async () => {
    const salt = "shared_salt_0000";
    const h1 = await hashPassword("password1", salt);
    const h2 = await hashPassword("password2", salt);
    expect(h1).not.toBe(h2);
  });

  it("empty password still produces a valid 64-char hash", async () => {
    const hash = await hashPassword("", "somesalt00000000");
    expect(hash).toHaveLength(64);
  });

  it("empty salt still produces a valid 64-char hash", async () => {
    const hash = await hashPassword("mypassword", "");
    expect(hash).toHaveLength(64);
  });
});

describe("email normalization (login/register logic)", () => {
  it("trims leading and trailing whitespace", () => {
    expect("  user@example.com  ".trim()).toBe("user@example.com");
  });

  it("lowercases the email address", () => {
    expect("User@Example.COM".toLowerCase()).toBe("user@example.com");
  });

  it("trims and lowercases together (as used in AuthScreen)", () => {
    const normalize = (e: string) => e.trim().toLowerCase();
    expect(normalize("  User@Example.COM  ")).toBe("user@example.com");
    expect(normalize("ADMIN@SITE.ORG")).toBe("admin@site.org");
    expect(normalize("mixed.Case+tag@Domain.io")).toBe("mixed.case+tag@domain.io");
  });
});

describe("password verification (login correctness)", () => {
  it("correct password verifies successfully", async () => {
    const salt = await generateSalt();
    const storedHash = await hashPassword("secret", salt);
    const inputHash = await hashPassword("secret", salt);
    expect(inputHash).toBe(storedHash);
  });

  it("wrong password does not verify", async () => {
    const salt = await generateSalt();
    const storedHash = await hashPassword("correct", salt);
    const inputHash = await hashPassword("wrong", salt);
    expect(inputHash).not.toBe(storedHash);
  });

  it("password with different salt does not verify even if text matches", async () => {
    const salt1 = await generateSalt();
    const salt2 = await generateSalt();
    const storedHash = await hashPassword("secret", salt1);
    const inputHash = await hashPassword("secret", salt2);
    expect(inputHash).not.toBe(storedHash);
  });
});
