import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/app/ProtectedRoute";
import { AppShell } from "@/components/app/AppShell";
import Index from "./pages/Index.tsx";
import Login from "./pages/Login.tsx";
import Register from "./pages/Register.tsx";

// Protected pages are code-split: the landing / auth bundle stays small.
const Dashboard = lazy(() => import("./pages/Dashboard.tsx"));
const Transactions = lazy(() => import("./pages/Transactions.tsx"));
const Settings = lazy(() => import("./pages/Settings.tsx"));
const Links = lazy(() => import("./pages/Links.tsx"));
const LinkDetail = lazy(() => import("./pages/LinkDetail.tsx"));
const Analytics = lazy(() => import("./pages/Analytics.tsx"));
const Debts = lazy(() => import("./pages/Debts.tsx"));
const Accounts = lazy(() => import("./pages/Accounts.tsx"));
const Goals = lazy(() => import("./pages/Goals.tsx"));
const WhatsNew = lazy(() => import("./pages/WhatsNew.tsx"));
const Admin = lazy(() => import("./pages/Admin.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

const queryClient = new QueryClient();

const RouteFallback = () => (
  <div className="grid min-h-[40vh] place-items-center text-sm text-muted-foreground">
    Loading…
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/accounts" element={<Accounts />} />
                <Route path="/transactions" element={<Transactions />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/goals" element={<Goals />} />
                <Route path="/debts" element={<Debts />} />
                <Route path="/links" element={<Links />} />
                <Route path="/links/:id" element={<LinkDetail />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/whats-new" element={<WhatsNew />} />
                <Route path="/admin" element={<Admin />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
