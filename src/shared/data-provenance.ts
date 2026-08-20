/**
 * data-provenance.ts — which build's rules wrote the data on disk, and what to do when they've moved on.
 *
 * The app derives almost everything it knows from the log, and the rules for reading it keep
 * improving. [ADR 0095](../../specs/decisions/0095-your-own-dot-tick-is-yours.md) is the case that
 * forced this: a parser fix raised every damage figure that includes your own damage-over-time ticks,
 * and was explicitly forward-only — so a thousand stored fights now under-report, and **nothing on
 * disk says so**. The figures are simply quietly wrong, which is the worst way for data to be wrong.
 *
 * Four ad-hoc version markers already existed and none of them could answer the question: the kill
 * log's `schema`, the settings' `schema`, the wiki cache's `CACHE_VERSION`, and the zone gazetteer's
 * `GAZETTEER_VERSION`. This is the one convention they generalise into.
 *
 * ## Why not the app version
 *
 * The obvious move — stamp `app.getVersion()` and compare — is wrong, and wrong in a way that would
 * make the feature useless rather than merely imperfect. CI stamps a build number into every push to
 * `main` ([ADR 0064](../../specs/decisions/0064-every-build-has-a-number.md)), so `0.1.41` becomes
 * `0.1.42` for a CSS change. Comparing app versions would mark **every store stale on every build**,
 * which trains you to ignore the flag — the same reasoning [ADR 0093](../../specs/decisions/0093-a-high-score-is-a-personal-best-with-a-floor.md)
 * used to keep a fresh scoreboard from firing eight banners at once.
 *
 * So what's compared is a **revision per concern**, bumped by hand when the rule that produces that
 * data actually changes. The app version rides along in the stamp, but only ever as diagnosis — the
 * answer to "which build wrote this?" in a bug report. It is never compared.
 *
 * ## Why this is not `migrations.ts`
 *
 * They look alike and they answer opposite questions, so the distinction is worth stating plainly:
 *
 *   - a **schema** (`migrations.ts`) is something the app can repair **by itself, at launch,
 *     silently** — filling in a zone the log states, converting a rule to its current shape.
 *   - a **revision** (here) is something the app **cannot** fix on its own. Re-reading a log,
 *     re-running a build script or refetching the wiki are all either slow, destructive, or a
 *     developer's job — so the honest thing is to *say so* and let a person decide.
 *
 * A file therefore carries both, and that isn't redundancy: one drives an automatic repair, the other
 * drives a prompt. Bumping either does nothing to the other.
 */

/** How stale data gets put right, and — the part that decides the UI — **who** can do it. */
export type DataRemedy =
  /** Read your logs again. The app can do this itself (Settings → digest a log). */
  | "re-eat"
  /** Pull it from the wiki again. The app can do this itself. */
  | "refetch"
  /** The app re-reads local files on its own; nothing to ask anybody. */
  | "rescan"
  /** A committed dataset rebuilt by an `npm` script — only a developer with a checkout can. */
  | "script"
  /** Nothing can rebuild it, because we were never the source (a peer told us). */
  | "unrecoverable";

/** One body of stored data whose rules can change under it. */
export interface DataConcern {
  id: string;
  label: string;
  /** The file under the app's data folder, when it is one — for the report and the debug log. */
  file?: string;
  /**
   * The revision of the rule that produces this data. **Bump when the rule changes**, and say why in
   * `changed` — a stale flag that can't tell you what changed is a chore rather than information.
   */
  revision: number;
  /**
   * What to assume a file carrying **no stamp** was written at.
   *
   * Defaults to `revision`, i.e. "assume it's fine". That default is the important half: the day
   * stamping ships nothing on disk has a stamp, and flagging every store stale at once would be pure
   * noise about data that really is current. Set it *below* `revision` only when a bump is known to
   * predate stamping — then unstamped data is genuinely out of date and should say so.
   */
  unstamped?: number;
  remedy: DataRemedy;
  /** The command to run, for a `script` remedy. */
  command?: string;
  /** What this data is, and what goes wrong while it's stale. */
  blurb: string;
  /** Why the current revision was bumped. Shown when the data is stale, so the flag is actionable. */
  changed?: string;
}

/**
 * What one file's stamp says. Written into the store beside its own data, under `provenance`.
 *
 * Every field is optional on read, because a file written by an older build has none of them — see
 * `DataConcern.unstamped` for what that means.
 */
export interface DataStamp {
  /** The `DataConcern.revision` current when this was written. The only field ever compared. */
  revision: number;
  /**
   * The build that wrote it. **Diagnosis only** — never compared, for the reason in this file's
   * header. It's what lets a bug report say "these fights were read by 0.1.42".
   */
  appVersion?: string;
  /** When it was last written, ISO. */
  at?: string;
}

