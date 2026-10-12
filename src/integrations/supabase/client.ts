import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // eslint-disable-next-line no-console
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env");
}

/**
 * What the auth redirect in the URL said, read before createClient: the client
 * signs in from the URL fragment and then strips it. `recovery` is true only when
 * this page load came from a password-reset email, which is what lets
 * /reset-password set a new password without asking for the old one.
 */
const authParams = new URLSearchParams(
  `${window.location.search.slice(1)}&${window.location.hash.slice(1)}`,
);
export const AUTH_REDIRECT = {
  recovery: authParams.get("type") === "recovery",
  error: authParams.get("error_description"),
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: window.localStorage,
    detectSessionInUrl: true,
  },
});
