import { BUCKET_META, formatKES } from "@/integrations/supabase/types";
import { Container, SectionHeading } from "./Section";
import { DEFAULT_SPLIT } from "@/lib/splits";

/** A flat stacked bar of the split. Widths are the real percentages. */
export const SplitBar = ({ amount, className = "" }: { amount?: number; className?: string }) => (
  <div className={className}>
    <div className="flex h-4 overflow-hidden rounded-full" role="img" aria-label="Payment split across four buckets">
      {DEFAULT_SPLIT.map((b) => (
        <div key={b.bucket} style={{ width: `${b.pct}%`, background: `hsl(${BUCKET_META[b.bucket].color})` }} />
      ))}
    </div>
    <dl className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
      {DEFAULT_SPLIT.map((b) => (
        <div key={b.bucket} className="border-t-[3px] pt-4" style={{ borderColor: `hsl(${BUCKET_META[b.bucket].color})` }}>
          <dt className="flex items-baseline justify-between gap-3">
            <span className="text-lg font-semibold">{BUCKET_META[b.bucket].name}</span>
            <span className="tabular-nums text-muted-foreground">{b.pct}%</span>
          </dt>
          {amount != null && (
            <dd className="mt-1 text-xl font-semibold tabular-nums">{formatKES((amount * b.pct) / 100)}</dd>
          )}
          <dd className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{b.use}</dd>
        </div>
      ))}
    </dl>
  </div>
);

export const Split = () => (
  <section id="split" className="scroll-mt-4 bg-muted py-20 sm:py-24">
    <Container>
      <SectionHeading
        title="One payment, four jobs"
        sub="Set your percentages once. Every payment after that is divided the same way, and the last bucket takes any rounding so the four always add up to exactly what you were paid."
      />
      <div className="mt-14">
        <p className="mb-4 text-[15px] text-muted-foreground">
          A <span className="font-semibold text-foreground">{formatKES(120000)}</span> payment at the default split:
        </p>
        <SplitBar amount={120000} />
      </div>
      <p className="mt-10 text-[15px] text-muted-foreground">
        Change the percentages any time in Settings. New payments use the new split; earlier ones stay as they were.
      </p>
    </Container>
  </section>
);
