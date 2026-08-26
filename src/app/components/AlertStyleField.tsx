"use client";
import { api } from "@/lib/api";
import { useSettings, useStyleUsage } from "@/lib/hooks";
import {
  alertStyle,
  defaultsUse,
  describeUse,
  newStyleId,
  nextStyleName,
  styleUse,
} from "@/shared/alert-styles";
import AlertStyleFields from "./AlertStyleFields";
import { PickField } from "./ui";
import type { AlertStyle, CastAlertSettings, NamedAlertStyle } from "@/shared/types";

/**
 * Picking a look, and editing it, **where the thing that wears it lives** — a spawn timer, a tracked
 * buff, the scoreboard's celebration, the shopping list.
 *
 * The picker on its own was a dead end. It named a look and then said, in a tooltip, that the look
 * itself was edited somewhere else — so "make this one green" meant leaving the board you were on,
 * finding the Alerts tab, finding the right row in a list of looks whose names you chose weeks ago,
 * and coming back. The style was findable only by someone who already knew where it was.
 *
 * So the editor comes to the row. It is the **same six controls** ([AlertStyleFields](./AlertStyleFields.tsx))
 * in the same drawer the Alerts tab opens, which is what keeps
 * [ADR 0090](../../../specs/decisions/0090-one-style-editor-at-a-time.md) true in spirit: there is
 * still one editor, it has just stopped being in one *place*.
 *
 * **What an edit here means is the shared meaning, not a private one.** A saved style is a shared
 * thing, and changing it changes it for everything wearing it — exactly as it does in the Alerts
 * tab's list, and exactly as the drawer under a feature's row there already did. The line above the
 * controls says who that is, in the same words, before a single swatch is clicked. The alternative —
 * forking silently, the way editing from a *rule* does — is right for a rule (a rule is one specific
 * thing you wrote) and wrong here: a player who opens this from a buff row is nearly always saying
 * "buff alerts should look like this", and a fork would answer a question they didn't ask while
 * quietly breeding near-identical styles nobody named.
 *
 * Making **this one** different is still one click, and an explicit one: the picker's last entry
 * forks the look into a saved style of its own and opens it. Saying so out loud is the whole
 * difference — the fork is a thing you chose rather than a thing that happened to you.
 */

/** Picker sentinel for "copy this look into one of my own". Not an id — no style can collide. */
const FORK = "+fork";

/**
 * The picker plus the 🎨 that opens the drawer.
 *
 * `open`/`onOpen` are the host's, like [StyleRow](./StyleRow.tsx)'s: these rows already own "which of
 * my drawers is open", and a field that decided for itself could open next to one of theirs.
 */
export default function AlertStyleField({
  styleId,
  fallback,
  blank,
  title,
  onPick,
  open,
  onOpen,
}: {
  /** The saved style this thing wears, if it picked one. */
  styleId?: string;
  /**
   * The saved style `blank` actually *means* — a feature's built-in look, worn by everything that
   * picked nothing. Absent where blank means the alert defaults (only the celebration can be there).
   */
  fallback?: string;
  /** What the blank choice is called here: "Spawn timer (default)", "Alert defaults". */
  blank: string;
  title?: string;
  /** Wear a different saved style, or `null` to go back to the blank one. */
  onPick: (styleId: string | null) => void;
  open: boolean;
  onOpen: () => void;
}) {
  const ca = useSettings()?.castAlerts;
  if (!ca) return null;
  const styles = ca.styles ?? [];
  const worn = wornStyle(ca, styleId, fallback);

  /**
   * Copy what this thing looks like **right now** into a style of its own, wear it, and open it.
   *
   * From the resolved look rather than from the defaults, for the same reason a rule's fork is
   * ([`applyStyleEdit`](../../shared/alert-styles.ts)): the copy should be what was on screen a
   * moment ago, so the only thing that changes is what you change next.
   */
  const fork = () => {
    const fresh: NamedAlertStyle = {
      id: newStyleId(styles),
      name: nextStyleName(styles, worn?.name),
      style: worn ? { ...worn.style } : alertStyle(ca),
    };
    void api()?.settings.update({ castAlerts: { styles: [...styles, fresh] } });
    onPick(fresh.id);
    if (!open) onOpen();
  };

  return (
    <>
      <PickField
        // The fallback is already the blank choice, so listing it again would be the same look twice
        // under two names. A thing that stored it explicitly reads as blank, which is what it is.
        value={styleId && styleId !== fallback ? styleId : ""}
        blank={blank}
        options={[
          ...styles.filter((s) => s.id !== fallback).map((s) => ({ value: s.id, label: s.name })),
          { value: FORK, label: "＋ New style from this one…" },
        ]}
        onChange={(choice) => (choice === FORK ? fork() : onPick(choice || null))}
        title={title}
      />
      <button
        className={`btn ghost sm ${open ? "on" : ""}`}
        title={open ? "Close" : `Edit ${worn ? `“${worn.name}”` : "the alert defaults"} — the look this wears`}
        onClick={onOpen}
      >
        🎨
      </button>
    </>
  );
}

