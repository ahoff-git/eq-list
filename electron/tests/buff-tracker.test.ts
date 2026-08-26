/**
 * Behaviour tests for the buff board: what puts a buff up, what takes it down, what gets announced,
 * and the two controls the player has over a spell.
 *
 * The tracker owns a file, so each test gets a scratch directory; everything else it needs — the
 * clock, the sentence lexicon, the spell facts and the alert path — is injected, so nothing here
 * touches a game install or a real alert.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createBuffTracker, type BuffTracker } from "../buff-tracker";
import { buildBuffLexicon, parseSpellStringFile } from "../../src/shared/spell-strings";
import { ON_PET, ON_UNKNOWN, ON_YOU } from "../../src/shared/buff-tracking";
import type { SpellFacts } from "../../src/shared/spell-file";
import type {
  CastAlertEvent,
  CastAlertSettings,
  CombatEvent,
  FightEndReason,
  LogLine,
} from "../../src/shared/types";

const T0 = Date.parse("2026-08-20T20:00:00.000Z");
const iso = (offsetSec = 0) => new Date(T0 + offsetSec * 1000).toISOString();

function facts(id: number, name: string, over: Partial<SpellFacts> = {}): SpellFacts {
  return {
    id,
    name,
    mana: 10,
    castMs: 1000,
    recoveryMs: 1500,
    recastMs: 0,
    levels: { Druid: 7 },
    beneficial: true,
    permanent: false,
    ...over,
  };
}

/**
 * Six spells, chosen to cover the cases that differ:
 *  - Spirit of Wolf — announces on you and on others, and fades with words. The ordinary buff.
 *  - Thistlecoat    — **permanent** on EQL, and shares its fade sentence with Thorncoat.
 *  - Thorncoat      — the other half of that shared sentence.
 *  - Complete Heal  — beneficial but says nothing at all: no landing, no fade.
 *  - Root / Snare   — **detrimental**, which is what makes them behave oppositely in both directions.
 */
const SPELLS = new Map<number, SpellFacts>([
  [278, facts(278, "Spirit of Wolf")],
  [515, facts(515, "Thistlecoat", { permanent: true })],
  [519, facts(519, "Thorncoat", { permanent: true, levels: { Druid: 47 } })],
  [13, facts(13, "Complete Heal")],
  [10, facts(10, "Root", { beneficial: false })],
  [11, facts(11, "Snare", { beneficial: false })],
]);

const STRINGS = [
  "#SPELLINDEX^CASTERMETXT^CASTEROTHERTXT^CASTEDMETXT^CASTEDOTHERTXT^SPELLGONE^",
  "278^^^You feel the spirit of wolf enter you.^ is surrounded by a brief lupine aura.^The spirit of wolf leaves you.^",
  "515^^^Your skin sprouts thistles.^'s skin sprouts thistles.^Your skin returns to normal.^",
  "519^^^Your skin sprouts thorns.^'s skin sprouts thorns.^Your skin returns to normal.^",
].join("\n");

const SETTINGS: CastAlertSettings = {
  enabled: true,
  includeSelf: false,
  watches: [],
  sound: true,
  flash: false,
  color: "#e5534b",
  soundName: "chirp",
  position: "top",
  durationMs: 6000,
  animation: "pulse",
  styles: [],
  locations: [],
};

/** A tracker plus the alerts it raised and a clock the test drives. */
interface Harness {
  buffs: BuffTracker;
  raised: CastAlertEvent[];
  /** Move the clock, in seconds from T0. Only matters where a window is being tested. */
  at(offsetSec: number): void;
  /** Are we mid-fight? What the damage meter would be answering. */
  fighting(on: boolean): void;
  /** End the fight, and say how — the two that matter are a kill and your own death. */
  endFight(reason?: FightEndReason): void;
  cast(spell: string, offsetSec?: number, caster?: string): void;
  line(message: string, offsetSec?: number): void;
  fade(opts: { spell: string; target?: string; pet?: boolean; raw?: string; offsetSec?: number }): void;
  die(offsetSec?: number): void;
}

