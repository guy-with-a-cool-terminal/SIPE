import { Container, RuledItem } from "./Section";

const costs = [
  { title: "The big month feels like a raise", body: "A large payment lands, the balance looks healthy, and the next weeks get spent as if another one is already on its way." },
  { title: "Tax season finds nothing set aside", body: "KRA does not wait for a good month. Without money put away as it came in, a return turns into a debt." },
  { title: "Saving comes from what is left", body: "Saving at the end of the month only works when there is something left at the end of the month." },
  { title: "You cannot tell what you earned", body: "Client payments, a friend's float and your own pay all sit in one M-Pesa balance, so no figure means much." },
];

export const Problem = () => (
  <section className="py-20 sm:py-24">
    <Container>
      <div className="grid items-end gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
        <h2 className="text-3xl font-semibold leading-tight tracking-tight sm:text-[40px]">
          Budgeting apps assume a salary. Freelance money does not arrive that way.
        </h2>
        <p className="text-[17px] leading-relaxed text-muted-foreground">
          When pay comes in irregular lumps, a monthly budget breaks in the first week. The fix is not tracking
          harder. It is deciding where each payment goes the moment it arrives.
        </p>
      </div>
      <div className="mt-14 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        {costs.map((c) => <RuledItem key={c.title} title={c.title}>{c.body}</RuledItem>)}
      </div>
    </Container>
  </section>
);
