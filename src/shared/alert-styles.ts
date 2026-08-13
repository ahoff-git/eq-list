/**
 * alert-styles.ts — how an alert looks: resolving it, and what changing it means.
 *
 * `alertStyle` is the resolution — three layers into the one `AlertStyle` that travels with an alert.
 * Everything after it is about *editing* a look, which is a harder question than it sounds because a
 * saved style is shared.
 *
 * A saved style is a **shared thing with a name**. That makes "change the colour" ambiguous in a way
 * a per-rule style never was, and the ambiguity is the whole problem this module exists to settle:
 *
 *   - Editing it **from a rule** means "I want *this rule* to look different." It must not reach
 *     across and restyle every other rule wearing the same style, and it must not quietly leave the
 *     rule wearing the shared style with an invisible layer of its own on top — that layer is a
 *     third thing nobody asked for, and it makes the picker a lie.
 *   - Editing it **as a style**, in the Saved styles list, means "this look is wrong." That one
 *     *should* change every rule wearing it. It is a different gesture in a different place.
 *
 * So: **changing a shared style from a rule forks it.** You used a style, you changed it, and what
 * you have now is a new style — which is exactly what you'd have said you were doing. The one case
 * that doesn't fork is a style **nobody else wears**, where there is no one to protect and forking
 * would only litter the list with near-identical copies.
 *
 * `plan` decides; the caller applies. Pure, so both halves are testable without a browser, and so
 * the panel can *say* which of the three is about to happen before the player commits to it.
 */
import type { AlertStyle, CastAlertSettings, CastWatch, NamedAlertStyle } from "./types";

/**
 * The style an alert should use: the **defaults**, then the **saved style** the watch wears, then
 * the watch's **own** look, field by field.
 *
 * A watch normally has one or the other — editing a shared style from a watch forks it rather than
 * layering on top (see `plan` below) — but the layering is what reads a settings file where both are
 * set, and what lets a look saved before a field existed still pick that field up from below.
 *
 * Resolved at the moment of the alert and **sent with it**, rather than letting the overlay read the
 * settings itself. The overlay would only know the defaults, so a watch's own colour would never
 * reach the screen; and an alert already up shouldn't restyle itself because a later one had
 * different ideas.
 *
 * A `styleId` that no longer resolves — the saved style was deleted — falls through to the defaults,
 * for the same reason a deleted custom spot falls back to the top of the screen: an alert that can't
 * be styled must still be *seen*.
 */
export function alertStyle(settings: CastAlertSettings, watch?: CastWatch | null): AlertStyle {
  const base: AlertStyle = {
    sound: settings.sound,
    flash: settings.flash,
    color: settings.color,
    soundName: settings.soundName,
    position: settings.position,
    durationMs: settings.durationMs,
    animation: settings.animation,
  };
  const saved = watch?.styleId ? settings.styles?.find((s) => s.id === watch.styleId)?.style : undefined;
  return layer(layer(base, saved), watch?.style);
}

/** Lay a partial style over a full one, ignoring keys it didn't set — `{color: undefined}` is not a choice. */
function layer(base: AlertStyle, over?: Partial<AlertStyle>): AlertStyle {
  if (!over) return base;
  const set = Object.fromEntries(Object.entries(over).filter(([, v]) => v !== undefined));
  return { ...base, ...set };
}

/**
 * The picker's value for "its own look" — not an id, because an unnamed look has none. A sentinel
 * rather than a blank so it can't be confused with the defaults, which *are* the blank.
 */
export const OWN_STYLE = "own";

/** What editing this rule's look will do. */
export type StyleEditMode =
  /** It has a look of its own, shared with nobody: change it in place. */
  | "own"
  /** It wears a saved style nobody else does: change that style in place. */
  | "in-place"
  /** It wears something shared — a saved style with other wearers, or the defaults: fork. */
  | "fork";

/** How many rules wear this saved style. Shown beside it, so "shared" is never a surprise. */
export function styleWearers(settings: CastAlertSettings, styleId: string): number {
  return settings.watches.filter((w) => w.styleId === styleId).length;
}

/** The saved style this watch wears, if it wears one that still exists. */
export function wornStyle(settings: CastAlertSettings, watch: CastWatch): NamedAlertStyle | undefined {
  return watch.styleId ? settings.styles?.find((s) => s.id === watch.styleId) : undefined;
}

