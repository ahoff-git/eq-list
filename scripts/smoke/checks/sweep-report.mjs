/**
 * sweep-report.mjs — the sweep's plan and its verdicts, as pure functions.
 *
 * What the walk visits (`planWalk`) and how what it saw becomes report rows (`sweepResults`), kept apart
 * from the driving so both are unit-tested without an app.
 */
import { ALLOWLIST } from "../lib/allowlist.mjs";
import { classify, describeGroup, groupFindings } from "../lib/findings.mjs";
import { fail, pass } from "../lib/report.mjs";
import { rollUp } from "./grid-judges.mjs";

/** Where the sweep goes: every section of every area, in the app's own order, with a label for each. */
export function planWalk(areas, names) {
  return areas.flatMap((area, a) =>
    area.sections.map((section, s) => ({ a, s, area: area.key, section, label: `${area.label} → ${names[section] ?? section}` })),
  );
}

/** One report row per kind of grid assertion, and the results that belong to each. */
const GRID_ROWS = [
  ["grid: present", /^grid present$/],
  ["grid: column menu", /^column menu/],
  ["grid: manage columns", /^manage columns$/],
  ["grid: pager footer", /^pager footer$/],
  ["grid: sort then page", /^sort then page$/],
  ["faction hits: ▶ ◀ rows per page", /^▶ ◀/],
];

/** A grid result's name in the evidence: the table, and for the column menu which kind of column was tried. */
const gridLabel = (r) => (r.assertion.startsWith("column menu") ? `${r.grid} ${r.assertion.slice("column menu".length).trim()}` : r.grid);

export function gridRows(grids) {
  return GRID_ROWS.map(([name, pattern]) => {
    const mine = grids.filter((g) => pattern.test(g.assertion)).map((g) => ({ ...g, grid: gridLabel(g) }));
    return { name, ...rollUp(name, mine), ms: 0 };
  });
}

/** The slowest few steps, as "label: 12.3s" — where the time went, for the next person who wants the run shorter. */
export function slowestSteps(timings, count = 4) {
  return [...timings]
    .sort((a, b) => b.ms - a.ms)
    .slice(0, count)
    .map((t) => `${t.label}: ${(t.ms / 1000).toFixed(1)}s`);
}

/** Everything the sweep concluded, as results. */
export function sweepResults({ seen, findings, how, blocked }) {
  const reached = `${seen.steps} sections, ${seen.views} views`;
  const results = [
    seen.problems.length
      ? fail("sweep: every section", `${seen.problems.length} step${seen.problems.length === 1 ? "" : "s"} did not work`, seen.problems)
      : pass("sweep: every section", reached, [
          how,
          `main refused ${blocked.count} outside fetches${blocked.hosts.length ? ` (${blocked.hosts.join(", ")})` : ""}`,
          `slowest: ${slowestSteps(seen.timings ?? []).join("; ")}`,
        ]),
  ];

  const errors = classify(findings, ALLOWLIST);
  const groups = groupFindings(errors.unexpected);
  const allowed = groupFindings(errors.allowed.map((a) => a.finding)).map((g) => `allowed: ${describeGroup(g)}`);
  results.push(
    groups.length
      ? fail("sweep: page errors", `${groups.length} distinct (${errors.unexpected.length} total)`, groups.map(describeGroup))
      : pass("sweep: page errors", `none in ${reached}`, allowed),
  );

  const broken = groupFindings(classify(seen.text, ALLOWLIST).unexpected);
  results.push(
    broken.length
      ? fail("sweep: broken values", `${broken.length} line${broken.length === 1 ? "" : "s"} show NaN/undefined`, broken.map(describeGroup))
      : pass("sweep: broken values", "no NaN, undefined or [object Object] on any view"),
  );

  return [...results, ...gridRows(seen.grids)];
}
