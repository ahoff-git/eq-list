/**
 * watch-upgrade.ts — bringing alert rules written by an older build up to the current model.
 *
 * Nothing here is a rescue. Every field the rule model grew is optional and absent means the old
 * behaviour ([ADR 0084](../../specs/decisions/0084-a-watch-is-a-rule-not-a-substring.md)), so an
 * untouched settings file keeps working exactly as it did — that property is asserted by the matcher
 * tests, which predate all of it and still run unchanged.
 *
 * What it fixes is the *other* cost of that promise: a rule whose meaning lives in what its fields
 * **don't** say. `onCast` absent means casts are on; a style copied out of the defaults means a look
 * shared with nobody; a rule with every prompt switched off means one that can never fire. Each of
 * those reads fine to the code and badly to a person — and now that the panel shows a rule back to
 * you in words, "it says nothing about casts, so it does them" is a sentence the UI has to keep
 * translating rather than a fact it can show.
 *
 * So this makes the implicit explicit, once, and folds duplicated looks into shared ones:
 *
 *   - **`onCast` is written down** as the true or false it always meant.
 *   - **A rule that can't be reached becomes a raw-text rule.** With no prompt ticked, nothing in the
 *     log can reach it — it is a rule someone wrote and lost. Pointing it at raw text is the one
 *     conversion that is a *guess*, and it's the honest one: raw text is the escape hatch that can
 *     match anything the game prints ([ADR 0050](../../specs/decisions/0050-a-watch-can-read-a-whole-log-line.md)),
 *     so the words are given the best chance of meaning something rather than being silently dead.
 *   - **Looks are deduplicated into saved styles.** The old 🎨 button copied the whole defaults into
 *     each rule, so six rules "with their own style" were six identical copies that had to be edited
 *     six times. Identical looks become **one** saved style they all wear
 *     ([ADR 0086](../../specs/decisions/0086-editing-a-shared-style-from-a-rule-forks-it.md)); a copy
 *     that never diverged from the defaults is dropped entirely, since wearing the defaults is the
 *     same look and one less thing to carry.
 *   - **A rule wearing a style *and* carrying its own layer is flattened** into a single saved style.
 *     That state was only ever reachable for a few hours between two builds, and the new picker can't
 *     describe it.
 *
 * Pure and idempotent: run it twice and the second pass changes nothing, which is what lets the
 * caller stamp a schema without having to trust that it did.
 */
import { alertStyle } from "./alert-styles";
import { wantsCast } from "./watch-conditions";
import type { AlertStyle, CastAlertSettings, CastWatch, NamedAlertStyle } from "./types";

/** What an upgrade did, for the log line and for the tests. All zeroes on an up-to-date file. */
export interface UpgradeReport {
  /** Rules whose `onCast` was written out. */
  explicit: number;
  /** Rules that could never fire and are now raw-text rules. */
  rescued: number;
  /** Rules whose own copy of a look became a shared style. */
  styled: number;
  /** Rules whose look was the defaults all along, and now simply follow them. */
  plain: number;
  /** Saved styles created by the fold. */
  created: number;
}

export interface Upgrade {
  settings: CastAlertSettings;
  report: UpgradeReport;
  /** Did anything change? The caller writes only when this is true. */
  changed: boolean;
}

export function upgradeWatches(settings: CastAlertSettings): Upgrade {
  const report: UpgradeReport = { explicit: 0, rescued: 0, styled: 0, plain: 0, created: 0 };
  const styles: NamedAlertStyle[] = [...(settings.styles ?? [])];
  const defaults = alertStyle(settings);

  const watches = settings.watches.map((watch) => {
    const next: CastWatch = { ...watch };

    // "Unset means on" is a rule about absent data. Say it instead.
    if (next.onCast === undefined) {
      next.onCast = true;
      report.explicit += 1;
    }
    // Nothing can reach it. Raw text is the escape hatch, so the words get a chance to mean something.
    if (!wantsCast(next) && !next.onFade && !next.onLine) {
      next.onLine = true;
      report.rescued += 1;
    }

    // Its look, resolved through whatever layers it had — the thing it actually looks like.
    if (next.style) {
      const look = alertStyle(settings, watch);
      if (sameLook(look, defaults)) {
        // A copy of the defaults is not a decision; it's what the old button did on the way to one.
        delete next.style;
        delete next.styleId;
        report.plain += 1;
      } else {
        const existing = styles.find((s) => sameLook(s.style, look));
        const style = existing ?? { id: freeId(styles), name: `Style ${styles.length + 1}`, style: look };
        if (!existing) {
          styles.push(style);
          report.created += 1;
        }
        delete next.style;
        next.styleId = style.id;
        report.styled += 1;
      }
    }
    return next;
  });

  const changed =
    report.explicit + report.rescued + report.styled + report.plain + report.created > 0;
  return {
    settings: changed ? { ...settings, watches, ...(styles.length ? { styles } : {}) } : settings,
    report,
    changed,
  };
}

/** Two looks are the same when every field is — the only sense in which one can replace another. */
function sameLook(a: AlertStyle, b: AlertStyle): boolean {
  return (
    a.sound === b.sound &&
    a.flash === b.flash &&
    a.color === b.color &&
    a.soundName === b.soundName &&
    a.position === b.position &&
    a.durationMs === b.durationMs &&
    a.animation === b.animation
  );
}

/** An id nothing already uses. Sequential, because this runs where `crypto` may not be the same one. */
function freeId(styles: NamedAlertStyle[]): string {
  const used = new Set(styles.map((s) => s.id));
  for (let n = styles.length + 1; ; n++) {
    const id = `style-${n}`;
    if (!used.has(id)) return id;
  }
}
