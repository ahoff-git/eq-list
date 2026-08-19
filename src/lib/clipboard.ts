"use client";
import { showToast } from "./toast";
import { createLogger } from "@/shared/logging";

/**
 * clipboard.ts — copy something, and say so.
 *
 * A copy button is the same silent gesture an add used to be
 * ([ADR 0106](../../specs/decisions/0106-an-add-says-what-it-did.md)): the clipboard is invisible,
 * nothing on screen changes, and `navigator.clipboard` is a promise nobody was awaiting — so a copy
 * that never happened (no clipboard in this context, or the write rejected) looked exactly like one
 * that did. Both share codes and the meter's summary line are meant to be pasted somewhere else, so
 * "did that work" is a question the player can only answer by leaving the app and finding out.
 *
 * One notice for the clipboard, keyed as such: copying twice is one thing said twice, and the second
 * card would only be able to disagree with the first.
 */
const log = createLogger("clipboard");

/** How the notice names what was copied — `what` finishes "Copied …". */
export async function copyText(text: string, what: string): Promise<void> {
  const key = "clipboard";
  try {
    // Optional rather than assumed: it's absent in an insecure context and in some embedded ones, and
    // the old `void navigator.clipboard?.writeText(…)` swallowed exactly that case.
    if (!navigator.clipboard) throw new Error("no clipboard in this window");
    await navigator.clipboard.writeText(text);
    showToast({ title: `Copied ${what}`, tone: "good", key });
  } catch (err) {
    log.warn("copy failed", err);
    showToast({
      title: `Couldn't copy ${what}`,
      // The reason, because the fix is never in the app: it's the window's permissions or the OS.
      detail: err instanceof Error ? err.message : "the clipboard refused it",
      tone: "bad",
      key,
    });
  }
}
