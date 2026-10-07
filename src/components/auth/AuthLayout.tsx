import { Link } from "react-router-dom";
import { ReactNode } from "react";
import { BUCKET_META } from "@/integrations/supabase/types";
import { DEFAULT_SPLIT } from "@/lib/splits";

export const AuthLayout = ({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) => (
  <div className="grid min-h-screen lg:grid-cols-2">
    {/* Left: form */}
    <div className="flex flex-col px-5 py-6 sm:p-10">
      <Link to="/" className="flex w-fit items-center gap-2">
        <img src="/logo.png" alt="" className="size-8" />
        <span className="text-xl font-bold tracking-tight">sipe</span>
      </Link>
      <div className="grid flex-1 place-items-center py-12">
        <div className="w-full max-w-sm">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-3 text-muted-foreground">{subtitle}</p>
          <div className="mt-10 space-y-5">{children}</div>
          <div className="mt-8 text-sm text-muted-foreground">{footer}</div>
        </div>
      </div>
    </div>

    {/* Right: what happens after sign-in, stated plainly */}
    <div className="hidden flex-col justify-center border-l border-border bg-muted p-12 lg:flex xl:p-16">
      <div className="max-w-md">
        <h2 className="text-3xl font-semibold leading-tight tracking-tight">Every payment, divided before you spend it.</h2>
        <p className="mt-4 text-[17px] leading-relaxed text-muted-foreground">
          New accounts start with this split. Change it in Settings whenever you like.
        </p>
        <div className="mt-10 flex h-3 overflow-hidden rounded-full" aria-hidden>
          {DEFAULT_SPLIT.map((b) => (
            <div key={b.bucket} style={{ width: `${b.pct}%`, background: `hsl(${BUCKET_META[b.bucket].color})` }} />
          ))}
        </div>
        <dl className="mt-6 divide-y divide-border border-y border-border">
          {DEFAULT_SPLIT.map((b) => (
            <div key={b.bucket} className="flex items-center justify-between py-3 text-[15px]">
              <dt className="flex items-center gap-3">
                <span className="size-2.5 rounded-full" style={{ background: `hsl(${BUCKET_META[b.bucket].color})` }} />
                {BUCKET_META[b.bucket].name}
              </dt>
              <dd className="font-semibold tabular-nums">{b.pct}%</dd>
            </div>
          ))}
        </dl>
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
      className="mt-2 w-full rounded-xl border border-border bg-input px-4 py-3 text-foreground transition placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
    />
  </label>
);

export const SubmitButton = ({ children }: { children: ReactNode }) => (
  <button type="submit" className="w-full rounded-xl bg-primary py-3.5 font-semibold text-primary-foreground transition hover:bg-primary-glow">
    {children}
  </button>
);
