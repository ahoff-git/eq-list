/**
 * ocr-rows.ts — word boxes from an OCR pass, gathered into the rows a person sees.
 *
 * Tesseract's own line grouping follows its reading of the page layout, which on a label-and-number
 * panel is the wrong question: two columns sharing a row ("HP 1976/1976" beside "Strength 74/510") come
 * back as separate lines in an order that depends on the pass. What a panel means is *geometric* — a
 * value belongs to the label on its row — so rows are rebuilt from the boxes: words whose vertical
 * centres agree to within half a word's height are one row, read left to right.
 *
 * Everything is relative to the words' own height, so it is the same at 100% UI scale or enlarged 3×
 * for the recogniser. Pure → a tested black box.
 */

/** One recognised word and its box, in the pixels of the image that was read. */
export interface OcrWord {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** The recogniser's own 0–100 confidence in this word. */
  confidence: number;
}

export interface OcrRow {
  /** The row's vertical centre. */
  y: number;
  /** Left to right. */
  words: OcrWord[];
}

const heightOf = (w: OcrWord) => w.y1 - w.y0;
const centreOf = (w: OcrWord) => (w.y0 + w.y1) / 2;

/** The middle word height — the unit gaps and row tolerances are measured in. 0 for no words. */
export function typicalHeight(words: readonly OcrWord[]): number {
  if (!words.length) return 0;
  const heights = words.map(heightOf).sort((a, b) => a - b);
  return heights[Math.floor(heights.length / 2)];
}

/** Words as rows, top to bottom, each left to right. */
export function rowsOf(words: readonly OcrWord[]): OcrRow[] {
  const tolerance = typicalHeight(words) * 0.5;
  const rows: { y: number; count: number; words: OcrWord[] }[] = [];
  for (const word of [...words].sort((a, b) => centreOf(a) - centreOf(b))) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(centreOf(word) - row.y) <= tolerance) {
      row.words.push(word);
      row.y = (row.y * row.count + centreOf(word)) / (row.count + 1);
      row.count += 1;
    } else {
      rows.push({ y: centreOf(word), count: 1, words: [word] });
    }
  }
  return rows.map((r) => ({ y: r.y, words: r.words.sort((a, b) => a.x0 - b.x0) }));
}
