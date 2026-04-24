const buckets = [
  { letter: "S", name: "Savings", color: "bucket-s", pct: "20%", desc: "Cushion for the dry months. Future you sleeps better." },
  { letter: "I", name: "Invest", color: "bucket-i", pct: "15%", desc: "Compounding doesn't care about your invoice schedule." },
  { letter: "P", name: "Pay yourself", color: "bucket-p", pct: "50%", desc: "An actual salary. Predictable. Boring. Beautiful." },
  { letter: "E", name: "Expenses", color: "bucket-e", pct: "15%", desc: "Tools, taxes, the coffee. Pre-allocated, never overdrawn." },
];

export const Buckets = () => (
  <section id="buckets" className="py-32 relative">
    <div className="mx-auto max-w-7xl px-6">
      <div className="max-w-3xl mb-20">
        <p className="text-sm uppercase tracking-[0.2em] text-primary mb-4">The four buckets</p>
        <h2 className="font-display text-5xl md:text-6xl leading-tight">
          One payment in.<br />
          <span className="text-gradient">Four</span> intentions out.
        </h2>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
        {buckets.map((b, i) => (
          <div key={b.letter} className="group relative glass rounded-3xl p-7 hover:-translate-y-2 transition-all duration-500" style={{ animationDelay: `${i * 100}ms` }}>
            <div className={`size-14 rounded-2xl grid place-items-center font-display text-3xl mb-6 transition-all group-hover:scale-110`} style={{ backgroundColor: `hsl(var(--${b.color}) / 0.15)`, color: `hsl(var(--${b.color}))` }}>
              {b.letter}
            </div>
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-xl font-semibold">{b.name}</h3>
              <span className="font-display text-2xl text-muted-foreground">{b.pct}</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{b.desc}</p>
            <div className="mt-6 h-1 rounded-full bg-secondary overflow-hidden">
              <div className="h-full rounded-full transition-all duration-1000 group-hover:w-full" style={{ width: b.pct, backgroundColor: `hsl(var(--${b.color}))` }} />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-10 text-sm text-muted-foreground text-center">Percentages are fully yours to tune in Settings.</p>
    </div>
  </section>
);
