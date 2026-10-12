import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout, Field, SubmitButton } from "@/components/auth/AuthLayout";
import { PasswordField } from "@/components/auth/PasswordField";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const Login = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") || "").trim();
    if (!email || !password) return toast.error("Email and password required");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back");
    navigate("/dashboard");
  };

  return (
    <AuthLayout
      title="Log in"
      subtitle="See what each bucket holds today."
      footer={<>New to sipe? <Link to="/register" className="text-primary hover:underline">Create an account</Link></>}
    >
      <form className="space-y-5" onSubmit={onSubmit}>
        <Field label="Email" name="email" type="email" placeholder="you@freelance.io" />
        <div>
          <PasswordField label="Password" name="password" value={password} onChange={setPassword} autoComplete="current-password" />
          <Link to="/forgot-password" className="mt-1 inline-block py-2 text-sm text-primary hover:underline">Forgot password?</Link>
        </div>
        <SubmitButton>{loading ? "Signing in…" : "Log in"}</SubmitButton>
      </form>
    </AuthLayout>
  );
};
export default Login;