function harness(opts: { lexicon?: boolean; enabled?: boolean; armed?: boolean } = {}): Harness {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eql-buffs-"));
  const raised: CastAlertEvent[] = [];
  let clock = T0;
  // Driven by the test rather than derived, because what a fight *is* belongs to the damage meter and
  // this suite is about what the buff board does with the answer. Out of combat by default: that is
  // the simple case, and a test about the hold says so explicitly.
  let fighting = false;
  const lex =
    opts.lexicon === false
      ? undefined
      : buildBuffLexicon(parseSpellStringFile(STRINGS), SPELLS);
  const buffs = createBuffTracker({
    userDataDir: dir,
    getSettings: () => ({ ...SETTINGS, enabled: opts.enabled !== false }),
    raise: (a) => raised.push(a),
    lexicon: () =>
      lex ?? {
        fadedBy: () => [],
        landedOnYou: () => [],
        landedOnOther: () => null,
        landsQuietly: () => true,
        size: 0,
      },
    facts: (spell) => [...SPELLS.values()].find((s) => s.name.toLowerCase() === spell.trim().toLowerCase()),
    inFight: () => fighting,
    now: () => clock,
  });
  const send = (event: CombatEvent) => buffs.combat(event);
  // Landing lines are only looked up once a parsed event has shown that spellcasting is happening,
  // so the game's files aren't read on line one of every launch (see `wanted` in the tracker). In real
  // play that is armed within seconds, so it is armed here by default — by a *stranger's* cast, which
  // is the cheapest thing that does it and leaves no pending cast behind. `armed: false` pins the gate.
  if (opts.armed !== false) {
    send({ kind: "cast", caster: "Stranger", spell: "Minor Healing", at: iso(-1), raw: "Stranger begins casting Minor Healing.", logId: 0 });
  }
  return {
    buffs,
    raised,
    at: (offsetSec) => {
      clock = T0 + offsetSec * 1000;
    },
    fighting: (on) => {
      fighting = on;
    },
    endFight: (reason = "kill") => {
      fighting = false;
      buffs.noteFightEnd(reason);
    },
    cast: (spell, offsetSec = 0, caster = "You") =>
      send({ kind: "cast", caster, spell, at: iso(offsetSec), raw: `${caster} begin casting ${spell}.`, logId: 1 }),
    line: (message, offsetSec = 0) =>
      buffs.line({ logId: 1, at: iso(offsetSec), message, raw: message } satisfies LogLine),
    fade: ({ spell, target, pet = false, raw, offsetSec = 0 }) =>
      send({
        kind: "buff-faded",
        spell,
        pet,
        target,
        at: iso(offsetSec),
        raw: raw ?? `Your ${spell} spell has worn off${target ? ` of ${target}` : ""}.`,
        logId: 2,
      }),
    die: (offsetSec = 0) =>
      send({ kind: "death", victim: "You", at: iso(offsetSec), raw: "You have been slain by a gnoll!", logId: 3 }),
  };
}

// ── a buff going up ───────────────────────────────────────────────────────────

test("a landing line is ignored until something shows that spells are being cast", () => {
  const h = harness({ armed: false });
  // Nothing has read the game's files yet, and nothing may make it: `line` sees every log line, and
  // the index behind it is a ~43 MB lazy read that must not land on the first poll of every launch.
  h.line("You feel the spirit of wolf enter you.");
  assert.equal(h.buffs.view().active.length, 0);

  // Any cast arms it — including somebody else's, since their landing sentence is the only evidence
  // that a buff of theirs reached you.
  h.cast("Minor Healing", 0, "Bloop");
  h.line("You feel the spirit of wolf enter you.", 1);
  assert.equal(h.buffs.view().active.length, 1);
});

