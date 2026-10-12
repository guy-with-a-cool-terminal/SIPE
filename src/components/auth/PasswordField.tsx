import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { checkPassword } from "@/lib/password";

const METER = ["bg-destructive", "bg-destructive", "bg-warning", "bg-primary", "bg-primary"];

interface Props {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: "current-password" | "new-password";
  placeholder?: string;
  /** Show the strength meter and what to fix (new passwords only). */
  meter?: boolean;
  /** Used to warn when the password is built from the email. */
  email?: string | null;
  className?: string;
  inputClassName?: string;
}

/** Password input with a show/hide toggle and, for new passwords, a strength meter. */
export const PasswordField = ({
  label, name, value, onChange, autoComplete, placeholder, meter, email, className, inputClassName,
}: Props) => {
  const [show, setShow] = useState(false);
  const hintId = useId();
  const check = meter && value ? checkPassword(value, email) : null;

  return (
    <div className={className}>
      <label className="block">
        <span className="text-sm text-muted-foreground">{label}</span>
        <div className="relative mt-2">
          <input
            name={name}
            type={show ? "text" : "password"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoComplete={autoComplete}
            placeholder={placeholder}
            aria-describedby={check ? hintId : undefined}
            className={cn(
              "w-full rounded-xl border border-border bg-input py-3 pl-4 pr-12 text-foreground transition placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20",
              inputClassName,
            )}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-1 my-auto grid size-10 place-items-center rounded-lg text-muted-foreground transition hover:text-foreground"
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </label>

      {check && (
        <div id={hintId} className="mt-2" aria-live="polite">
          <div className="flex gap-1" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={cn("h-1 flex-1 rounded-full", i < Math.max(1, check.score) ? METER[check.score] : "bg-secondary")} />
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{check.label}.</span>{" "}
            {check.problems.length ? check.problems.join(". ") + "." : check.score < 3 ? "A longer passphrase of a few words is stronger." : "Good to go."}
          </p>
        </div>
      )}
    </div>
  );
};
