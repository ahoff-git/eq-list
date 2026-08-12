"use client";
import { api } from "@/lib/api";
import MaximizeButton from "./MaximizeButton";

/**
 * The three controls at the right of a frameless window's title bar: minimize, maximize, dismiss.
 *
 * The main window and the map window each spelled these out, which is how the glyphs and titles drift
 * apart — and a title bar whose buttons don't match the one next to it looks like a different program.
 * What genuinely differs is only what **dismiss** means: the main window hides to the tray and stays
 * running (it's watching the log), while the map window is closed outright and reopened on demand.
 *
 * `MaximizeButton` stays its own component because it owns state — see its own note.
 */
export default function WindowButtons({ dismiss, dismissTitle }: { dismiss: () => void; dismissTitle: string }) {
  return (
    <>
      <button className="wc" title="Minimize" onClick={() => api()?.win.minimize()}>
        —
      </button>
      <MaximizeButton />
      <button className="wc" title={dismissTitle} onClick={dismiss}>
        ✕
      </button>
    </>
  );
}
