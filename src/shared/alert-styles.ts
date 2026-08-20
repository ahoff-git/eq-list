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
 * A **feature's** look is the same question in different clothes. Three things alert with no rule at
 * all — a personal best, a spawn window opening, a tracked item dropping — and each is built on a
 * style the app ships (`ALERT_SOURCES`). They *wear* it, so they count as wearers, which is what the
 * old rules-only count was missing; and a feature cannot be without a look, so its style is
 * **sticky** — restyle it freely, but there is no deleting or renaming it (ADR 0120).
 *
 * `plan` decides; the caller applies. Pure, so both halves are testable without a browser, and so
 * the panel can *say* which of the three is about to happen before the player commits to it.
 */
import type {
  AlertLocation,
  AlertPositionValue,
  AlertStyle,
  CastAlertSettings,
  CastWatch,
  HighScoreSettings,
  KnownSpawn,
  NamedAlertStyle,
} from "./types";
import { count } from "./format";

/**
 * Anything that can wear a look: a saved style by id, its own layer, or neither.
 *
 * A `CastWatch` is one, and for most of this module's life it was the only one — but a **personal
 * best** now wears a style too (`Settings.highScores`), and it is not a rule and never will be. So
 * the resolver asks for the two fields it actually reads rather than for a whole watch, which is
 * also what stops the alternative: a second, parallel resolver that would drift from this one.
 */
