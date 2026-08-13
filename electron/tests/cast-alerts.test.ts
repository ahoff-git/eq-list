/**
 * Black-box tests for the cast-alert matcher: which "<caster> begins casting <spell>"
 * events raise a dispel-prep alert, given the user's watch list — and, for a watch pointed at
 * raw lines, which of the log's own sentences do.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIVE_WITHIN_MS, matchCast, matchFade, matchLine, watchesLines } from "../../src/shared/cast-alerts";
import { alertStyle } from "../../src/shared/alert-styles";
import type { CastAlertSettings, CastWatch } from "../../src/shared/types";

/** A cast that just happened — the timing rule has its own tests below. */
const NOW = Date.parse("2026-07-29T21:00:00");
const cast = (caster: string, spell: string, at = "2026-07-29T21:00:00") => ({ caster, spell, at });

function settings(over: Partial<CastAlertSettings> = {}): CastAlertSettings {
  return {
    enabled: true,
    sound: false,
    flash: false,
    includeSelf: false,
    watches: [
      { id: "fear", spell: "Fear", enabled: true },
      { id: "mez", spell: "Mesmeri", enabled: true },
    ],
    color: "#e5534b",
    soundName: "chirp",
    position: "top",
    durationMs: 6000,
    animation: "pulse",
    locations: [],
    ...over,
  };
}

test("matches a watched spell case-insensitively, by substring", () => {
  // "Mesmeri" catches "Mesmerize" and "Mesmerization" alike.
  const m = matchCast(cast("a dark elf", "Mesmerization"), settings(), NOW);
  assert.equal(m?.id, "mez");
  assert.equal(matchCast(cast("a goblin", "word of FEAR"), settings(), NOW)?.id, "fear");
});

test("no match when nothing in the watch list is contained in the spell", () => {
  assert.equal(matchCast(cast("a bat", "Minor Healing"), settings(), NOW), null);
});

test("disabled overall, or a disabled watch, never matches", () => {
  assert.equal(matchCast(cast("a mob", "Fear"), settings({ enabled: false }), NOW), null);
  const oneOff = settings({ watches: [{ id: "fear", spell: "Fear", enabled: false }] });
  assert.equal(matchCast(cast("a mob", "Fear"), oneOff, NOW), null);
});

test("your own casts are skipped unless includeSelf", () => {
  assert.equal(matchCast(cast("You", "Fear"), settings(), NOW), null);
  assert.equal(matchCast(cast("You", "Fear"), settings({ includeSelf: true }), NOW)?.id, "fear");
});

test("a named caster (player / pet / named NPC) is skipped unless the watch includes players", () => {
  // BunnySlayer is a person; a groupmate's Charm isn't a threat to prep against.
  const charm = settings({ watches: [{ id: "charm", spell: "Charm", enabled: true }] });
  assert.equal(matchCast(cast("BunnySlayer", "Charm"), charm, NOW), null);
  // A plain mob (article-led) with the same spell still alerts.
  assert.equal(matchCast(cast("a spectre", "Charm"), charm, NOW)?.id, "charm");
});

test("a watch that includes players fires on named casters (and still on mobs)", () => {
  const withPlayers = settings({ watches: [{ id: "charm", spell: "Charm", enabled: true, includePlayers: true }] });
  assert.equal(matchCast(cast("BunnySlayer", "Charm"), withPlayers, NOW)?.id, "charm");
  assert.equal(matchCast(cast("Kainos`s warder", "Charm"), withPlayers, NOW)?.id, "charm"); // a pet is "named" too
  assert.equal(matchCast(cast("a spectre", "Charm"), withPlayers, NOW)?.id, "charm");
});

test("include-players is per watch — one spell can allow players while another doesn't", () => {
  const mixed = settings({
    watches: [
      { id: "fear", spell: "Fear", enabled: true }, // mobs only
      { id: "charm", spell: "Charm", enabled: true, includePlayers: true }, // players too
    ],
  });
  assert.equal(matchCast(cast("BunnySlayer", "Fear"), mixed, NOW), null); // a player's Fear: not opted in
  assert.equal(matchCast(cast("BunnySlayer", "Charm"), mixed, NOW)?.id, "charm"); // a player's Charm: opted in
  assert.equal(matchCast(cast("a gnoll", "Fear"), mixed, NOW)?.id, "fear"); // a mob's Fear: still alerts
});

test("blank / whitespace watches are ignored (don't match everything)", () => {
  const blank = settings({ watches: [{ id: "empty", spell: "  ", enabled: true }] });
  assert.equal(matchCast(cast("a mob", "Anything"), blank, NOW), null);
});

