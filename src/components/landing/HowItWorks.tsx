const steps = [
  { n: "01", t: "Connect Paystack", d: "Plug in your Paystack account in under a minute. We listen for incoming payments via secure webhooks." },
  { n: "02", t: "Set your split", d: "Decide what % of every shilling goes to Savings, Invest, Pay yourself, and Expenses. Change it anytime." },
  { n: "03", t: "Get paid, get sorted", d: "Every payment is auto-allocated the moment it lands. Your dashboard updates live. You go back to working." },
];

export const HowItWorks = () => (
  <section id="how" className="py-32 relative">
    <div className="mx-auto max-w-6xl px-6">
      <div className="max-w-2xl mb-20">
        <p className="text-sm uppercase tracking-[0.2em] text-primary mb-4">How it works</p>
        <h2 className="font-display text-5xl md:text-6xl leading-tight">
          Set it once.<br />
          <span className="text-gradient">Forget</span> forever.
        </h2>
      </div>
      <div className="space-y-px">
        {steps.map((s) => (
          <div key={s.n} className="grid md:grid-cols-[120px,1fr,2fr] gap-6 items-start py-10 border-t border-border group">
            <span className="font-display text-5xl text-muted-foreground group-hover:text-primary transition-colors">{s.n}</span>
            <h3 className="font-display text-3xl">{s.t}</h3>
            <p className="text-muted-foreground text-lg leading-relaxed max-w-lg">{s.d}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);