test("a landing on you puts a buff up, and enrols the spell switched on", () => {
  const h = harness();
  h.line("You feel the spirit of wolf enter you.");
  const view = h.buffs.view();
  assert.equal(view.active.length, 1);
  assert.equal(view.active[0].spell, "Spirit of Wolf");
  assert.equal(view.active[0].target, ON_YOU);
  assert.equal(view.active[0].source, "landed");
  // Enrolled switched on: the feature has to work without anyone ticking a box first.
  assert.deepEqual(
    view.known.map((k) => [k.key, k.tracked, k.notify, k.onScreen]),
    [["spirit of wolf", true, true, true]],
  );
});

test("a landing on somebody else only counts when you were the one casting", () => {
  const h = harness();
  // A stranger's buff at a busy camp: the sentence is zone-visible, so without the cast gate this
  // fills your board with other people's work.
  h.line("Bloop is surrounded by a brief lupine aura.");
  assert.equal(h.buffs.view().active.length, 0);

  h.cast("Spirit of Wolf", 0);
  h.line("Bloop is surrounded by a brief lupine aura.", 2);
  const up = h.buffs.view().active;
  assert.equal(up.length, 1);
  assert.equal(up[0].target, "Bloop");
  assert.equal(up[0].byYou, true);
});

test("a cast is withdrawn by a fizzle, so the next landing isn't credited to you", () => {
  const h = harness();
  h.cast("Spirit of Wolf", 0);
  h.buffs.combat({
    kind: "spell-outcome",
    caster: "You",
    spell: "Spirit of Wolf",
    outcome: "fizzle",
    at: iso(1),
    raw: "Your spell fizzles!",
    logId: 4,
  });
  h.line("Bloop is surrounded by a brief lupine aura.", 2);
  // eql-alerts' hard-won half: without the withdrawal this reads as your buff on Bloop.
  assert.equal(h.buffs.view().active.length, 0);
});

test("a cast goes stale rather than crediting a landing minutes later", () => {
  const h = harness();
  h.cast("Spirit of Wolf", 0);
  h.at(600);
  h.line("Bloop is surrounded by a brief lupine aura.", 600);
  assert.equal(h.buffs.view().active.length, 0);
});

test("a spell that lands in silence is put up by its cast, with no target claimed", () => {
  const h = harness();
  h.cast("Complete Heal", 0);
  const up = h.buffs.view().active;
  assert.equal(up.length, 1);
  assert.equal(up[0].source, "cast");
  // Not "you": a cast line names no target, and guessing would put the wrong name on the alert.
  assert.equal(up[0].target, ON_UNKNOWN);
});

test("a spell that announces itself waits for the landing rather than guessing", () => {
  const h = harness();
  h.cast("Spirit of Wolf", 0);
  // Enrolled — it's yours — but nothing is claimed to be up until a line says where it went.
  assert.equal(h.buffs.view().active.length, 0);
  assert.equal(h.buffs.view().known.length, 1);
  assert.equal(h.buffs.view().known[0].mine, true);
});

test("somebody else's cast enrols nothing", () => {
  const h = harness();
  h.cast("Spirit of Wolf", 0, "Bloop");
  assert.equal(h.buffs.view().known.length, 0);
});

test("re-casting a buff that is already up keeps the moment it went up", () => {
  const h = harness();
  h.line("You feel the spirit of wolf enter you.", 0);
  h.line("You feel the spirit of wolf enter you.", 100);
  const up = h.buffs.view().active;
  assert.equal(up.length, 1);
  // "How long have I had haste" is not restarted by topping it up.
  assert.equal(up[0].since, iso(0));
});

// ── a buff coming down ────────────────────────────────────────────────────────

test("a targeted fade names the spell and the target, and needs no game install", () => {
  const h = harness({ lexicon: false });
  h.fade({ spell: "Thorns", target: "Bloop" });
  const view = h.buffs.view();
  assert.equal(view.lapsed.length, 1);
  assert.equal(view.lapsed[0].spell, "Thorns");
  assert.equal(view.lapsed[0].target, "Bloop");
  assert.equal(view.lapsed[0].reason, "faded");
  // A fade is proof it *was* up, so the spell is enrolled by it — that is the reminder asked for.
  assert.equal(view.known.length, 1);
});

