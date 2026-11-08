/**
 * stats-reader.ts — a crop of the Inventory window's stats page, read into numbers.
 *
 * The part of the stats grab that needs Electron (a `NativeImage` to enlarge and repaint) and an OCR
 * worker; everything that decides what the words *mean* is `stats-page.ts`, and how the pixels are
 * made readable is `ocr-pixels.ts`. This only strings them together:
 *
 *   enlarge → make dark-on-light → read word boxes → parse
 *
 * and does it a second time, prepared differently, only when the first parse had to *repair* a cell
 * (the `/` in `242/368` read as a `1`). The two preparations fail in different places, so a second look
 * usually reads cleanly what the first could only infer — and a page that read cleanly the first time
 * never pays for it.
 */
import { nativeImage, type NativeImage } from "electron";
import { createLogger } from "../src/shared/logging";
import { readable, type Tone } from "../src/shared/chrome/ocr-pixels";
import type { OcrWord } from "../src/shared/chrome/ocr-rows";
import { readStatsPage, type StatsRead } from "../src/shared/items/stats-page";
import type { Ocr } from "./ocr";

const log = createLogger("stats-reader");

/**
 * How much the crop is enlarged for the recogniser. The page's text is about ten pixels tall at 100% UI
 * scale; on real crops three times that read every label and nearly every number, and four or five did no
 * better (and the recogniser slowed). Capped by width so a drag over the whole screen can't ask for a
 * 20-megapixel image.
 */
const SCALE = { factor: 3, maxWidth: 2400 } as const;

/** The preparations, best first. `soft` keeps anti-aliasing; `strict` thickens a dim `/` into something solid. */
const TONES: readonly Tone[] = ["soft", "strict"];

export interface StatsReader {
  /** The numbers on the stats page in this crop. An unreadable crop is an empty read, never a throw. */
  read(shot: NativeImage): Promise<StatsRead>;
}

export function createStatsReader(ocr: Ocr): StatsReader {
  /** One preparation of the crop, read: the words and where they are, in the enlarged image's pixels. */
  async function pass(shot: NativeImage, tone: Tone): Promise<OcrWord[]> {
    const { width, height } = shot.getSize();
    const factor = Math.max(1, Math.min(SCALE.factor, SCALE.maxWidth / Math.max(1, width)));
    const big = factor > 1 ? shot.resize({ width: Math.round(width * factor), height: Math.round(height * factor), quality: "best" }) : shot;
    const size = big.getSize();
    const prepared = readable({ data: big.toBitmap(), width: size.width, height: size.height }, tone);
    const png = nativeImage.createFromBitmap(Buffer.from(prepared.data), { width: size.width, height: size.height }).toPNG();
    const words = await ocr.words(png);
    log.debug(`stats pass (${tone}): ${words.length} words`, JSON.stringify(words));
    return words;
  }

  return {
    async read(shot) {
      const passes: OcrWord[][] = [];
      let read = readStatsPage(passes);
      for (const tone of TONES) {
        passes.push(await pass(shot, tone));
        read = readStatsPage(passes);
        // Something was read and none of it had to be inferred: a second look has nothing to add. A crop
        // that gave nothing at all still gets one — the other preparation may be the one it needed.
        if (Object.keys(read.values).length > 0 && !read.repaired.length) break;
      }
      log.debug("stats read", JSON.stringify(read));
      return read;
    },
  };
}
