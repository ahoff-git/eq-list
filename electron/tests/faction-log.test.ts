/**
 * Black-box test for the always-on faction ledger: it records hits, hands them back newest-first
 * (bounded by the caller's limit), folds them to a net standing per faction, survives a restart, and
 * treats a corrupt legacy file as empty rather than fatal. Mirrors `loot-log.test.ts`.
 *
 * SQLite-backed (ADR 0232): most tests use an in-memory database (fast, and there is no cap left to
 * fill up to force an eviction) — only "survives a restart" needs a real file, since that is the one
 * property an in-memory database cannot demonstrate.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { createFactionLog, FACTION_LOG_MIGRATIONS, type FactionLog } from "../faction-log";
import { openAppDatabase } from "../sqlite-store";
import type { FactionRecord } from "../../src/shared/types";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "eql-faction-"));
}

/** A ledger over a fresh in-memory database — fast, and isolated from every other test. */
function freshLog(dir = tempDir()): FactionLog {
  const db = new Database(":memory:");
  for (const m of FACTION_LOG_MIGRATIONS) m.up(db);
  return createFactionLog(db, dir);
}

function hit(
  faction: string,
  sec: number,
  delta: number | null,
  direction: FactionRecord["direction"],
  causedBy?: FactionRecord["causedBy"],
): FactionRecord {
  return {
    kind: "faction",
    faction,
    delta,
    direction,
    causedBy,
    logId: sec,
    raw: `faction hit ${faction}`,
    at: `2026-07-29T00:00:${String(sec).padStart(2, "0")}`,
  };
}

const raised = (faction: string, sec: number, delta: number, mob?: string) =>
  hit(faction, sec, delta, "raised", mob ? { kind: "kill", mob, gapSec: 1 } : undefined);
const lowered = (faction: string, sec: number, delta: number, mob?: string) =>
  hit(faction, sec, delta, "lowered", mob ? { kind: "kill", mob, gapSec: 1 } : undefined);

test("the same faction line twice is one hit — a replayed gap isn't a second adjustment", () => {
  const l = freshLog();
  assert.equal(l.add(lowered("Agents of Mistmoore", 1, -3)), "added");
  assert.equal(l.add(lowered("Agents of Mistmoore", 1, -3)), "known", "the same line says so rather than landing twice");
  assert.deepEqual(l.recent().map((e) => e.faction), ["Agents of Mistmoore"]);
  // A genuinely later hit against the same faction is a different line, and counts.
  assert.equal(l.add(lowered("Agents of Mistmoore", 2, -1)), "added");
  assert.equal(l.recent().length, 2);
});

test("recent returns hits newest first, capped at the limit", () => {
  const l = freshLog();
  l.add(raised("Circle of Unseen Hands", 1, 2));
  l.add(lowered("Agents of Mistmoore", 2, -3));
  l.add(raised("Circle of Unseen Hands", 3, 4));
  assert.deepEqual(l.recent().map((e) => e.at.slice(-2)), ["03", "02", "01"]);
  assert.deepEqual(l.recent(2).map((e) => e.at.slice(-2)), ["03", "02"]);
});

test("hitsPage sorts and pages server-side, and reports the true total", () => {
  const l = freshLog();
  l.add(raised("Circle of Unseen Hands", 1, 2));
  l.add(lowered("Agents of Mistmoore", 2, -3));
  l.add(raised("Circle of Unseen Hands", 3, 4));

  const first = l.hitsPage({ offset: 0, limit: 2, sortField: "at", sortDesc: true });
  assert.deepEqual(first.rows.map((e) => e.at.slice(-2)), ["03", "02"]);
  assert.equal(first.total, 3);

  const second = l.hitsPage({ offset: 2, limit: 2, sortField: "at", sortDesc: true });
  assert.deepEqual(second.rows.map((e) => e.at.slice(-2)), ["01"]);
  assert.equal(second.total, 3);

  const byFaction = l.hitsPage({ offset: 0, limit: 10, sortField: "faction", sortDesc: false });
  assert.deepEqual(byFaction.rows.map((e) => e.faction), [
    "Agents of Mistmoore",
    "Circle of Unseen Hands",
    "Circle of Unseen Hands",
  ]);
});

