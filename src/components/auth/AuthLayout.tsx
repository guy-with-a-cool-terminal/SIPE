import { Link } from "react-router-dom";
import { ReactNode } from "react";

export const AuthLayout = ({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) => (
  <div className="min-h-screen grid lg:grid-cols-2">
    {/* Left: form */}
    <div className="flex flex-col p-8 md:p-12">
      <Link to="/" className="flex items-center gap-2 w-fit">
        <div className="size-8 rounded-xl bg-primary/90 grid place-items-center text-primary-foreground font-bold">S</div>
        <span className="font-display text-2xl">sipe</span>
      </Link>
      <div className="flex-1 grid place-items-center py-12">
        <div className="w-full max-w-sm animate-fade-up">
          <h1 className="font-display text-5xl leading-tight">{title}</h1>
          <p className="mt-3 text-muted-foreground">{subtitle}</p>
          <div className="mt-10 space-y-5">{children}</div>
          <div className="mt-8 text-sm text-muted-foreground">{footer}</div>
        </div>
      </div>
    </div>
    {/* Right: visual */}
    <div className="hidden lg:flex relative bg-secondary/30 overflow-hidden p-12 flex-col justify-between border-l border-border">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(var(--primary)/0.25),transparent_60%)]" />
      <div className="absolute -top-40 -right-40 size-[600px] bg-primary/10 rounded-full blur-3xl" />
      <div className="relative">
        <p className="text-sm uppercase tracking-[0.2em] text-primary">The sipe split</p>
      </div>
      <div className="relative grid grid-cols-2 gap-4 max-w-md">
        {[
          { l: "S", n: "Savings", c: "bucket-s", p: 20 },
          { l: "I", n: "Invest", c: "bucket-i", p: 15 },
          { l: "P", n: "Pay yourself", c: "bucket-p", p: 50 },
          { l: "E", n: "Expenses", c: "bucket-e", p: 15 },
        ].map((b) => (
          <div key={b.l} className="glass rounded-2xl p-5">
            <div className="size-10 rounded-xl grid place-items-center font-display text-xl mb-4" style={{ backgroundColor: `hsl(var(--${b.c}) / 0.15)`, color: `hsl(var(--${b.c}))` }}>{b.l}</div>
            <p className="text-sm">{b.n}</p>
            <p className="font-display text-2xl mt-1">{b.p}%</p>
          </div>
        ))}
      </div>
      <div className="relative">
        <p className="font-display text-3xl leading-snug max-w-md">"Money lands. <span className="text-gradient">sipe</span> sorts it."</p>
      </div>
    </div>
  </div>
);

export const Field = ({ label, type = "text", placeholder, name }: { label: string; type?: string; placeholder?: string; name: string }) => (
  <label className="block">
    <span className="text-sm text-muted-foreground">{label}</span>
    <input
      name={name}
      type={type}
      placeholder={placeholder}
      className="mt-2 w-full bg-input border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
    />
  </label>
);

export const SubmitButton = ({ children }: { children: ReactNode }) => (
  <button type="submit" className="w-full bg-primary text-primary-foreground font-semibold py-3.5 rounded-xl hover:bg-primary-glow transition shadow-[0_10px_40px_-10px_hsl(var(--primary)/0.6)]">
    {children}
  </button>
);
