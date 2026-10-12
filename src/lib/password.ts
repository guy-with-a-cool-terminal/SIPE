// Password rules shared by sign-up, reset and change-password.
//
// Follows current guidance (NIST 800-63B): length matters most, block passwords
// that are common or built from the user's own email, and don't force arbitrary
// symbol rules. Supabase enforces its own minimum server-side too; keep the
// project's "Minimum password length" in the dashboard at MIN_LENGTH or above.

export const MIN_LENGTH = 10;

// The most common passwords and the patterns people reach for first.
const COMMON = new Set([
  "password", "password1", "password12", "password123", "passw0rd", "p@ssw0rd", "p@ssword",
  "123456", "1234567", "12345678", "123456789", "1234567890", "0123456789", "987654321",
  "qwerty", "qwerty123", "qwertyuiop", "asdfghjkl", "zxcvbnm", "1q2w3e4r", "1qaz2wsx",
  "letmein", "welcome", "welcome1", "welcome123", "admin", "admin123", "iloveyou",
  "monkey", "dragon", "football", "baseball", "sunshine", "princess", "trustno1",
  "abc123", "abcd1234", "abcdefgh", "abcdefghij", "changeme", "secret", "starwars",
  "kenya", "kenya123", "nairobi", "nairobi123", "mpesa", "mpesa123", "safaricom", "sipe", "sipe1234",
]);

export interface PasswordCheck {
  ok: boolean;
  /** 0 (very weak) to 4 (strong). */
  score: 0 | 1 | 2 | 3 | 4;
  label: "Too weak" | "Weak" | "Fair" | "Good" | "Strong";
  /** What to fix, in plain words. Empty when ok. */
  problems: string[];
}

const LABELS = ["Too weak", "Weak", "Fair", "Good", "Strong"] as const;

export function checkPassword(password: string, email?: string | null): PasswordCheck {
  const pw = password ?? "";
  const lower = pw.toLowerCase();
  const problems: string[] = [];

  if (pw.length < MIN_LENGTH) problems.push(`Use at least ${MIN_LENGTH} characters`);

  const stripped = lower.replace(/[^a-z0-9]/g, "");
  if (COMMON.has(lower) || COMMON.has(stripped) || COMMON.has(stripped.replace(/\d+$/, ""))) {
    problems.push("This is one of the most common passwords");
  }

  // "jane.wanjiru.dev@x.com" → ["jane", "wanjiru"]; any one of them in the password counts.
  const parts = (email ?? "").split("@")[0]?.toLowerCase().split(/[^a-z0-9]+/).filter((p) => p.length >= 4) ?? [];
  if (parts.some((p) => stripped.includes(p))) problems.push("Don't build it from your email address");

  if (pw.length > 0 && new Set(pw).size <= 3) problems.push("Use more than a few different characters");

  // Score: length carries most of the weight; variety adds a little.
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  let score = pw.length >= 16 ? 3 : pw.length >= 12 ? 2 : pw.length >= MIN_LENGTH ? 1 : 0;
  if (classes >= 3 && score > 0) score += 1;
  if (problems.length) score = Math.min(score, 1);
  const s = Math.max(0, Math.min(4, score)) as PasswordCheck["score"];

  return { ok: problems.length === 0, score: s, label: LABELS[s], problems };
}
