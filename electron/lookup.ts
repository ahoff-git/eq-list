/**
 * lookup.ts — the screengrab: item lookup, and the stats-page read that shares its frozen screen and drag.
 *
 * On open we FIRST screenshot every display (before any of our windows appear, so
 * a hovered game tooltip is frozen intact and none of our UI is captured), then
 * put a transparent fullscreen selector over each display. The user drags a box on
 * any monitor; we crop that display's already-captured image, OCR it, and hand the
 * text to the main window's Search box (`onText`). Per-display windows keep DPI
 * handling simple.
 *
 * The same drag serves a second purpose (`GrabPurpose`): a grab opened for `"stats"` hands the crop,
 * as pixels, to `onStats` instead — the stats page is columns of labels and numbers, which OCR as one
 * block of item-name text reads badly (ADR 0368). Everything about getting the crop is unchanged.
 *
 * Those windows cover every screen and swallow every click, so nothing here is allowed to hold them
 * open indefinitely — see `DEADLINE`.
 */
import { desktopCapturer, globalShortcut, screen, type BrowserWindow, type WebContents, type NativeImage } from "electron";
import { createLookupWindow, destroyLookupWindows, hasLookupWindows } from "./windows";
import { createLogger } from "./../src/shared/logging";
import { ocrReadings } from "../src/shared/chrome/ocr-variants";
import type { Ocr } from "./ocr";
import type { GrabPurpose, Rect } from "../src/shared/types";

const log = createLogger("lookup");

export interface Lookup {
  /** Freeze the screens and put a selector over each. `purpose` says what the drag is for; item lookup is the default. */
  open(purpose?: GrabPurpose): Promise<void>;
  /** OCR the selected region and route the text onward; resolves the read text. */
  capture(rect: Rect, view: { width: number; height: number }, sender: WebContents): Promise<string>;
  /** A selector reporting it is mounted and listening — the only thing that puts it on screen. Answers what the grab is for. */
  ready(sender: WebContents): GrabPurpose | undefined;
  cancel(): void;
  /** Whether selectors are currently on screen — lets the hotkey call off a lookup it started. */
  isOpen(): boolean;
}

/**
 * Which of several readings of one grab to search for — the raw text and its OCR corrections, in
 * order (`ocr-variants.ts`). Injected because judging them needs the names we know, which is the
 * wiki's index and none of this module's business; the default believes what OCR read.
 */
export type PickReading = (readings: readonly string[]) => string;

const believeOcr: PickReading = (readings) => readings[0] ?? "";

/**
 * What a stats grab does with its crop: read it and say so. `null` means there was no screen to crop
 * from. Injected for the same reason `pickReading` is — judging the numbers is nothing to do with how a
 * grab is taken — and it may take a few seconds, which the grab waits for without holding the screen.
 */
export type StatsGrab = (shot: NativeImage | null) => void | Promise<void>;

interface Selector {
  win: BrowserWindow;
  reveal(): void;
  display: Electron.Display;
  image: NativeImage | null;
}

/**
 * How a crop is prepared for OCR.
 *
 * Tesseract reads enlarged text markedly better, and an item name grabbed from a game UI is small —
 * so a narrow crop is scaled up toward `targetWidth`. Capped, because interpolating past 2× invents
 * detail rather than revealing it, and never downscaled: throwing pixels away can only lose letters.
 */
const UPSCALE = {
  targetWidth: 1600,
  maxFactor: 2,
  /** Don't pay for a resize that changes nothing — anything under this is the same image. */
  worthIt: 1.01,
} as const;

/** A crop smaller than this (px) is noise from a stray drag; OCR the whole grab instead. */
const MIN_CROP_PX = 4;

/**
 * How long a lookup may hold the screen, per phase, before it gives up and closes.
 *
 * The selectors are fullscreen and take input, so every second one lives past its usefulness is a
 * second the user cannot click their game — and a selector whose renderer never loaded, or a read
 * that never returns, would otherwise hold that forever. Both budgets end the same way: close
 * everything. Restarting a lookup costs one keypress; losing the mouse costs the fight.
 */
