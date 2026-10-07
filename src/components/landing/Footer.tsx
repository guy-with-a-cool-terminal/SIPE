import { Link } from "react-router-dom";
import { Container } from "./Section";
import { Logo } from "./Nav";

const cols = [
  { title: "Product", links: [
    { label: "How the split works", href: "#split" },
    { label: "Invoicing", href: "#invoicing" },
    { label: "FAQ", href: "#faq" },
  ] },
  { title: "Account", links: [
    { label: "Log in", to: "/login" },
    { label: "Create account", to: "/register" },
  ] },
];

export const Footer = () => (
  <footer className="bg-muted">
    <Container className="grid gap-10 py-14 sm:grid-cols-[1.4fr_1fr_1fr]">
      <div>
        <Logo />
        <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
          Splits irregular income into savings, investments, your pay and expenses.
        </p>
      </div>
      {cols.map((c) => (
        <div key={c.title}>
          <h3 className="text-base font-semibold after:mt-3 after:block after:h-[3px] after:w-16 after:bg-primary">{c.title}</h3>
          <ul className="mt-5 space-y-3 text-sm">
            {c.links.map((l) => (
              <li key={l.label}>
                {"to" in l
                  ? <Link to={l.to!} className="text-foreground transition hover:text-primary">{l.label}</Link>
                  : <a href={l.href} className="text-foreground transition hover:text-primary">{l.label}</a>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Container>
    <div className="border-t border-border">
      <Container className="py-5 text-sm text-muted-foreground">
        &copy; {new Date().getFullYear()} Brian AI Studio. SIPE is a Brian AI Studio product.
      </Container>
    </div>
  </footer>
);
