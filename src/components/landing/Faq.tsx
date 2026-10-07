import { ChevronDown } from "lucide-react";
import { Container, SectionHeading } from "./Section";

const faqs = [
  { q: "Does SIPE hold or move my money?", a: "No. Your money stays in your M-Pesa and bank accounts. SIPE records each payment and tells you how much of what you hold belongs to savings, investing, your pay and expenses." },
  { q: "What does it connect to?", a: "Paystack. Payments made through your SIPE payment links are recorded and split as they happen. Payments by M-Pesa, bank or cash take a few taps to record." },
  { q: "Can I change my percentages?", a: "Any time, in Settings. New payments use the new split. Payments already recorded keep the split they had." },
  { q: "What if some money is not mine to keep?", a: "Mark the invoice as pass-through, for a deal you close on someone else's behalf, for example. Its payments are tracked on the invoice and never reach your buckets or analytics." },
  { q: "Is it only for Kenya?", a: "Amounts are in Kenyan shillings, and invoices follow Kenyan practice: KRA PIN, an eTIMS invoice number field and M-Pesa paybill details. Other currencies are not supported yet." },
  { q: "Who makes SIPE?", a: "Brian AI Studio, a registered software business in Kenya." },
];

export const Faq = () => (
  <section id="faq" className="scroll-mt-4 py-20 sm:py-24">
    <Container className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
      <SectionHeading title="Questions people ask first" />
      <div className="border-t border-foreground">
        {faqs.map((f) => (
          <details key={f.q} className="group border-b border-border">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-lg font-medium transition hover:text-primary [&::-webkit-details-marker]:hidden">
              {f.q}
              <ChevronDown className="size-5 flex-shrink-0 text-primary transition-transform duration-200 group-open:rotate-180" />
            </summary>
            <p className="pb-6 pr-10 text-[15px] leading-relaxed text-muted-foreground">{f.a}</p>
          </details>
        ))}
      </div>
    </Container>
  </section>
);