// An alert says "dispel, now". Lines can arrive long after they were written — a log read
// from the top, a replay — and a barrage of warnings about fights that ended hours ago is
// worse than silence.
test("a cast that already finished raises no alert", () => {
  const stale = new Date(NOW + LIVE_WITHIN_MS + 1000).toISOString();
  assert.equal(matchCast({ caster: "a mob", spell: "Fear", at: "2026-07-29T21:00:00" }, settings(), Date.parse(stale)), null);
});

test("a cast within the live window still alerts", () => {
  const soonAfter = NOW + LIVE_WITHIN_MS - 1000;
  assert.equal(matchCast(cast("a mob", "Fear"), settings(), soonAfter)?.id, "fear");
});

test("an unreadable timestamp is allowed through — a missed alert is the worse failure", () => {
  assert.equal(matchCast({ caster: "a mob", spell: "Fear", at: "not a date" }, settings(), NOW)?.id, "fear");
});

// ── fades ──────────────────────────────────────────────────────────────────────
// The other half of a watch: a cast says "stop that", a fade says "do it again". Off by
// default, because most watches are the first kind.

const faded = (spell: string, at = "2026-07-29T21:00:00") => ({ spell, at });

test("a fade only alerts for a watch that asked for fades", () => {
  assert.equal(matchFade(faded("Fear"), settings(), NOW), null);
  const s = settings({ watches: [{ id: "root", spell: "Root", enabled: true, onFade: true }] });
  assert.equal(matchFade(faded("Root"), s, NOW)?.id, "root");
});

test("a watch can be fade-only, and still not fire on a cast", () => {
  const s = settings({
    watches: [{ id: "sow", spell: "Spirit of Wolf", enabled: true, onCast: false, onFade: true }],
  });
  assert.equal(matchFade(faded("Spirit of Wolf"), s, NOW)?.id, "sow");
  assert.equal(matchCast(cast("a mob", "Spirit of Wolf"), s, NOW), null);
});

test("a watch with no explicit choice still alerts on casts", () => {
  // Every watch predates the option, so unset has to keep meaning "warn me when it's cast".
  const s = settings({ watches: [{ id: "fear", spell: "Fear", enabled: true }] });
  assert.equal(matchCast(cast("a mob", "Fear"), s, NOW)?.id, "fear");
});

test("EQ's per-spell fade wording is matched as the words it used", () => {
  // "Your strength fades." names no spell, so a watch for it matches the wording. Documented
  // rather than fixed: the log simply doesn't say which spell it was.
  const s = settings({ watches: [{ id: "str", spell: "strength", enabled: true, onFade: true }] });
  assert.equal(matchFade(faded("strength"), s, NOW)?.id, "str");
  assert.equal(matchFade(faded("surge of strength"), s, NOW)?.id, "str");
});

test("a disabled watch, and disabled alerts, stay quiet about fades too", () => {
  const off = settings({ watches: [{ id: "root", spell: "Root", enabled: false, onFade: true }] });
  assert.equal(matchFade(faded("Root"), off, NOW), null);
  const master = settings({ enabled: false, watches: [{ id: "root", spell: "Root", enabled: true, onFade: true }] });
  assert.equal(matchFade(faded("Root"), master, NOW), null);
});

test("a fade from hours ago raises nothing, like a stale cast", () => {
  const s = settings({ watches: [{ id: "root", spell: "Root", enabled: true, onFade: true }] });
  assert.equal(matchFade(faded("Root"), s, NOW + LIVE_WITHIN_MS + 1000), null);
  assert.equal(matchFade(faded("Root"), s, NOW + LIVE_WITHIN_MS - 1000)?.id, "root");
});

// ── whole log lines ────────────────────────────────────────────────────────────
// A watch can be pointed at the log's own words instead of a spell name, which is how a party
// invite ("BunnySlayer invites you to a party") raises an alert at all — nothing parses that line.

const line = (message: string, at = "2026-07-29T21:00:00") => ({ message, at });
/** Verbatim from a real log — this is the sentence the game actually prints. */
const INVITE = "Bunnyslayer invites you to join a group.";
const lineWatch = (over: Partial<CastWatch> = {}) =>
  settings({ watches: [{ id: "invite", spell: "invites you", enabled: true, onLine: true, onCast: false, ...over }] });

