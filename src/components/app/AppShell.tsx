import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { LayoutDashboard, ArrowLeftRight, Settings, LogOut, Link2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const links = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { to: "/links", label: "Payment links", icon: Link2 },
  { to: "/settings", label: "Settings", icon: Settings },
];

export const AppShell = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex">
      <aside className="hidden md:flex w-64 flex-col border-r border-border bg-card/40 backdrop-blur p-6">
        <Link to="/dashboard" className="flex items-center gap-2 mb-10">
          <div className="size-8 rounded-xl bg-primary/90 grid place-items-center text-primary-foreground font-bold">S</div>
          <span className="text-xl font-bold tracking-tight">sipe</span>
        </Link>
        <nav className="flex flex-col gap-1">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition ${
                  isActive ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto pt-6 border-t border-border">
          <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          <button
            onClick={async () => { await signOut(); navigate("/"); }}
            className="mt-3 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <div className="md:hidden flex items-center justify-between border-b border-border px-4 py-3">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="size-7 rounded-lg bg-primary/90 grid place-items-center text-primary-foreground font-bold text-sm">S</div>
            <span className="font-bold">sipe</span>
          </Link>
          <div className="flex gap-3 text-sm">
            {links.map(({ to, label }) => (
              <NavLink key={to} to={to} className={({ isActive }) => isActive ? "text-primary" : "text-muted-foreground"}>{label}</NavLink>
            ))}
          </div>
        </div>
        <Outlet />
      </main>
    </div>
  );
};