/**
 * What changing this rule's look will do, and the sentence to say so with.
 *
 * A rule on **the defaults** forks too: the defaults are every rule's fallback, so editing them from
 * one rule is the same overreach as editing a shared style from one rule.
 */
export function plan(settings: CastAlertSettings, watch: CastWatch): { mode: StyleEditMode; note: string } {
  const worn = wornStyle(settings, watch);
  if (!worn) {
    if (watch.style) return { mode: "own", note: "This rule has a look of its own. Changes stay here." };
    return { mode: "fork", note: "Changing this makes a new saved style for this rule — the defaults are shared." };
  }
  const wearers = styleWearers(settings, worn.id);
  if (wearers > 1) {
    return {
      mode: "fork",
      note: `${wearers} rules wear “${worn.name}”, so changing it here makes a copy for this one. To change it for all of them, edit it under Saved styles.`,
    };
  }
  return { mode: "in-place", note: `Editing “${worn.name}”. No other rule wears it.` };
}

/** Both halves of an edit: the style list as it should now be, and the patch for the rule. */
export interface StyleEdit {
  styles: NamedAlertStyle[];
  watch: Partial<CastWatch>;
  /** What just happened, when it's worth saying — a fork, mainly, since it made something new. */
  said?: string;
}

/**
 * Apply a change to this rule's look, by whichever of the three routes applies.
 *
 * Returns both lists rather than mutating either, and returns them **together**, because a fork is
 * two writes that must not be seen apart: a rule pointing at a style that doesn't exist yet would
 * render as the defaults for a frame, and a style nothing points at is litter.
 */
export function applyStyleEdit(
  settings: CastAlertSettings,
  watch: CastWatch,
  over: Partial<AlertStyle>,
): StyleEdit {
  const styles = settings.styles ?? [];
  const { mode } = plan(settings, watch);

  if (mode === "own") {
    return { styles, watch: { style: { ...watch.style, ...over } } };
  }
  if (mode === "in-place") {
    const id = watch.styleId;
    return { styles: styles.map((s) => (s.id === id ? { ...s, style: { ...s.style, ...over } } : s)), watch: {} };
  }

  // Fork. The new style starts from what this rule *currently looks like* — resolved through every
  // layer — so the copy is what was on screen a moment ago plus the one change, rather than a
  // surprise assembled from the defaults.
  const worn = wornStyle(settings, watch);
  const fresh: NamedAlertStyle = {
    id: newStyleId(styles),
    name: nextStyleName(styles, worn?.name),
    style: { ...alertStyle(settings, watch), ...over },
  };
  return {
    styles: [...styles, fresh],
    // The rule's own layer is cleared: everything it said is baked into the copy, and leaving it
    // would put an invisible override back on top of the style the picker claims it's wearing.
    watch: { styleId: fresh.id, style: undefined },
    said: `Made a new style, “${fresh.name}”.`,
  };
}

/** Promote a rule's own look into the shared list, so other rules can wear it too. */
export function nameOwnStyle(settings: CastAlertSettings, watch: CastWatch): StyleEdit {
  const styles = settings.styles ?? [];
  const fresh: NamedAlertStyle = {
    id: newStyleId(styles),
    name: nextStyleName(styles),
    style: alertStyle(settings, watch),
  };
  return { styles: [...styles, fresh], watch: { styleId: fresh.id, style: undefined }, said: `Saved as “${fresh.name}”.` };
}

/** `Loud copy`, then `Loud copy 2` — and `Style 3` for a fork off the defaults, which have no name. */
export function nextStyleName(styles: NamedAlertStyle[], from?: string): string {
  const taken = new Set(styles.map((s) => s.name));
  const base = from ? `${from} copy` : `Style ${styles.length + 1}`;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const name = `${base} ${n}`;
    if (!taken.has(name)) return name;
  }
}

/**
 * An id for a new style. Sequential rather than random because this module is pure and has to be
 * testable — and because the ids only ever have to be unique within one settings file.
 */
export function newStyleId(styles: NamedAlertStyle[]): string {
  const used = new Set(styles.map((s) => s.id));
  for (let n = styles.length + 1; ; n++) {
    const id = `style-${n}`;
    if (!used.has(id)) return id;
  }
}
