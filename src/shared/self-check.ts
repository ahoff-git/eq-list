/**
 * self-check.ts — "why isn't it doing anything?", answered as a chain of steps with the first
 * broken link named.
 *
 * Everything this app does hangs off one thread: a folder → a file in it → a watcher on that file →
 * lines in the shape we read → events we understand. When that thread breaks, **every symptom looks
 * the same** — the list never lights up, the meter stays at zero, no alert ever pops — and the
 * causes are wildly different: a folder that moved, `/log on` never typed for this character, a
 * pinned log file that was deleted, a folder we can't read. Nothing on screen tells them apart, so
 * the question reaching us is always the same unanswerable one.
 *
 * Two properties make this useful rather than another status light:
 *
 *   - **It is a chain, not a checklist.** A step declares what it `needs`, and a step whose
 *     prerequisite failed reports `skip` rather than running. Nine red rows for one missing folder
 *     is noise that buries the one row that matters; one red row and eight "not checked yet" is a
 *     diagnosis. This is the whole design (ADR 0100).
 *   - **Every step says what it found**, pass or fail. A green row that names the file it's
 *     following is worth as much as a red one — half of troubleshooting is discovering the app is
 *     watching a different character than you're playing.
 *
 * Pure and dependency-free, deliberately: the *judging* lives here so it can be tested without a
 * filesystem, a network or an Electron window, and the *looking* lives in
 * [electron/self-check.ts](../../electron/self-check.ts), which supplies one probe per step. The
 * panel renders what comes back and decides nothing.
 */

/** How a step came out. `skip` is never a probe's answer — the runner assigns it (see `runChecks`). */
export type CheckStatus = "pass" | "warn" | "fail" | "skip";

/** One thing that has to be true, and what depends on it. */
export interface CheckStep {
  id: string;
  /** What's being checked, as the thing the user cares about — not as a function name. */
  label: string;
  /** What stops working when this one is wrong. Shown beside a row that isn't green. */
  matters: string;
  /**
   * The step that has to pass first. A step whose prerequisite failed (or was itself skipped) is
   * **not run** — its answer would be a restatement of the real fault, dressed as a second fault.
   */
  needs?: string;
}

/** What a probe found. `detail` is always stated; `fix` only when there's something to do. */
export interface CheckOutcome {
  status: "pass" | "warn" | "fail";
  /** What we actually found, in the user's terms — a path, a count, an age, an error. */
  detail: string;
  /** The one thing worth doing about it. Omitted on a pass. */
  fix?: string;
}

/** How one step is looked at. Async because two of them touch the disk and the network. */
export type CheckProbe = () => CheckOutcome | Promise<CheckOutcome>;

/** One row of the report: the step, how it came out, and what was found. */
export interface CheckResult {
  step: CheckStep;
  status: CheckStatus;
  detail: string;
  fix?: string;
}

/**
 * The chain, in the order it's read — **the order things actually depend on each other**, not worst
 * first. A reader scanning down stops at the first row that isn't green, and everything below it is
 * either a consequence or a separate concern; sorting by severity would break exactly that reading.
 *
 * The log thread comes first because it is what breaks: the folder, the file, the watcher, the
 * shape of the lines. The rest are independent — a place to save what's learned, the wiki, the
 * game's maps, the alert overlay, and whether there's anything on the list to watch for — and each
 * fails on its own without taking the others down.
 */
export const SETUP_CHECKS: CheckStep[] = [
  {
    id: "log-folder",
    label: "Your EverQuest log folder",
    matters: "Nothing at all is read until this points at the Logs folder inside your EverQuest install.",
  },
  {
    id: "log-files",
    label: "A log to watch",
    // Deliberately "a log", not "an eqlog_*.txt": a file pinned in Settings counts whatever it's
    // called, because the watcher follows the path it's given. The step asks the question the user
    // asks, and the probe answers it the way the app really behaves.
    matters: "EverQuest only writes one once logging has been switched on in game, and it's remembered per character rather than per account.",
    needs: "log-folder",
  },
  {
    id: "log-file",
    label: "The log we're following",
    matters: "One file at a time — the newest, or the one you pinned in Settings.",
    needs: "log-files",
  },
  {
    id: "watching",
    label: "The watcher is running on it",
    matters: "This is what turns new lines into everything else the app shows.",
    needs: "log-file",
  },
  {
    id: "log-fresh",
    label: "The game is still writing to it",
    matters:
      "A log that stopped growing while you're in game means logging is off for this character — the single most common reason nothing happens.",
    needs: "watching",
  },
  {
    id: "log-lines",
    label: "Its lines are the shape we read",
    matters: "Every line has to carry EverQuest's own timestamp before any of it can be parsed.",
    needs: "watching",
  },
  {
    id: "log-events",
    label: "Something in them is something we act on",
    matters: "Kills, loot, casts and zone lines are what the panels are built from; chat alone feeds nothing.",
    needs: "log-lines",
  },
  {
    id: "character",
    label: "Which character this is",
    matters: "Your name comes from the log's filename, and it's what marks a kill, a record or a fight as yours.",
    needs: "log-file",
  },
  {
    id: "data-folder",
    label: "Somewhere to save what it learns",
    matters: "Settings, your list and everything learned from the log are written here — unwritable means nothing survives a restart.",
  },
  {
    id: "wiki",
    label: "eqlwiki.com is reachable",
    matters: "Searching, and adding an item, quest or recipe from the wiki. Watching your log doesn't need it.",
  },
  {
    id: "maps",
    label: "The game's own map files",
    matters: "The map window and travel routes are drawn from the maps folder beside your Logs folder.",
  },
  {
    id: "alerts",
    label: "An alert can reach the screen",
    matters: "The transparent overlay is what a cast alert, a spawn pop or a match is drawn on.",
  },
  {
    id: "list",
    label: "Something on your list to watch for",
    matters: "The list is what a drop is matched against — an empty one can never light up.",
  },
];