test("hitsPage clamps a negative limit or offset instead of handing back the whole ledger", () => {
  // SQLite treats a negative `LIMIT` as "no limit at all" — nothing in `FactionHitsGrid`'s own pagination
  // state can go negative today, but nothing at the IPC boundary stopped it either, and a page-sized
  // request for a negative limit fetching the entire table is exactly what server-side paging exists
  // to avoid.
  const l = freshLog();
  for (let i = 1; i <= 5; i++) l.add(raised("Circle of Unseen Hands", i, 1));

  const page = l.hitsPage({ offset: 0, limit: -1, sortField: "at", sortDesc: true });
  assert.equal(page.rows.length, 0);
  assert.equal(page.total, 5, "the true total is still reported, even though the page itself is empty");

  const negOffset = l.hitsPage({ offset: -3, limit: 2, sortField: "at", sortDesc: true });
  assert.equal(negOffset.rows.length, 2, "a negative offset clamps to the start, not an empty/invalid page");
});

test("hitsPage sorts a null delta (a floor/ceiling hit) to the end, in either direction", () => {
  const l = freshLog();
  l.add(raised("Circle of Unseen Hands", 1, 2));
  l.add(hit("Agents of Mistmoore", 2, null, "floor"));
  l.add(lowered("Priests of Marr", 3, -5));

  const asc = l.hitsPage({ offset: 0, limit: 10, sortField: "delta", sortDesc: false });
  assert.deepEqual(asc.rows.map((e) => e.delta), [-5, 2, null]);
  const desc = l.hitsPage({ offset: 0, limit: 10, sortField: "delta", sortDesc: true });
  assert.deepEqual(desc.rows.map((e) => e.delta), [2, -5, null]);
});

test("hitsPage's filter reaches the whole ledger, not just the requested page — total reflects it too", () => {
  const l = freshLog();
  l.add(raised("Circle of Unseen Hands", 1, 2));
  l.add(lowered("Agents of Mistmoore", 2, -3));
  l.add(raised("Circle of Unseen Hands", 3, 4));
  l.add(lowered("Agents of Mistmoore", 4, -1));

  // A page size of 1 would only ever see one row of whichever faction is on top if this only
  // narrowed what was already fetched — the whole point is that it narrows before paging, not after.
  const page = l.hitsPage({
    offset: 0,
    limit: 1,
    sortField: "at",
    sortDesc: true,
    filter: { items: [{ field: "faction", operator: "contains", value: "Mistmoore" }] },
  });
  assert.equal(page.total, 2, "two Mistmoore hits exist, even though only one fits on this page");
  assert.deepEqual(page.rows.map((e) => e.faction), ["Agents of Mistmoore"]);
});

test("hitsPage's filter supports numeric operators on delta", () => {
  const l = freshLog();
  l.add(raised("Circle of Unseen Hands", 1, 2));
  l.add(lowered("Agents of Mistmoore", 2, -3));
  l.add(raised("Priests of Marr", 3, 10));

  const big = l.hitsPage({
    offset: 0,
    limit: 10,
    sortField: "at",
    sortDesc: true,
    filter: { items: [{ field: "delta", operator: ">", value: 5 }] },
  });
  assert.deepEqual(big.rows.map((e) => e.faction), ["Priests of Marr"]);
});

test("hitsPage's filter narrows by isAnyOf, and folds multiple items with 'or'", () => {
  const l = freshLog();
  l.add(raised("Circle of Unseen Hands", 1, 2));
  l.add(lowered("Agents of Mistmoore", 2, -3));
  l.add(raised("Priests of Marr", 3, 10));

  const anyOf = l.hitsPage({
    offset: 0,
    limit: 10,
    sortField: "at",
    sortDesc: true,
    filter: { items: [{ field: "faction", operator: "isAnyOf", value: ["Priests of Marr", "Circle of Unseen Hands"] }] },
  });
  assert.equal(anyOf.total, 2);

  const ored = l.hitsPage({
    offset: 0,
    limit: 10,
    sortField: "at",
    sortDesc: true,
    filter: {
      logicOperator: "or",
      items: [
        { field: "faction", operator: "equals", value: "Agents of Mistmoore" },
        { field: "delta", operator: ">", value: 5 },
      ],
    },
  });
  assert.deepEqual(
    ored.rows.map((e) => e.faction).sort(),
    ["Agents of Mistmoore", "Priests of Marr"],
  );
});