/** Where a body of data stands against the rules that produce it today. */
export type DataState =
  /** Written by the current rules. */
  | "current"
  /** Written by an older rule — the remedy applies. */
  | "stale"
  /** Written by a **newer** build than this one. See `dataState` on why this is not "stale". */
  | "ahead"
  /** There is no file: nothing has been recorded yet. Not a problem, and not a thing to fix. */
  | "absent";

/** One row of the health report: a concern, where it stands, and what it says it was written by. */
export interface DataReportRow {
  concern: DataConcern;
  state: DataState;
  stamp?: DataStamp;
}

/**
 * Where this stamp stands against the concern's current revision.
 *
 * **`ahead` is deliberately not `stale`.** A file written by a newer build means the app was
 * downgraded, and offering to "update" it would rebuild newer data with older rules — a downgrade
 * quietly eating the better answer. That's the hazard [ADR 0031](../../specs/decisions/0031-an-inferred-bound-must-be-able-to-fall.md)
 * is careful about from the other direction, and the honest response is to say so and touch nothing.
 *
 * `present: false` is a store with no file yet, which is every store on a first run.
 */
export function dataState(concern: DataConcern, stamp: DataStamp | undefined, present = true): DataState {
  if (!present) return "absent";
  const at = stamp?.revision ?? concern.unstamped ?? concern.revision;
  if (at > concern.revision) return "ahead";
  return at < concern.revision ? "stale" : "current";
}

/** The stamp to write now. `at` and `appVersion` are passed in, so this stays pure. */
export function stampFor(concern: DataConcern, appVersion: string, at: string): DataStamp {
  return { revision: concern.revision, appVersion, at };
}

/**
 * Every body of data whose rules can move under it, and what to do about each.
 *
 * Ordered by how much a stale one costs you, worst first, because that's the order the panel shows and
 * a list of eight rows is read from the top.
 *
 * **On bumping a revision:** change the number, write `changed`, and — if the bump invalidates what is
 * already on disk — that is the whole point, so don't touch `unstamped`. Leave `unstamped` alone
 * unless the bump *predates* stamping, which is a one-off circumstance and not something a future bump
 * will need.
 */
