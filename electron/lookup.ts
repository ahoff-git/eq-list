/**
 * lookup.ts — the screengrab item lookup.
 *
 * On open we FIRST screenshot every display (before any of our windows appear, so
 * a hovered game tooltip is frozen intact and none of our UI is captured), then
 * put a transparent fullscreen selector over each display. The user drags a box on
 * any monitor; we crop that display's already-captured image, OCR it, and hand the
 * text to the main window's Search box (`onText`). Per-display windows keep DPI
 * handling simple.
 */
import { desktopCapturer, screen, type BrowserWindow, type WebContents, type NativeImage } from "electron";
import { createLookupWindow } from "./windows";
import { createLogger } from "./../src/shared/logging";
import type { Ocr } from "./ocr";
import type { Rect } from "../src/shared/types";

const log = createLogger("lookup");

export interface Lookup {
  open(): Promise<void>;
  /** OCR the selected region and route the text onward; resolves the read text. */
  capture(rect: Rect, view: { width: number; height: number }, sender: WebContents): Promise<string>;
  cancel(): void;
}

interface Selector {
  win: BrowserWindow;
  display: Electron.Display;
  image: NativeImage | null;
}

/** OCR output is noisy — collapse whitespace and drop obvious junk characters. */
function cleanText(text: string): string {
  return text
    .replace(/[^A-Za-z0-9'’:+\-.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

/** `onText` receives the recognized text (empty string if none) to route to Search. */
export function createLookup(ocr: Ocr, onText: (text: string) => void): Lookup {
  let selectors: Selector[] = [];
  // `open()` captures the screens (100s of ms) before it assigns `selectors`. It's
  // reachable from both the hotkey and IPC, so guard against a second call racing inside
  // that window — otherwise the first call's fullscreen, input-blocking windows are
  // orphaned (never in `selectors`, so never closed).
  let opening = false;

  function closeAll(except?: BrowserWindow): void {
    for (const s of selectors) {
      if (s.win !== except && !s.win.isDestroyed()) s.win.close();
    }
    selectors = except ? selectors.filter((s) => s.win === except && !s.win.isDestroyed()) : [];
  }

  const find = (sender: WebContents) =>
    selectors.find((s) => !s.win.isDestroyed() && s.win.webContents === sender);

  return {
    async open() {
      if (opening) return; // a capture is already being set up; don't stack a second set
      opening = true;
      try {
        closeAll();
        const displays = screen.getAllDisplays();
        // Capture BEFORE creating any window, so the shot has neither our UI nor a
        // tooltip that would vanish when our window steals focus.
        const images = await grabAllDisplays(displays).catch((e) => {
          log.warn("screen capture failed:", (e as Error).message);
          return new Map<number, NativeImage>();
        });
        selectors = displays.map((display) => {
          const win = createLookupWindow(display.bounds);
          win.on("closed", () => {
            selectors = selectors.filter((s) => s.win !== win);
          });
          return { win, display, image: images.get(display.id) ?? null };
        });
      } finally {
        opening = false;
      }
    },

    cancel() {
      closeAll();
    },

    async capture(rect, view, sender) {
      const sel = find(sender) ?? selectors[0];
      closeAll(sel?.win); // region chosen — drop the other monitors, keep this one for the loading state
      if (!sel?.image) {
        closeAll();
        onText("");
        return "";
      }
      try {
        const img = sel.image;
        const isize = img.getSize();
        // Map the selection from the window's viewport to image pixels by ratio. This
        // is unit-agnostic: whether the window reports client coords in DIP or physical
        // px, image/view converts correctly. Assumes the window covers the display.
        const rx = isize.width / Math.max(1, view.width);
        const ry = isize.height / Math.max(1, view.height);
        let x = Math.round(rect.x * rx);
        let y = Math.round(rect.y * ry);
        x = Math.max(0, Math.min(x, isize.width - 1));
        y = Math.max(0, Math.min(y, isize.height - 1));
        const w = Math.max(1, Math.min(Math.round(rect.width * rx), isize.width - x));
        const h = Math.max(1, Math.min(Math.round(rect.height * ry), isize.height - y));
        const crop = { x, y, width: w, height: h };
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
        const cropped = w > 4 && h > 4 ? img.crop(crop) : img;
        // Upscale small crops — Tesseract reads enlarged text much better. Scale up
        // toward ~1600px wide, capped at 2x, never downscaling.
        const cs = cropped.getSize();
        const factor = Math.max(1, Math.min(2, 1600 / Math.max(1, cs.width)));
        const image =
          factor > 1.01
            ? cropped.resize({ width: Math.round(cs.width * factor), height: Math.round(cs.height * factor), quality: "best" })
            : cropped;
        const text = cleanText(await ocr.recognize(image.toPNG()));
        log.debug("OCR text:", JSON.stringify(text));
        closeAll(); // done — close the last selector; main brings itself forward
        onText(text);
        return text;
      } catch (e) {
        log.warn("capture failed:", (e as Error).message);
        closeAll();
        onText("");
        return "";
      }
    },
  };
}
