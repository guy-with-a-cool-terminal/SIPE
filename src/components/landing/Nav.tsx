import { Link } from "react-router-dom";
import { Container } from "./Section";

export const Logo = () => (
  <Link to="/" className="flex items-center gap-2 py-2">
    <img src="/logo.svg" alt="" className="size-8" />
    <span className="text-xl font-bold tracking-tight text-foreground">sipe</span>
  </Link>
);

export const Nav = () => (
  <header className="sticky top-0 z-40 border-b border-border bg-muted">
    <Container className="flex h-16 items-center justify-between gap-3 sm:h-[72px]">
      <Logo />
      <nav className="hidden items-center gap-10 text-[15px] text-foreground md:flex" aria-label="Main">
        <a href="#split" className="transition hover:text-primary">How the split works</a>
        <a href="#invoicing" className="transition hover:text-primary">Invoicing</a>
        <a href="#faq" className="transition hover:text-primary">FAQ</a>
      </nav>
      <div className="flex items-center gap-1 sm:gap-4">
        <Link to="/login" className="whitespace-nowrap px-3 py-2.5 text-[15px] text-foreground transition hover:text-primary">Log in</Link>
        <Link to="/register" className="whitespace-nowrap rounded-full bg-primary px-4 py-2.5 text-[15px] font-medium text-primary-foreground transition hover:bg-primary-glow sm:px-5">
          <span className="sm:hidden">Sign up</span><span className="hidden sm:inline">Create account</span>
        </Link>
      </div>
    </Container>
  </header>
);
