import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AuthLayout, SubmitButton } from "@/components/auth/AuthLayout";
import { PasswordField } from "@/components/auth/PasswordField";
import { AUTH_REDIRECT, supabase } from "@/integrations/supabase/client";
import { checkPassword } from "@/lib/password";

type State = "checking" | "ready" | "invalid";

/**
 * Landing page for the password-reset email. Only works on a page load that came
 * from that email (AUTH_REDIRECT.recovery); an ordinary signed-in visit can't use
 * it to change the password without the current one (that lives in Settings).
 */
const ResetPassword = () => {
  const navigate = useNavigate();
  const [state, setState] = useState<State>(AUTH_REDIRECT.recovery ? "checking" : "invalid");
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!AUTH_REDIRECT.recovery) return;
    let done = false;
    const accept = (userEmail: string | null | undefined) => {
      if (done) return;
      done = true;
      setEmail(userEmail ?? null);
      setState("ready");
    };
    // The client signs in from the link as it starts; wait for that session.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION")) accept(session.user.email);
    });
    supabase.auth.getSession().then(({ data }) => { if (data.session) accept(data.session.user.email); });
    const timer = setTimeout(() => { if (!done) setState("invalid"); }, 8000);
    return () => { subscription.unsubscribe(); clearTimeout(timer); };
  }, []);

  const check = checkPassword(password, email);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!check.ok) return toast.error(check.problems[0]);
    if (password !== confirm) return toast.error("The two passwords don't match");
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setSaving(false); return toast.error(error.message); }
    // A reset usually means the old password may be known to someone else.
    await supabase.auth.signOut({ scope: "others" });
    setSaving(false);
    toast.success("Password updated. Other devices have been signed out");
    navigate("/dashboard", { replace: true });
  };

  if (state !== "ready") {
    return (
      <AuthLayout
        title={state === "checking" ? "Checking your link" : "This link can't be used"}
        subtitle={
          state === "checking"
            ? "One moment."
            : AUTH_REDIRECT.error
              ? `${AUTH_REDIRECT.error}. Reset links work once and expire after an hour.`
              : "Reset links work once and expire after an hour. Request a new one to set your password."
        }
        footer={<>Remembered it? <Link to="/login" className="text-primary hover:underline">Log in</Link></>}
      >
        {state === "invalid" && (
          <Link to="/forgot-password" className="block w-full rounded-xl bg-primary py-3.5 text-center font-semibold text-primary-foreground transition hover:bg-primary-glow">
            Send a new link
          </Link>
        )}
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Set a new password"
      subtitle={email ? `For ${email}. You'll stay signed in on this device.` : "You'll stay signed in on this device."}
      footer={<>Changed your mind? <Link to="/dashboard" className="text-primary hover:underline">Go to the dashboard</Link></>}
    >
      <form className="space-y-5" onSubmit={onSubmit}>
        <PasswordField label="New password" name="new-password" value={password} onChange={setPassword}
          autoComplete="new-password" placeholder="A few words make a strong password" meter email={email} />
        <PasswordField label="Confirm new password" name="confirm-password" value={confirm} onChange={setConfirm}
          autoComplete="new-password" />
        <SubmitButton>{saving ? "Saving…" : "Save new password"}</SubmitButton>
      </form>
    </AuthLayout>
  );
};

export default ResetPassword;