test("a pet fade lands on the pet", () => {
  const h = harness({ lexicon: false });
  h.fade({ spell: "Burst of Strength", pet: true });
  assert.equal(h.buffs.view().lapsed[0].target, ON_PET);
});

test("a nameless fade on you is read back through the game's own sentence", () => {
  const h = harness();
  h.line("You feel the spirit of wolf enter you.", 0);
  // The parser hands over the words it matched; the raw line is what the file holds.
  h.fade({ spell: "spirit of wolf", raw: "The spirit of wolf leaves you.", offsetSec: 60 });
  const view = h.buffs.view();
  assert.equal(view.active.length, 0);
  assert.equal(view.lapsed.length, 1);
  assert.equal(view.lapsed[0].spell, "Spirit of Wolf");
  assert.equal(view.lapsed[0].target, ON_YOU);
});

test("a lapse of a watched buff announces once and keeps when it went up", () => {
  const h = harness();
  h.line("You feel the spirit of wolf enter you.", 0);
  h.raised.length = 0;
  h.fade({ spell: "spirit of wolf", raw: "The spirit of wolf leaves you.", offsetSec: 300 });
  // One banner. Asking "which instances does this fade affect" after already flipping them to
  // `up: false` returns nothing, so the orphan path used to run as well — two banners for one fade.
  assert.equal(h.raised.length, 1);
  const lapsed = h.buffs.view().lapsed;
  assert.equal(lapsed.length, 1);
  // And it remembers the landing rather than being replaced by a row that starts and ends at once,
  // which is what makes "held 5m" true instead of "held 0s".
  assert.equal(lapsed[0].since, iso(0));
  assert.equal(lapsed[0].at, iso(300));
});

test("with no install a nameless fade is left alone rather than guessed at", () => {
  const h = harness({ lexicon: false });
  h.fade({ spell: "spirit of wolf", raw: "The spirit of wolf leaves you." });
  assert.equal(h.buffs.view().lapsed.length, 0);
  assert.equal(h.raised.length, 0);
});

test("a shared fade sentence is narrowed by which candidate is actually up", () => {
  const h = harness();
  // Thistlecoat and Thorncoat both fade with "Your skin returns to normal."
  h.line("Your skin sprouts thistles.", 0);
  h.fade({ spell: "skin", raw: "Your skin returns to normal.", offsetSec: 60 });
  const lapsed = h.buffs.view().lapsed;
  assert.equal(lapsed.length, 1);
  assert.equal(lapsed[0].spell, "Thistlecoat");
  // Narrowed outright, so there is nothing left to hedge about.
  assert.equal(lapsed[0].alsoCouldBe, undefined);
});

test("an undecidable shared sentence names every candidate instead of picking one", () => {
  const h = harness();
  h.fade({ spell: "skin", raw: "Your skin returns to normal." });
  const lapsed = h.buffs.view().lapsed;
  assert.equal(lapsed.length, 1);
  assert.deepEqual(lapsed[0].alsoCouldBe, ["Thorncoat"]);
  // And the banner carries the hedge too, so the player can see what to check.
  assert.deepEqual(h.raised.at(-1)?.buff?.alsoCouldBe, ["Thorncoat"]);
});

test("a fade that names a target retires the placeholder the cast left behind", () => {
  const h = harness();
  h.cast("Complete Heal", 0); // silent spell: filed under an unknown target
  assert.equal(h.buffs.view().active[0].target, ON_UNKNOWN);
  h.fade({ spell: "Complete Heal", target: "Bloop", offsetSec: 60 });
  const view = h.buffs.view();
  // One row, not two: the placeholder *was* this buff before we knew where it went.
  assert.equal(view.active.length, 0);
  assert.equal(view.lapsed.length, 1);
  assert.equal(view.lapsed[0].target, "Bloop");
});