test("hitsPage's filter reaches a guessed cause by the mob or NPC it names", () => {
  const l = freshLog();
  l.add(raised("Circle of Unseen Hands", 1, 2, "a shady goblin"));
  l.add(lowered("Agents of Mistmoore", 2, -3, "a fizzled skeleton"));

  const page = l.hitsPage({
    offset: 0,
    limit: 10,
    sortField: "at",
    sortDesc: true,
    filter: { items: [{ field: "cause", operator: "contains", value: "fizzled" }] },
  });
  assert.deepEqual(page.rows.map((e) => e.faction), ["Agents of Mistmoore"]);
});

test("hitsPage's filter reaches causeKind, by the same Kill/Quest label the Source column shows", () => {
  const l = freshLog();
  l.add(raised("Circle of Unseen Hands", 1, 2, "a shady goblin"));
  l.add(hit("Agents of Mistmoore", 2, -3, "lowered", { kind: "dialogue", npc: "a hooded figure", text: "...", gapSec: 1 }));

  const page = l.hitsPage({
    offset: 0,
    limit: 10,
    sortField: "at",
    sortDesc: true,
    filter: { items: [{ field: "causeKind", operator: "equals", value: "Quest" }] },
  });
  assert.deepEqual(page.rows.map((e) => e.faction), ["Agents of Mistmoore"]);
});

test("hitsPage's filter reaches the raw log line", () => {
  const l = freshLog();
  l.add(raised("Circle of Unseen Hands", 1, 2));
  l.add(lowered("Agents of Mistmoore", 2, -3));

  const page = l.hitsPage({
    offset: 0,
    limit: 10,
    sortField: "at",
    sortDesc: true,
    filter: { items: [{ field: "raw", operator: "contains", value: "Mistmoore" }] },
  });
  assert.deepEqual(page.rows.map((e) => e.faction), ["Agents of Mistmoore"]);
});

test("hitsPage's filter treats a literal % or _ as text, not a SQL wildcard", () => {
  const l = freshLog();
  l.add(raised("100% Zek", 1, 2));
  l.add(raised("Circle of Unseen Hands", 2, 4));

  const page = l.hitsPage({
    offset: 0,
    limit: 10,
    sortField: "at",
    sortDesc: true,
    filter: { items: [{ field: "faction", operator: "contains", value: "100%" }] },
  });
  assert.deepEqual(page.rows.map((e) => e.faction), ["100% Zek"]);
});

test("hitsPage ignores an incomplete filter item instead of erroring", () => {
  const l = freshLog();
  l.add(raised("Circle of Unseen Hands", 1, 2));
  l.add(lowered("Agents of Mistmoore", 2, -3));

  // No value typed yet (mid-edit in the grid's own UI) and an operator that doesn't apply to a
  // number column both fall out of the filter entirely rather than narrowing to nothing.
  const page = l.hitsPage({
    offset: 0,
    limit: 10,
    sortField: "at",
    sortDesc: true,
    filter: { items: [{ field: "faction", operator: "contains", value: "" }, { field: "delta", operator: "contains", value: "2" }] },
  });
  assert.equal(page.total, 2);
});

test("the faction ledger survives a restart", () => {
  const dir = tempDir();
  const db1 = openAppDatabase(dir, FACTION_LOG_MIGRATIONS);
  const first = createFactionLog(db1, dir);
  first.add(lowered("Agents of Mistmoore", 1, -3));
  first.flush();
  db1.close();

  const db2 = openAppDatabase(dir, FACTION_LOG_MIGRATIONS);
  assert.deepEqual(createFactionLog(db2, dir).recent().map((e) => e.faction), ["Agents of Mistmoore"]);
});

