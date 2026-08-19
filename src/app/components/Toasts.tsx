"use client";
import { useEffect, useState } from "react";
import { toastTiming, useToasts, type Toast } from "@/lib/toast";

/**
 * The stack of brief notices in the corner of a window.
 *
 * **Mount this once per window and nothing else has to know about toasts** — anything in it can then
 * call `showToast` (see `lib/toast.ts`). Mounted by the shell rather than by a panel, and outside the
 * shell's own clipped box, so a notice outlives the tab that raised it: pressing + on Search and
 * switching to List must not swallow the answer.
 *
 * Click-through (`PASS_THROUGH`) covers the panel, not this: a notice is ours to show and the game
 * gets the clicks under it either way, since nothing here is worth pointing at.
 */
export default function Toasts() {
  const { toasts, dismiss } = useToasts();
  if (!toasts.length) return null;
  return (
    <div className="toasts">
      {/* Keyed by `id`, not by what the notice is about: a second press on the same row arrives as a
          *new* id in the old one's slot, and remounting is what restarts its life and its animation
          rather than swapping the words under a card that is already halfway gone. */}
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDone={() => dismiss(t.id)} />
      ))}
    </div>
  );
}

/**
 * One card, which owns its own lifetime: it fades out shortly before it's dropped, so the exit is
 * animated rather than a disappearance. Clicking it dismisses it early.
 */
function ToastCard({ toast, onDone }: { toast: Toast; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const { life, leaveAt } = toastTiming(toast.ms);
    const out = setTimeout(() => setLeaving(true), leaveAt);
    const gone = setTimeout(onDone, life);
    return () => {
      clearTimeout(out);
      clearTimeout(gone);
    };
    // The card's life starts when it mounts and is fixed for that mount; `onDone` is a fresh closure
    // each render, and restarting the timers on every one would keep a toast up for ever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      className={`toast tone-${toast.tone ?? "info"} ${leaving ? "leaving" : ""}`}
      title="Dismiss"
      onClick={onDone}
    >
      <div className="toast-title">{toast.title}</div>
      {toast.detail && <div className="toast-detail">{toast.detail}</div>}
    </div>
  );
}
