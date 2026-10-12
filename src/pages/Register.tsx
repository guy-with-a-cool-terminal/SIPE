import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout, Field, SubmitButton } from "@/components/auth/AuthLayout";
import { PasswordField } from "@/components/auth/PasswordField";
import { checkPassword } from "@/lib/password";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const Register = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const full_name = String(fd.get("name") || "").trim();
    if (!email.trim()) return toast.error("Enter your email");
    const check = checkPassword(password, email);
    if (!check.ok) return toast.error(check.problems[0]);

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { full_name },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Account created");
    navigate("/dashboard");
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Set your split once. Every payment after that is divided for you."
      footer={<>Already have an account? <Link to="/login" className="text-primary hover:underline">Log in</Link></>}
    >
      <form className="space-y-5" onSubmit={onSubmit}>
        <Field label="Full name" name="name" placeholder="Wanjiku Kamau" />
        <label className="block">
          <span className="text-sm text-muted-foreground">Email</span>
          <input
            name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@freelance.io"
            className="mt-2 w-full rounded-xl border border-border bg-input px-4 py-3 text-foreground transition placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </label>
        <PasswordField label="Password" name="password" value={password} onChange={setPassword} autoComplete="new-password"
          placeholder="A few words make a strong password" meter email={email} />
        <SubmitButton>{loading ? "Creating…" : "Create my account"}</SubmitButton>
        <p className="text-xs text-muted-foreground text-center">By signing up you agree to our Terms & Privacy.</p>
      </form>
    </AuthLayout>
  );
};
export default Register;