const DEADLINE = {
  /**
   * Waiting for a selector to report it is listening. Covers the page load, hydration, and a dev
   * server compiling the route; past it the screenshot is stale anyway, so there is nothing to show.
   */
  ready: 5_000,
  /**
   * Waiting for a drag: long enough to aim at a frozen tooltip, short enough that a dead selector is
   * a blip. Timed from the moment a selector is actually on screen, not from the hotkey.
   */
  select: 10_000,
  /**
   * Showing "reading text…" after a region was chosen. This gives up on *showing* the read, not on
   * the read: a first run that spends a minute downloading the language model still fills Search
   * when it lands — it just doesn't get to sit on top of the game while it does.
   */
  ocr: 6_000,
} as const;

/** OCR output is noisy — collapse whitespace and drop obvious junk characters. */
function cleanText(text: string): string {
  return text
    .replace(/[^A-Za-z0-9'’:+\-.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * What OCR returned → the text we hand to Search: junk stripped, then the font's own misreadings
 * corrected against what we know ([ADR 0081](../specs/decisions/0081-an-ocr-grab-is-corrected-before-it-is-searched.md)).
 * Two steps, both elsewhere — this only says they happen in that order.
 */
function readingOf(raw: string, pick: PickReading): string {
  const readings = ocrReadings(cleanText(raw));
  if (readings.length < 2) return readings[0] ?? "";
  const chosen = pick(readings);
  log.debug(`readings ${JSON.stringify(readings)} → ${JSON.stringify(chosen)}`);
  return chosen;
}

/**
 * The selected region mapped from the window's viewport onto image pixels, by ratio. This is
 * unit-agnostic: whether the window reports client coords in DIP or physical px, image/view
 * converts correctly. Assumes the window covers the display. Clamped, so a drag that ends off the
 * edge crops to it rather than failing.
 */
function cropIn(image: { width: number; height: number }, rect: Rect, view: { width: number; height: number }): Rect {
  const rx = image.width / Math.max(1, view.width);
  const ry = image.height / Math.max(1, view.height);
  const x = Math.max(0, Math.min(Math.round(rect.x * rx), image.width - 1));
  const y = Math.max(0, Math.min(Math.round(rect.y * ry), image.height - 1));
  return {
    x,
    y,
    width: Math.max(1, Math.min(Math.round(rect.width * rx), image.width - x)),
    height: Math.max(1, Math.min(Math.round(rect.height * ry), image.height - y)),
  };
}

/** The selection itself — or the whole grab, when the drag was too small to mean anything. */
function croppedTo(image: NativeImage, crop: Rect): NativeImage {
  return crop.width > MIN_CROP_PX && crop.height > MIN_CROP_PX ? image.crop(crop) : image;
}

/** The grab as Tesseract wants it: cropped to the selection, then enlarged per `UPSCALE`. */
function forOcr(image: NativeImage, crop: Rect): NativeImage {
  const cropped = croppedTo(image, crop);
  const size = cropped.getSize();
  const factor = Math.max(1, Math.min(UPSCALE.maxFactor, UPSCALE.targetWidth / Math.max(1, size.width)));
  if (factor <= UPSCALE.worthIt) return cropped;
  return cropped.resize({
    width: Math.round(size.width * factor),
    height: Math.round(size.height * factor),
    quality: "best",
  });
}

/**
 * Screenshot each display at its OWN native resolution and map display id → image.
 * A single shared thumbnailSize would stretch monitors whose resolution/aspect
 * differs from it (distorting the OCR image and the crop), so we request each
 * display's native size separately. `display_id` is often empty on Windows, so we
 * fall back to source order, then to the first source, so a display is never blank.
 */
async function grabAllDisplays(displays: Electron.Display[]): Promise<Map<number, NativeImage>> {
  const byId = new Map<number, NativeImage>();
  await Promise.all(
    displays.map(async (d, i) => {
      const scale = d.scaleFactor || 1;
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: Math.round(d.size.width * scale), height: Math.round(d.size.height * scale) },
      });
      const src = sources.find((s) => s.display_id && String(s.display_id) === String(d.id)) ?? sources[i] ?? sources[0];
      if (src?.thumbnail && !src.thumbnail.isEmpty()) {
        byId.set(d.id, src.thumbnail);
        const t = src.thumbnail.getSize();
        log.debug(
          `display ${d.id}: bounds=${JSON.stringify(d.bounds)} size=${d.size.width}x${d.size.height}` +
            ` scale=${d.scaleFactor} thumb=${t.width}x${t.height} matchedById=${!!(src.display_id && String(src.display_id) === String(d.id))}`,
        );
      }
    }),
  );
  return byId;
}

