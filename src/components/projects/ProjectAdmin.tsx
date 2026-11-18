import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, Link2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatKES } from "@/integrations/supabase/types";
import { field } from "@/lib/forms";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { canEdit, moneySummary, roleLabel, ROLES, type Role } from "@/lib/projects";
import type { ProjectData } from "@/hooks/useProjects";
import { useInvalidateProjects } from "@/hooks/useProjects";
import { callFunction, dbMessage, fmtNum, primaryBtn, secondaryBtn, Section } from "./bits";
import { nameOf } from "./ProjectWork";
import { ProjectModal } from "./ProjectModal";

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------
export const MoneyTab = ({ d }: { d: ProjectData }) => {
  const { user } = useAuth();
  const invalidate = useInvalidateProjects();
  const { project: p, me, money, team } = d;
  const isOwner = me.role === "owner";
  const myHours = Number(money?.hours?.find((h) => h.user_id === user?.id)?.hours ?? 0);
  const s = moneySummary(money, me.share_pct, myHours);
  const owner = team.find((t) => t.role === "owner");
  const hasShare = me.role === "owner" || me.share_pct != null;
  const partShare = me.share_pct != null && Number(me.share_pct) !== 100;

  const toggleShare = async (on: boolean) => {
    const { error } = await supabase.from("projects").update({ money_shared: on }).eq("id", p.id);
    if (error) return toast.error(dbMessage(error));
    invalidate();
    toast.success(on ? "The team can now see this project's totals" : "Project money is private again");
  };

  return (
    <div className="space-y-5">
      {isOwner && (
        <Section>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Share project money with the team</p>
              <p className="text-sm text-muted-foreground">They'd see this page's totals only: income, costs and net for this project. Never your accounts, buckets or other income.</p>
            </div>
            <Switch checked={p.money_shared} onCheckedChange={toggleShare} aria-label="Share project money" />
          </div>
        </Section>
      )}

      {!s ? (
        <Section>
          <p className="text-sm text-muted-foreground">
            {nameOf(team, owner?.user_id ?? "", user?.id)} hasn't shared this project's money with the team.
          </p>
        </Section>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {(hasShare ? [
              { label: "Income, whole project", value: formatKES(s.income), sub: `${formatKES(s.income90)} in the last 90 days` },
              { label: partShare ? `Your share (${fmtNum(me.share_pct)}%)` : "Yours", value: formatKES(s.myShare) },
              { label: partShare ? "Costs, your share" : "Costs", value: formatKES(partShare ? s.myCosts : s.costs), sub: s.billsMonthly > 0 ? `${formatKES(s.billsMonthly)} a month in bills` : undefined },
              { label: "Net to you", value: formatKES(s.net), sub: s.perHour != null ? `${formatKES(s.perHour, { whole: true })} per hour logged` : "Log hours in check-ins to see per hour", tone: s.net < 0 ? "text-destructive" : "" },
            ] : [
              // No share in the project (contributors, viewers): whole-project figures only.
              { label: "Income, whole project", value: formatKES(s.income), sub: `${formatKES(s.income90)} in the last 90 days` },
              { label: "Costs, whole project", value: formatKES(s.costs), sub: s.billsMonthly > 0 ? `${formatKES(s.billsMonthly)} a month in bills` : undefined },
              { label: "Net, whole project", value: formatKES(s.income - s.costs), tone: s.income - s.costs < 0 ? "text-destructive" : "" },
              { label: "Still owed on invoices", value: formatKES(s.openInvoices) },
            ]).map((k) => (
              <div key={k.label} className="glass rounded-2xl p-4">
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className={cn("mt-1 text-xl font-bold tabular-nums", k.tone)}>{k.value}</p>
                {k.sub && <p className="mt-0.5 text-xs text-muted-foreground">{k.sub}</p>}
              </div>
            ))}
          </div>
          {s.openInvoices > 0 && <p className="text-sm text-muted-foreground">{formatKES(s.openInvoices)} still owed on this project's invoices.</p>}
          <Section title="By month">
            {(money?.months ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing tagged yet. When you record income or an expense, pick this project. Payment links and invoices can belong to a project too.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 font-medium">Month</th><th className="py-2 text-right font-medium">Income</th><th className="py-2 text-right font-medium">Costs</th><th className="py-2 text-right font-medium">Net</th>
                  </tr></thead>
                  <tbody>
                    {[...(money?.months ?? [])].reverse().map((m) => (
                      <tr key={m.month} className="border-b border-border last:border-0">
                        <td className="py-2">{new Date(`${m.month}-01T12:00:00`).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}</td>
                        <td className="py-2 text-right tabular-nums">{formatKES(Number(m.income))}</td>
                        <td className="py-2 text-right tabular-nums">{formatKES(Number(m.costs))}</td>
                        <td className={cn("py-2 text-right font-medium tabular-nums", Number(m.income) - Number(m.costs) < 0 && "text-destructive")}>{formatKES(Number(m.income) - Number(m.costs))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------
export const TeamTab = ({ d }: { d: ProjectData }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const invalidate = useInvalidateProjects();
  const { project: p, me, team } = d;
  const isOwner = me.role === "owner";
  const inviteRoles: Role[] = isOwner ? ["cofounder", "contributor", "viewer"] : ["contributor", "viewer"];
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("contributor");
  const [share, setShare] = useState("");
  const [sending, setSending] = useState(false);
  const [lastLink, setLastLink] = useState<{ email: string; link: string; emailed: boolean } | null>(null);
  const [leaving, setLeaving] = useState(false);

  const linkFor = (token: string) => `${window.location.origin}/join/${token}`;
  const copy = (s: string) => navigator.clipboard.writeText(s).then(() => toast.success("Link copied"));

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      const r = await callFunction<{ token: string; emailed: boolean }>("project-invite", {
        project_id: p.id, email, role, share_pct: role === "cofounder" && share ? Number(share) : null,
      });
      setLastLink({ email, link: linkFor(r.token), emailed: r.emailed });
      toast.success(r.emailed ? `Invite sent to ${email}` : "Invite created. The email didn't go out, so share the link yourself.");
      setEmail(""); setShare("");
      invalidate();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const update = async (id: string, patch: Record<string, unknown>) => {
    const { error } = await supabase.from("project_members").update(patch).eq("id", id);
    if (error) return toast.error(dbMessage(error));
    invalidate();
  };
  const remove = async (id: string) => {
    const { error } = await supabase.from("project_members").delete().eq("id", id);
    if (error) return toast.error(dbMessage(error));
    invalidate();
  };
  const leave = async () => {
    const { error } = await supabase.from("project_members").delete().eq("id", me.id);
    if (error) return toast.error(dbMessage(error));
    invalidate();
    toast.success(`You left ${p.name}`);
    navigate("/projects");
  };

  const pendingToken = async (memberId: string) => {
    const { data } = await supabase.from("project_members").select("invite_token").eq("id", memberId).maybeSingle();
    if (data?.invite_token) copy(linkFor(data.invite_token));
  };

  return (
    <div className="space-y-5">
      <Section title="Team">
        <ul className="divide-y divide-border">
          {team.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{t.user_id ? nameOf(team, t.user_id, user?.id) : t.email}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {t.status === "invited" ? "Invited, not joined yet" : t.email}
                  {t.share_pct != null && ` · ${fmtNum(t.share_pct)}% share`}
                </p>
              </div>
              {isOwner && t.role !== "owner" ? (
                <select value={t.role} onChange={(e) => update(t.id, { role: e.target.value })} className="rounded-lg border border-border bg-input px-2 py-1 text-sm">
                  {ROLES.filter((r) => r.key !== "owner" && r.key !== "client").map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                </select>
              ) : (
                <span className="text-xs text-muted-foreground">{roleLabel(t.role)}</span>
              )}
              {isOwner && t.role === "cofounder" && (
                <input
                  type="number" min={0} max={100} defaultValue={t.share_pct ?? ""} placeholder="Share %"
                  onBlur={(e) => e.target.value !== String(t.share_pct ?? "") && update(t.id, { share_pct: e.target.value === "" ? null : Number(e.target.value) })}
                  className="w-20 rounded-lg border border-border bg-input px-2 py-1 text-sm" aria-label="Share %"
                />
              )}
              {t.status === "invited" && canEdit(me.role) && (
                <button onClick={() => pendingToken(t.id)} className="text-xs font-medium text-primary"><Link2 className="mr-1 inline size-3.5" />Copy link</button>
              )}
              {isOwner && t.role !== "owner" && (
                <button onClick={() => remove(t.id)} className="text-xs font-medium text-destructive">{t.status === "invited" ? "Cancel" : "Remove"}</button>
              )}
            </li>
          ))}
        </ul>
        {!isOwner && (
          <button onClick={() => setLeaving(true)} className="mt-3 text-sm text-muted-foreground hover:text-destructive">Leave this project</button>
        )}
      </Section>

      {canEdit(me.role) && (
        <Section title="Invite someone">
          <form onSubmit={invite} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="their@email.com" className={field} aria-label="Email" />
              <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={field} aria-label="Role">
                {inviteRoles.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
              </select>
            </div>
            <p className="text-xs text-muted-foreground">{ROLES.find((r) => r.key === role)?.blurb} They'll only see this project.</p>
            {isOwner && role === "cofounder" && (
              <input type="number" min={0} max={100} value={share} onChange={(e) => setShare(e.target.value)} placeholder="Their share % (optional)" className={field} />
            )}
            <button type="submit" disabled={sending} className={primaryBtn}>{sending ? "Sending…" : "Send invite"}</button>
          </form>
          {lastLink && (
            <div className="mt-4 rounded-xl border border-border bg-muted p-3 text-sm">
              <p>{lastLink.emailed ? `Emailed to ${lastLink.email}.` : "The email didn't go out."} You can also send the link on WhatsApp:</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-background px-3 py-1.5 text-xs">{lastLink.link}</code>
                <button onClick={() => copy(lastLink.link)} className={secondaryBtn}><Copy className="size-4" /></button>
              </div>
            </div>
          )}
        </Section>
      )}

      <ConfirmDialog open={leaving} onOpenChange={setLeaving} title={`Leave ${p.name}?`} description="Your check-ins stay with the project. Someone on the team can invite you back." confirmLabel="Leave" destructive onConfirm={leave} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export const SettingsTab = ({ d }: { d: ProjectData }) => {
  const navigate = useNavigate();
  const invalidate = useInvalidateProjects();
  const { project: p, me } = d;
  const isOwner = me.role === "owner";
  const [editOpen, setEditOpen] = useState(false);
  const [killOpen, setKillOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [deleting, setDeleting] = useState(false);

  const kill = async () => {
    if (!reason.trim()) return toast.error("Write one line on why. It's the most useful lesson this project leaves.");
    const { error } = await supabase.from("projects").update({ killed_at: new Date().toISOString(), killed_reason: reason.trim() }).eq("id", p.id);
    if (error) return toast.error(dbMessage(error));
    await supabase.rpc("set_project_mode", { p_project: p.id, p_mode: "parked" });
    invalidate();
    setKillOpen(false);
    toast.success(`${p.name} stopped. Its history stays here.`);
  };
  const revive = async () => {
    const { error } = await supabase.from("projects").update({ killed_at: null }).eq("id", p.id);
    if (error) return toast.error(dbMessage(error));
    invalidate();
    toast.success(`${p.name} is back, parked`);
  };
  const del = async () => {
    const { error } = await supabase.from("projects").delete().eq("id", p.id);
    if (error) return toast.error(dbMessage(error));
    invalidate();
    navigate("/projects");
  };

  return (
    <div className="space-y-5">
      <Section title="Details" action={<button onClick={() => setEditOpen(true)} className={secondaryBtn}>Edit</button>}>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="text-muted-foreground">Web address</dt><dd>{p.url ?? "–"}</dd>
          <dt className="text-muted-foreground">One-liner</dt><dd>{p.one_liner ?? "–"}</dd>
          <dt className="text-muted-foreground">North Star</dt><dd>{p.north_star ?? "–"}</dd>
        </dl>
      </Section>

      {isOwner && (
        <Section title="Stop or delete">
          {p.killed_at ? (
            <div>
              <p className="text-sm text-muted-foreground">Stopped. Reason: {p.killed_reason ?? "–"}</p>
              <button onClick={revive} className={cn(secondaryBtn, "mt-3")}>Bring it back</button>
            </div>
          ) : killOpen ? (
            <div className="space-y-3">
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className={field} placeholder="Why are you stopping it? One line." />
              <div className="flex gap-2">
                <button onClick={kill} className="rounded-full bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground">Stop {p.name}</button>
                <button onClick={() => setKillOpen(false)} className={secondaryBtn}>Cancel</button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Stopping keeps the history, numbers and lessons, and can be undone.{" "}
              <button onClick={() => setKillOpen(true)} className="font-medium text-destructive">Stop this project</button>
            </p>
          )}
          <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">
            Deleting removes the project, its check-ins and numbers for the whole team. Money you tagged stays in your transactions, untagged.{" "}
            <button onClick={() => setDeleting(true)} className="font-medium text-destructive">Delete</button>
          </p>
        </Section>
      )}

      <ProjectModal open={editOpen} onClose={() => setEditOpen(false)} project={p} myShare={me.share_pct} />
      <ConfirmDialog open={deleting} onOpenChange={setDeleting} title={`Delete ${p.name}?`} description="This can't be undone. Stopping the project keeps its history instead." confirmLabel="Delete" destructive onConfirm={del} />
    </div>
  );
};
