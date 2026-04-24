import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout, Field, SubmitButton } from "@/components/auth/AuthLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const Register = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const full_name = String(fd.get("name") || "").trim();
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");
    if (!email || password.length < 8) return toast.error("Use a valid email and 8+ char password");

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
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
      title="Start splitting."
      subtitle="Three minutes. Then your income runs itself."
      footer={<>Already have an account? <Link to="/login" className="text-primary hover:underline">Log in</Link></>}
    >
      <form className="space-y-5" onSubmit={onSubmit}>
        <Field label="Full name" name="name" placeholder="Wanjiku Kamau" />
        <Field label="Email" name="email" type="email" placeholder="you@freelance.io" />
        <Field label="Password" name="password" type="password" placeholder="At least 8 characters" />
        <SubmitButton>{loading ? "Creating…" : "Create my account"}</SubmitButton>
        <p className="text-xs text-muted-foreground text-center">By signing up you agree to our Terms & Privacy.</p>
      </form>
    </AuthLayout>
  );
};
export default Register;