test("a pre-ADR-0232 faction-log.json is folded in once; the file survives as a provenance stub", () => {
  const dir = tempDir();
  const legacyFile = path.join(dir, "faction-log.json");
  fs.writeFileSync(
    legacyFile,
    JSON.stringify({
      hits: [lowered("Agents of Mistmoore", 1, -3)],
      retired: [
        {
          faction: "Old Faction",
          net: -10,
          raises: 0,
          lowers: 2,
          floors: 0,
          ceilings: 0,
          firstAt: "2026-01-01T00:00:00",
          lastAt: "2026-01-01T00:00:01",
          causes: [],
        },
      ],
      provenance: { revision: 1, appVersion: "0.0.0", at: "2026-01-01T00:00:00.000Z" },
    }),
  );

  const l = freshLog(dir);
  assert.deepEqual(l.recent().map((e) => e.faction), ["Agents of Mistmoore"]);
  const standings = l.standings().sort((a, b) => a.faction.localeCompare(b.faction));
  assert.deepEqual(
    standings.map((s) => [s.faction, s.net]),
    [
      ["Agents of Mistmoore", -3],
      ["Old Faction", -10],
    ],
  );
  // The file isn't renamed away: `data-health.ts` still reads its `provenance` field directly off
  // disk (see the module doc), so it goes on existing — carrying the *legacy* stamp forward exactly
  // as it was, not a fresh "current" one, since migrating storage engines re-derives nothing.
  assert.equal(fs.existsSync(legacyFile), true);
  const stub = JSON.parse(fs.readFileSync(legacyFile, "utf8"));
  assert.deepEqual(stub, { provenance: { revision: 1, appVersion: "0.0.0", at: "2026-01-01T00:00:00.000Z" } });

  // Re-running against the same directory (a second launch before the app ever wrote its own data)
  // must not double the migrated hit — the stub has no `hits` array left to re-migrate from.
  const again = freshLog(dir);
  assert.equal(again.recent().length, 0, "a fresh database, and the stub has nothing left to feed it");
});

test("a corrupt legacy file migrates nothing, rather than crashing the ledger", () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "faction-log.json"), "{nope");
  assert.deepEqual(freshLog(dir).recent(), []);
});

test("clearing empties the feed but keeps standings", () => {
  const l = freshLog();
  l.add(lowered("Agents of Mistmoore", 1, -3));
  l.clear();
  assert.deepEqual(l.recent(), []);
  // What the ledger taught survives a plain clear — the same rule a loot price gets (ADR 0056),
  // now a snapshot taken at clear time rather than a fold triggered by a cap filling up.
  assert.equal(l.standings()[0]?.net, -3);

  // Only the second, explicit answer unlearns it.
  l.clear("everything");
  assert.deepEqual(l.standings(), []);
});

test("a standing outlives the hits that built it once they're cleared, and folds onto what was already frozen", () => {
  const l = freshLog();
  l.add(lowered("Agents of Mistmoore", 1, -3));
  l.add(raised("Agents of Mistmoore", 2, 1));
  l.clear();
  assert.deepEqual(l.recent(), [], "the hits are gone");
  l.add(lowered("Agents of Mistmoore", 3, -1));
  const standing = l.standings().find((s) => s.faction === "Agents of Mistmoore");
  assert.deepEqual(
    [standing?.net, standing?.raises, standing?.lowers],
    [-3, 1, 2],
    "the frozen snapshot and the live hit since are folded together, not one replacing the other",
  );
});

test("standings fold every stated delta, and count floor/ceiling hits apart from them", () => {
  const l = freshLog();
  l.add(lowered("Agents of Mistmoore", 1, -3));
  l.add(lowered("Agents of Mistmoore", 2, -5));
  l.add(raised("Agents of Mistmoore", 3, 1));
  l.add(hit("Agents of Mistmoore", 4, null, "floor"));
  l.add(raised("Priests of Marr", 5, 10));
  l.add(hit("Priests of Marr", 6, null, "ceiling"));

  const [mistmoore, marr] = l.standings().sort((a, b) => a.faction.localeCompare(b.faction));
  assert.deepEqual(
    [mistmoore.faction, mistmoore.net, mistmoore.raises, mistmoore.lowers, mistmoore.floors, mistmoore.ceilings],
    ["Agents of Mistmoore", -7, 1, 2, 1, 0],
  );
  assert.deepEqual(
    [marr.faction, marr.net, marr.raises, marr.lowers, marr.floors, marr.ceilings],
    ["Priests of Marr", 10, 1, 0, 0, 1],
  );
  assert.equal(mistmoore.firstAt.slice(-2), "01");
  assert.equal(mistmoore.lastAt.slice(-2), "04");
});

