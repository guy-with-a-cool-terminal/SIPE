import { Link } from "react-router-dom";
import { SipeFlow } from "./SipeFlow";

export const Hero = () => (
  <section className="relative pt-40 pb-24 overflow-hidden">
    <div className="mx-auto max-w-7xl px-6 grid lg:grid-cols-[1.1fr,1fr] gap-12 items-center">
      <div className="animate-fade-up">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass text-xs text-muted-foreground mb-8">
          <span className="size-1.5 rounded-full bg-primary animate-pulse" />
          For freelancers who get paid in lumps
        </div>
        <h1 className="text-5xl md:text-6xl lg:text-7xl leading-[1.05] tracking-tight">
          Money lands.<br />
          <span className="text-gradient">sipe sorts it.</span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-xl leading-relaxed">
          Every payment that hits your account gets quietly split across four buckets — Savings, Invest, Pay yourself, Expenses — at the percentages you set. No spreadsheets. No guilt. Just intentional money.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Link to="/register" className="bg-primary text-primary-foreground px-7 py-3.5 rounded-full font-semibold hover:bg-primary-glow transition shadow-[0_10px_40px_-10px_hsl(var(--primary)/0.6)]">
            Start splitting
          </Link>
          <a href="#how" className="px-7 py-3.5 rounded-full glass font-medium hover:bg-secondary transition">
            See how it works
          </a>
        </div>
        <div className="mt-12 flex items-center gap-6 text-xs text-muted-foreground">
          <span>Built for Paystack</span>
          <span className="size-1 rounded-full bg-border" />
          <span>Bank-grade security</span>
          <span className="size-1 rounded-full bg-border" />
          <span>Free while you grow</span>
        </div>
      </div>
      <div className="relative">
        <SipeFlow />
      </div>
    </div>
  </section>
);
