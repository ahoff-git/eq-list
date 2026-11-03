"use client";
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

/** Where each place was scrolled to when you left it, kept for the life of the window. */
const saved = new Map<string, number>();

/** How long to keep trying when the content isn't tall enough yet: about a second and a half of frames. */
const RESTORE_FRAMES = 90;

/**
 * Remembers how far a scrolling region was scrolled at each place, and puts it back when you return
 * by back, forward or a breadcrumb (`restore`). Arriving fresh (a tab click, a link) starts at the
 * top, as a browser does.
 *
 * Content that arrives after the switch (a list reading its data) may not be tall enough yet, so
 * restoring retries each frame until it lands or the player takes over by wheel, key or click — and
 * while it's pending, the clamped position the shorter content forces isn't saved over the real one.
 */
export function useScrollMemory(ref: RefObject<HTMLElement | null>, key: string, restore: boolean): void {
  const current = useRef(key);
  const pending = useRef(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    current.current = key;
    if (!restore) saved.delete(key);
    const target = restore ? (saved.get(key) ?? 0) : 0;
    el.scrollTop = target;
    if (!target) {
      pending.current = false;
      return;
    }

    pending.current = true;
    let frames = 0;
    let raf = 0;
    const interrupts = ["wheel", "pointerdown", "keydown"] as const;
    const stop = () => {
      pending.current = false;
      cancelAnimationFrame(raf);
      for (const e of interrupts) el.removeEventListener(e, stop);
    };
    const attempt = () => {
      el.scrollTop = target;
      if (Math.abs(el.scrollTop - target) < 2 || ++frames > RESTORE_FRAMES) return stop();
      raf = requestAnimationFrame(attempt);
    };
    for (const e of interrupts) el.addEventListener(e, stop, { passive: true });
    raf = requestAnimationFrame(attempt);
    return stop;
  }, [ref, key, restore]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      if (!pending.current) saved.set(current.current, el.scrollTop);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [ref]);
}