test("a line watch matches the words of a whole log line, case-insensitively", () => {
  assert.equal(matchLine(line(INVITE), lineWatch(), NOW)?.id, "invite");
  assert.equal(matchLine(line("BunnySlayer INVITES YOU to a party."), lineWatch(), NOW)?.id, "invite");
  assert.equal(matchLine(line("You have entered Befallen."), lineWatch(), NOW), null);
});

// What the phrase is *for*: the real log's other invite-shaped lines must stay quiet. Your own
// outgoing invite isn't news, and players talk about invites in chat all evening.
test("the party-invite phrase catches the game's invite and not the talk around it", () => {
  const w = lineWatch();
  assert.equal(matchLine(line("You invite bunnyslayer to join your group."), w, NOW), null);
  assert.equal(matchLine(line("Pons tells General:2, 'if ur upset ur not gettin invites, i can see what i can do'"), w, NOW), null);
  assert.equal(matchLine(line("To join the group, click on the 'FOLLOW' option, or 'DECLINE' to cancel."), w, NOW), null);
  assert.equal(matchLine(line("bunnyslayer rejects your offer to join the group."), w, NOW), null);
});

test("only a watch that asked for lines sees them, and it doesn't leak into casts", () => {
  // The spell matchers and the line matcher share a list, so each has to ignore the other's watches.
  assert.equal(matchLine(line(INVITE), settings(), NOW), null); // the default spell watches: not line watches
  assert.equal(matchCast(cast("a mob", "invites you"), lineWatch(), NOW), null);
  assert.equal(matchFade(faded("invites you"), lineWatch(), NOW), null);
});

test("a line watch obeys the master switch, its own switch, and the liveness rule", () => {
  assert.equal(matchLine(line(INVITE), lineWatch({ enabled: false }), NOW), null);
  assert.equal(matchLine(line(INVITE), settings({ enabled: false, watches: lineWatch().watches }), NOW), null);
  // Last night's invite is not something to react to — the same rule casts and fades get.
  assert.equal(matchLine(line(INVITE), lineWatch(), NOW + LIVE_WITHIN_MS + 1000), null);
});

// The escape hatch doing the job the parser can't: "The mystical path fades away." is a spell and
// "Bunnyslayer fades away." is a player gating out, and no pattern separates them — but the spell's
// own words do, because a player's name can't contain them. 50 gate-outs in a real log stay quiet.
test("a raw-text watch alerts on a fade the parser deliberately won't take", () => {
  const w = settings({
    watches: [{ id: "path", spell: "mystical path fades away", enabled: true, onLine: true, onCast: false }],
  });
  assert.equal(matchLine(line("The mystical path fades away."), w, NOW)?.id, "path");
  assert.equal(matchLine(line("Bunnyslayer fades away."), w, NOW), null);
  assert.equal(matchLine(line("The Ancient One fades away."), w, NOW), null);
  // The half that isn't a fade at all stays quiet too.
  assert.equal(matchLine(line("A mystical path appears before you."), w, NOW), null);
});

test("a blank line watch matches nothing, rather than every line", () => {
  assert.equal(matchLine(line(INVITE), lineWatch({ spell: "  " }), NOW), null);
});

test("watchesLines answers whether any line matching is worth doing at all", () => {
  assert.equal(watchesLines(lineWatch()), true);
  assert.equal(watchesLines(settings()), false); // spell watches only
  assert.equal(watchesLines(lineWatch({ enabled: false })), false);
  assert.equal(watchesLines(lineWatch({ spell: " " })), false); // a half-typed watch costs nothing
  assert.equal(watchesLines(settings({ enabled: false, watches: lineWatch().watches })), false);
});

// ── conditions, through the real matchers ──────────────────────────────────────
// `watch-conditions.test.ts` pins the rules themselves; these pin the wiring — that each matcher
// hands the evaluator the right subject, so the same condition means the same thing whether the
// line was a cast, a fade or something no parser models.

const CAST_LINE = "a dark elf priest begins casting Mesmerization.";
const casting = (over: Partial<Parameters<typeof matchCast>[0]> = {}) => ({
  caster: "a dark elf priest",
  spell: "Mesmerization",
  at: "2026-07-29T21:00:00",
  raw: CAST_LINE,
  ...over,
});
const withConditions = (conditions: CastWatch["conditions"], over: Partial<CastWatch> = {}) =>
  settings({ watches: [{ id: "mez", spell: "Mesmeri", enabled: true, includePlayers: true, conditions, ...over }] });