export const DATA_CONCERNS: DataConcern[] = [
  {
    id: "combat-history",
    label: "Recorded fights",
    file: "combat-history.json",
    // 2: your own DoT ticks became readable, so every damage figure in a stored fight is low.
    revision: 2,
    // Stamping shipped *with* that bump, so an unstamped file is revision 1 — genuinely out of date,
    // and the only concern here for which that's true.
    unstamped: 1,
    remedy: "re-eat",
    blurb:
      "Every fight the meter has banked — damage, DPS, spells, and the cells every drill-down is rolled up from. A stale one under-reports rather than looking wrong, so nothing about it draws the eye.",
    changed:
      "Your own damage-over-time ticks are now read (ADR 0095). Fights recorded before that miss them — about 3% of a character's damage, and most of a DoT-led one's.",
  },
  {
    id: "high-scores",
    label: "Personal bests",
    file: "high-scores.json",
    // 2: the board is seeded from stored fights, so it inherits their figures.
    revision: 2,
    unstamped: 1,
    remedy: "re-eat",
    blurb:
      "The scoreboard. Records set from live play are right; the ones seeded from recorded fights are as low as those fights are, and a record that is too low is one you beat by accident.",
    // Do **not** tell anyone to Reset here. `electron/high-scores.ts`'s `clear()` marks the board
    // `seeded: true` on purpose — "forget my records" must not put most of them straight back — so a
    // reset does not re-seed, it empties the board for good and takes the records set from live play
    // (which were never wrong) with it. Digesting is the whole remedy: the importer hands the fresh
    // fights to `absorb`, which raises every record they beat.
    changed:
      "Seeded from recorded fights, which under-reported DoT damage before ADR 0095. Digesting your logs again folds the corrected fights back into the board — don't Reset it, which empties it for good rather than re-seeding.",
  },
  {
    id: "kill-log",
    label: "Recorded kills and drops",
    file: "kill-log.json",
    // 2: a kill line's **articles** are now read, and they are destroyed a line later by
    // `stripArticle` — so they exist on a record only if that record was written by this rule.
    revision: 2,
    // Stamping shipped at revision 1, so an unstamped file predates even that. Both are stale
    // against this bump, and both are fixed by the same re-read.
    unstamped: 1,
    remedy: "re-eat",
    blurb:
      "Where each mob died, what it dropped, and what it carried — the heatmap, the observed drop rates, and the mob knowledge pooled from them.",
    changed:
      "A kill now records whether the mob and its killer were written with an article (ADR 0092) — the log's only signal for what kind of thing died. Kills recorded before that can't say, so a named you have camped for months teaches its respawn nothing until you kill it once more. Digesting the log fills it in for every kill you still have.",
  },
  {
    id: "loot-log",
    label: "Loot ledger",
    file: "loot-log.json",
    revision: 1,
    remedy: "re-eat",
    blurb: "Every drop the log has shown, and what the auto-sold ones fetched — the Loot tab and its vendor prices.",
  },
  {
    id: "spawn-timers",
    label: "Respawn timers",
    file: "spawn-timers.json",
    // Still 1, and deliberately so even though the *rules* changed this release (gaps across a
    // difficulty change are now discarded, ADR 0092). What this file holds is what the player
    // typed — figures, padding, notify, the looks — plus due times and sightings. The learned
    // windows are **derived from the kill log on every read**, so a rule change corrects them the
    // next time they're looked at, with nothing to reprocess. Bumping this would flag a file that
    // is perfectly current and send the reader to a remedy that would change none of it; the
    // concern that really did move is `kill-log`, and that is where it is flagged.
    revision: 1,
    remedy: "re-eat",
    blurb:
      "Respawn windows learned from the gaps between your own kills. Only the shortest gap counts, so re-reading a log can tighten a window but never loosen one.",
  },
  {
    id: "zone-names",
    label: "Map-pack zone names",
    file: "map-zone-names.json",
    revision: 1,
    remedy: "rescan",
    blurb:
      "Which zone each map file is, worked out from the pack's own exit labels. The app re-reads a folder by itself when its own version moves, so this row is here to be *seen* rather than acted on.",
  },
  {
    id: "wiki-cache",
    label: "Wiki pages",
    file: "wiki-cache/",
    revision: 1,
    remedy: "refetch",
    blurb:
      "Mirrored item, quest and recipe pages. These also expire on their own after a while, so this only matters when our reading of a page changes rather than the page itself.",
  },
  {
    id: "travel-graph",
    label: "Travel graph",
    revision: 1,
    remedy: "script",
    command: "npm run travel:build",
    blurb:
      "The zone-line graph behind “how do I get there”, harvested from the map pack's exit labels. Built from a checkout, so only a developer can rebuild it.",
  },
  {
    id: "zone-expansions",
    label: "Zone / expansion table",
    revision: 1,
    remedy: "script",
    command: "npm run zones:expansions",
    blurb:
      "Which expansion each zone belongs to, harvested from the wiki. Committed to the repo, so its age is the repo's rather than yours — three expansion pages are known to be unreadable (see todo).",
  },
  {
    id: "peer-knowledge",
    label: "What peers told us",
    file: "mob-knowledge.json",
    // 2: contributions are keyed by contributor id rather than by display name, and an id is
    // something only the contributor can supply — so a tally from before this can never be matched
    // back up with the person who shared it.
    revision: 2,
    // Deliberately *not* set below the revision: `migrations.ts` re-keys the old file in place, so a
    // store written by an older build is repaired rather than stale. What it can't repair — who
    // those tallies really belonged to — is recorded in the key itself (`name:…`), not flagged here,
    // because there is nothing anybody can do about it and this row is for things there are.
    remedy: "unrecoverable",
    blurb:
      "Observations other players shared. We were never the source, so there is no log of ours to re-read — the only remedy is to forget it and let it be shared again.",
  },
  {
    id: "peer-kills",
    label: "Kill positions peers shared",
    file: "peer-kills.json",
    revision: 1,
    remedy: "unrecoverable",
    blurb:
      "Where other players killed things — the pooled half of the heatmap. Somebody else's measurements, so nothing here can rebuild them; forgetting them and being shared them again is the whole remedy.",
  },
];

/** One concern by id, for a caller that knows which it wants. */
export const concernById = (id: string): DataConcern | undefined => DATA_CONCERNS.find((c) => c.id === id);

/**
 * What to tell the user to do, per remedy. Here rather than in the panel so the vocabulary and its
 * wording stay together — a remedy nobody can act on has to *say* that, not present a dead button.
 */
export const REMEDY_ADVICE: Record<DataRemedy, string> = {
  "re-eat": "Digest your log again — Settings → “Digest a past log”. Fights and kills are keyed by their own lines, so nothing is counted twice.",
  refetch: "Refresh the wiki mirror — the Search tab's refresh, or it happens on its own within a week.",
  rescan: "Nothing to do: the app re-reads this itself when it needs to.",
  script: "Run the command below from a checkout, then ship a build.",
  unrecoverable: "Nothing can rebuild this. Forget it (Settings → Forget recorded data) and let peers share it again.",
};

/** Does this row want somebody to do something? `ahead` never does — see `dataState`. */
export const needsAction = (row: DataReportRow): boolean =>
  row.state === "stale" && row.concern.remedy !== "rescan" && row.concern.remedy !== "unrecoverable";

/** How many rows want something done — the badge on the Settings tab. */
export const actionsNeeded = (rows: DataReportRow[]): number => rows.filter(needsAction).length;