test("a faction touched only by floor/ceiling hits nets zero, not SQL NULL", () => {
  // `SUM()` over a group where every row's `delta` is `NULL` (every hit here is a floor/ceiling cap,
  // which states no amount) itself returns SQL `NULL`, not `0` — unlike the old array-backed fold,
  // which always started a standing at `net: raises: lowers: 0` and only ever added to them. Without
  // a `COALESCE`, a faction whose entire recorded history is caps would carry `net: null`, a value
  // `FactionStanding.net`'s own type (a plain `number`) never promises and the Standings table would
  // render as a blank cell instead of "0".
  const l = freshLog();
  l.add(hit("Circle of Unseen Hands", 1, null, "floor"));
  l.add(hit("Circle of Unseen Hands", 2, null, "ceiling"));

  const [standing] = l.standings();
  assert.deepEqual(
    [standing.net, standing.raises, standing.lowers, standing.floors, standing.ceilings],
    [0, 0, 0, 1, 1],
  );
});

test("standings are ordered most-recently-touched first", () => {
  const l = freshLog();
  l.add(lowered("Agents of Mistmoore", 1, -3));
  l.add(raised("Priests of Marr", 2, 5));
  assert.deepEqual(l.standings().map((s) => s.faction), ["Priests of Marr", "Agents of Mistmoore"]);
});

test("a standing rolls up which mobs' kills its hits were guessed to come from", () => {
  const l = freshLog();
  l.add(lowered("Agents of Mistmoore", 1, -3, "a gnoll pup"));
  l.add(lowered("Agents of Mistmoore", 2, -5, "a gnoll pup"));
  l.add(raised("Agents of Mistmoore", 3, 1, "a gnoll"));
  l.add(lowered("Agents of Mistmoore", 4, -1)); // nothing landed close enough to guess a cause

  const [standing] = l.standings();
  assert.deepEqual(
    standing.causes,
    [
      { kind: "kill", source: "a gnoll pup", net: -8, hits: 2 },
      { kind: "kill", source: "a gnoll", net: 1, hits: 1 },
    ],
    "biggest |net| leads, and an uncorrelated hit adds no row",
  );
});

test("a floor/ceiling hit's cause counts as a hit but contributes no net", () => {
  const l = freshLog();
  l.add(hit("Priests of Marr", 1, null, "ceiling", { kind: "kill", mob: "a gnoll pup", gapSec: 2 }));
  assert.deepEqual(l.standings()[0].causes, [{ kind: "kill", source: "a gnoll pup", net: 0, hits: 1 }]);
});

test("a cause rollup outlives the hits that built it, the same as the net itself", () => {
  const l = freshLog();
  l.add(lowered("Agents of Mistmoore", 1, -3, "a gnoll pup"));
  l.clear();
  assert.deepEqual(l.recent(), [], "the hit is gone");
  assert.deepEqual(l.standings().find((s) => s.faction === "Agents of Mistmoore")?.causes, [
    { kind: "kill", source: "a gnoll pup", net: -3, hits: 1 },
  ]);
});

test("a plain clear keeps the cause rollup along with the net; 'everything' drops both", () => {
  const l = freshLog();
  l.add(lowered("Agents of Mistmoore", 1, -3, "a gnoll pup"));
  l.clear();
  assert.deepEqual(l.standings()[0].causes, [{ kind: "kill", source: "a gnoll pup", net: -3, hits: 1 }]);
  l.clear("everything");
  assert.deepEqual(l.standings(), []);
});

test("a standing rolls up mobs and dialogue causes separately, even if they share a name", () => {
  const l = freshLog();
  l.add(lowered("Agents of Mistmoore", 1, -3, "Bob"));
  l.add(hit("Agents of Mistmoore", 2, 5, "raised", { kind: "dialogue", npc: "Bob", text: "Thank you!", gapSec: 4 }));

  const [standing] = l.standings();
  assert.deepEqual(standing.causes, [
    { kind: "dialogue", source: "Bob", net: 5, hits: 1 },
    { kind: "kill", source: "Bob", net: -3, hits: 1 },
  ]);
});