// ── death ─────────────────────────────────────────────────────────────────────

test("your death lapses your own buffs and leaves other people's alone", () => {
  const h = harness();
  h.line("You feel the spirit of wolf enter you.", 0);
  h.cast("Spirit of Wolf", 10);
  h.line("Bloop is surrounded by a brief lupine aura.", 11);
  h.raised.length = 0;

  h.die(60);
  const view = h.buffs.view();
  // Bloop keeps theirs — your death is not their loss, and if it were the log would say so.
  assert.deepEqual(
    view.active.map((b) => b.target),
    ["Bloop"],
  );
  assert.deepEqual(
    view.lapsed.map((b) => [b.target, b.reason]),
    [[ON_YOU, "died"]],
  );
});

test("a death strip is recorded and never announced", () => {
  const h = harness();
  h.line("You feel the spirit of wolf enter you.", 0);
  h.line("Your skin sprouts thistles.", 1);
  h.raised.length = 0;

  h.die(60);
  // Two lapses, which is exactly why there are no banners: a dozen at once is not a dozen pieces of
  // news, and the standing list is the thing a corpse actually wants to read.
  assert.equal(h.buffs.view().lapsed.length, 2);
  assert.equal(h.raised.length, 0);
});

test("a group-mate's death does nothing here", () => {
  const h = harness();
  h.line("You feel the spirit of wolf enter you.", 0);
  h.buffs.combat({ kind: "death", victim: "Bloop", at: iso(10), raw: "Bloop has been slain!", logId: 5 });
  assert.equal(h.buffs.view().active.length, 1);
});

// ── announcing ────────────────────────────────────────────────────────────────

test("a lapse raises a banner carrying the buff, and no wording of its own", () => {
  const h = harness({ lexicon: false });
  h.fade({ spell: "Thorns", target: "Bloop" });
  const alert = h.raised.at(-1);
  assert.equal(alert?.event, "buff");
  assert.equal(alert?.spell, "Thorns");
  assert.equal(alert?.target, "Bloop");
  assert.equal(alert?.buff?.spell, "Thorns");
  // Worded by the overlay from the payload, the way a record and a drop are.
  assert.equal(alert?.message, undefined);
  // A look is resolved here rather than in the overlay, like every other alert's.
  assert.ok(alert?.style, "a lapse wears a resolved style");
});

test("a fade on you is announced without a target, since the banner leaves it off", () => {
  const h = harness();
  h.line("You feel the spirit of wolf enter you.", 0);
  h.fade({ spell: "spirit of wolf", raw: "The spirit of wolf leaves you.", offsetSec: 60 });
  assert.equal(h.raised.at(-1)?.target, undefined);
});

test("alerts switched off silences the banner and still keeps the board", () => {
  const h = harness({ enabled: false, lexicon: false });
  h.fade({ spell: "Thorns", target: "Bloop" });
  assert.equal(h.raised.length, 0);
  // The part that needs no window is still there — the overlay is what's missing, not the fact.
  assert.equal(h.buffs.view().lapsed.length, 1);
});

// ── the fight, and the two things ending it means ─────────────────────────────

test("a debuff that dropped is announced at once, mid-fight or not", () => {
  const h = harness({ lexicon: false });
  h.fighting(true);
  h.fade({ spell: "Root", target: "a wild tiger" });
  // No waiting: a root you don't recast this second is a mob in your casters.
  assert.equal(h.raised.length, 1);
  assert.equal(h.raised[0].buff?.onEnemy, true);
});

