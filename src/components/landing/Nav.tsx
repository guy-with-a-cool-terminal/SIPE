import { Link } from "react-router-dom";
import { Container } from "./Section";

export const Logo = () => (
  <Link to="/" className="flex items-center gap-2">
    <img src="/logo.png" alt="" className="size-8" />
    <span className="text-xl font-bold tracking-tight text-foreground">sipe</span>
  </Link>
);

export const Nav = () => (
  <header className="border-b border-border bg-muted">
    <Container className="flex h-[72px] items-center justify-between gap-4">
      <Logo />
      <nav className="hidden items-center gap-10 text-[15px] text-foreground md:flex" aria-label="Main">
        <a href="#split" className="transition hover:text-primary">How the split works</a>
        <a href="#invoicing" className="transition hover:text-primary">Invoicing</a>
        <a href="#faq" className="transition hover:text-primary">FAQ</a>
      </nav>
      <div className="flex items-center gap-2 sm:gap-4">
        <Link to="/login" className="px-2 py-2 text-[15px] text-foreground transition hover:text-primary">Log in</Link>
        <Link to="/register" className="rounded-full bg-primary px-5 py-2.5 text-[15px] font-medium text-primary-foreground transition hover:bg-primary-glow">
          Create account
        </Link>
      </div>
    </Container>
  </header>
);
