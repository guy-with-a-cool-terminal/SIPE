import { useEffect } from "react";

/**
 * Sets `document.title` for the current route and restores the previous one on
 * unmount. See docs/design/DESIGN_SYSTEM.md §7.
 */
export function usePageTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} · SIPE` : "SIPE";
    return () => {
      document.title = previous;
    };
  }, [title]);
}
