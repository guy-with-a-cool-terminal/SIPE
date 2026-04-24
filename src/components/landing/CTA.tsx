import { Link } from "react-router-dom";

export const CTA = () => (
  <section className="py-32">
    <div className="mx-auto max-w-5xl px-6">
      <div className="relative glass rounded-[2.5rem] p-14 md:p-20 text-center overflow-hidden animate-pulse-glow">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 size-[500px] bg-primary/20 rounded-full blur-3xl" />
        <div className="relative">
          <h2 className="font-display text-5xl md:text-7xl leading-tight">
            Your next invoice<br />
            <span className="text-gradient">deserves a plan.</span>
          </h2>
          <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto">
            Three minutes to set up. A lifetime of less financial anxiety.
          </p>
          <Link to="/register" className="mt-10 inline-flex bg-primary text-primary-foreground px-8 py-4 rounded-full font-semibold hover:bg-primary-glow transition shadow-[0_10px_40px_-10px_hsl(var(--primary)/0.6)]">
            Create your free account
          </Link>
        </div>
      </div>
    </div>
  </section>
);
