/**
 * findings.mjs — what the app told us was wrong, and which of it we have agreed to live with.
 *
 * Pure: it turns raw Chrome DevTools Protocol events (and lines from the main process's debug log) into
 * `Finding`s, and sorts them into **unexpected** and **allowed**. It never touches a socket, so what
 * counts as a problem is unit-tested (findings.test.mjs) and the live sweep only has to feed it.
 *
 * A finding is `{ source, text, url?, where? }`:
 *   source  "console" | "exception" | "log:<chromium source>" | "main"
 *   where   the sweep step it appeared in (`Now → Overview`), stamped by the collector.
 */

const MAX_TEXT = 400;

/** One console argument as text: a primitive as itself, an object by its description (an Error's is its stack). */
function argText(arg) {
  if (arg.value !== undefined) return String(arg.value);
  return arg.description ?? arg.type ?? "";
}

const clip = (text) => (text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text);

/**
 * A CDP event as a finding, or `null` when it is not a problem. Only error-level output counts:
 * warnings are plentiful in a dev build (React, Electron's CSP notice) and a suite that fails on them
 * teaches people to ignore it.
 */
export function findingFromEvent(method, params) {
  switch (method) {
    case "Runtime.consoleAPICalled":
      // `console.assert` reports a failed assertion as type "assert".
      if (params.type !== "error" && params.type !== "assert") return null;
      return {
        source: "console",
        text: clip((params.args ?? []).map(argText).join(" ")),
        url: params.stackTrace?.callFrames?.[0]?.url,
      };
    case "Runtime.exceptionThrown": {
      const details = params.exceptionDetails ?? {};
      return {
        source: "exception",
        text: clip(details.exception?.description ?? details.text ?? "exception"),
        url: details.url,
      };
    }
    case "Log.entryAdded": {
      const entry = params.entry ?? {};
      if (entry.level !== "error") return null;
      return { source: `log:${entry.source}`, text: clip(entry.text ?? ""), url: entry.url };
    }
    default:
      return null;
  }
}

/**
 * The debug log's lines are `<iso> LEVEL message`; only `ERROR` ones are findings (warn is routine).
 * Main mirrors every renderer's console into that log as `[renderer:<window>] …`; the prefix is dropped
 * so a message the page reported and the log repeats reads as the same message.
 */
const MAIN_ERROR = /^\S+ ERROR (?:\[renderer:[^\]]*\] )?(.*)$/;

export function findingsFromMainLog(text) {
  const found = [];
  for (const line of text.split(/\r?\n/)) {
    const match = MAIN_ERROR.exec(line);
    if (match) found.push({ source: "main", text: clip(match[1]) });
  }
  return found;
}

/**
 * The allowlist entry that covers a finding, or `undefined`. An entry's every field must match:
 *   source  a string compared exactly, optional
 *   text    a RegExp tested against the finding's text — required, so nothing is allowed wholesale
 *   where   a RegExp tested against the step label, optional (an error allowed only in one tab)
 */
export function allowedBy(finding, allowlist) {
  return allowlist.find(
    (entry) =>
      (entry.source === undefined || entry.source === finding.source) &&
      entry.text.test(finding.text) &&
      (entry.where === undefined || entry.where.test(finding.where ?? "")),
  );
}

/** Split findings into the ones nobody agreed to and the ones an allowlist entry covers (with which). */
export function classify(findings, allowlist) {
  const unexpected = [];
  const allowed = [];
  for (const finding of findings) {
    const entry = allowedBy(finding, allowlist);
    if (entry) allowed.push({ finding, entry });
    else unexpected.push(finding);
  }
  return { unexpected, allowed };
}

/**
 * The same message appearing forty times in forty steps is one problem. Groups by source + text,
 * counting and remembering the first few places it showed up, in first-seen order.
 */
export function groupFindings(findings, maxWhere = 4) {
  const groups = new Map();
  for (const finding of findings) {
    const key = `${finding.source}|${finding.text}`;
    const group = groups.get(key) ?? { source: finding.source, text: finding.text, count: 0, where: [] };
    group.count += 1;
    if (finding.where && !group.where.includes(finding.where) && group.where.length < maxWhere) group.where.push(finding.where);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** One group as evidence lines for the report. */
export function describeGroup(group) {
  const where = group.where.length ? ` — in ${group.where.join(" | ")}` : "";
  return `[${group.source}] x${group.count}${where}\n      ${group.text.replace(/\s+/g, " ")}`;
}

/**
 * Text on screen that means a value failed to compute. Deliberately narrow: `null`, `true` or
 * `Infinity` are all words a real page can contain (a wiki item called "Blade of Infinity"), so
 * only the tokens no sentence has a reason to print are looked for.
 */
const BROKEN_TEXT = /\bNaN\b|\bundefined\b|\[object Object\]|Invalid Date/;

/** The lines of a screen's text that show a broken value, trimmed and capped. */
export function brokenTextLines(screenText) {
  return screenText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => BROKEN_TEXT.test(line))
    .map((line) => line.slice(0, 160));
}
