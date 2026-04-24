// Custom SVG visualization of the SIPE allocation process.
// One incoming payment splits into 4 buckets via animated streams.

const buckets = [
  { key: "S", name: "Savings", pct: 20, color: "var(--bucket-s)" },
  { key: "I", name: "Invest", pct: 15, color: "var(--bucket-i)" },
  { key: "P", name: "Pay yourself", pct: 50, color: "var(--bucket-p)" },
  { key: "E", name: "Expenses", pct: 15, color: "var(--bucket-e)" },
];

export const SipeFlow = () => (
  <div className="relative w-full">
    <div className="absolute -inset-10 bg-primary/5 rounded-full blur-3xl" />
    <div className="relative glass rounded-3xl p-6 md:p-8">
      {/* Header strip: incoming payment */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-xl bg-primary/15 grid place-items-center text-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Payment received · Paystack</p>
            <p className="text-base font-semibold">+ KSh 400,000.00</p>
          </div>
        </div>
        <span className="text-xs text-muted-foreground hidden sm:block">just now</span>
      </div>

      {/* The flow diagram */}
      <svg viewBox="0 0 400 240" className="w-full h-auto" aria-label="One payment splitting into four buckets">
        <defs>
          <linearGradient id="streamGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.9" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.15" />
          </linearGradient>
          {buckets.map((b, i) => (
            <linearGradient key={b.key} id={`g-${b.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={`hsl(${b.color})`} stopOpacity="0.9" />
              <stop offset="100%" stopColor={`hsl(${b.color})`} stopOpacity="0.2" />
            </linearGradient>
          ))}
        </defs>

        {/* Source node */}
        <circle cx="200" cy="30" r="10" fill="hsl(var(--primary))" />
        <circle cx="200" cy="30" r="18" fill="none" stroke="hsl(var(--primary))" strokeOpacity="0.3" strokeWidth="1">
          <animate attributeName="r" values="14;26;14" dur="2.4s" repeatCount="indefinite" />
          <animate attributeName="stroke-opacity" values="0.5;0;0.5" dur="2.4s" repeatCount="indefinite" />
        </circle>

        {/* Streams: curved paths from source to each bucket */}
        {buckets.map((b, i) => {
          const x = 50 + i * 100;
          const d = `M 200 40 C 200 100, ${x} 110, ${x} 180`;
          return (
            <g key={b.key}>
              <path d={d} stroke={`url(#g-${b.key})`} strokeWidth="3" fill="none" strokeLinecap="round" />
              {/* Flowing dot */}
              <circle r="3.5" fill={`hsl(${b.color})`}>
                <animateMotion dur={`${2 + i * 0.25}s`} repeatCount="indefinite" path={d} />
              </circle>
            </g>
          );
        })}

        {/* Bucket nodes */}
        {buckets.map((b, i) => {
          const x = 50 + i * 100;
          return (
            <g key={b.key}>
              <rect x={x - 22} y={180} width="44" height="44" rx="12" fill={`hsl(${b.color} / 0.15)`} stroke={`hsl(${b.color} / 0.5)`} />
              <text x={x} y={208} textAnchor="middle" fontSize="18" fontWeight="700" fill={`hsl(${b.color})`} fontFamily="Inter, sans-serif">{b.key}</text>
            </g>
          );
        })}
      </svg>

      {/* Bucket allocations footer */}
      <div className="grid grid-cols-4 gap-2 md:gap-3 mt-4">
        {buckets.map((b) => {
          const amount = Math.round((400000 * b.pct) / 100).toLocaleString();
          return (
            <div key={b.key} className="rounded-xl bg-secondary/40 px-2 py-3 text-center">
              <p className="text-[11px] text-muted-foreground truncate">{b.name}</p>
              <p className="text-sm font-semibold mt-0.5" style={{ color: `hsl(${b.color})` }}>+KSh {amount}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{b.pct}%</p>
            </div>
          );
        })}
      </div>
    </div>
  </div>
);