test("your own buff lapsing mid-fight waits for the fight to end", () => {
  const h = harness();
  h.line("You feel the spirit of wolf enter you.", 0);
  h.fighting(true);
  h.raised.length = 0;

  h.fade({ spell: "spirit of wolf", raw: "The spirit of wolf leaves you.", offsetSec: 60 });
  // Nobody stops swinging to rebuff, so the banner holds — but the standing list says it *now*,
  // which is what makes holding the interruption free.
  assert.equal(h.raised.length, 0);
  assert.equal(h.buffs.view().lapsed.length, 1);

  h.endFight();
  assert.equal(h.raised.length, 1);
  assert.equal(h.raised[0].buff?.spell, "Spirit of Wolf");
});

test("out of combat there is nothing to wait for", () => {
  const h = harness();
  h.line("You feel the spirit of wolf enter you.", 0);
  h.raised.length = 0;
  h.fade({ spell: "spirit of wolf", raw: "The spirit of wolf leaves you.", offsetSec: 60 });
  assert.equal(h.raised.length, 1);
});

test("a buff rebuffed during the fight has nothing left to say at the end of it", () => {
  const h = harness();
  h.line("You feel the spirit of wolf enter you.", 0);
  h.fighting(true);
  h.fade({ spell: "spirit of wolf", raw: "The spirit of wolf leaves you.", offsetSec: 30 });
  h.line("You feel the spirit of wolf enter you.", 40);
  h.raised.length = 0;

  h.endFight();
  // The hold exists to tell you what is *still* wrong when you get a moment. It isn't.
  assert.equal(h.raised.length, 0);
  assert.equal(h.buffs.view().lapsed.length, 0);
  assert.equal(h.buffs.view().active.length, 1);
});

test("a fight that ended by killing you says nothing", () => {
  const h = harness();
  h.line("You feel the spirit of wolf enter you.", 0);
  h.fighting(true);
  h.fade({ spell: "spirit of wolf", raw: "The spirit of wolf leaves you.", offsetSec: 30 });
  h.raised.length = 0;

  h.endFight("death");
  // You lost everything on you anyway, and the standing list already says so. A stack of "recast it"
  // over a corpse is what ADR 0082 refuses.
  assert.equal(h.raised.length, 0);
  // Still listed, because that is the question a corpse has.
  assert.equal(h.buffs.view().lapsed.length, 1);
});

test("a lapse dismissed mid-fight does not come back as a banner", () => {
  const h = harness();
  h.line("You feel the spirit of wolf enter you.", 0);
  h.fighting(true);
  h.fade({ spell: "spirit of wolf", raw: "The spirit of wolf leaves you.", offsetSec: 30 });
  h.buffs.dismiss("spirit of wolf", ON_YOU);
  h.raised.length = 0;

  h.endFight();
  assert.equal(h.raised.length, 0);
});

test("the fight ending clears every row about something you were fighting", () => {
  const h = harness({ lexicon: false });
  h.fighting(true);
  h.fade({ spell: "Root", target: "a wild tiger" });
  // A *named*: no article, so only the spell being detrimental places this one — which is the case the
  // article test alone gets wrong, and why both signals exist.
  h.fade({ spell: "Snare", target: "Lord Nagafen", offsetSec: 5 });
  assert.equal(h.buffs.view().lapsed.length, 2);

  h.endFight();
  // The whole of the first complaint: a reminder to re-root a corpse is what filled the list forever.
  assert.equal(h.buffs.view().lapsed.length, 0);
});

