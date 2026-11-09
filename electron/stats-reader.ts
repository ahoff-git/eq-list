/**
 * stats-reader.ts — a crop of the Inventory window's stats page, read into numbers.
 *
 * The part of the stats grab that needs Electron (a `NativeImage` to enlarge and repaint) and an OCR
 * worker; everything that decides what the words *mean* is `stats-page.ts`, and how the pixels are
 * made readable is `ocr-pixels.ts`. This only strings them together:
 *
 *   enlarge → make dark-on-light → read word boxes → parse
 *
 * and does it twice, prepared differently. The two preparations fail in different places, so the second
 * usually reads cleanly what the first could only infer (the `/` in `242/368` read as a `1`) — and,
 * where they disagree about a figure each read believably, says the figure can't be trusted.
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
  /**
   * The numbers on the stats page in this crop — and who the window's corner says you are, when the drag
   * included it. An unreadable crop is an empty read, never a throw; a recogniser that fails is one that says so
   * (`problem: "engine"`).
   */
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
      const { width, height } = shot.getSize();
      try {
        const passes: OcrWord[][] = [];
        let read = readStatsPage(passes);
        // Both preparations, always. The second is not only for what the first had to infer: it is the check on
        // what the first read *confidently*. On real screenshots a clean-looking first pass was wrong about a
        // digit (a red SV. Fire row, a compressed or small-scaled window) and nothing but a second, differently
        // prepared read could say so. A read is made once per level, not per frame; a second is worth the wait.
        for (const tone of TONES) {
          passes.push(await pass(shot, tone));
          read = readStatsPage(passes);
        }
        read = { ...read, seen: { words: 0, sample: "", ...read.seen, width, height } };
        log.debug("stats read", JSON.stringify(read));
        return read;
      } catch (e) {
        // The recogniser failing (its model couldn't load, the worker died) is not a crop with nothing in it,
        // and the player is told differently: nothing they drag will help until it's fixed.
        log.warn("stats read failed:", (e as Error).message);
        return { ...readStatsPage([]), problem: "engine", seen: { words: 0, sample: "", width, height } };
      }
    },
  };
}
