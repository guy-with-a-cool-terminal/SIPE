import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("wraps plain text in a paragraph", () => {
    expect(renderMarkdown("Hello world")).toBe("<p>Hello world</p>");
  });

  it("renders headings h2–h4", () => {
    expect(renderMarkdown("# Title")).toBe("<h2>Title</h2>");
    expect(renderMarkdown("### Small")).toBe("<h4>Small</h4>");
  });

  it("renders bold, italic and inline code", () => {
    expect(renderMarkdown("a **b** c")).toContain("<strong>b</strong>");
    expect(renderMarkdown("a *b* c")).toContain("<em>b</em>");
    expect(renderMarkdown("a `b` c")).toContain("<code>b</code>");
  });

  it("renders bullet lists", () => {
    expect(renderMarkdown("- one\n- two")).toBe("<ul><li>one</li><li>two</li></ul>");
  });

  it("renders https links with a safe target", () => {
    const out = renderMarkdown("see [docs](https://example.com/x)");
    expect(out).toContain('href="https://example.com/x"');
    expect(out).toContain('rel="noreferrer noopener"');
  });

  it("escapes HTML in the source", () => {
    expect(renderMarkdown("<script>alert(1)</script>")).toBe(
      "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
    );
  });

  it("keeps paragraphs separate", () => {
    expect(renderMarkdown("one\n\ntwo")).toBe("<p>one</p><p>two</p>");
  });
});
