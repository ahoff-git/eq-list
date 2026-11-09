"use client";
import { api } from "@/lib/api";
import { useStatsHotkey } from "@/lib/items/useStatsHotkey";
import { exportAgeText } from "@/shared/game-exports";
import { statMeta, type StatKey } from "@/shared/items/item-stats";
import type { StatsValues } from "@/shared/items/stats-page";
import type { Reason } from "@/shared/items/stats-drift";

const num = (n: number) => Math.round(n).toLocaleString();

/** A short list: the first few, then how many more — a rough capture can leave every figure in doubt. */
const listOf = (names: readonly string[], spelled = 6) => (names.length <= spelled ? names.join(", ") : `${names.slice(0, spelled).join(", ")} and ${names.length - spelled} more`);

/**
 * Where your real stats stand, and the one thing to do about it — said in words, with the keys.
 *
 * The planner counts what your race, classes and gear give; the rest (class HP, AAs, buffs) is what the game's
 * Inventory window shows, and the app reads that off the screen (ADR 0368). Nothing about that is
 * discoverable from a slider, so this says it: *not read yet* → the two steps; *read* → when, and as whom;
 * *stale* → why, and the two ways out; *waiting* → for what; *unsure of a figure* → the figure, to confirm.
 *
 * Only ever for **your** character with the desktop app's screen capture — a peer's stats aren't yours to
 * read, and a browser has no screen to read.
 */
export default function StatsSource({
  haveDump,
  calibrated,
  readAt,
  classes,
  level,
  drift,
  waiting,
  unconfirmed,
  onAcknowledge,
  onConfirm,
  onDismiss,
}: {
  /** The app has seen what you wear — a read is measured against it, so without it there is nothing to read *into*. */
  haveDump: boolean;
  /** Any stat is calibrated (read or typed). */
  calibrated: boolean;
  /** When the screen was last read, if it has been. */
  readAt?: number;
  /** What the plan is using for who you are now. */
  classes: readonly string[];
  level: number;
  /** Why the read may be stale (`stats-drift.ts`); empty while it can be trusted. */
  drift: readonly Reason[];
  /** A read has come in and is waiting for the dump. */
  waiting: boolean;
  /** Figures the read was unsure of, awaiting a yes or no. */
  unconfirmed: StatsValues | null;
  onAcknowledge?: () => void;
  onConfirm: (keys: StatKey[]) => void;
  onDismiss: () => void;
}) {
  const open = () => void api()?.lookup.open("stats");
  const hotkey = useStatsHotkey();
  // The key can be refused (another program owns the chord): then the button is the only way, and it says so.
  const keyed = hotkey.works ? ` · ${hotkey.label}` : "";
  const how = `Open your Inventory window, then ${hotkey.works ? `press ${hotkey.label} (or this)` : "click this"} and drag over the whole window`;
  const keys = Object.keys(unconfirmed ?? {}) as StatKey[];
  const who = `${classes.length ? classes.join(" / ") : "no classes ticked"} at level ${level}`;

  return (
    <div className="stats-source small">
      {waiting && (
        <p className="warn">
          A stats read is waiting for your inventory dump. It is measured against what you wear, so the app has to have seen that first — in game, type{" "}
          <code>/outputfile inventory</code>.
        </p>
      )}

      {keys.length > 0 && unconfirmed && (
        <p className="warn">
          Not sure of {listOf(keys.map((k) => `${statMeta(k).label} ${num(unconfirmed[k] ?? 0)}?`))} — check {keys.length === 1 ? "it" : "them"} against your game&apos;s Inventory window.{" "}
          <button
            className="btn sm"
            disabled={!haveDump}
            onClick={() => onConfirm(keys)}
            title={haveDump ? "The figure is what the game shows: keep it" : "Needs your inventory dump first — a figure is measured against what you wear (/outputfile inventory in game)"}
          >
            Yes, use {keys.length === 1 ? "it" : "them"}
          </button>{" "}
          <button className="btn ghost sm" onClick={onDismiss} title="Leave it out — grab again, or type the right figure in its box below">
            No, leave {keys.length === 1 ? "it" : "them"} out
          </button>
        </p>
      )}

      {drift.length > 0 ? (
        <p className="warn">
          Your stats may have changed since you last read them — {drift.map((r) => r.text).join("; ")}. Floors count what you have beyond your gear from that read, so they are off until it is read again.{" "}
          <button className="btn sm" onClick={open} title={how}>
            Read my stats again{keyed}
          </button>{" "}
          {onAcknowledge && (
            <button className="btn ghost sm" onClick={onAcknowledge} title="Keep the stats as they are, and stop saying this until something else changes">
              Nothing&apos;s changed
            </button>
          )}
        </p>
      ) : readAt ? (
        <p className="muted">
          Your stats are as of {exportAgeText(Date.now() - readAt)} — measured as {who}.{" "}
          <button className="btn ghost sm" onClick={open} title={how}>
            Read again{keyed}
          </button>
        </p>
      ) : calibrated ? null : (
        <div>
          <p className="muted">
            Floors count what your race, classes and gear give. To count the rest — class HP, AAs, buffs — let the app read your game&apos;s Inventory window:
          </p>
          <ol className="stats-steps muted">
            <li>Open your Inventory window (I by default), on its Equipment tab, so Character Vitals and Stats and Resists show.</li>
            <li>
              {hotkey.works ? (
                <>
                  Press <b>{hotkey.label}</b> — or the button —
                </>
              ) : (
                <>
                  Click the button (the hotkey, {hotkey.label}, is taken by another program)
                </>
              )}{" "}
              and drag a box over the <b>whole window</b>. Take the top-right corner too (your name, level and classes), and your classes are filled in for you.
            </li>
          </ol>
          <button className="btn sm" onClick={open}>
            Read my stats from the game{keyed}
          </button>
          {!haveDump && (
            <p className="muted">
              No inventory dump yet, so there is nothing to measure it against — in game, type <code>/outputfile inventory</code> first.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