test("a condition on the caster narrows a trigger that was too wide", () => {
  const notMine = withConditions([{ field: "caster", op: "contains", text: "warder", exclude: true }]);
  assert.equal(matchCast(casting(), notMine, NOW)?.id, "mez");
  assert.equal(matchCast(casting({ caster: "Kainos`s warder" }), notMine, NOW), null);
});

test("a condition can read the whole line even for an event the parser modelled", () => {
  const s = withConditions([{ field: "line", op: "contains", text: "begins casting" }]);
  assert.equal(matchCast(casting(), s, NOW)?.id, "mez");
  // Same spell, a line that doesn't say it — no `raw` at all, so the line reads as the spell name.
  assert.equal(matchCast({ caster: "a dark elf priest", spell: "Mesmerization", at: casting().at }, s, NOW), null);
});

test("a zone condition uses what the app knows, not what the line said", () => {
  const s = withConditions([{ field: "zone", op: "contains", text: "Lower Guk" }]);
  assert.equal(matchCast(casting(), s, NOW, { zone: "Lower Guk" })?.id, "mez");
  assert.equal(matchCast(casting(), s, NOW, { zone: "Befallen" }), null);
  assert.equal(matchCast(casting(), s, NOW), null); // no zone known: the condition can't hold
});

test("a fade's target is offered as the banner words it", () => {
  const s = withConditions([{ field: "target", op: "exact", text: "your pet" }], { onFade: true });
  assert.equal(matchFade({ spell: "Mesmerization", at: "2026-07-29T21:00:00", pet: true }, s, NOW)?.id, "mez");
  assert.equal(matchFade({ spell: "Mesmerization", at: "2026-07-29T21:00:00", target: "a gnoll" }, s, NOW), null);
});

test("`any` lets one line watch cover two sentences that share no words", () => {
  // The two invite wordings ADR 0050 had to ship as two chips.
  const s = settings({
    watches: [
      {
        id: "invite",
        spell: "invites you",
        enabled: true,
        onLine: true,
        onCast: false,
        match: "any",
        conditions: [{ field: "subject", op: "contains", text: "asked you to join" }],
      },
    ],
  });
  assert.equal(matchLine(line(INVITE), s, NOW)?.id, "invite");
  assert.equal(matchLine(line("Bunnyslayer has asked you to join the instance: Befallen"), s, NOW)?.id, "invite");
  assert.equal(matchLine(line("You have entered Befallen."), s, NOW), null);
});

test("a watch can be nothing but conditions", () => {
  // "tell me anything BunnySlayer casts", which no single substring can say.
  const s = settings({
    watches: [
      {
        id: "bunny",
        spell: "",
        enabled: true,
        includePlayers: true,
        conditions: [{ field: "caster", op: "exact", text: "BunnySlayer" }],
      },
    ],
  });
  assert.equal(matchCast(casting({ caster: "BunnySlayer", spell: "Anything At All" }), s, NOW)?.id, "bunny");
  assert.equal(matchCast(casting(), s, NOW), null);
});

test("watchesLines counts a line watch that carries its meaning in a condition", () => {
  const conditionOnly = settings({
    watches: [
      { id: "x", spell: "", enabled: true, onLine: true, conditions: [{ field: "line", op: "contains", text: "tells you" }] },
    ],
  });
  assert.equal(watchesLines(conditionOnly), true);
  // …and still refuses the watch that says nothing at all.
  const mute = settings({ watches: [{ id: "x", spell: " ", enabled: true, onLine: true }] });
  assert.equal(watchesLines(mute), false);
});

test("the caster and liveness rules still come first, whatever the conditions say", () => {
  // A condition can widen what a watch reads; it must not smuggle a watch past the rules about
  // *the event*, or "players" and the live window would quietly stop meaning anything.
  const s = withConditions([{ field: "caster", op: "contains", text: "bunny" }], { includePlayers: false });
  assert.equal(matchCast(casting({ caster: "BunnySlayer" }), s, NOW), null);
  const live = withConditions([{ field: "caster", op: "contains", text: "dark elf" }]);
  assert.equal(matchCast(casting(), live, NOW + LIVE_WITHIN_MS + 1000), null);
});

// ── per-alert style ────────────────────────────────────────────────────────────
// Two emergencies shouldn't look alike, so a watch may carry its own style. Resolved in the
// main process and sent with the alert — the overlay only knows the defaults.

test("a watch with no style of its own uses the defaults", () => {
  const s = settings();
  assert.deepEqual(alertStyle(s, s.watches[0]), {
    sound: false,
    flash: false,
    color: "#e5534b",
    soundName: "chirp",
    position: "top",
    durationMs: 6000,
    animation: "pulse",
  });
  // And with no watch at all (the Test button before anything is watched).
  assert.equal(alertStyle(s).color, "#e5534b");
});

