import { Link } from "react-router-dom";
import { Container } from "./Section";

export const CTA = () => (
  <section className="pb-14 sm:pb-20 lg:pb-24">
    <Container>
      <div className="flex flex-col items-start justify-between gap-8 rounded-[24px] bg-primary px-6 py-10 sm:px-12 sm:py-12 lg:flex-row lg:items-center">
        <div>
          <h2 className="text-balance text-[26px] font-medium leading-tight text-primary-foreground sm:text-[36px]">Set your split before the next payment lands.</h2>
          <p className="mt-3 text-lg text-primary-foreground/85">It takes a few minutes, and you can change it whenever you like.</p>
        </div>
        <Link to="/register" className="flex-shrink-0 rounded-full bg-white px-8 py-3.5 text-[17px] font-medium text-primary transition hover:bg-white/90">
          Create your account
        </Link>
      </div>
    </Container>
  </section>
);
