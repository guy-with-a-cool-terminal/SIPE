import type { ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";

interface Props {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** widen the desktop dialog for denser forms */
  size?: "md" | "lg";
  className?: string;
}

/**
 * One modal primitive for the whole app.
 *
 * - Below `md`: a bottom drawer (vaul) — drag-to-dismiss, safe-area padding,
 *   its own scroll region so the submit button stays reachable above the keyboard.
 * - `md` and up: a centered dialog styled as the SIPE `.glass` card.
 *
 * Focus trap, Esc-to-close, scroll lock and labelling come from the primitives.
 * See docs/design/DESIGN_SYSTEM.md §5.4.
 *
 * `children` is the full body, including its own `<form>` and submit button.
 */
export const ResponsiveModal = ({
  open,
  onClose,
  title,
  description,
  children,
  size = "md",
  className,
}: Props) => {
  const isMobile = useIsMobile();
  const onOpenChange = (next: boolean) => {
    if (!next) onClose();
  };

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
        <DrawerContent
          className={cn(
            "glass max-h-[92dvh] rounded-t-3xl border-border px-0",
            className,
          )}
        >
          <DrawerHeader className="flex-shrink-0 px-5 pt-2 text-left">
            <DrawerTitle className="text-lg font-bold">{title}</DrawerTitle>
            {description && (
              <DrawerDescription className="text-sm text-muted-foreground">
                {description}
              </DrawerDescription>
            )}
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-1 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            {children}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "glass gap-0 rounded-3xl border-border p-0 sm:rounded-3xl",
          size === "lg" ? "max-w-lg" : "max-w-md",
          className,
        )}
      >
        <DialogHeader className="px-6 pt-6 pb-2 pr-12 text-left sm:px-8 sm:pt-8">
          <DialogTitle className="text-xl font-bold">{title}</DialogTitle>
          {description && (
            <DialogDescription className="text-sm text-muted-foreground">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="max-h-[75vh] overflow-y-auto px-6 pb-6 sm:px-8 sm:pb-8">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
};
