import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { LayoutDashboard, ArrowLeftRight, BarChart3, Landmark, Settings, LogOut, ChevronLeft, ChevronRight, Wallet, Target, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/lib/admin";
import { NotificationsBell } from "./NotificationsBell";
import { WhatsNew } from "./WhatsNew";

const links = [
  { to: "/dashboard",    label: "Dashboard",    icon: LayoutDashboard },
  { to: "/accounts",     label: "Accounts",     icon: Wallet },
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { to: "/analytics",   label: "Analytics",    icon: BarChart3 },
  { to: "/goals",       label: "Goals",        icon: Target },
  { to: "/debts",       label: "Debts",        icon: Landmark },
  { to: "/settings",    label: "Settings",     icon: Settings },
];

export const AppShell = () => {
  const { user, signOut } = useAuth();
  const { isAdmin } = useAdmin();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("sidebar-collapsed") === "1"
  );

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar-collapsed", next ? "1" : "0");
  };

  return (
    <div className="min-h-screen flex">
      <aside
        className={`hidden md:flex flex-col border-r border-border bg-card/40 backdrop-blur transition-[width] duration-200 overflow-hidden ${
          collapsed ? "w-14" : "w-52"
        }`}
      >
        {/* Logo row */}
        <div className={`flex items-center gap-2 border-b border-border ${collapsed ? "justify-center py-4 px-0" : "px-5 py-4"}`}>
          <Link to="/dashboard" className="flex items-center gap-2 min-w-0">
            <img src="/logo.png" alt="" className="size-8 flex-shrink-0" />
            {!collapsed && <span className="font-bold truncate">sipe</span>}
          </Link>
          {!collapsed && (
            <button
              onClick={toggle}
              className="ml-auto text-muted-foreground hover:text-foreground transition p-0.5 rounded"
              title="Collapse sidebar"
            >
              <ChevronLeft className="size-4" />
            </button>
          )}
        </div>

        {/* Expand button (collapsed only) */}
        {collapsed && (
          <button
            onClick={toggle}
            className="mx-auto mt-2 text-muted-foreground hover:text-foreground transition p-1 rounded"
            title="Expand sidebar"
          >
            <ChevronRight className="size-4" />
          </button>
        )}

        {/* Nav */}
        <nav className={`flex flex-col gap-0.5 flex-1 ${collapsed ? "px-2 pt-3" : "px-3 pt-4"}`}>
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 py-2 rounded-lg text-sm transition ${
                  collapsed ? "px-0 justify-center" : "px-3"
                } ${
                  isActive
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`
              }
            >
              <Icon className="size-4 flex-shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className={`border-t border-border ${collapsed ? "px-2 py-4 flex flex-col items-center gap-3" : "px-5 py-4"}`}>
          {!collapsed && (
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              <NotificationsBell align="left" direction="up" />
            </div>
          )}
          {collapsed && <NotificationsBell align="left" direction="up" />}
          {isAdmin && (
            <NavLink
              to="/admin"
              title={collapsed ? "Admin" : undefined}
              className={({ isActive }) =>
                `flex items-center gap-2 text-sm transition mb-2 ${collapsed ? "justify-center" : ""} ${
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`
              }
            >
              <ShieldCheck className="size-4" />
              {!collapsed && "Admin"}
            </NavLink>
          )}
          <button
            onClick={async () => { await signOut(); navigate("/"); }}
            title={collapsed ? "Sign out" : undefined}
            className={`flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition ${
              collapsed ? "justify-center" : ""
            }`}
          >
            <LogOut className="size-4" />
            {!collapsed && "Sign out"}
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        {/* Mobile header */}
        <div className="md:hidden flex items-center justify-between border-b border-border px-4 py-3">
          <Link to="/dashboard" className="flex items-center gap-2">
            <img src="/logo.png" alt="" className="size-8" />
            <span className="font-bold">sipe</span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            {links.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => isActive ? "text-primary font-medium" : "text-muted-foreground"}
              >
                {label}
              </NavLink>
            ))}
            <NotificationsBell align="right" direction="down" />
          </div>
        </div>
        <WhatsNew />
        <Outlet />
      </main>
    </div>
  );
};