export type StyleWearer = Pick<CastWatch, "styleId" | "style">;

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
export function alertStyle(settings: CastAlertSettings, watch?: StyleWearer | null): AlertStyle {
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

/**
 * How many **rules** wear this saved style. Shown in a rule's own picker, where rules are all that
 * is being chosen between.
 *
 * Rules are not the whole answer to "who wears this" — a feature wears one too — so anything asking
 * in order to decide something (whether an edit forks, whether a ✕ is safe) wants `styleUse`.
 */
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
 * one rule is the same overreach as editing a shared style from one rule. A rule on a **sticky**
 * style forks for exactly that reason as well — a feature is built on that look, and "make this rule
 * green" must not repaint every loot banner on the machine.
 *
 * `usage` sharpens the middle case, where a style is shared with something that isn't a rule: a
 * spawn timer wearing a hand-made style is a wearer, and without it the edit would change how that
 * timer looks with nothing said. Optional because a caller may not have it, and the answer without
 * it errs towards forking, which is the direction that protects somebody.
 */
export function plan(
  settings: CastAlertSettings,
  watch: CastWatch,
  usage: AlertUsage = {},
): { mode: StyleEditMode; note: string } {
  const worn = wornStyle(settings, watch);
  if (!worn) {
    if (watch.style) return { mode: "own", note: "This rule has a look of its own. Changes stay here." };
    return { mode: "fork", note: "Changing this makes a new saved style for this rule — the defaults are shared." };
  }
  const sticky = stickySource(worn.id);
  if (sticky) {
    return {
      mode: "fork",
      note: `“${worn.name}” is the look ${sticky.label} wear, so changing it here makes a copy for this rule. To change how they look, edit it under Saved styles.`,
    };
  }
  const use = styleUse(settings, worn.id, usage);
  if (use.total > 1) {
    return {
      mode: "fork",
      note: `“${worn.name}” is ${describeUse(use)}, so changing it here makes a copy for this one. To change it for all of them, edit it under Saved styles.`,
    };
  }
  return { mode: "in-place", note: `Editing “${worn.name}”. Nothing else wears it.` };
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
  usage: AlertUsage = {},
): StyleEdit {
  const styles = settings.styles ?? [];
  const { mode } = plan(settings, watch, usage);

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

/**
 * A feature that raises an alert **by itself** — off what the app observed, with no rule involved.
 *
 * There are three (a personal best, a spawn window opening, a tracked item dropping) and they were
 * three unrelated call sites into `alertStyle`, each naming a built-in style id inline. Nothing said
 * they were the same kind of thing, and two consequences followed from that:
 *
 *   - The Saved styles list counted **rules only**, so the look every loot alert wears read *worn by
 *     0* and offered a ✕ promising that "rules wearing it fall back to the defaults" — which is to
 *     say, nothing will happen. It was not true, and the count is what made it not true.
 *   - The Alerts tab listed the rules and nothing else, so the three features that alert *without* a
 *     rule were invisible in the tab named after them.
 *
 * Naming them answers both in one place: `wears` is what the count was missing, `armed` is what the
 * row says, and being on this list is what makes a style **sticky** — see `stickySource`.
 *
 * `wears` and `armed` are separate questions on purpose. Wearing is a *setting* ("its pop looks like
 * this"); arming is a switch that flips whenever the player likes. A style is worn by a timer that is
 * currently silent, and deleting it would still change how that timer looks the moment it speaks.
 */
export interface AlertSource {
  /** Stable key — the row's React key, and what a test names. */
  id: "record" | "spawn" | "loot";
  /** What the Alerts tab calls it. */
  label: string;
  /** What sets it off, and **where its on/off lives** — the one thing its row can't show inline. */
  hint: string;
  /** The look it ships with: an ordinary saved style, and the one it may never be stripped of. */
  style: NamedAlertStyle;
  /** What one of its armed things is ("list row"), for `count`. Absent when it is a single switch. */
  unit?: string;
  /**
   * The saved style its alerts wear today, by id — absent means the alert defaults, which only the
   * celebration can be pointed at.
   *
   * Reads `usage` where the choice is the player's, and falls back to **the shipped arrangement**
   * where `usage` wasn't supplied: a caller holding only `castAlerts` (a rule's own style picker)
   * still gets the right answer for the ordinary case, and errs towards "shared", which is the safe
   * direction for a fork decision.
   */
  worn: (usage: AlertUsage) => string | undefined;
  /**
   * How many of its things wear this style. Absent when the source is **one look for the whole
   * feature** and `worn` already answers it — only the spawn board needs its own count, its timers
   * choosing one each. Call it through `sourceWears`, never directly.
   */
  wears?: (styleId: string, usage: AlertUsage) => number;
  /** How many of its things would actually speak right now. */
  armed: (usage: AlertUsage) => number;
}

/** How many of this source's things wear a style: its own count where it keeps one, `worn` otherwise. */
export function sourceWears(source: AlertSource, styleId: string, usage: AlertUsage): number {
  if (source.wears) return source.wears(styleId, usage);
  return source.worn(usage) === styleId ? 1 : 0;
}

/** A spawn timer, as the style questions see it: what it wears, and whether it is armed. */
export type SpawnWearer = Pick<KnownSpawn, "notify" | "styleId">;

/**
 * Who is wearing what **outside `castAlerts`** — the scoreboard's celebration, the spawn board and
 * the shopping list, each of which lives in a store of its own.
 *
 * Every field is optional and every reader has a fallback, because the callers know different
 * amounts: the Alerts tab gathers all of it, a rule's style picker has only the settings it was
 * handed. An absent field means *unknown*, never *none*.
 */
export interface AlertUsage {
  /** The scoreboard's celebration: whether it speaks, and which saved style it points at. */
  highScores?: HighScoreSettings;
  /** Every spawn timer the board knows about. */
  spawns?: readonly SpawnWearer[];
  /** How many list rows asked to be told when they drop (`ShoppingListEntry.notify`). */
  lootArmed?: number;
}

/**
 * The looks the app ships with, so the three things that can raise a banner don't all arrive
 * looking like the same emergency.
 *
 * A cast alert is a **warning** — dispel now — and keeps the red defaults. A **record** and a
 * **spawn** are news: nothing is on fire, they belong somewhere other than dead centre of the
 * warning's spot, and telling them apart at a glance is the whole point of a colour. Getting that
 * out of the box matters more than it sounds, because the alternative is that the feature looks
 * broken-by-sameness until someone goes and builds two styles by hand.
 *
 * They are **ordinary saved styles**: they sit in the Alerts tab's list like any other, are edited
 * with the same six controls, and anything else may wear them. That is what keeps
 * [ADR 0090](../../specs/decisions/0090-one-style-editor-at-a-time.md)'s "one editor, in one place"
 * true — a built-in look the player couldn't reach would be a second wardrobe by another name.
 *
 * What they are *not* is deletable or renameable
 * ([ADR 0120](../../specs/decisions/0120-a-feature-s-look-is-sticky.md)): a feature is built on the
 * look, its row in the Alerts tab names it, and a name that can drift is a row that can start lying.
 * Restyling one is the whole point and stays wide open.
 *
 * The ids are namespaced so a hand-made style can never collide with one, and so a build that adds
 * another can tell what it has already seeded.
 */
export const RECORD_STYLE_ID = "built-in:record";
export const SPAWN_STYLE_ID = "built-in:spawn";
export const LOOT_STYLE_ID = "built-in:loot";

export const ALERT_SOURCES: AlertSource[] = [
  {
    id: "record",
    label: "Personal bests",
    hint: "A record falling. Switched on in the Records tab, which is also where it can be pointed at a different saved style.",
    // One switch for a whole board, so no unit: its row says on or off.
    armed: (u) => ((u.highScores?.celebrate ?? true) ? 1 : 0),
    // The only source whose look is a *choice*, so the only one that can be wearing something else —
    // including the alert defaults, which are no saved style at all.
    worn: (u) => (u.highScores ? u.highScores.styleId : RECORD_STYLE_ID),
    style: {
      id: RECORD_STYLE_ID,
      name: "Record",
      // Gold, and it does not flash: a personal best is worth a moment of pleasure, not a jolt.
      style: {
        sound: true,
        flash: false,
        color: "#f0b429",
        soundName: "chime",
        position: "top",
        durationMs: 6000,
        animation: "float",
      },
    },
  },
  {
    id: "spawn",
    label: "Spawn timers",
    hint: "A named you were timing coming back. 🔔 on a timer arms it, and a timer may wear a saved style of its own instead of this one.",
    unit: "timer",
    armed: (u) => u.spawns?.filter((s) => s.notify).length ?? 0,
    // A timer that picked nothing wears this, which is the fallback `spawn-tracker` applies — so it is
    // what the row names, and what a timer's own picker starts from.
    worn: () => SPAWN_STYLE_ID,
    // The one source with a look *per thing*, so the only one that counts its own wearers.
    wears: (styleId, u) =>
      u.spawns
        ? u.spawns.filter((s) => (s.styleId ?? SPAWN_STYLE_ID) === styleId).length
        : styleId === SPAWN_STYLE_ID
          ? 1
          : 0,
    style: {
      id: SPAWN_STYLE_ID,
      name: "Spawn timer",
      // Green, out of the warning's way, and it lingers: a pop is news you may be a few seconds late
      // to notice, where a dispel prompt is useless the moment it is missed.
      style: {
        sound: true,
        flash: false,
        color: "#46c86b",
        soundName: "chirp",
        position: "top-right",
        durationMs: 10000,
        animation: "pulse",
      },
    },
  },
  {
    id: "loot",
    label: "Loot drops",
    hint: "Something on your list dropping. 🔔 on a list row arms it, and every armed row wears this look — there is no style per row (ADR 0105).",
    unit: "list row",
    armed: (u) => u.lootArmed ?? 0,
    // Not a choice at all: `lootAlert` names this style outright, so the answer needs no data and
    // cannot be stale. One wearer — the feature — however many rows are armed behind it.
    worn: () => LOOT_STYLE_ID,
    style: {
      id: LOOT_STYLE_ID,
      name: "Loot",
      // Gold-ish and short: a drop is news you are looking at the screen for anyway (you just looted
      // it), so it wants a moment of pleasure rather than the lingering "get over here" a pop needs.
      // It does not flash — the one thing you are doing when this fires is reading a loot window.
      style: {
        sound: true,
        flash: false,
        color: "#d4a03c",
        soundName: "levelup",
        position: "top-right",
        durationMs: 5000,
        animation: "float",
      },
    },
  },
];

/** The shipped looks, for seeding a settings file that hasn't got them (`electron/migrations.ts`). */
export const BUILT_IN_STYLES: NamedAlertStyle[] = ALERT_SOURCES.map((s) => s.style);

/**
 * The feature built on this style, if any — which is what makes it **sticky**: un-deletable and
 * un-renameable, however freely it may be restyled.
 *
 * Derived from `ALERT_SOURCES` rather than kept as a second list of ids, so a fourth source makes its
 * look sticky just by arriving. Asked by the Alerts tab (to withhold the ✕ and the name field) and by
 * `plan`, where a rule editing a feature's look has to fork — "make *this* rule green" must not
 * repaint every loot banner on the machine.
 */
export function stickySource(styleId: string): AlertSource | undefined {
  return ALERT_SOURCES.find((s) => s.style.id === styleId);
}

/**
 * A source's live state in a few words: `2 list rows armed`, `nothing armed`, or a plain `on`/`off`
 * for a source that is one switch.
 *
 * Words rather than a bare number, because a `0` beside a row is ambiguous in exactly the way this
 * whole change is about: it reads as *broken* as readily as *nothing asked for it*.
 */
export function describeArmed(source: AlertSource, usage: AlertUsage): string {
  const armed = source.armed(usage);
  if (!source.unit) return armed ? "on" : "off";
  return armed ? `${count(armed, source.unit)} armed` : "nothing armed";
}

/**
 * Everything wearing a saved style — the rules, **and** the features that alert without one.
 *
 * The count is not a nicety. It is what the ✕ beside a style means ("who am I about to change?") and
 * what `plan` reads to decide whether an edit from one rule must fork. Counting rules alone got both
 * wrong in the same direction — towards *nobody is watching* — which is the worse way to be wrong
 * about a shared thing.
 */
export interface StyleUse {
  /** Cast-alert rules wearing it. */
  rules: number;
  /** The features wearing it, by label — "Loot drops", "Spawn timers". */
  features: string[];
  /** Everything, counted. More than one means an edit from a single rule has to fork. */
  total: number;
}

export function styleUse(settings: CastAlertSettings, styleId: string, usage: AlertUsage = {}): StyleUse {
  const rules = styleWearers(settings, styleId);
  const worn = ALERT_SOURCES.map((s) => ({ source: s, count: sourceWears(s, styleId, usage) })).filter(
    (w) => w.count > 0,
  );
  return {
    rules,
    features: worn.map((w) => w.source.label),
    total: rules + worn.reduce((n, w) => n + w.count, 0),
  };
}

/**
 * Who wears **the defaults** — the rules that picked nothing, and any source pointed at no saved style.
 *
 * Its own function because the defaults have no id to search on: a rule wears them by having neither
 * field set, and a source by `worn` answering nothing at all. Worth stating rather than leaving the
 * row to count rules, since the celebration *can* be pointed here from the Records board, and the
 * defaults are the one look where "who else wears this" has always mattered most.
 */
export function defaultsUse(settings: CastAlertSettings, usage: AlertUsage = {}): StyleUse {
  const rules = settings.watches.filter((w) => !w.styleId && !w.style).length;
  const features = ALERT_SOURCES.filter((s) => s.worn(usage) === undefined);
  return { rules, features: features.map((s) => s.label), total: rules + features.length };
}

/** The line beside a style in the list: `worn by 2 rules · Loot drops`, or `worn by nobody`. */
export function describeUse(use: StyleUse): string {
  const parts = [...(use.rules ? [count(use.rules, "rule")] : []), ...use.features];
  return parts.length ? `worn by ${parts.join(" · ")}` : "worn by nobody";
}

/**
 * Drop a saved style. A **sticky** one survives: a feature is built on it, and there is nothing for
 * the deletion to mean except "make that feature look like a dispel warning again".
 *
 * Here rather than in the panel so the rule has one home, and so the list the panel writes and the
 * list a test asserts on are produced by the same code. The panel also withholds the ✕ — this is the
 * floor under that, not a substitute for it.
 */
export function withoutStyle(styles: NamedAlertStyle[], id: string): NamedAlertStyle[] {
  if (stickySource(id)) return styles;
  return styles.filter((s) => s.id !== id);
}

/**
 * Rename a saved style. A **sticky** one keeps the name it shipped with: its feature's row in the
 * Alerts tab says "wears Loot", and a name that can drift is a row that can start lying.
 */
export function withStyleName(styles: NamedAlertStyle[], id: string, name: string): NamedAlertStyle[] {
  if (stickySource(id)) return styles;
  return styles.map((s) => (s.id === id ? { ...s, name } : s));
}

/**
 * Where on the overlay something anchored to `position` should sit: a preset class, or — for a
 * `loc:<id>` custom spot — the placed fraction as an absolute point, centred on it.
 *
 * Here rather than in the banner that first needed it, because a **pinned countdown** is anchored
 * the same way and by the same setting: a player who put their alerts bottom-right meant the corner
 * they look at, and a second copy of these six rules would be a second thing to keep in step.
 *
 * A `loc:` that no longer resolves — the spot was deleted — falls back to the top rather than
 * refusing to place: something that can't be positioned must still be *seen*, which is the same call
 * `alertStyle` makes about a style that has gone.
 */
export function alertPlacement(
  position: AlertPositionValue,
  locations: AlertLocation[],
): { className: string; style?: { left: string; top: string } } {
  if (position.startsWith("loc:")) {
    const loc = locations.find((l) => `loc:${l.id}` === position);
    if (loc) return { className: "pos-custom", style: { left: `${loc.fx * 100}%`, top: `${loc.fy * 100}%` } };
    return { className: "pos-top" };
  }
  return { className: `pos-${position}` };
}