/** One step by id, for a caller that knows which it wants. */
export const stepById = (id: string): CheckStep | undefined => SETUP_CHECKS.find((s) => s.id === id);

/**
 * Run the chain and report every step.
 *
 * A step is skipped — not run — when what it `needs` failed or was itself skipped, and the skip says
 * which step it's waiting on, so the report reads as a diagnosis rather than a pile of faults.
 *
 * A probe that **throws** is a `fail` carrying the error rather than an exception out of here: this
 * is the button people press when things are already broken, and it returning nothing at all would
 * be the one outcome with no diagnostic value whatsoever.
 *
 * Sequential by design. The steps are cheap apart from the network one, and running them in order
 * is what makes the skip rule expressible at all.
 */
export async function runChecks(
  probes: Record<string, CheckProbe>,
  steps: CheckStep[] = SETUP_CHECKS,
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const status = new Map<string, CheckStatus>();

  for (const step of steps) {
    const blocker = step.needs ? blockerFor(step.needs, status, steps) : undefined;
    if (blocker) {
      results.push({ step, status: "skip", detail: `Not checked — “${blocker}” has to be right first.` });
      status.set(step.id, "skip");
      continue;
    }
    const probe = probes[step.id];
    const outcome = probe
      ? await Promise.resolve()
          .then(probe)
          .catch((err: unknown) => fail(`The check itself failed: ${String(err)}`))
      : fail("Nothing knows how to check this.");
    results.push({ step, ...outcome });
    status.set(step.id, outcome.status);
  }
  return results;
}

/** The label of the step blocking `needs`, or undefined when it's clear to run. */
function blockerFor(needs: string, status: Map<string, CheckStatus>, steps: CheckStep[]): string | undefined {
  const state = status.get(needs);
  if (state === "pass" || state === "warn") return undefined;
  return steps.find((s) => s.id === needs)?.label ?? needs;
}

const fail = (detail: string): CheckOutcome => ({ status: "fail", detail });

/** Which of two statuses is the more worrying — `fail` over `warn` over the rest. */
const RANK: Record<CheckStatus, number> = { fail: 3, warn: 2, skip: 1, pass: 0 };

/**
 * The headline: how it went, and — the point of the whole feature — **which step is the one to
 * deal with**.
 *
 * Named from the *first* problem in chain order rather than the worst one, because in a chain the
 * first is the cause and the rest are its shadow. A run with no probes at all still summarises
 * honestly rather than reading as a pass.
 */
export function summarize(results: CheckResult[]): { status: CheckStatus; headline: string } {
  const broken = results.find((r) => r.status === "fail");
  if (broken) return { status: "fail", headline: `Stopped at: ${broken.step.label}.` };
  const iffy = results.find((r) => r.status === "warn");
  if (iffy) return { status: "warn", headline: `Working, with one thing worth knowing: ${iffy.step.label}.` };
  if (!results.length) return { status: "skip", headline: "Nothing was checked." };
  return { status: "pass", headline: "Everything checked out." };
}

/** The worst status in the report — what the button's own badge wears. */
export const worstStatus = (results: CheckResult[]): CheckStatus =>
  results.reduce<CheckStatus>((worst, r) => (RANK[r.status] > RANK[worst] ? r.status : worst), "pass");

/** How many rows want somebody to do something. */
export const problemCount = (results: CheckResult[]): number =>
  results.filter((r) => r.status === "fail" || r.status === "warn").length;

/**
 * The whole report as plain text, for pasting into a bug report.
 *
 * Worth its own function rather than left to the panel: what somebody sends us is the thing we
 * debug from, so it should carry the same words the screen did — including the `fix` lines, which
 * say what the app already advised and therefore what they've likely already tried.
 */
export function reportText(results: CheckResult[], header?: string): string {
  const { headline } = summarize(results);
  const lines = [header ? `EQ List setup check — ${header}` : "EQ List setup check", headline, ""];
  for (const r of results) {
    lines.push(`${MARK[r.status]} ${r.step.label}: ${r.detail}`);
    if (r.fix) lines.push(`    → ${r.fix}`);
  }
  return lines.join("\n");
}

/** ASCII rather than emoji: this text is pasted into places that mangle emoji. */
const MARK: Record<CheckStatus, string> = { pass: "[ok]  ", warn: "[warn]", fail: "[FAIL]", skip: "[--]  " };
