import { renderMarkdown } from "@/lib/markdown";

/**
 * Renders a small subset of Markdown (headings, bold/italic/code, links, bullet
 * lists, paragraphs). Source is HTML-escaped in renderMarkdown before insertion.
 */
export const Markdown = ({ md, className = "" }: { md: string; className?: string }) => (
  <div
    className={
      "text-sm leading-relaxed text-muted-foreground " +
      "[&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_h2]:mt-4 [&_h2]:mb-2 " +
      "[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mt-3 [&_h3]:mb-1.5 " +
      "[&_h4]:text-sm [&_h4]:font-semibold [&_h4]:text-foreground [&_h4]:mt-3 [&_h4]:mb-1.5 " +
      "[&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_li]:mb-1 " +
      "[&_a]:text-primary [&_a]:underline [&_strong]:text-foreground [&_strong]:font-semibold " +
      "[&_code]:bg-secondary [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs " +
      "[&>*:last-child]:mb-0 " + className
    }
    dangerouslySetInnerHTML={{ __html: renderMarkdown(md) }}
  />
);
