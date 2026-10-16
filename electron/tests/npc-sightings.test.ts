/**
 * Placing a hail, a consider, or a line of /say against your nearest `/loc` (ADR 0298) —
 * `src/shared/npc/npc-sightings.ts`. Lines are the real ones from handing in Tarton's Wheel.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { importLog } from "../log-import";
import { createNpcSightings } from "../npc-sightings";
import type { KillLog } from "../kill-log";
import {
  addSample,
  createSightingPlacer,
  FIX_WINDOW_SEC,
  MAX_SAMPLES,
  sightingPlace,
  speakerOf,
  type NpcSighting,
  type PlacedSighting,
} from "../../src/shared/npc/npc-sightings";

const EF = "Everfrost Peaks";
const at = (hms: string) => `2026-10-14T${hms}.000Z`;

function placer() {
  const out: PlacedSighting[] = [];
  return { p: createSightingPlacer((s) => out.push(s)), out };
}

test("a hail just after a /loc is placed by it", () => {
  const { p, out } = placer();
  p.noteLoc({ y: 2998.57, x: -2399.41, at: at("23:11:54") }, EF);
  p.note("Sulgar", "hail", at("23:11:56"), EF);
  assert.deepEqual(out, [
    { name: "Sulgar", zone: EF, sample: { at: at("23:11:56"), how: "hail", y: 2999, x: -2399, fixAgeSec: 2 } },
  ]);
});

test("a hail with no /loc yet waits for the next one in the window", () => {
  const { p, out } = placer();
  p.note("Sulgar", "hail", at("23:11:56"), EF);
  assert.equal(out.length, 0);
  p.noteLoc({ y: 3009, x: -2397, at: at("23:12:10") }, EF);
  assert.equal(out[0].sample.y, 3009);
  assert.equal(out[0].sample.fixAgeSec, 14);
});

test("a /loc too long after, or in another zone, places nothing — the sighting is kept unplaced", () => {
  const late = placer();
  late.p.note("Sulgar", "hail", at("23:11:56"), EF);
  late.p.noteLoc({ y: 3009, x: -2397, at: at(`23:1${2 + Math.ceil(FIX_WINDOW_SEC / 60)}:00`) }, EF);
  assert.equal(late.out.length, 1);
  assert.equal(late.out[0].sample.y, undefined);

  const zoned = placer();
  zoned.p.noteLoc({ y: 3009, x: -2397, at: at("23:11:50") }, "Halas");
  zoned.p.note("Sulgar", "hail", at("23:11:56"), EF);
  zoned.p.noteZone();
  assert.equal(zoned.out[0].sample.y, undefined);
  assert.equal(zoned.out[0].zone, EF);
});

test("you and your group are players, not NPCs", () => {
  const { p, out } = placer();
  p.setPlayer("Kainos");
  p.noteParty("joined", "Anguswo");
  p.noteLoc({ y: 1, x: 2, at: at("23:00:00") }, EF);
  p.note("Kainos", "speech", at("23:00:01"), EF);
  p.note("Anguswo", "consider", at("23:00:02"), EF);
  assert.equal(out.length, 0);
  p.noteParty("cleared");
  p.note("Anguswo", "consider", at("23:00:03"), EF);
  assert.equal(out.length, 1);
});

test("speech: only /say range, never a tell, a channel, or a pet", () => {
  assert.equal(speakerOf("Sulgar says, 'Hail, traveler!  Would you happen to know'"), "Sulgar");
  assert.equal(speakerOf("Mizr N`Mar says, 'Ah - the Coin of Tash'"), "Mizr N`Mar");
  assert.equal(speakerOf("Bristlebane tells you, 'The trickster smiles upon you.'"), undefined);
  assert.equal(speakerOf("Orden says out of character, 'lfg'"), undefined);
  assert.equal(speakerOf("Orden tells General:1, 'anyone wanna do a d4 yael raid?'"), undefined);
  assert.equal(speakerOf("Gabober says, 'Following you, Master.'"), undefined);
  assert.equal(speakerOf("Kainos`s warder says, 'Attacking a gnoll'"), undefined);
  assert.equal(speakerOf("Kober says, 'As you wish, oh great one.'"), undefined);
  assert.equal(speakerOf("Gabobn says, 'Guarding with my life, oh splendid one.'"), undefined);
  assert.equal(speakerOf("Goyim says, 'Hail'"), undefined, "a player's bare hail");
  assert.equal(speakerOf("Bunnyslayer says, 'Hail, The Kerran Sha`rr'"), undefined, "a player hailing");
  assert.equal(speakerOf("A minotaur slaver's corpse says, 'Ugh...'"), undefined);
  // A one-word name is no tell: these are a Crushbone orc and a merchant.
  assert.equal(speakerOf("Chokehold says, 'Death!  Death to all who oppose the Crushbone orcs!'"), "Chokehold");
  assert.equal(speakerOf("Tiki says, 'Welcome to my shop, Kainos.'"), "Tiki");
});

const placed = (hms: string, how: PlacedSighting["sample"]["how"], y?: number, x?: number): PlacedSighting => ({
  name: "Sulgar",
  zone: EF,
  sample: { at: at(hms), how, ...(y === undefined ? {} : { y, x }) },
});

test("a sample already held, or a repeat a moment later, files nothing new", () => {
  const one = addSample(undefined, placed("23:11:56", "hail", 2999, -2399));
  assert.equal(addSample(one, placed("23:11:56", "hail", 2999, -2399)), one, "same line read twice");
  assert.equal(addSample(one, placed("23:12:30", "hail", 2999, -2399)), one, "hailed again straight away");
  assert.notEqual(addSample(one, placed("23:12:30", "speech", 2999, -2399)), one, "a different kind of line counts");
});

test("the cap keeps the first sighting and the newest after it", () => {
  let e: NpcSighting | undefined;
  for (let i = 0; i < MAX_SAMPLES + 5; i++) e = addSample(e, placed(`2${Math.floor(i / 10)}:${i % 10}0:00`, "consider", 1, 1));
  assert.equal(e!.samples.length, MAX_SAMPLES);
  assert.equal(e!.samples[0], e!.first);
  assert.equal(e!.first.at, at("20:00:00"));
  assert.equal(e!.samples[MAX_SAMPLES - 1].at, at("22:40:00"));
});

test("placed by the best kind of line only — a far consider never drags a hail's cluster", () => {
  let e = addSample(undefined, placed("20:00:00", "consider", 3500, -2000));
  e = addSample(e, placed("21:00:00", "hail", 3000, -2400));
  e = addSample(e, placed("22:00:00", "hail", 2996, -2398));
  e = addSample(e, placed("23:00:00", "hail"));
  assert.deepEqual(sightingPlace(e), { y: 2998, x: -2399, spread: 2, samples: 2, how: "hail" });
  assert.equal(sightingPlace(addSample(undefined, placed("20:00:00", "hail"))), undefined);
});

test("a digested log files its sightings, and digesting it again adds nothing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eql-sightings-"));
  const file = path.join(dir, "eqlog_Kainos_qeynos.txt");
  fs.writeFileSync(
    file,
    [
      "[Wed Oct 14 23:07:47 2026] You have entered Everfrost Peaks.",
      "[Wed Oct 14 23:11:54 2026] Your Location is 2998.57, -2399.41, -61.97",
      "[Wed Oct 14 23:11:56 2026] You say, 'Hail, Sulgar'",
      "[Wed Oct 14 23:11:56 2026] Sulgar says, 'Hail, traveler!  Would you happen to know the location of any of the [spokes] of Tarton's Wheel?'",
      "[Wed Oct 14 23:12:20 2026] Kainos says, 'spokes'",
    ].join("\n"),
  );
  const store = createNpcSightings(dir);
  const killLog = new Proxy({}, { get: () => () => false }) as unknown as KillLog;
  importLog(file, killLog, undefined, undefined, undefined, store);
  const [sulgar] = store.of("Sulgar");
  assert.equal(sulgar.zone, "Everfrost Peaks");
  assert.deepEqual(sulgar.samples.map((s) => [s.how, s.y, s.x]), [["hail", 2999, -2399], ["speech", 2999, -2399]]);
  assert.deepEqual(store.of("Kainos"), [], "your own /say is not a sighting");
  importLog(file, killLog, undefined, undefined, undefined, store);
  assert.equal(store.of("Sulgar")[0].samples.length, 2);
});
