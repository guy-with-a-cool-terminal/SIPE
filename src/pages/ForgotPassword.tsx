import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AuthLayout, Field, SubmitButton } from "@/components/auth/AuthLayout";
import { supabase } from "@/integrations/supabase/client";

const ForgotPassword = () => {
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") || "").trim();
    if (!email) return toast.error("Enter your email");
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    // Rate limits are worth reporting; anything else gets the same answer so the
    // page never reveals whether an email has an account.
    if (error && /rate|too many|seconds/i.test(error.message)) return toast.error(error.message);
    setSentTo(email);
  };

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter the email you signed up with and we'll send you a link to set a new password."
      footer={<>Remembered it? <Link to="/login" className="text-primary hover:underline">Log in</Link></>}
    >
      {sentTo ? (
        <div className="rounded-xl border border-border bg-muted p-5 text-sm leading-relaxed">
          <p className="font-medium">Check your email</p>
          <p className="mt-1 text-muted-foreground">
            If <span className="text-foreground">{sentTo}</span> has a SIPE account, a reset link is on its way. It
            works once and expires in an hour. Check spam if it hasn't arrived in a few minutes.
          </p>
          <button onClick={() => setSentTo(null)} className="mt-3 text-primary hover:underline">Use a different email</button>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={onSubmit}>
          <Field label="Email" name="email" type="email" placeholder="you@freelance.io" />
          <SubmitButton>{loading ? "Sending…" : "Send reset link"}</SubmitButton>
        </form>
      )}
    </AuthLayout>
  );
};

export default ForgotPassword;