test("with no spell file, a debuff on a named cannot be told from a buff on a player", () => {
  // The honest limit, asserted so it is a known cost rather than a surprise. `Lord Nagafen` and
  // `Bloop` are written identically by the log, so without the file to say "Snare is detrimental"
  // there is nothing to separate them — and keeping a row we cannot place beats sweeping away a
  // reminder about a group-mate.
  const h = harness({ lexicon: false });
  const noFacts = createBuffTracker({
    userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), "eql-buffs-")),
    getSettings: () => SETTINGS,
    raise: () => {},
    lexicon: () => ({
      fadedBy: () => [],
      landedOnYou: () => [],
      landedOnOther: () => null,
      landsQuietly: () => true,
      size: 0,
    }),
    facts: () => undefined,
    inFight: () => true,
    now: () => T0,
  });
  noFacts.combat({
    kind: "buff-faded",
    spell: "Snare",
    pet: false,
    target: "Lord Nagafen",
    at: iso(0),
    raw: "Your Snare spell has worn off of Lord Nagafen.",
    logId: 2,
  });
  noFacts.noteFightEnd("kill");
  assert.equal(noFacts.view().lapsed.length, 1);
  // An ordinary mob still goes, because the article answers it without the file.
  h.fighting(true);
  h.fade({ spell: "Snare", target: "a wild tiger" });
  h.endFight();
  assert.equal(h.buffs.view().lapsed.length, 0);
});

test("clearing enemy rows leaves your own alone", () => {
  const h = harness();
  h.line("You feel the spirit of wolf enter you.", 0);
  h.fighting(true);
  h.fade({ spell: "Root", target: "a wild tiger", offsetSec: 10 });
  h.fade({ spell: "Thorns", target: "Bloop", offsetSec: 11 });

  h.endFight();
  const lapsed = h.buffs.view().lapsed;
  // The mob's row goes; the buff on you stays up, and the one on a group-mate stays listed.
  assert.deepEqual(lapsed.map((b) => b.target).sort(), ["Bloop"]);
  assert.equal(h.buffs.view().active.length, 1);
});

test("a buff still up on something you were fighting goes too", () => {
  const h = harness();
  // A buff on a charmed pet: no game install could call this detrimental, so the article does it.
  h.cast("Spirit of Wolf", 0);
  h.line("a wild tiger is surrounded by a brief lupine aura.", 1);
  assert.equal(h.buffs.view().active.length, 1);

  h.endFight();
  // Otherwise "Up now" keeps claiming something about a mob that is gone for the rest of the session.
  assert.equal(h.buffs.view().active.length, 0);
});

test("a detrimental spell never files itself under you", () => {
  const h = harness({ lexicon: false });
  // Belt and braces on the check that runs first: even if the file mislabels something, a lapse on
  // *you* is never swept away by a fight ending.
  h.fade({ spell: "Root", target: "you" });
  h.endFight();
  assert.equal(h.buffs.view().lapsed.length, 1);
});

// ── the player's two controls ─────────────────────────────────────────────────

test("unchecking a spell silences it, keeps its row, and clears what it was saying", () => {
  const h = harness({ lexicon: false });
  h.fade({ spell: "Thorns", target: "Bloop" });
  assert.equal(h.buffs.view().lapsed.length, 1);

  h.buffs.track("thorns", false);
  const view = h.buffs.view();
  // The row stays — the control that reverses this has to remain findable.
  assert.deepEqual(
    view.known.map((k) => [k.key, k.tracked]),
    [["thorns", false]],
  );
  // And the standing warning goes: an unchecked buff must not keep a message on screen.
  assert.equal(view.lapsed.length, 0);

  h.raised.length = 0;
  h.fade({ spell: "Thorns", target: "Bloop", offsetSec: 60 });
  assert.equal(h.raised.length, 0);
  assert.equal(h.buffs.view().lapsed.length, 0);
});

test("notify off keeps the standing message and drops the banner", () => {
  const h = harness({ lexicon: false });
  h.fade({ spell: "Thorns", target: "Bloop" });
  h.buffs.notify("thorns", false);
  h.raised.length = 0;

  h.fade({ spell: "Thorns", target: "Bloop", offsetSec: 60 });
  assert.equal(h.raised.length, 0);
  // Still on the board: the two switches are a moment and a state, and they are asked separately.
  assert.equal(h.buffs.view().lapsed.length, 1);
});

