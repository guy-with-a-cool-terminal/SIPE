import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import { roleLabel, ROLES, type Role } from "@/lib/projects";

interface Invite { project: string; one_liner: string | null; role: Role; email: string; status: string; invited_by: string }

const btn = "w-full rounded-xl bg-primary py-3 font-semibold text-primary-foreground transition hover:bg-primary-glow disabled:opacity-50";

/**
 * /join/:token, the page an invite email links to. Signed out: we email a
 * sign-in link to the invited address (no password needed) that comes back
 * here. Signed in with the invited email: the invite is accepted straight away.
 */
const Join = () => {
  usePageTitle("Join a project");
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, loading, signOut } = useAuth();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const tried = useRef(false);

  const { data: invite, isLoading } = useQuery({
    queryKey: ["invite", token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_project_invite", { p_token: token });
      if (error) throw error;
      return data as Invite | null;
    },
    retry: false,
  });

  const emailMatches = !!user && !!invite && user.email?.toLowerCase() === invite.email.toLowerCase();

  useEffect(() => {
    if (!emailMatches || tried.current) return;
    tried.current = true;
    (async () => {
      setBusy(true);
      const { data, error } = await supabase.rpc("accept_project_invite", { p_token: token });
      setBusy(false);
      if (error) return setFailed(error.message.replace(/^[a-z_]+:\s*/, ""));
      qc.invalidateQueries();
      toast.success(`You've joined ${invite!.project}`);
      navigate(`/projects/${data}`, { replace: true });
    })();
  }, [emailMatches, token, invite, navigate, qc]);

  const sendLink = async () => {
    if (!invite) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: invite.email,
      options: { emailRedirectTo: `${window.location.origin}/join/${token}`, shouldCreateUser: true },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setSent(true);
  };

  let body: React.ReactNode;
  if (isLoading || loading) {
    body = <p className="text-muted-foreground">Loading…</p>;
  } else if (!invite) {
    body = (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">This invite link isn't valid any more</h1>
        <p className="mt-2 text-muted-foreground">It may have been used already, or cancelled. Ask whoever invited you to send a new one.</p>
        <Link to={user ? "/projects" : "/login"} className="mt-6 inline-block font-medium text-primary">{user ? "Go to your projects →" : "Log in →"}</Link>
      </>
    );
  } else {
    const heading = (
      <>
        <p className="text-sm text-muted-foreground">{invite.invited_by} invited you to</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{invite.project}</h1>
        {invite.one_liner && <p className="mt-2 text-muted-foreground">{invite.one_liner}</p>}
        <p className="mt-4 rounded-xl bg-muted px-4 py-3 text-sm">
          As a <b>{roleLabel(invite.role).toLowerCase()}</b>: {ROLES.find((r) => r.key === invite.role)?.blurb.toLowerCase()} You'll only see this project.
        </p>
      </>
    );
    if (user && !emailMatches) {
      body = (
        <>
          {heading}
          <p className="mt-6 text-sm">This invite is for <b>{invite.email}</b>, but you're signed in as <b>{user.email}</b>.</p>
          <button onClick={async () => { await signOut(); tried.current = false; }} className={`${btn} mt-4`}>Sign out and continue as {invite.email}</button>
        </>
      );
    } else if (user) {
      body = (
        <>
          {heading}
          <p className="mt-6 text-sm text-muted-foreground">{failed ?? (busy ? "Joining…" : "Joining…")}</p>
        </>
      );
    } else if (sent) {
      body = (
        <>
          <div className="mb-4 grid size-12 place-items-center rounded-full bg-primary/10 text-primary"><Mail className="size-6" /></div>
          <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
          <p className="mt-2 text-muted-foreground">We sent a sign-in link to <b>{invite.email}</b>. Open it on this device and you'll land in {invite.project}.</p>
          <button onClick={sendLink} disabled={busy} className="mt-6 text-sm font-medium text-primary">Send it again</button>
        </>
      );
    } else {
      body = (
        <>
          {heading}
          <button onClick={sendLink} disabled={busy} className={`${btn} mt-6`}>{busy ? "Sending…" : `Email me a sign-in link`}</button>
          <p className="mt-2 text-center text-xs text-muted-foreground">Goes to {invite.email}. No password needed.</p>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already use SIPE with a password?{" "}
            <Link to={`/login?next=${encodeURIComponent(`/join/${token}`)}&email=${encodeURIComponent(invite.email)}`} className="font-medium text-primary">Log in</Link>
          </p>
        </>
      );
    }
  }

  return (
    <div className="flex min-h-screen flex-col px-5 py-6 sm:p-10">
      <Link to="/" className="flex w-fit items-center gap-2">
        <img src="/logo.svg" alt="" className="size-8" />
        <span className="text-xl font-bold tracking-tight">sipe</span>
      </Link>
      <div className="grid flex-1 place-items-center py-12">
        <div className="w-full max-w-sm">{body}</div>
      </div>
    </div>
  );
};

export default Join;
