// Download a quote / invoice as a real PDF file (no print dialog).
//
// The paper (`DocumentPaper`) is rendered to a canvas with html2canvas-pro and laid
// onto A4 pages with jsPDF. Both libraries are loaded on demand, so they cost
// nothing until someone clicks Download.
//
// Page breaks are chosen so a line item, a paragraph or the totals block is never
// cut in half: see `pageBreaks`.

/** A4 at 96 dpi, the size DocumentPaper is laid out at. */
export const A4_W_PX = 794;
export const A4_H_PX = 1123;
/** Same margins as the @page print rules in index.css (12mm top on later pages, 14mm bottom). */
export const MARGIN_TOP_PX = 45;
export const MARGIN_BOTTOM_PX = 53;

export interface Block { top: number; bottom: number }

/**
 * Y positions (in paper px) where the content is cut into pages, starting with 0 and
 * ending with `total`. The first page has no top margin (the header band bleeds to the
 * edge); later pages do. A cut that would split a block moves up to that block's top,
 * unless that would leave the page less than `minFill` full (a block taller than a page
 * has to be split somewhere).
 */
export function pageBreaks(total: number, blocks: Block[], minFill = 0.3): number[] {
  const cuts = [0];
  let start = 0;
  let first = true;
  while (start < total - 1) {
    const avail = A4_H_PX - MARGIN_BOTTOM_PX - (first ? 0 : MARGIN_TOP_PX);
    let end = start + avail;
    if (end >= total) {
      cuts.push(total);
      break;
    }
    for (let changed = true; changed; ) {
      changed = false;
      for (const b of blocks) {
        if (b.top < end && b.bottom > end && b.top > start + avail * minFill) {
          end = b.top;
          changed = true;
        }
      }
    }
    cuts.push(end);
    start = end;
    first = false;
  }
  return cuts;
}

/** Everything that should not be split across pages. */
const KEEP_TOGETHER = "tr, li, p, h1, h2, h3, dl > div, img, .break-inside-avoid";

/** A file-system-safe name like "INV-2026-0001-Afriframe-Solutions.pdf". */
export function pdfFileName(...parts: (string | null | undefined)[]): string {
  const base = parts.filter(Boolean).join(" ").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-");
  return `${base || "document"}.pdf`;
}

/** Render the `[data-paper]` element inside `container` to a PDF and download it. */
export async function downloadPaperPdf(container: HTMLElement, fileName: string): Promise<void> {
  const pdf = await renderPaperPdf(container);
  pdf.save(fileName);
}

/**
 * Render the `[data-paper]` element inside `container` to a jsPDF document.
 * Works whether or not the paper is currently scaled down to fit the screen.
 */
export async function renderPaperPdf(container: HTMLElement) {
  const paper = container.querySelector<HTMLElement>("[data-paper]");
  if (!paper) throw new Error("Nothing to export");

  // Measure in unscaled paper px (the on-screen frame may be scaled to fit).
  const rect = paper.getBoundingClientRect();
  const scale = rect.width / A4_W_PX || 1;
  const total = Math.ceil(rect.height / scale);
  const blocks: Block[] = Array.from(paper.querySelectorAll<HTMLElement>(KEEP_TOGETHER)).map((el) => {
    const r = el.getBoundingClientRect();
    return { top: (r.top - rect.top) / scale, bottom: (r.bottom - rect.top) / scale };
  });
  const cuts = pageBreaks(total, blocks);

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);
  await document.fonts?.ready;

  const RES = 2; // ~192 dpi: sharp text, sensible file size
  const canvas = await html2canvas(paper, {
    scale: RES,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
    onclone: (doc) => {
      doc.querySelectorAll<HTMLElement>("[data-paper-frame]").forEach((el) => { el.style.transform = "none"; });
    },
  });

  const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const pageW = pdf.internal.pageSize.getWidth();
  const ptPerPx = pageW / A4_W_PX;
  const slice = document.createElement("canvas");
  const ctx = slice.getContext("2d")!;

  for (let i = 0; i < cuts.length - 1; i++) {
    const y0 = cuts[i], y1 = cuts[i + 1];
    slice.width = canvas.width;
    slice.height = Math.max(1, Math.round((y1 - y0) * RES));
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, Math.round(y0 * RES), canvas.width, slice.height, 0, 0, slice.width, slice.height);
    if (i > 0) pdf.addPage();
    const top = i === 0 ? 0 : MARGIN_TOP_PX * ptPerPx;
    pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", 0, top, pageW, (y1 - y0) * ptPerPx, undefined, "FAST");
  }
  return pdf;
}
