/**
 * release-notes.ts — what changed between the build you last looked at and the one running now.
 *
 * ## The unit is the release line, not the build
 *
 * Every push to main publishes a build, stamped `major.minor.<CI run>` (ADR 0064) — so the patch is a
 * counter nobody writing a note can know in advance, and a note can't be keyed by it. The `major.minor`
 * is the part a person sets by hand, in `package.json`. So **a release note is a release line**: the
 * change that adds `0.4` is the change that bumps `package.json` to `0.4.0`, and every build of that
 * line (`0.4.17`, `0.4.18`…) carries the same notes. Going from `0.1.x` to `0.5.x` therefore shows
 * `0.2`, `0.3`, `0.4` and `0.5` — whichever builds in between the player never ran (ADR 0373).
 *
 * Pure, so what the banner says and what the history shows can be pinned without a window: the data
 * is `changelog.ts`, the screens are `src/app/components/help/`.
 */
import { compareVersions, parseVersion } from "../version";

export type ChangeKind = "new" | "better" | "fixed";

export interface Change {
  kind: ChangeKind;
  /** One sentence in the player's words: what they can now do, or no longer trip over. Not a commit message. */
  text: string;
  /** The how-to guide (`guides.ts`) that teaches it, offered beside the line. */
  guide?: string;
}

export interface ReleaseNote {
  /** `major.minor` — the line `package.json` was bumped to by the change that wrote this note. */
  line: string;
  /** `YYYY-MM-DD`, the day it was written. */
  date: string;
  /** What the release is, in a few words — the banner's headline. */
  title: string;
  changes: readonly Change[];
}

/** `0.3.42` → `[0, 3]`; null if it isn't a version. The two numbers a person sets, without the build counter. */
export function releaseLine(version: string): number[] | null {
  const parts = parseVersion(version);
  if (!parts) return null;
  const [major = 0, minor = 0] = parts;
  return [major, minor];
}

/**
 * The release notes the player hasn't been shown yet: every line **after** the one they last saw, up to
 * and including the one running — newest first. A line in the notes that is *ahead* of this build is never
 * shown (a note can be written before its build exists, and a rolled-back install mustn't announce features
 * it doesn't have).
 *
 * With nothing remembered there is no "since" to compute — a first install and an upgrade from before this
 * was tracked look the same — so the answer is the newest note alone, not the whole history: enough to say
 * what this build is, without a screenful about things that were never new to this person.
 */
export function notesSince(notes: readonly ReleaseNote[], seen: string | null, current: string): ReleaseNote[] {
  const now = releaseLine(current);
  if (!now) return [];
  const shippable = notes
    .filter((n) => {
      const line = releaseLine(n.line);
      return line !== null && compareVersions(line, now) <= 0;
    })
    .sort(newestFirst);
  const before = seen === null ? null : releaseLine(seen);
  if (before === null) return shippable.slice(0, 1);
  return shippable.filter((n) => compareVersions(releaseLine(n.line)!, before) > 0);
}

/**
 * Where to count the notes owed *from*: the remembered version if there is one. Failing that, an install that has
 * been used before — it kept settings of some kind — is an update from before this was tracked, so it counts from
 * `baseline` (the version everybody was on then) and is owed every note since. Only a blank slate, a first install,
 * has no "since" at all and is shown the newest alone (`notesSince`).
 */
export function countFrom(seen: string | null, usedBefore: boolean, baseline: string): string | null {
  return seen ?? (usedBefore ? baseline : null);
}

/**
 * What a **first install** should remember the moment it launches, or null when it shouldn't. A blank slate — nothing
 * remembered, nothing else saved — has no history to catch up on, so it is shown the newest note once, as a courtesy,
 * and starts counting from this build. Left unmarked until somebody opens the notes, it would fail the next test the
 * way an old install does: its second launch has saved settings but no marker, reads as "updating from before this was
 * tracked", and is owed *every* note since the baseline — a list that grows with each release for anyone who never
 * clicked the banner.
 */
export function firstLaunchMarker(seen: string | null, usedBefore: boolean, current: string): string | null {
  if (seen !== null || usedBefore) return null;
  return parseVersion(current) ? current : null;
}

/**
 * The version to remember once the notes have been shown: the one running — unless that is *behind*
 * what's already remembered. A dev build (`0.3.0`, never CI-stamped) launched over an installed `0.3.45`, or a
 * rollback, must not pull the marker back, or the next real launch would announce everything again.
 */
export function nextSeen(seen: string | null, current: string): string | null {
  const now = parseVersion(current);
  if (!now) return seen;
  const before = seen === null ? null : parseVersion(seen);
  if (!before) return current;
  return compareVersions(now, before) > 0 ? current : seen;
}

/** A stored value read back: a version we can order, or null — a hand-edited or damaged store is "nothing remembered". */
export function readSeen(stored: unknown): string | null {
  return typeof stored === "string" && parseVersion(stored) ? stored : null;
}

/**
 * The banner's one line: which build this is and what is newest in it, and how much more there is. Where the
 * player came *from* is only said when it is known — a marker was remembered; an install updating from before
 * this was tracked has none, and "Updated 0.1.0 →" would be a made-up starting point.
 */
