import { useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  ArrowLeftRight,
  BarChart3,
  Landmark,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Wallet,
  Target,
  ShieldCheck,
  MoreHorizontal,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/lib/admin";
import { NotificationsBell } from "./NotificationsBell";
import { WhatsNew } from "./WhatsNew";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const links = [
  { to: "/dashboard",    label: "Dashboard",    icon: LayoutDashboard },
  { to: "/accounts",     label: "Accounts",     icon: Wallet },
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { to: "/analytics",   label: "Analytics",    icon: BarChart3 },
  { to: "/goals",       label: "Goals",        icon: Target },
  { to: "/debts",       label: "Debts",        icon: Landmark },
  { to: "/settings",    label: "Settings",     icon: Settings },
];

// The 4 destinations that get a permanent slot in the mobile bottom bar.
const PRIMARY_MOBILE = ["/dashboard", "/accounts", "/transactions", "/analytics"];
const primaryLinks = links.filter((l) => PRIMARY_MOBILE.includes(l.to));
const moreLinks = links.filter((l) => !PRIMARY_MOBILE.includes(l.to));

export const AppShell = () => {
  const { user, signOut } = useAuth();
  const { isAdmin } = useAdmin();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("sidebar-collapsed") === "1"
  );
  const [moreOpen, setMoreOpen] = useState(false);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar-collapsed", next ? "1" : "0");
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const moreActive = moreLinks.some((l) => location.pathname.startsWith(l.to)) ||
    location.pathname.startsWith("/admin");

  return (
    <div className="min-h-screen flex">
      {/* ---------- Desktop sidebar ---------- */}
      <aside
        className={`hidden md:flex flex-col border-r border-border bg-card/40 backdrop-blur transition-[width] duration-200 overflow-hidden ${
          collapsed ? "w-14" : "w-52"
        }`}
      >
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
              aria-label="Collapse sidebar"
            >
              <ChevronLeft className="size-4" />
            </button>
          )}
        </div>

        {collapsed && (
          <button
            onClick={toggle}
            className="mx-auto mt-2 text-muted-foreground hover:text-foreground transition p-1 rounded"
            title="Expand sidebar"
            aria-label="Expand sidebar"
          >
            <ChevronRight className="size-4" />
          </button>
        )}

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
            onClick={handleSignOut}
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

      <main className="flex-1 min-w-0 [padding-left:env(safe-area-inset-left)] [padding-right:env(safe-area-inset-right)]">
        {/* ---------- Mobile top bar ---------- */}
        <div className="md:hidden sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/85 backdrop-blur px-4 h-14 [padding-top:env(safe-area-inset-top)]">
          <Link to="/dashboard" className="flex items-center gap-2">
            <img src="/logo.png" alt="" className="size-7" />
            <span className="font-bold">sipe</span>
          </Link>
          <NotificationsBell align="right" direction="down" />
        </div>

        <WhatsNew />
        <Outlet />

        {/* ---------- Mobile bottom nav ---------- */}
        <nav
          className="md:hidden fixed bottom-0 inset-x-0 z-30 flex items-stretch border-t border-border bg-background/95 backdrop-blur [padding-bottom:env(safe-area-inset-bottom)]"
          aria-label="Primary"
        >
          {primaryLinks.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center justify-center gap-1 py-2 min-h-[3.5rem] text-[10px] font-medium transition ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`
              }
            >
              <Icon className="size-5" />
              {label}
            </NavLink>
          ))}
          <button
            onClick={() => setMoreOpen(true)}
            className={`flex flex-1 flex-col items-center justify-center gap-1 py-2 min-h-[3.5rem] text-[10px] font-medium transition ${
              moreActive ? "text-primary" : "text-muted-foreground"
            }`}
            aria-label="More"
          >
            <MoreHorizontal className="size-5" />
            More
          </button>
        </nav>
      </main>

      {/* ---------- "More" sheet (mobile) ---------- */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl [padding-bottom:max(1.5rem,env(safe-area-inset-bottom))]">
          <SheetHeader className="text-left">
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <div className="mt-4 grid gap-1">
            {moreLinks.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setMoreOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${
                    isActive
                      ? "bg-primary/15 text-primary"
                      : "text-foreground hover:bg-secondary"
                  }`
                }
              >
                <Icon className="size-4" />
                {label}
              </NavLink>
            ))}
            {isAdmin && (
              <NavLink
                to="/admin"
                onClick={() => setMoreOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${
                    isActive
                      ? "bg-primary/15 text-primary"
                      : "text-foreground hover:bg-secondary"
                  }`
                }
              >
                <ShieldCheck className="size-4" />
                Admin
              </NavLink>
            )}
            <p className="truncate px-3 pt-3 text-xs text-muted-foreground">{user?.email}</p>
            <button
              onClick={() => {
                setMoreOpen(false);
                handleSignOut();
              }}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            >
              <LogOut className="size-4" />
              Sign out
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};
