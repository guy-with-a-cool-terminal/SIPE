import { Link } from "react-router-dom";
import { useClientPriority } from "@/hooks/useClientPriority";
import { cn } from "@/lib/utils";

const TONE: Record<string, string> = {
  overdue: "text-destructive",
  invoice_accepted: "text-warning",
};

/** Dashboard: the top three client items from /clients. Renders nothing when all is well. */
export const AttentionCard = () => {
  const { attention } = useClientPriority();
  if (!attention || attention.length === 0) return null;

  return (
    <section className="glass mb-5 overflow-hidden rounded-xl">
      <div className="flex items-baseline justify-between gap-3 px-4 pt-4 pb-1">
        <h2 className="text-sm font-semibold">Clients who need you</h2>
        <Link to="/clients" className="text-xs font-medium text-primary hover:text-primary/80">
          {attention.length > 3 ? `All ${attention.length} →` : "Open clients →"}
        </Link>
      </div>
      <ul className="divide-y divide-border">
        {attention.slice(0, 3).map((i) => (
          <li key={`${i.kind}-${i.doc?.id ?? i.clientId}`}>
            <Link
              to={i.doc ? `/${i.doc.kind === "invoice" ? "invoices" : "quotes"}/${i.doc.id}` : "/clients"}
              className="block px-4 py-2.5 transition hover:bg-secondary/20"
            >
              <p className={cn("text-sm font-medium leading-snug", TONE[i.kind])}>{i.title}</p>
              <p className="text-xs text-muted-foreground">{i.detail}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
};