export function updateHeadline(fresh: readonly ReleaseNote[], seen: string | null, current: string): string {
  const [newest, ...rest] = fresh;
  if (!newest) return "";
  const more = rest.length ? `, and ${rest.length} more ${rest.length === 1 ? "update" : "updates"}` : "";
  if (seen === null) return `EQ List ${current} — ${newest.title}${more}.`;
  return `Updated ${seen} → ${current}: ${newest.title}${more}.`;
}

/**
 * A stretch of the app's history from **before** release notes existed, reconstructed from the project's own log.
 *
 * Not a release line, and deliberately not a `ReleaseNote`: every install that exists is on `0.1.x`, so a numbered
 * note for something they already have would be announced to them as new. These are only ever read, under "Before
 * release notes" — never announced. Dated, since a date is the one thing the history actually has. The further back
 * one goes the less there is to say, and the notes say less (CHANGELOG's own rule is the opposite: be exact).
 */
export interface HistoryNote {
  /** First day it covers, `YYYY-MM-DD`. */
  from: string;
  /** Last day it covers, inclusive. */
  to: string;
  title: string;
  changes: readonly Change[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * A period as a person says it: `Sep 2026` for a whole month, `26–31 Oct 2026` inside one, `22 Jul – 3 Aug 2026`
 * across two. Fixed English month names rather than `Intl`, so the words don't depend on the machine's locale.
 */
export function periodText(from: string, to: string): string {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const day = (y: number, m: number, d: number) => `${d} ${MONTHS[m - 1]} ${y}`;
  if (from === to) return day(fy, fm, fd);
  if (fy === ty && fm === tm) {
    const lastDay = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
    return fd === 1 && td === lastDay ? `${MONTHS[fm - 1]} ${fy}` : `${fd}–${td} ${MONTHS[tm - 1]} ${ty}`;
  }
  return fy === ty ? `${fd} ${MONTHS[fm - 1]} – ${day(ty, tm, td)}` : `${day(fy, fm, fd)} – ${day(ty, tm, td)}`;
}

/** What is wrong with a list of changes — the rules a release and a stretch of history share. */
function changeProblems(at: string, changes: readonly Change[]): string[] {
  const kinds: ChangeKind[] = ["new", "better", "fixed"];
  const problems: string[] = [];
  if (!changes.length) problems.push(`${at}: says nothing changed`);
  for (const c of changes) {
    if (!kinds.includes(c.kind)) problems.push(`${at}: unknown kind "${c.kind}"`);
    if (!c.text.trim()) problems.push(`${at}: an empty change`);
  }
  return problems;
}

/**
 * What is wrong with a changelog, said in words — an empty list is a good one. Pinned by a test over the real
 * data rather than checked at runtime: a malformed note should fail the build that wrote it, not the screen
 * that shows it.
 */
export function changelogProblems(notes: readonly ReleaseNote[]): string[] {
  const problems: string[] = [];
  notes.forEach((note, i) => {
    const at = `release ${note.line}`;
    if (!/^\d+\.\d+$/.test(note.line)) problems.push(`${at}: a line is "major.minor"`);
    if (!isCalendarDate(note.date)) problems.push(`${at}: date "${note.date}" is not YYYY-MM-DD`);
    if (!note.title.trim()) problems.push(`${at}: no title`);
    problems.push(...changeProblems(at, note.changes));
    const older = notes[i + 1];
    if (!older) return;
    const [a, b] = [releaseLine(note.line), releaseLine(older.line)];
    if (a && b && compareVersions(a, b) <= 0) problems.push(`${at}: must come before ${older.line} — newest first, one note per line`);
    if (note.date < older.date) problems.push(`${at}: dated ${note.date}, before the older ${older.line} (${older.date})`);
  });
  return problems;
}

/**
 * The same for the history: real dates, newest first, no two periods overlapping — and, given `before`, the day the
 * first numbered release was written, none of it reaching past that, or the same work would be told twice.
 */
export function historyProblems(history: readonly HistoryNote[], before?: string): string[] {
  const problems: string[] = [];
  history.forEach((h, i) => {
    const at = `history ${h.from}`;
    if (!isCalendarDate(h.from) || !isCalendarDate(h.to)) problems.push(`${at}: dates must be YYYY-MM-DD (${h.from} – ${h.to})`);
    if (h.from > h.to) problems.push(`${at}: starts after it ends (${h.to})`);
    if (!h.title.trim()) problems.push(`${at}: no title`);
    problems.push(...changeProblems(at, h.changes));
    if (i === 0 && before !== undefined && h.to >= before) problems.push(`${at}: runs to ${h.to}, into the first numbered release (${before})`);
    const older = history[i + 1];
    if (older && older.to >= h.from) problems.push(`${at}: overlaps or comes before the older period ending ${older.to} — newest first`);
  });
  return problems;
}

/** A real day, spelled `YYYY-MM-DD`. Round-tripped, because `Date.parse` lets February have a 30th. */
function isCalendarDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const parsed = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(text);
}

function newestFirst(a: ReleaseNote, b: ReleaseNote): number {
  return compareVersions(releaseLine(b.line) ?? [], releaseLine(a.line) ?? []);
}
