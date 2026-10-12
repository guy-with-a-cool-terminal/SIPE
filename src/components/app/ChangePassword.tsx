import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PasswordField } from "@/components/auth/PasswordField";
import { checkPassword } from "@/lib/password";

const input = "!mt-0 py-2.5 text-base sm:text-sm";

/** Settings › Profile: change the password while signed in. Asks for the current one first. */
export const ChangePassword = () => {
  const { user } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.email) return;
    if (!current) return toast.error("Enter your current password");
    const check = checkPassword(next, user.email);
    if (!check.ok) return toast.error(check.problems[0]);
    if (next !== confirm) return toast.error("The two new passwords don't match");
    if (next === current) return toast.error("Choose a password different from your current one");

    setSaving(true);
    // Re-check the current password, so an unattended signed-in session can't be used to take over the account.
    const verify = await supabase.auth.signInWithPassword({ email: user.email, password: current });
    if (verify.error) {
      setSaving(false);
      return toast.error(/invalid/i.test(verify.error.message) ? "Your current password is incorrect" : verify.error.message);
    }
    const { error } = await supabase.auth.updateUser({ password: next });
    if (error) { setSaving(false); return toast.error(error.message); }
    if (signOutOthers) await supabase.auth.signOut({ scope: "others" });
    setSaving(false);
    setCurrent(""); setNext(""); setConfirm("");
    toast.success(signOutOthers ? "Password changed. Other devices have been signed out" : "Password changed");
  };

  return (
    <section className="glass rounded-2xl p-6">
      <h2 className="text-base font-semibold">Change password</h2>
      <p className="mt-1 mb-5 text-sm text-muted-foreground">
        A passphrase of three or four unrelated words is easy to remember and hard to guess.
      </p>
      <form onSubmit={submit} className="max-w-md space-y-4">
        {/* Lets password managers attach the new password to the right account. */}
        <input type="email" name="email" autoComplete="username" value={user?.email ?? ""} readOnly hidden />
        <PasswordField label="Current password" name="current-password" value={current} onChange={setCurrent}
          autoComplete="current-password" inputClassName={input} />
        <PasswordField label="New password" name="new-password" value={next} onChange={setNext}
          autoComplete="new-password" meter email={user?.email} inputClassName={input} />
        <PasswordField label="Confirm new password" name="confirm-password" value={confirm} onChange={setConfirm}
          autoComplete="new-password" inputClassName={input} />
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={signOutOthers} onChange={(e) => setSignOutOthers(e.target.checked)} className="size-4 accent-[hsl(var(--primary))]" />
          Sign out my other devices
        </label>
        <div className="flex flex-wrap items-center gap-4 pt-1">
          <button type="submit" disabled={saving} className="rounded-full bg-primary px-6 py-2.5 font-semibold text-primary-foreground transition hover:bg-primary-glow disabled:opacity-50">
            {saving ? "Saving…" : "Change password"}
          </button>
          <Link to="/forgot-password" className="text-sm text-muted-foreground transition hover:text-foreground">Forgot your current password?</Link>
        </div>
      </form>
    </section>
  );
};
