import { Link } from "react-router-dom";
import { Container } from "./Section";

const proof = [
  "Every payment split the moment it is recorded",
  "Paystack payments recorded on their own",
  "Quotes and invoices under your business name",
  "Built in Kenya, in shillings",
];

export const Hero = () => (
  <>
    <section className="bg-background">
      <Container className="py-20 text-center sm:py-28">
        <h1 className="mx-auto max-w-[900px] text-[40px] font-semibold leading-[1.1] tracking-tight text-foreground sm:text-[60px]">
          Your income comes in lumps.<br className="hidden sm:block" />{" "}
          <span className="text-primary">Your rent does not.</span>
        </h1>
        <p className="mx-auto mt-7 max-w-[660px] text-lg leading-relaxed text-muted-foreground">
          SIPE divides every payment you receive into Savings, Investments, Pay yourself and Expenses at the
          percentages you choose. A KES 120,000 invoice becomes a month of salary, a tax set-aside and money for
          bills, instead of three good weeks.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <Link to="/register" className="rounded-full bg-primary px-8 py-3.5 text-[17px] font-medium text-primary-foreground transition hover:bg-primary-glow">
            Create your account
          </Link>
          <a href="#split" className="rounded-full border-2 border-foreground px-8 py-3 text-[17px] text-foreground transition hover:border-primary hover:text-primary">
            See how the split works
          </a>
        </div>
      </Container>
    </section>

    <section className="border-y border-border bg-background">
      <ul className="mx-auto grid max-w-[1160px] grid-cols-1 px-5 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        {proof.map((text, i) => (
          <li
            key={text}
            className={`py-5 text-[15px] font-medium text-foreground sm:py-7 sm:pr-6 ${i > 0 ? "border-t border-border sm:border-t-0" : ""} ${i % 2 === 1 ? "sm:border-l sm:border-border sm:pl-6" : ""} ${i === 2 ? "lg:border-l lg:pl-6" : ""}`}
          >
            {text}
          </li>
        ))}
      </ul>
    </section>
  </>
);