test("standingsSince folds only hits at or after the cutoff, ordered most-recently-touched first", () => {
  const l = freshLog();
  l.add(lowered("Agents of Mistmoore", 1, -3));
  l.add(raised("Circle of Unseen Hands", 2, 2));
  l.add(lowered("Agents of Mistmoore", 3, -1));

  const since = l.standingsSince("2026-07-29T00:00:02");
  assert.deepEqual(
    since.map((s) => s.faction),
    ["Agents of Mistmoore", "Circle of Unseen Hands"],
    "most-recently-touched first, same as standings()",
  );
  const mistmoore = since.find((s) => s.faction === "Agents of Mistmoore")!;
  assert.equal(mistmoore.net, -1, "the hit at second 1 predates the cutoff and doesn't count toward the session net");
});

test("standingsSince rolls up causes the same way standings() does, scoped to the same window", () => {
  const l = freshLog();
  l.add(lowered("Agents of Mistmoore", 1, -3, "a gnoll pup"));
  l.add(lowered("Agents of Mistmoore", 2, -5, "a gnoll pup"));

  const [standing] = l.standingsSince("2026-07-29T00:00:02");
  assert.deepEqual(
    standing.causes,
    [{ kind: "kill", source: "a gnoll pup", net: -5, hits: 1 }],
    "only the second hit falls inside the window",
  );
});

test("standingsSince never folds in what a past clear() froze, even when sinceIso reaches back before it", () => {
  const l = freshLog();
  l.add(lowered("Agents of Mistmoore", 1, -3));
  l.clear(); // freezes the standing at net -3, then empties the live table
  l.add(raised("Agents of Mistmoore", 2, 1));

  const [standing] = l.standingsSince("2026-07-29T00:00:01");
  assert.equal(standing.net, 1, "a freeze can only ever be older than any session asking, so it stays out entirely");
  // Confirmed against the lifetime view, which does fold the freeze in — the two are meant to disagree.
  assert.equal(l.standings().find((s) => s.faction === "Agents of Mistmoore")?.net, -2);
});

test("standingsSince nets zero rather than SQL NULL for a faction touched only by floor/ceiling hits in the window", () => {
  const l = freshLog();
  l.add(hit("Circle of Unseen Hands", 1, null, "floor"));
  l.add(hit("Circle of Unseen Hands", 2, null, "ceiling"));

  const [standing] = l.standingsSince("2026-07-29T00:00:01");
  assert.deepEqual(
    [standing.net, standing.raises, standing.lowers, standing.floors, standing.ceilings],
    [0, 0, 0, 1, 1],
  );
});

test("recheckDialogueCauses clears a whole cause once its giver isn't a confirmed mob, per ADR 0257/0261", () => {
  const l = freshLog();
  l.add(
    hit("Agents of Mistmoore", 1, 5, "raised", {
      kind: "dialogue",
      npc: "A Dusty Tome",
      text: "Well done.",
      gapSec: 2,
      quests: ["Shovel of Ponz"],
      questsMatched: false,
    }),
  );
  const result = l.recheckDialogueCauses({
    questGiver: () => ["Shovel of Ponz"],
    isMob: () => false, // the wiki cache says "A Dusty Tome" is not a mob
  });
  assert.deepEqual(result, { checked: 1, changed: 1 });
  // Not just the quest — an unmatched speaker is no cause at all any more (ADR 0261), so the whole
  // guess reverts to uncorrelated rather than keeping "conversation with a non-mob" around.
  assert.equal(l.recent()[0].causedBy, undefined);

  // Calling it again against the same, unchanged wiki state is a no-op — nothing left to fix.
  assert.deepEqual(l.recheckDialogueCauses({ questGiver: () => ["Shovel of Ponz"], isMob: () => false }), {
    checked: 0,
    changed: 0,
  });
});