/**
 * `onText` receives the recognized text (empty string if none) to route to Search; `pickReading`
 * chooses between OCR's raw reading and its corrections, defaulting to the raw one. `onStats` takes the
 * crop of a grab opened for `"stats"`; without it every grab is an item lookup.
 */
export function createLookup(ocr: Ocr, onText: (text: string) => void, pickReading: PickReading = believeOcr, onStats?: StatsGrab): Lookup {
  let selectors: Selector[] = [];
  // What the grab now open is for. Set by `open()`, read by `ready()` (so the selector can say so) and by
  // `capture()` (so the crop goes to the right place); a lookup is one at a time, so one value is enough.
  let purpose: GrabPurpose = "item";
  // `open()` captures the screens (100s of ms) before it assigns `selectors`. It's
  // reachable from both the hotkey and IPC, so guard against a second call racing inside
  // that window — otherwise the first call's fullscreen, input-blocking windows are
  // orphaned (never in `selectors`, so never closed).
  let opening = false;
  let deadline: NodeJS.Timeout | null = null;
  let escapeHeld = false;

  function clearDeadline(): void {
    if (deadline) clearTimeout(deadline);
    deadline = null;
  }

  /** Free the screen after `ms`, whatever phase we're in. Replaces any deadline already running. */
  function armDeadline(ms: number, phase: string): void {
    clearDeadline();
    deadline = setTimeout(() => {
      deadline = null;
      if (!selectors.length) return;
      log.warn(`lookup abandoned: no ${phase} within ${ms}ms — closing selectors`);
      closeAll();
    }, ms);
  }

  /**
   * Every selector goes, `except` an optional survivor (the read's progress window).
   *
   * Delegated to `windows.ts` rather than looping over `selectors`, because a window this module
   * never recorded is the one most likely to be stuck on screen — closing only what we remembered is
   * how a lookup becomes unkillable.
   */
  function closeAll(except?: BrowserWindow): void {
    const gone = destroyLookupWindows(except);
    const tracked = selectors.filter((s) => s.win !== except).length;
    if (gone > tracked) log.warn(`closed ${gone - tracked} selector window(s) that were not being tracked`);
    selectors = except ? selectors.filter((s) => s.win === except && !s.win.isDestroyed()) : [];
    if (!selectors.length) {
      clearDeadline(); // nothing left to time out
      releaseEscape();
    }
  }

  /**
   * Escape, for as long as a lookup is open.
   *
   * The hint promises "Esc to cancel" and the window's own key handler can only deliver that while it
   * has focus and has hydrated — neither of which is guaranteed, and both of which fail exactly when
   * the user most needs out. A global shortcut is delivered whatever has focus. Held only for the
   * seconds a lookup lives, so the game gets its Escape back immediately.
   */
  function claimEscape(): void {
    if (escapeHeld) return;
    escapeHeld = globalShortcut.register("Escape", () => {
      log.debug("Escape pressed — cancelling lookup");
      closeAll();
    });
    if (!escapeHeld) log.warn("could not register Escape; the selector's own handler is the only way out");
  }

  function releaseEscape(): void {
    if (!escapeHeld) return;
    escapeHeld = false;
    globalShortcut.unregister("Escape");
  }

  const find = (sender: WebContents) =>
    selectors.find((s) => !s.win.isDestroyed() && s.win.webContents === sender);

  return {
    async open(wanted = "item") {
      if (opening) return; // a capture is already being set up; don't stack a second set
      opening = true;
      try {
        closeAll();
        purpose = wanted === "stats" && onStats ? "stats" : "item";
        const displays = screen.getAllDisplays();
        // Capture BEFORE creating any window, so the shot has neither our UI nor a
        // tooltip that would vanish when our window steals focus.
        const images = await grabAllDisplays(displays).catch((e) => {
          log.warn("screen capture failed:", (e as Error).message);
          return new Map<number, NativeImage>();
        });
        // The model download is the one part of a read that isn't quick; start it now so it's paid
        // for while the user aims rather than out of the read's budget.
        ocr.warm();
        claimEscape();
        // Registered one at a time rather than assigned from a `map`: a throw partway through would
        // otherwise leave the windows built so far outside `selectors`, which means never closed.
        for (const display of displays) {
          const { win, reveal } = createLookupWindow(display.bounds);
          selectors.push({ win, reveal, display, image: images.get(display.id) ?? null });
          win.on("closed", () => {
            selectors = selectors.filter((s) => s.win !== win);
          });
          // Three ways a selector can end up unable to take the drag it exists for. All of them mean
          // the same thing — a pane of glass over the screen — so all of them end the lookup rather
          // than leave one on show.
          win.webContents.on("did-fail-load", (_e, code, desc, _url, isMainFrame) => {
            // -3 is ERR_ABORTED, which is what being destroyed mid-load looks like; not a failure.
            if (!isMainFrame || code === -3) return;
            log.warn(`selector for display ${display.id} failed to load (${code} ${desc}) — cancelling lookup`);
            closeAll();
          });
          // Escape, read in **main** before the page sees it. The renderer's own handler needs a
          // hydrated page; this needs only a focused window, which is the case the report described.
          win.webContents.on("before-input-event", (_e, input) => {
            if (input.type !== "keyDown" || input.key !== "Escape") return;
            log.debug("Escape in selector window — cancelling lookup");
            closeAll();
          });
          win.on("unresponsive", () => {
            log.warn(`selector for display ${display.id} stopped responding — cancelling lookup`);
            closeAll();
          });
          win.webContents.on("render-process-gone", (_e, details) => {
            log.warn(`selector for display ${display.id} renderer gone (${details.reason}) — cancelling lookup`);
            closeAll();
          });
        }
        armDeadline(DEADLINE.ready, "selector reporting in");
      } finally {
        opening = false;
      }
    },

    isOpen() {
      // Asks `windows.ts`, not `selectors`: the hotkey is a rescue as much as a shortcut, so it has to
      // see a selector this module has lost track of — that one is the reason someone is reaching for it.
      return hasLookupWindows();
    },

    /**
     * Show the selector that just said it is listening, and start the drag clock.
     *
     * The drag budget is timed from here rather than from the hotkey, because a window nobody can see
     * yet has not been offered to anyone. On a multi-monitor setup each display reports separately;
     * the first one in re-arms the deadline and the rest are already inside it.
     */
    ready(sender) {
      const sel = find(sender);
      if (!sel) return undefined; // a report from a selector we have already closed
      sel.reveal();
      armDeadline(DEADLINE.select, "selection");
      return purpose;
    },

    cancel() {
      closeAll();
    },

    async capture(rect, view, sender) {
      const sel = find(sender) ?? selectors[0];
      closeAll(sel?.win); // region chosen — drop the other monitors, keep this one for the loading state
      armDeadline(DEADLINE.ocr, "read"); // the kept window shows progress; it doesn't get to stay
      const grabbing = purpose; // a new open() mid-read must not redirect this one's result
      if (!sel?.image) {
        closeAll();
        if (grabbing === "stats") await onStats?.(null);
        else onText("");
        return "";
      }
      try {
        const img = sel.image;
        const isize = img.getSize();
        const crop = cropIn(isize, rect, view);
        const cb = (() => {
          try {
            return sel.win.getContentBounds();
          } catch {
            return null;
          }
        })();
        log.debug(
          `crop display ${sel.display.id}: rect=${JSON.stringify(rect)} view=${view.width}x${view.height}` +
            ` displaySize=${sel.display.size.width}x${sel.display.size.height} scale=${sel.display.scaleFactor}` +
            ` content=${JSON.stringify(cb)} img=${isize.width}x${isize.height} → ${JSON.stringify(crop)}`,
        );
        if (grabbing === "stats") {
          // The selector gives up on *showing* the read at its deadline; the read itself carries on and
          // lands in the control window when it is done, the way a slow first item lookup lands in Search.
          await onStats?.(croppedTo(img, crop));
          closeAll();
          return "";
        }
        const text = readingOf(await ocr.recognize(forOcr(img, crop).toPNG()), pickReading);
        log.debug("OCR text:", JSON.stringify(text));
        closeAll(); // done — close the last selector; main brings itself forward
        onText(text);
        return text;
      } catch (e) {
        log.warn("capture failed:", (e as Error).message);
        closeAll();
        if (grabbing === "stats") await Promise.resolve(onStats?.(null)).catch(() => {});
        else onText("");
        return "";
      }
    },
  };
}
