/**
 * ocr.ts — text recognition for the screengrab lookup, via Tesseract.js.
 *
 * The worker is created lazily on first use (it loads WASM + the English model),
 * then reused. Model/cache data lives under `cachePath`; Tesseract fetches the
 * English traineddata from its CDN on first run and caches it there, so the first
 * lookup needs a network connection. Recognition failures degrade to "" rather
 * than throwing, so a bad capture just yields no matches.
 */
import { createLogger } from "../src/shared/logging";

const log = createLogger("ocr");

export interface Ocr {
  recognize(image: Buffer): Promise<string>;
}

export function createOcr(cachePath: string): Ocr {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let workerPromise: Promise<any> | null = null;

  async function getWorker() {
    if (!workerPromise) {
      log.debug("initializing tesseract worker");
      const tesseract = await import("tesseract.js");
      workerPromise = tesseract.createWorker("eng", 1, { cachePath }).then(async (w) => {
        // Treat the crop as a single uniform block of text (an item name/tooltip),
        // rather than letting auto-segmentation hunt for page layout.
        await w.setParameters({ tessedit_pageseg_mode: tesseract.PSM.SINGLE_BLOCK });
        return w;
      });
      // First init fetches the model from a CDN; if that fails (e.g. offline on first run)
      // clear the cached rejection so a later lookup retries instead of being dead forever.
      workerPromise.catch(() => {
        workerPromise = null;
      });
    }
    return workerPromise;
  }

  return {
    async recognize(image) {
      try {
        const worker = await getWorker();
        const { data } = await worker.recognize(image);
        return (data.text ?? "").trim();
      } catch (e) {
        log.warn("OCR failed:", (e as Error).message);
        return "";
      }
    },
  };
}