test("recheckDialogueCauses clears a whole cause once no quest matches at all, even for a real mob", () => {
  // The Clan Runnyeye case: "A goblin lookout" is a perfectly real, confirmed mob, but it is not a
  // "Quest giver" for anything — its own combat social line matched the dialogue shape, and this hit
  // was almost certainly just a kill, not a conversation at all (ADR 0261).
  const l = freshLog();
  l.add(
    hit("Clan Runnyeye", 1, 5, "raised", {
      kind: "dialogue",
      npc: "A goblin lookout",
      text: "To arms!",
      gapSec: 2,
    }),
  );
  const result = l.recheckDialogueCauses({ questGiver: () => [], isMob: () => true });
  assert.deepEqual(result, { checked: 1, changed: 1 });
  assert.equal(l.recent()[0].causedBy, undefined);
});

test("recheckDialogueCauses leaves a quest given by a confirmed mob untouched", () => {
  const l = freshLog();
  l.add(
    hit("Agents of Mistmoore", 1, 5, "raised", {
      kind: "dialogue",
      npc: "Vira",
      text: "Well done.",
      gapSec: 2,
      quests: ["Shovel of Ponz"],
      questsMatched: false,
    }),
  );
  const result = l.recheckDialogueCauses({ questGiver: () => ["Shovel of Ponz"], isMob: () => true });
  assert.deepEqual(result, { checked: 1, changed: 0 });
  const [record] = l.recent();
  assert.deepEqual(record.causedBy?.kind === "dialogue" ? record.causedBy.quests : undefined, ["Shovel of Ponz"]);
});

test("recheckDialogueCauses can add a quest to a hit that had none, once the cache catches up", () => {
  // A hit stored with no quest at all — the shape every dialogue cause used to be able to take before
  // ADR 0261, and still can as legacy data on disk even though a *fresh* guess can no longer produce
  // one (see `createFactionCauseTracker`'s tests for that half).
  const l = freshLog();
  l.add(
    hit("Agents of Mistmoore", 1, 5, "raised", {
      kind: "dialogue",
      npc: "Vira",
      text: "Well done.",
      gapSec: 2,
    }),
  );
  // The giver wasn't cached yet when this hit first happened; it is now.
  const result = l.recheckDialogueCauses({ questGiver: () => ["Shovel of Ponz"], isMob: () => true });
  assert.deepEqual(result, { checked: 1, changed: 1 });
  const [record] = l.recent();
  assert.deepEqual(record.causedBy?.kind === "dialogue" ? record.causedBy.quests : undefined, ["Shovel of Ponz"]);
});

test("recheckDialogueCauses never touches a kill-caused hit", () => {
  const l = freshLog();
  l.add(lowered("Agents of Mistmoore", 1, -3, "a gnoll pup"));
  assert.deepEqual(l.recheckDialogueCauses({ questGiver: () => ["Shovel of Ponz"], isMob: () => false }), {
    checked: 0,
    changed: 0,
  });
  assert.equal(l.recent()[0].causedBy?.kind, "kill");
});

test("the admin panel can browse and remove a hit, but nothing is patchable", () => {
  const l = freshLog();
  l.add(lowered("Agents of Mistmoore", 1, -3, "a gnoll pup"));
  const [record] = l.admin.list();
  assert.equal(record.summary, "Agents of Mistmoore lowered -3 (2026-07-29T00:00:01)");
  assert.deepEqual(record.fields, []);
  assert.deepEqual(l.admin.patch(record.id, "delta", "1"), { ok: false, error: '"delta" is not editable' });

  assert.deepEqual(l.admin.remove(record.id), { ok: true });
  assert.deepEqual(l.recent(), []);
  assert.deepEqual(l.admin.remove(record.id), { ok: false, error: "no such record" });
});

test("the admin store's counts() matches a plain list().length, without scanning every row", () => {
  // `faction_hits` keeps every hit forever (ADR 0232) — `counts()` exists so `createAdminRegistry`'s
  // `stores()` can report a total without a full scan-and-map through `list()`. Its own number still
  // has to agree with what `list()` would say.
  const l = freshLog();
  l.add(lowered("Agents of Mistmoore", 1, -3));
  l.add(raised("Circle of Unseen Hands", 2, 4));
  l.add(raised("Circle of Unseen Hands", 3, 1));

  assert.deepEqual(l.admin.counts!(), { total: 3, edited: 0 });
  assert.equal(l.admin.counts!().total, l.admin.list().length);
});
