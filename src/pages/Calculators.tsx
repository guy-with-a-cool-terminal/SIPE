import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useAuth } from "@/contexts/AuthContext";
import { Nav } from "@/components/landing/Nav";
import { Footer } from "@/components/landing/Footer";
import { CTA } from "@/components/landing/CTA";
import { Container } from "@/components/landing/Section";
import { GetAheadPlanner } from "@/components/calculators/GetAheadPlanner";
import { ExpensesCheck } from "@/components/calculators/ExpensesCheck";
import { EarningsTarget } from "@/components/calculators/EarningsTarget";
import { PrepayOrKeep } from "@/components/calculators/PrepayOrKeep";
import { MoveInCost } from "@/components/calculators/MoveInCost";
import { RateSetter } from "@/components/calculators/RateSetter";
import { SavingsGrowth } from "@/components/calculators/SavingsGrowth";

type Kind = "getAhead" | "expenses" | "earn" | "prepay" | "moveIn" | "rate" | "savings";

const CALCS: { kind: Kind; title: string; body: string }[] = [
  {
    kind: "getAhead",
    title: "Pay rent and wifi months ahead",
    body: "Pick a bill and how far ahead you want to be: 1, 3, 6 or 12 months. See what to put aside each month, or when you'll get there at a share of each payment.",
  },
  {
    kind: "savings",
    title: "What could my savings earn?",
    body: "Compare a money market fund, a fixed deposit, T-bills, an infrastructure bond and a SACCO against leaving the money on M-Pesa, after tax.",
  },
  {
    kind: "expenses",
    title: "How much of my income goes to bills?",
    body: "List rent, wifi, power, water and food, monthly or yearly. Get the smallest share of each payment that covers them.",
  },
  {
    kind: "earn",
    title: "How much do I need to earn?",
    body: "Start from a target and a date and work back to the monthly income, and the number of extra client payments, that get you there.",
  },
  {
    kind: "prepay",
    title: "Pay the landlord upfront, or keep the money?",
    body: "Weigh a discount for paying months at once against the interest the same money earns in a fund while you pay monthly.",
  },
  {
    kind: "moveIn",
    title: "What does moving in really cost?",
    body: "Deposit, rent in advance, agent fees, water and power deposits, transport and setup, added up into one number.",
  },
  {
    kind: "rate",
    title: "What should I charge?",
    body: "Turn the income you need, your business costs, tax and the hours you can actually bill into an hourly and a day rate.",
  },
];

const DESCRIPTION =
  "Free money calculators for Kenyan freelancers: pay rent months ahead, compare MMF and fixed deposit returns, set your rate, and see what you need to earn.";

/** Public, no-login versions of the in-app calculators. Same components, no saved data. */
const Calculators = () => {
  usePageTitle("Money calculators for freelancers");
  const { user } = useAuth();
  const [open, setOpen] = useState<Kind | null>(null);
  const close = () => setOpen(null);

  useEffect(() => {
    const meta = document.querySelector('meta[name="description"]');
    const previous = meta?.getAttribute("content") ?? null;
    meta?.setAttribute("content", DESCRIPTION);
    return () => { if (meta && previous != null) meta.setAttribute("content", previous); };
  }, []);

  return (
    <>
      <Nav />
      <main>
        <section className="py-14 sm:py-20">
          <Container>
            <div className="max-w-2xl">
              <h1 className="text-balance text-[34px] font-semibold leading-tight tracking-tight text-foreground sm:text-[48px]">
                Do the maths before the money comes in.
              </h1>
              <p className="mt-5 text-[17px] leading-relaxed text-muted-foreground">
                Calculators for freelancers paid in KES: getting months ahead on rent, where to keep savings, and what to charge.
                No account needed.{" "}
                {user
                  ? <>Inside <Link to="/dashboard" className="text-primary hover:text-primary/80">SIPE</Link> they fill in from your own numbers.</>
                  : "With an account they fill in from your own payments and bills."}
              </p>
            </div>

            <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {CALCS.map((c) => (
                <div key={c.kind} className="flex flex-col border-t border-foreground pt-5">
                  <h2 className="text-lg font-semibold">{c.title}</h2>
                  <p className="mt-2 flex-1 text-[15px] leading-relaxed text-muted-foreground">{c.body}</p>
                  <button
                    onClick={() => setOpen(c.kind)}
                    className="mt-4 w-fit rounded-full border border-foreground px-5 py-2 text-sm font-medium transition hover:bg-foreground hover:text-background"
                  >
                    Open calculator
                  </button>
                </div>
              ))}
            </div>

            <p className="mt-12 max-w-2xl text-sm text-muted-foreground">
              Interest rates in these calculators are examples. They move with the Central Bank rate, so check the provider's current rate before you move money. This is a planning tool, not financial advice.
            </p>
          </Container>
        </section>
        <CTA />
      </main>
      <Footer />

      <GetAheadPlanner open={open === "getAhead"} onClose={close} />
      <ExpensesCheck open={open === "expenses"} onClose={close} />
      <EarningsTarget open={open === "earn"} onClose={close} />
      <PrepayOrKeep open={open === "prepay"} onClose={close} />
      <MoveInCost open={open === "moveIn"} onClose={close} />
      <RateSetter open={open === "rate"} onClose={close} />
      <SavingsGrowth open={open === "savings"} onClose={close} />
    </>
  );
};

export default Calculators;