test("a watch's style overrides field by field, leaving the rest alone", () => {
  const s = settings({
    watches: [{ id: "charm", spell: "Charm", enabled: true, style: { color: "#a371f7", durationMs: 12000 } }],
  });
  const style = alertStyle(s, s.watches[0]);
  assert.equal(style.color, "#a371f7");
  assert.equal(style.durationMs, 12000);
  // Untouched fields still come from the defaults.
  assert.equal(style.position, "top");
  assert.equal(style.soundName, "chirp");
  assert.equal(style.animation, "pulse");
});

test("an explicitly undefined override doesn't blank out the default", () => {
  // A hand-edited settings file (or a style saved before a field existed) can look like this.
  const s = settings({
    watches: [{ id: "x", spell: "X", enabled: true, style: { color: undefined, position: "center" } }],
  });
  const style = alertStyle(s, s.watches[0]);
  assert.equal(style.color, "#e5534b");
  assert.equal(style.position, "center");
});

// ── saved styles ───────────────────────────────────────────────────────────────
// A look with a name, worn by several watches — so changing it changes all of them, which is the
// whole difference between wearing one and having copied one.

const SAVED = { id: "loud", name: "Loud", style: { sound: true, flash: true, color: "#a371f7", soundName: "alarm", position: "center" as const, durationMs: 9000, animation: "wiggle" as const } };

test("a watch wears a saved style, over the defaults", () => {
  const s = settings({ styles: [SAVED], watches: [{ id: "w", spell: "Fear", enabled: true, styleId: "loud" }] });
  assert.deepEqual(alertStyle(s, s.watches[0]), SAVED.style);
});

test("a watch's own tweaks sit on top of the style it wears", () => {
  const s = settings({
    styles: [SAVED],
    watches: [{ id: "w", spell: "Fear", enabled: true, styleId: "loud", style: { color: "#46c86b" } }],
  });
  const style = alertStyle(s, s.watches[0]);
  assert.equal(style.color, "#46c86b"); // its own
  assert.equal(style.soundName, "alarm"); // the saved style's
  assert.equal(style.animation, "wiggle");
});

test("a style that was deleted falls back to the defaults rather than to nothing", () => {
  // Same call as a deleted custom spot: an alert that can't be styled must still be seen.
  const s = settings({ styles: [], watches: [{ id: "w", spell: "Fear", enabled: true, styleId: "gone" }] });
  assert.equal(alertStyle(s, s.watches[0]).color, "#e5534b");
});

test("two watches can wear one style, and it's the same object's values both times", () => {
  const s = settings({
    styles: [SAVED],
    watches: [
      { id: "a", spell: "Fear", enabled: true, styleId: "loud" },
      { id: "b", spell: "Charm", enabled: true, styleId: "loud" },
    ],
  });
  assert.deepEqual(alertStyle(s, s.watches[0]), alertStyle(s, s.watches[1]));
});

// ── your own casts, per watch ──────────────────────────────────────────────────

test("a watch can take your own casts without the group setting being on", () => {
  // The whole class of "you cast it, so recast it" reminders needs this, and turning the group
  // setting on to get one of them would make every other watch fire on you too.
  const mine = settings({ watches: [{ id: "mez", spell: "Mesmeri", enabled: true, includeSelf: true }] });
  assert.equal(matchCast(cast("You", "Mesmerize"), mine, NOW)?.id, "mez");
  // …and the neighbouring watch still doesn't.
  const both = settings({
    watches: [
      { id: "mez", spell: "Mesmeri", enabled: true, includeSelf: true },
      { id: "fear", spell: "Fear", enabled: true },
    ],
  });
  assert.equal(matchCast(cast("You", "Fear"), both, NOW), null);
});

test("a watch can also refuse your casts while the group setting takes them", () => {
  const s = settings({
    includeSelf: true,
    watches: [{ id: "fear", spell: "Fear", enabled: true, includeSelf: false }],
  });
  assert.equal(matchCast(cast("You", "Fear"), s, NOW), null);
  assert.equal(matchCast(cast("a gnoll", "Fear"), s, NOW)?.id, "fear");
});

test("the defaults are never mutated by resolving a style", () => {
  const s = settings({ watches: [{ id: "x", spell: "X", enabled: true, style: { color: "#46c86b" } }] });
  alertStyle(s, s.watches[0]);
  assert.equal(s.color, "#e5534b");
});
