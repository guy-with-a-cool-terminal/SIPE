import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { useAdminUsers } from "@/lib/admin";

interface Props {
  value: string;                       // selected email
  onChange: (email: string) => void;
}

/** Searchable dropdown of SIPE users, keyed by email. Falls back to free typing. */
export const UserPicker = ({ value, onChange }: Props) => {
  const { data: users = [], isLoading } = useAdminUsers();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = s
      ? users.filter((u) => (u.email ?? "").toLowerCase().includes(s) || (u.full_name ?? "").toLowerCase().includes(s))
      : users;
    return list.slice(0, 50);
  }, [users, q]);

  const field = "w-full bg-input border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary";

  return (
    <div className="relative mt-1.5" ref={boxRef}
      onBlur={(e) => { if (!boxRef.current?.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <button type="button" onClick={() => setOpen((v) => !v)}
        className={`${field} flex items-center justify-between text-left ${value ? "" : "text-muted-foreground"}`}>
        <span className="truncate">{value || "Pick a user…"}</span>
        <ChevronDown className="size-4 flex-shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-popover border border-border rounded-xl shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <Search className="size-4 text-muted-foreground flex-shrink-0" />
            <input
              autoFocus value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search name or email"
              className="w-full bg-transparent text-sm focus:outline-none"
            />
          </div>
          <ul className="max-h-64 overflow-y-auto py-1">
            {isLoading ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">Loading users…</li>
            ) : filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">
                {q.includes("@") ? (
                  <button type="button" className="text-primary hover:underline"
                    onClick={() => { onChange(q.trim()); setOpen(false); }}>
                    Use "{q.trim()}" anyway
                  </button>
                ) : "No matching users"}
              </li>
            ) : filtered.map((u) => (
              <li key={u.id}>
                <button type="button"
                  onClick={() => { onChange(u.email ?? ""); setOpen(false); setQ(""); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-secondary/50 transition">
                  <Check className={`size-4 flex-shrink-0 ${u.email === value ? "text-primary" : "text-transparent"}`} />
                  <span className="min-w-0">
                    <span className="block text-sm truncate">{u.email}</span>
                    {u.full_name && <span className="block text-xs text-muted-foreground truncate">{u.full_name}</span>}
                  </span>
                  {!u.subscribed && (
                    <span className="ml-auto text-[10px] text-muted-foreground flex-shrink-0">opted out</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
