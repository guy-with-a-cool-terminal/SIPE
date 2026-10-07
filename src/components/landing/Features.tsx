import { Container, RuledItem, SectionHeading } from "./Section";

const features = [
  { title: "Accounts", body: "M-Pesa, bank, Paystack and cash balances in one list, each payment tagged to where it actually landed." },
  { title: "Goals", body: "Fund a goal from a bucket, an account or a share of every deposit, and see whether you are on pace." },
  { title: "Debts", body: "What you owe and what you are owed, with part payments and due dates." },
  { title: "Bucket limits", body: "Set a ceiling per bucket. SIPE flags it as spending gets close, and again if it goes over." },
  { title: "Analytics", body: "Income against spending by month, by bucket and by category, from the same records." },
  { title: "Weekly review", body: "A Monday email with what came in, what went out and how your goals are tracking." },
];

export const Features = () => (
  <section className="bg-muted py-20 sm:py-24">
    <Container>
      <SectionHeading title="The rest of your money, in the same place" sub="Everything reads from the same payments and buckets, so the numbers agree with each other." />
      <dl className="mt-14 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => <RuledItem key={f.title} title={f.title}>{f.body}</RuledItem>)}
      </dl>
    </Container>
  </section>
);
