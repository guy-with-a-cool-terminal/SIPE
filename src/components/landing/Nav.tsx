import { Link } from "react-router-dom";

export const Nav = () => (
  <nav className="fixed top-0 inset-x-0 z-50">
    <div className="mx-auto max-w-7xl px-6 py-5 flex items-center justify-between">
      <Link to="/" className="flex items-center gap-2">
        <div className="size-8 rounded-xl bg-primary/90 grid place-items-center text-primary-foreground font-bold">S</div>
        <span className="font-display text-2xl">sipe</span>
      </Link>
      <div className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
        <a href="#how" className="hover:text-foreground transition">How it works</a>
        <a href="#buckets" className="hover:text-foreground transition">Buckets</a>
        <a href="#story" className="hover:text-foreground transition">Why sipe</a>
      </div>
      <div className="flex items-center gap-3">
        <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground transition">Log in</Link>
        <Link to="/register" className="text-sm bg-primary text-primary-foreground px-4 py-2 rounded-full font-medium hover:bg-primary-glow transition">
          Get sipe
        </Link>
      </div>
    </div>
  </nav>
);
