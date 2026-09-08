import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { BUCKET_META, type Account, type Bucket, type Goal, type GoalFunding } from "@/integrations/supabase/types";
import { GOAL_ICONS, GOAL_ICON_KEYS, DEFAULT_GOAL_ICON } from "@/lib/goalIcons";

const ALL_BUCKETS: Bucket[] = ["S", "I", "P", "E"];
const SWATCHES = ["#22c55e", "#3b82f6", "#a855f7", "#ec4899", "#f97316", "#eab308", "#14b8a6", "#64748b"];

const FUNDING_OPTS: { value: GoalFunding; label: string; hint: string }[] = [
  { value: "manual",      label: "Manual",            hint: "You log contributions yourself." },
  { value: "deposit_pct", label: "% of every deposit", hint: "A slice of each income deposit is auto-contributed." },
  { value: "bucket",      label: "Bucket balance",     hint: "Tracks the live balance of an S/I/P/E bucket." },
  { value: "account",     label: "Account balance",    hint: "Tracks the live balance of one account." },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  userId: string;
  goal?: Goal | null;
  goals: Goal[];
}

export const GoalModal = ({ open, onClose, onSaved, userId, goal, goals }: Props) => {
  const editing = !!goal;
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [name, setName] = useState("");
  const [icon, setIcon] = useState(DEFAULT_GOAL_ICON);
  const [color, setColor] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [funding, setFunding] = useState<GoalFunding>("manual");
  const [bucket, setBucket] = useState<Bucket>("S");
  const [accountId, setAccountId] = useState("");
  const [depositPct, setDepositPct] = useState("");

  useEffect(() => {
    if (!open) return;
    setSaving(false);
    setName(goal?.name ?? "");
    setIcon(goal?.icon && GOAL_ICONS[goal.icon] ? goal.icon : DEFAULT_GOAL_ICON);
    setColor(goal?.color ?? "");
    setTargetAmount(goal ? String(goal.target_amount) : "");
    setTargetDate(goal?.target_date ?? "");
    setFunding(goal?.funding ?? "manual");
    setBucket(goal?.bucket ?? "S");
    setAccountId(goal?.account_id ?? "");
    setDepositPct(goal?.deposit_pct != null ? String(goal.deposit_pct) : "");
    supabase.from("accounts").select("*").eq("user_id", userId).eq("archived", false).order("name")
      .then(({ data }) => {
        const list: Account[] = data || [];
        setAccounts(list);
        if (!goal?.account_id) setAccountId((prev) => prev || list.find((a) => a.is_default)?.id || list[0]?.id || "");
      });
  }, [open, goal, userId]);

  if (!open) return null;

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;
    if (!name.trim()) return toast.error("Give the goal a name");
    const target = Number(targetAmount);
    if (!target || target <= 0) return toast.error("Enter a target amount above 0");

    // Mirror the DB check constraints client-side.
    if (funding === "bucket" && !bucket) return toast.error("Pick a bucket");
    if (funding === "account" && !accountId) return toast.error("Pick an account");
    let pct: number | null = null;
    if (funding === "deposit_pct") {
      pct = Number(depositPct);
      if (!pct || pct <= 0 || pct > 100) return toast.error("Deposit % must be between 0 and 100");
    }

    const payload = {
      user_id: userId,
      name: name.trim(),
      icon,
      color: color || null,
      target_amount: target,
      target_date: targetDate || null,
      funding,
      bucket: funding === "bucket" ? bucket : null,
      account_id: funding === "account" ? accountId : null,
      deposit_pct: funding === "deposit_pct" ? pct : null,
    };

    setSaving(true);
    let error;
    if (goal) {
      ({ error } = await supabase.from("goals").update(payload).eq("id", goal.id));
    } else {
      const maxSort = goals.reduce((m, g) => Math.max(m, g.sort_order), -1);
      ({ error } = await supabase.from("goals").insert({ ...payload, sort_order: maxSort + 1 }));
    }
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Goal updated" : "Goal created");
    onSaved();
    onClose();
  };

  const field = "mt-1.5 w-full bg-input border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary";

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur grid place-items-center z-50 p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="glass rounded-3xl p-8 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold">{editing ? "Edit goal" : "New goal"}</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-5" /></button>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="text-sm text-muted-foreground">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Emergency fund, New laptop" className={field} />
          </label>

          <div>
            <span className="text-sm text-muted-foreground">Icon</span>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              {GOAL_ICON_KEYS.map((key) => {
                const Ico = GOAL_ICONS[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setIcon(key)}
                    title={key}
                    className={`size-9 rounded-lg grid place-items-center border transition ${icon === key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-secondary/40 hover:text-foreground"}`}
                  >
                    <Ico className="size-[18px]" />
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="text-sm text-muted-foreground">Colour</span>
            <div className="flex flex-wrap gap-2 mt-1.5">
              <button type="button" onClick={() => setColor("")} className={`size-7 rounded-full border grid place-items-center text-xs ${color === "" ? "border-primary" : "border-border"}`} title="None">–</button>
              {SWATCHES.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)} style={{ backgroundColor: c }} className={`size-7 rounded-full border-2 ${color === c ? "border-foreground" : "border-transparent"}`} />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm text-muted-foreground">Target (KES)</span>
              <input value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} type="number" step="0.01" min={0} placeholder="0.00" className={field} />
            </label>
            <label className="block">
              <span className="text-sm text-muted-foreground">Target date</span>
              <input value={targetDate} onChange={(e) => setTargetDate(e.target.value)} type="date" className={field} />
            </label>
          </div>

          <label className="block">
            <span className="text-sm text-muted-foreground">Funding</span>
            <select value={funding} onChange={(e) => setFunding(e.target.value as GoalFunding)} className={field} disabled={editing}>
              {FUNDING_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <span className="text-xs text-muted-foreground mt-1 block">
              {FUNDING_OPTS.find((o) => o.value === funding)?.hint}
              {editing && " · funding mode can't be changed after creation"}
            </span>
          </label>

          {funding === "bucket" && (
            <label className="block">
              <span className="text-sm text-muted-foreground">Bucket</span>
              <select value={bucket} onChange={(e) => setBucket(e.target.value as Bucket)} className={field}>
                {ALL_BUCKETS.map((b) => <option key={b} value={b}>{BUCKET_META[b].name}</option>)}
              </select>
            </label>
          )}

          {funding === "account" && (
            <label className="block">
              <span className="text-sm text-muted-foreground">Account</span>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={field}>
                <option value="">— pick an account —</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              {accounts.length === 0 && <span className="text-xs text-destructive mt-1 block">No accounts yet — add one on the Accounts tab first.</span>}
            </label>
          )}

          {funding === "deposit_pct" && (
            <label className="block">
              <span className="text-sm text-muted-foreground">% of each deposit</span>
              <input value={depositPct} onChange={(e) => setDepositPct(e.target.value)} type="number" step="0.01" min={0} max={100} placeholder="e.g. 10" className={field} />
            </label>
          )}
        </div>

        <button type="submit" disabled={saving} className="mt-6 w-full bg-primary text-primary-foreground font-semibold py-3 rounded-xl hover:bg-primary-glow transition disabled:opacity-50">
          {saving ? "Saving…" : editing ? "Save changes" : "Create goal"}
        </button>
      </form>
    </div>
  );
};
