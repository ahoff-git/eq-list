/**
 * ocr.ts — text recognition for the screengrab lookup, via Tesseract.js.
 *
 * The worker is created lazily on first use (it loads WASM + the English model),
 * then reused. Model/cache data lives under `cachePath`; Tesseract fetches the
 * English traineddata from its CDN on first run and caches it there, so the first
 * lookup needs a network connection. Recognition failures degrade to "" rather
 * than throwing, so a bad capture just yields no matches.
 *
 * Every wait here is bounded, and blowing a budget costs the worker (see `BUDGET` and
 * `discardWorker`) — a wedged worker would otherwise fail every later lookup too. How long the
 * *screen* is held is not this module's call: `lookup.ts` decides that, and stops waiting on a read
 * without stopping the read, so a slow first run still lands in Search when it finishes.
 */
import type { Worker } from "tesseract.js";
import { createLogger } from "../src/shared/logging";
import { withTimeout } from "../src/shared/deadline";

const log = createLogger("ocr");

/**
 * The two waits a read is made of, bounded separately because they fail on different timescales.
 *
 * Recognizing an upscaled item name is fast and always has been — minding that budget tightly is
 * what catches a worker that has stopped answering. Getting a worker, on the first run of a fresh
 * install, means downloading the language model over the user's connection, which is slow for
 * honest reasons; holding it to the read's budget would just fail every first lookup.
 */
const BUDGET = {
  read: 4_000,
  worker: 60_000,
} as const;

export interface Ocr {
  recognize(image: Buffer): Promise<string>;
  /**
   * Start loading the worker now, off the critical path. Optional to call — `recognize` still
   * initializes on demand — but calling it before a read means the first-run model download isn't
   * spent against that read's timeout.
   */
  warm(): void;
}

export function createOcr(cachePath: string): Ocr {
  // The type comes from a **type-only** import, which is erased at compile time — so naming the
  // worker properly doesn't undo the lazy `await import` below, which is what keeps the WASM and the
  // language model out of startup.
  let workerPromise: Promise<Worker> | null = null;

  async function getWorker(): Promise<Worker> {
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

  /**
   * Forget the current worker and tear it down in the background.
   *
   * A read that timed out leaves its worker mid-job, and it does not come back on its own — every
   * later lookup would inherit the wedge and time out too. Dropping the reference means the next
   * read builds a fresh one (the model is cached by then, so that costs little).
   */
  function discardWorker(): void {
    const dying = workerPromise;
    workerPromise = null;
    void dying?.then((w) => w.terminate()).catch(() => {});
  }

  return {
    warm() {
      void getWorker().catch(() => {}); // failures are reported by the read that needs it
    },

    async recognize(image) {
      try {
        const worker = await withTimeout(getWorker(), BUDGET.worker, "OCR worker init");
        const { data } = await withTimeout(worker.recognize(image), BUDGET.read, "OCR read");
        return (data.text ?? "").trim();
      } catch (e) {
        log.warn("OCR failed:", (e as Error).message);
        discardWorker();
        return "";
      }
    },
  };
}
