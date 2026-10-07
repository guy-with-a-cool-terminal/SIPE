import { describe, expect, it } from "vitest";
import { A4_H_PX, MARGIN_BOTTOM_PX, MARGIN_TOP_PX, pageBreaks, pdfFileName } from "./pdf";

const first = A4_H_PX - MARGIN_BOTTOM_PX;           // 1070: usable height on page 1
const later = A4_H_PX - MARGIN_BOTTOM_PX - MARGIN_TOP_PX; // 1025 on later pages

describe("pageBreaks", () => {
  it("keeps a short document on one page", () => {
    expect(pageBreaks(900, [])).toEqual([0, 900]);
  });

  it("cuts at the page height when nothing is in the way", () => {
    expect(pageBreaks(first + later + 100, [])).toEqual([0, first, first + later, first + later + 100]);
  });

  it("moves a cut up so a row is not split", () => {
    const row = { top: first - 20, bottom: first + 30 };
    expect(pageBreaks(1500, [row])).toEqual([0, row.top, 1500]);
  });

  it("follows nested blocks (a row inside the totals block)", () => {
    const totals = { top: 900, bottom: 1150 };
    const inner = { top: 1060, bottom: 1080 };
    expect(pageBreaks(1500, [inner, totals])[1]).toBe(900);
  });

  it("splits a block taller than a page instead of leaving a near-empty page", () => {
    const huge = { top: 100, bottom: 2500 };
    expect(pageBreaks(2600, [huge])[1]).toBe(first);
  });
});

describe("pdfFileName", () => {
  it("builds a safe name", () => {
    expect(pdfFileName("INV-2026-0001", "Afriframe Solutions Ltd.")).toBe("INV-2026-0001-Afriframe-Solutions-Ltd.pdf");
    expect(pdfFileName(null, "")).toBe("document.pdf");
  });
});
