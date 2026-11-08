/**
 * ocr-pixels.ts — a game window's pixels, made easy for Tesseract to read.
 *
 * Tesseract wants dark text on a light page. A game window is the opposite, and its text is not one
 * colour: the Inventory window's stats are white, grey, green when a buff lifts them and red when a
 * debuff drops them. Plain luminance throws the red away (a red 19 is darker than the panel it sits
 * on, to the eye *and* to the maths — it read as "11000" on the real page), so ink is measured by the
 * **brightest channel** on a dark window: any saturated colour counts as fully lit.
 *
 * The result is a grey image, paper-white with dark ink, stretched so the dimmest text still has
 * contrast. Two tones, because neither is right everywhere: `soft` keeps anti-aliasing (what the
 * recogniser likes best), `strict` thickens dim strokes into solid black — the slash in a grey
 * `242/368` is exactly the stroke `soft` loses.
 *
 * Pure, over a BGRA bitmap (what Electron's `NativeImage.toBitmap()` hands over) → a tested black box.
 */

/** A BGRA bitmap, four bytes a pixel, row after row. */
export interface Bitmap {
  data: Uint8Array;
  width: number;
  height: number;
}

export type Tone = "soft" | "strict";

/** Share of pixels allowed to sit below/above the stretch, so one stray bright icon doesn't flatten the text. */
const CLIP = { low: 0.02, high: 0.985 } as const;

/** Under this much range between "dark" and "bright" there is no text to bring out — leave the grey as it is. */
const MIN_RANGE = 24;

/** A window whose middle pixel is brighter than this is a light skin: dark text on a pale panel. */
const LIGHT_PANEL = 128;

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/** The value below which `share` of the samples fall. */
function percentile(samples: Uint8Array, share: number): number {
  const counts = new Uint32Array(256);
  for (const v of samples) counts[v]++;
  const target = samples.length * share;
  let seen = 0;
  for (let v = 0; v < 256; v++) {
    seen += counts[v];
    if (seen >= target) return v;
  }
  return 255;
}

/**
 * How lit each pixel's *ink* is, 0–255, whichever way round the window is painted. On a dark panel text
 * is the bright channel; on a light one it is whatever is darkest in any channel (red on white is
 * low in green and blue, which the brightest channel would call paper).
 */
function inkOf(bitmap: Bitmap): Uint8Array {
  const { data, width, height } = bitmap;
  const count = width * height;
  const brightest = new Uint8Array(count);
  const darkest = new Uint8Array(count);
  const grey = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const b = data[i * 4];
    const g = data[i * 4 + 1];
    const r = data[i * 4 + 2];
    brightest[i] = Math.max(r, g, b);
    darkest[i] = Math.min(r, g, b);
    grey[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  const lightPanel = percentile(grey, 0.5) > LIGHT_PANEL;
  if (!lightPanel) return brightest;
  const ink = new Uint8Array(count);
  for (let i = 0; i < count; i++) ink[i] = 255 - darkest[i];
  return ink;
}

/** The bitmap as dark ink on white paper, stretched to the given tone. Same size as it came in. */
export function readable(bitmap: Bitmap, tone: Tone): Bitmap {
  const { width, height } = bitmap;
  const ink = inkOf(bitmap);
  const low = percentile(ink, CLIP.low);
  const high = percentile(ink, CLIP.high);
  const flat = high - low < MIN_RANGE;
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < ink.length; i++) {
    const lit = flat ? ink[i] / 255 : (ink[i] - low) / (high - low);
    const strength = tone === "strict" ? (lit > 0.5 ? 1 : 0) : Math.max(0, Math.min(1, lit));
    const paper = clamp(255 - strength * 255);
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = paper;
    data[i * 4 + 3] = 255;
  }
  return { data, width, height };
}
