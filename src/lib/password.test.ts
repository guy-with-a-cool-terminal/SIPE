import { describe, expect, it } from "vitest";
import { MIN_LENGTH, checkPassword } from "./password";

describe("checkPassword", () => {
  it("rejects short passwords", () => {
    const r = checkPassword("abc12");
    expect(r.ok).toBe(false);
    expect(r.problems).toContain(`Use at least ${MIN_LENGTH} characters`);
    expect(r.score).toBe(0);
  });

  it("rejects common passwords, including with symbols or trailing digits", () => {
    expect(checkPassword("password123").ok).toBe(false);
    expect(checkPassword("P@ssw0rd").ok).toBe(false);
    expect(checkPassword("qwertyuiop").ok).toBe(false);
    expect(checkPassword("Nairobi2026").ok).toBe(false);
  });

  it("rejects passwords built from the email", () => {
    const r = checkPassword("njugunabriian99", "njugunabriian.dev@gmail.com");
    expect(r.ok).toBe(false);
    expect(r.problems).toContain("Don't build it from your email address");
  });

  it("rejects one repeated character", () => {
    expect(checkPassword("aaaaaaaaaaaa").ok).toBe(false);
  });

  it("accepts a long passphrase and rates it strong", () => {
    const r = checkPassword("mango-matatu-river-42", "someone@example.com");
    expect(r.ok).toBe(true);
    expect(r.score).toBe(4);
    expect(r.label).toBe("Strong");
  });

  it("accepts a minimum-length password but rates it weak", () => {
    const r = checkPassword("tembolojia");
    expect(r.ok).toBe(true);
    expect(r.score).toBe(1);
  });
});
