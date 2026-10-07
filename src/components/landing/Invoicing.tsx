import { DocumentPaper, PaperFrame } from "@/components/invoicing/DocumentPaper";
import { computeTotals, type DocumentItem, type Issuer } from "@/lib/invoicing";
import { Container, RuledItem } from "./Section";

// Rendered by the same component that prints real invoices, so this is the product, not a mock-up.
const items: DocumentItem[] = [
  { position: 0, description: "Website design & development", details: "Responsive, six pages", quantity: 1, unit_price: 65000 },
  { position: 1, description: "M-Pesa checkout integration", details: null, quantity: 1, unit_price: 25000 },
  { position: 2, description: "Hosting and domain, first year", details: null, quantity: 1, unit_price: 9500 },
];
const issuer = {
  legal_name: "Your business name", trading_name: null, tagline: null, kra_pin: "P051234567X",
  email: "you@yourbusiness.co.ke", phone: null, website: null, address: "Nairobi, Kenya",
  logo_url: null, brand_color: "#15803d", header_style: "band", vat_registered: false, default_tax_rate: 16,
  bank_name: null, bank_branch: null, bank_account_name: null, bank_account_number: null, bank_swift: null,
  mpesa_paybill: "247247", mpesa_account: null, mpesa_till: null, mpesa_phone: null, payment_note: null,
  invoice_prefix: "INV", quote_prefix: "QT", default_due_days: 14, default_valid_days: 30,
  signatory_name: null, signatory_title: null, footer_text: null,
} as Issuer;

const points = [
  { title: "Your name on it", body: "Registered name, KRA PIN, logo and brand colour, set once in Settings and printed on every quote and invoice." },
  { title: "Numbers without gaps", body: "A number is given only when you finalise, so deleted drafts never leave holes in your sequence." },
  { title: "Paid means split", body: "Record a payment against an invoice and it goes into your buckets. Mark a deal as pass-through and it stays out." },
  { title: "Easy for the client", body: "A link they open without an account, a print-ready PDF, and your M-Pesa and bank details under How to pay." },
];

export const Invoicing = () => (
  <section id="invoicing" className="scroll-mt-4 bg-ink py-20 text-white sm:py-24">
    <Container className="grid items-start gap-14 lg:grid-cols-[1fr_1fr]">
      <div>
        <h2 className="text-3xl font-semibold leading-tight tracking-tight text-white sm:text-[40px]">
          Invoices that look like a business sent them.
        </h2>
        <p className="mt-5 text-[17px] leading-relaxed text-white/75">
          Quote the work, turn the accepted quote into an invoice, and record what the client pays. The money lands
          in your buckets without being typed in twice.
        </p>
        <dl className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {points.map((p) => <RuledItem key={p.title} title={p.title} dark>{p.body}</RuledItem>)}
        </dl>
      </div>
      <div className="min-w-0 overflow-hidden rounded-lg">
        <PaperFrame>
          <DocumentPaper
            kind="invoice" status="sent" number="INV-2026-0014"
            doc={{
              title: "Company website", summary: null, deliverables: [], reference: null, timeline: null,
              payment_terms: null, notes: "Thank you for your business.", terms: null, etims_number: null,
              issue_date: "2026-10-06", due_date: "2026-10-20", discount_type: "amount", discount_value: 0,
              tax_rate: 0, tax_label: "VAT", payment_link_url: null,
            }}
            items={items}
            totals={computeTotals(items, "amount", 0, 0)}
            amountPaid={40000}
            payments={[{ id: "p", document_id: "d", amount: 40000, paid_at: "2026-10-07", method: "mpesa", reference: "Deposit", note: null, transaction_id: null }]}
            issuer={issuer}
            client={{ name: "Accounts team", company: "Your client's company", email: null, phone: null, address: "Nairobi", kra_pin: null }}
          />
        </PaperFrame>
      </div>
    </Container>
  </section>
);