test("clearing a spell forgets it, and casting it again brings it back fresh", () => {
  const h = harness({ lexicon: false });
  h.fade({ spell: "Thorns", target: "Bloop" });
  h.buffs.notify("thorns", false);

  h.buffs.forget("thorns");
  assert.equal(h.buffs.view().known.length, 0);
  assert.equal(h.buffs.view().lapsed.length, 0);

  h.fade({ spell: "Thorns", target: "Bloop", offsetSec: 60 });
  const known = h.buffs.view().known;
  assert.equal(known.length, 1);
  // Fresh, not restored: the earlier "don't notify me" went with the row. That's the difference
  // between clearing and unchecking, and it's why both exist.
  assert.equal(known[0].notify, true);
});

test("dismissing stands one lapse down without untracking the spell", () => {
  const h = harness({ lexicon: false });
  h.fade({ spell: "Thorns", target: "Bloop" });
  h.buffs.dismiss("thorns", "Bloop");
  assert.equal(h.buffs.view().lapsed.length, 0);
  assert.equal(h.buffs.view().known[0].tracked, true);

  h.raised.length = 0;
  h.fade({ spell: "Thorns", target: "Bloop", offsetSec: 60 });
  assert.equal(h.raised.length, 1, "still tracked, so the next lapse is still news");
});

test("dismiss all clears the standing list and touches nothing that is up", () => {
  const h = harness();
  h.line("You feel the spirit of wolf enter you.", 0);
  h.fade({ spell: "Thorns", target: "Bloop", offsetSec: 10 });
  h.fade({ spell: "Thorns", target: "Kainos", offsetSec: 11 });
  assert.equal(h.buffs.view().lapsed.length, 2);

  h.buffs.dismissAll();
  assert.equal(h.buffs.view().lapsed.length, 0);
  assert.equal(h.buffs.view().active.length, 1);
});

// ── persistence, and what deliberately isn't persisted ────────────────────────

test("the choices survive a restart and the board does not", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eql-buffs-"));
  const deps = {
    userDataDir: dir,
    getSettings: () => SETTINGS,
    raise: () => {},
    lexicon: () => buildBuffLexicon(parseSpellStringFile(STRINGS), SPELLS),
    facts: (spell: string) =>
      [...SPELLS.values()].find((s) => s.name.toLowerCase() === spell.trim().toLowerCase()),
    inFight: () => false,
    now: () => T0,
  };
  const first = createBuffTracker(deps);
  // Built directly rather than through `harness`, so the landing lookup has to be armed by hand —
  // see the gate test above.
  first.combat({ kind: "cast", caster: "You", spell: "Spirit of Wolf", at: iso(0), raw: "You begin casting Spirit of Wolf.", logId: 0 });
  first.line({ logId: 1, at: iso(0), message: "You feel the spirit of wolf enter you.", raw: "You feel the spirit of wolf enter you." });
  first.track("spirit of wolf", false);
  first.flush();

  const second = createBuffTracker(deps);
  const view = second.view();
  // The decision is a decision: it outlives the process.
  assert.deepEqual(
    view.known.map((k) => [k.key, k.tracked]),
    [["spirit of wolf", false]],
  );
  // The board does not. Which buffs are up is a fact about a login, and nothing in the log restates
  // it — claiming otherwise would be inventing state the first fade line would contradict.
  assert.equal(view.active.length, 0);
});

test("permanence comes from the spell file, and reaches the row and the alert", () => {
  const h = harness();
  h.line("Your skin sprouts thistles.", 0);
  assert.equal(h.buffs.view().known.find((k) => k.key === "thistlecoat")?.permanent, true);
  h.fade({ spell: "skin", raw: "Your skin returns to normal.", offsetSec: 60 });
  // The banner needs it: a permanent buff cannot have run out, so "re-cast!" would be the wrong
  // prompt and "dispelled" is the right one.
  assert.equal(h.raised.at(-1)?.buff?.permanent, true);
});

test("the view says whether the sentence file was found", () => {
  assert.equal(harness().buffs.view().lexicon, true);
  assert.equal(harness({ lexicon: false }).buffs.view().lexicon, false);
});