/**
 * The drawer the 🎨 opens: who else this changes, then the controls.
 *
 * A sibling of the field rather than a child, because the rows it goes in are wrapping flex lines and
 * a drawer belongs on its own line under the row that opened it — the shape `.spawn-edit` and a
 * rule's drawer already have. It re-derives the worn style from the same two props the field gets, so
 * there is no third piece of state for the two halves to disagree about.
 */
export function AlertStyleDrawer({
  styleId,
  fallback,
  forkable,
}: {
  styleId?: string;
  fallback?: string;
  /**
   * Whether a picker sits beside this drawer offering the fork. Two of the places that open it have
   * none — the shopping list and the Alerts tab's feature rows, where the look belongs to a whole
   * feature — and pointing at an option that isn't there is worse than saying nothing.
   */
  forkable?: boolean;
}) {
  const ca = useSettings()?.castAlerts;
  // Only mounted while a drawer is open, which is what makes this affordable on a board of 200 rows:
  // the usage read is per open editor, not per row.
  const usage = useStyleUsage();
  if (!ca) return null;
  const worn = wornStyle(ca, styleId, fallback);
  const styles = ca.styles ?? [];

  // A saved style is edited in the list; the defaults *are* the cast-alert settings, so they are
  // edited in place — the same two writes the Alerts tab makes, so a look has one way of changing.
  const onChange = (over: Partial<AlertStyle>) =>
    void api()?.settings.update(
      worn
        ? { castAlerts: { styles: styles.map((s) => (s.id === worn.id ? { ...s, style: { ...s.style, ...over } } : s)) } }
        : { castAlerts: over },
    );

  return (
    <div className="style-editor">
      {/* Said before the controls, not after the damage: these looks are shared, and the one thing a
          player needs to know before touching a swatch is how far the change reaches. */}
      <span className="hint" style={{ display: "block", marginBottom: 6 }}>
        {worn ? `“${worn.name}” is ${describeUse(styleUse(ca, worn.id, usage))}` : `The alert defaults are ${describeUse(defaultsUse(ca, usage))}`}
        {" "}— changing {worn ? "it" : "them"} here changes {worn ? "it" : "them"} for all of them.
        {forkable && (
          <>
            {" "}To leave the others alone, pick <b>＋ New style from this one…</b> instead.
          </>
        )}
      </span>
      <AlertStyleFields style={worn ? worn.style : ca} locations={ca.locations} onChange={onChange} />
    </div>
  );
}

/**
 * The saved style a thing wears: what it picked, else the built-in its blank choice stands for.
 *
 * `undefined` means the alert defaults, which are not a saved style and have no id — the one case
 * both halves have to treat differently, so it is worth having one answer to.
 */
function wornStyle(
  ca: CastAlertSettings,
  styleId?: string,
  fallback?: string,
): NamedAlertStyle | undefined {
  const id = styleId ?? fallback;
  return id ? (ca.styles ?? []).find((s) => s.id === id) : undefined;
}
