import { Container, SectionHeading } from "./Section";

const steps = [
  { title: "Quote", body: "Send a quote with your name, KRA PIN and logo. When the client accepts, it becomes an invoice in one click." },
  { title: "Get paid", body: "Clients pay by M-Pesa, bank or a Paystack link. Paystack payments are recorded on their own; anything else takes a few taps." },
  { title: "Split", body: "The payment is divided into your four buckets straight away, against the account it landed in." },
  { title: "Spend on purpose", body: "Expenses are logged against a bucket, so before you pay a bill you can see what is left for it." },
];

export const HowItWorks = () => (
  <section className="py-20 sm:py-24">
    <Container>
      <SectionHeading title="From quote to salary" sub="SIPE follows the money from the first quote to the day you pay yourself." />
      <ol className="relative mt-14 grid gap-10 md:grid-cols-2 lg:grid-cols-4 lg:gap-8">
        <div className="absolute left-0 right-0 top-[7px] hidden h-px bg-border lg:block" aria-hidden />
        {steps.map((s) => (
          <li key={s.title} className="relative">
            <span className="relative block size-[15px] rounded-full border-[3px] border-primary bg-background" aria-hidden />
            <h3 className="mt-6 text-2xl font-semibold">{s.title}</h3>
            <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{s.body}</p>
          </li>
        ))}
      </ol>
    </Container>
  </section>
);
