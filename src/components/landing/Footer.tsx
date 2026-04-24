export const Footer = () => (
  <footer className="border-t border-border py-12 mt-20">
    <div className="mx-auto max-w-7xl px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
      <div className="flex items-center gap-2">
        <div className="size-7 rounded-lg bg-primary/90 grid place-items-center text-primary-foreground font-bold text-sm">S</div>
        <span className="font-display text-xl text-foreground">sipe</span>
        <span className="ml-2">— money on purpose.</span>
      </div>
      <p>© {new Date().getFullYear()} sipe. Built for freelancers, by freelancers.</p>
    </div>
  </footer>
);
