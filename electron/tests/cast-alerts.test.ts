/**
 * Black-box tests for the cast-alert matcher: which "<caster> begins casting <spell>"
 * events raise a dispel-prep alert, given the user's watch list — and, for a watch pointed at
 * raw lines, which of the log's own sentences do.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { alertStyle, LIVE_WITHIN_MS, matchCast, matchFade, matchLine, watchesLines } from "../../src/shared/cast-alerts";
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

test("the defaults are never mutated by resolving a style", () => {
  const s = settings({ watches: [{ id: "x", spell: "X", enabled: true, style: { color: "#46c86b" } }] });
  alertStyle(s, s.watches[0]);
  assert.equal(s.color, "#e5534b");
});
