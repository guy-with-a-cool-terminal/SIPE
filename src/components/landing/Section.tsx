import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Landing page building blocks. One container width, one heading treatment. */
export const Container = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn("mx-auto w-full max-w-[1160px] px-5 sm:px-6", className)}>{children}</div>
);

export const SectionHeading = ({
  title, sub, align = "left", className,
}: { title: string; sub?: string; align?: "left" | "center"; className?: string }) => (
  <div className={cn(align === "center" ? "mx-auto max-w-[820px] text-center" : "max-w-2xl", className)}>
    <h2 className="text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-[40px]">{title}</h2>
    {sub && <p className="mt-4 text-[17px] leading-relaxed text-muted-foreground">{sub}</p>}
  </div>
);

/** A titled block that sits under a thin top rule. Used instead of icon cards. */
export const RuledItem = ({ title, children, dark }: { title: string; children: ReactNode; dark?: boolean }) => (
  <div className={cn("border-t pt-5", dark ? "border-white/20" : "border-foreground")}>
    <h3 className={cn("text-lg font-semibold", dark && "text-white")}>{title}</h3>
    <p className={cn("mt-2 text-[15px] leading-relaxed", dark ? "text-white/75" : "text-muted-foreground")}>{children}</p>
  </div>
);
