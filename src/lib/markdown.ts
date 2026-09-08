// Tiny, dependency-free Markdown → HTML for announcement bodies.
// Supports: #/##/### headings, **bold**, *italic*, `code`, [text](https link),
// - / * bullet lists, and paragraphs. Everything is HTML-escaped first, so the
// output is safe to drop into dangerouslySetInnerHTML.

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(s: string): string {
  return esc(s)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

export function renderMarkdown(md: string): string {
  const blocks = (md ?? "").replace(/\r\n/g, "\n").trim().split(/\n{2,}/);
  return blocks
    .map((block) => {
      const lines = block.split("\n");
      const h = lines[0].match(/^(#{1,3})\s+(.*)$/);
      if (h) {
        const level = h[1].length + 1; // h2..h4
        return `<h${level}>${inline(h[2])}</h${level}>`;
      }
      if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
        const items = lines
          .map((l) => `<li>${inline(l.replace(/^\s*[-*]\s+/, ""))}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }
      return `<p>${inline(block.replace(/\n/g, " "))}</p>`;
    })
    .join("");
}
