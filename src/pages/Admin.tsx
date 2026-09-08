import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { adminCall, useAdmin, useAdminUsers } from "@/lib/admin";
import { AdminEmail } from "@/components/app/AdminEmail";
import { toast } from "sonner";
import { Search } from "lucide-react";

type Tab = "overview" | "users" | "email";

interface Stats {
  users: number;
  active_goals: number;
  accounts: number;
  news_subscribers: number;
  announcements_published: number;
  emails_sent_7d: number;
  notifications_7d: number;
}

const STAT_META: { key: keyof Stats; label: string }[] = [
  { key: "users", label: "Users" },
  { key: "news_subscribers", label: "News subscribers" },
  { key: "active_goals", label: "Active goals" },
  { key: "accounts", label: "Accounts tracked" },
  { key: "announcements_published", label: "Announcements published" },
  { key: "emails_sent_7d", label: "Emails sent (7d)" },
  { key: "notifications_7d", label: "Notifications (7d)" },
];

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });

const Admin = () => {
  const { isAdmin, loading } = useAdmin();
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) return;
    adminCall<{ stats: Stats }>({ action: "overview" })
      .then((r) => setStats(r.stats))
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setStatsLoading(false));
  }, [isAdmin]);

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const tabBtn = (t: Tab, label: string) => (
    <button
      onClick={() => setTab(t)}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${tab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="p-6 md:px-8 xl:px-12 py-6 md:py-8 w-full max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Admin</h1>
        <p className="text-muted-foreground mt-1">Monitoring, users, and outbound email. Only visible to admins.</p>
      </div>

      <div className="flex items-center gap-1 p-1 bg-secondary/40 rounded-xl w-fit mb-6">
        {tabBtn("overview", "Overview")}
        {tabBtn("users", "Users")}
        {tabBtn("email", "Email")}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {STAT_META.map(({ key, label }) => (
            <div key={key} className="glass rounded-2xl p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold mt-1 tabular-nums">
                {statsLoading ? "…" : stats?.[key] ?? 0}
              </p>
            </div>
          ))}
        </div>
      )}

      {tab === "users" && <UsersView />}
      {tab === "email" && <AdminEmail />}
    </div>
  );
};

const UsersView = () => {
  const { data: users = [], isLoading } = useAdminUsers();
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return users;
    return users.filter((u) =>
      (u.email ?? "").toLowerCase().includes(s) || (u.full_name ?? "").toLowerCase().includes(s));
  }, [users, q]);

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-base font-semibold">
          Users <span className="text-muted-foreground font-normal">{users.length}</span>
        </h2>
        <div className="flex items-center gap-2 bg-input border border-border rounded-xl px-3 py-1.5 w-56">
          <Search className="size-4 text-muted-foreground flex-shrink-0" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search"
            className="w-full bg-transparent text-sm focus:outline-none" />
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No matching users.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-muted-foreground text-left">
                <th className="font-medium py-2 pr-4">Email</th>
                <th className="font-medium py-2 pr-4">Name</th>
                <th className="font-medium py-2 pr-4">Joined</th>
                <th className="font-medium py-2">News</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((u) => (
                <tr key={u.id}>
                  <td className="py-2.5 pr-4 truncate max-w-[240px]">{u.email}</td>
                  <td className="py-2.5 pr-4 text-muted-foreground truncate max-w-[160px]">{u.full_name || "-"}</td>
                  <td className="py-2.5 pr-4 text-muted-foreground whitespace-nowrap">{fmt(u.created_at)}</td>
                  <td className="py-2.5">
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${u.subscribed ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}>
                      {u.subscribed ? "on" : "off"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Admin;
