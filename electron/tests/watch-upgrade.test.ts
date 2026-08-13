/**
 * Black-box tests for the one-time conversion of alert rules written by an older build.
 *
 * Two properties matter more than any single conversion. It has to be **idempotent** — the caller
 * stamps a schema on the strength of that, and a second pass that changed something would mean the
 * stamp was a lie. And it must not change **what any rule does**: this is a rewrite of how a rule is
 * *written down*, so every rule has to fire on exactly what it fired on before, which the tests below
 * check by matching the same events against the settings either side of the upgrade.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { upgradeWatches } from "../../src/shared/watch-upgrade";
import { alertStyle } from "../../src/shared/alert-styles";
import { matchCast, matchLine } from "../../src/shared/cast-alerts";
import type { AlertStyle, CastAlertSettings, CastWatch } from "../../src/shared/types";

const NOW = Date.parse("2026-07-29T21:00:00");
const DEFAULTS: AlertStyle = {
  sound: true,
  flash: true,
  color: "#e5534b",
  soundName: "chirp",
  position: "top",
  durationMs: 6000,
  animation: "pulse",
};

function settings(watches: CastWatch[], over: Partial<CastAlertSettings> = {}): CastAlertSettings {
  return { enabled: true, includeSelf: false, watches, locations: [], ...DEFAULTS, ...over };
}

/** How a watch list looked before any of this: a substring, a flag or two, nothing said explicitly. */
const OLD: CastWatch[] = [
  { id: "fear", spell: "Fear", enabled: true },
  { id: "sow", spell: "Spirit of Wolf", enabled: true, onCast: false, onFade: true },
  { id: "invite", spell: "invites you", enabled: true, onCast: false, onLine: true },
];

test("what was implicit is written down, and nothing else moves", () => {
  const { settings: after, report } = upgradeWatches(settings(OLD));
  assert.deepEqual(after.watches.map((w) => w.onCast), [true, false, false]);
  assert.equal(report.explicit, 1); // only the one that never said
  assert.equal(after.watches[0].spell, "Fear");
  assert.equal(after.watches[1].onFade, true);
  assert.equal(after.watches[2].onLine, true);
});

test("it is idempotent — a second pass changes nothing at all", () => {
  const once = upgradeWatches(settings(OLD));
  const twice = upgradeWatches(once.settings);
  assert.equal(twice.changed, false);
  assert.deepEqual(twice.settings, once.settings);
});

test("an up-to-date file is left byte-identical, so the caller can skip the write", () => {
  const current = settings([{ id: "a", spell: "Fear", enabled: true, onCast: true }]);
  const result = upgradeWatches(current);
  assert.equal(result.changed, false);
  assert.equal(result.settings, current); // the same object, not a copy
});

test("every rule still matches exactly what it matched before", () => {
  // The point of the whole exercise: this is a change of notation, not of behaviour.
  const before = settings(OLD);
  const after = upgradeWatches(before).settings;
  const cast = { caster: "a gnoll", spell: "Fear", at: "2026-07-29T21:00:00" };
  const line = { message: "Bunnyslayer invites you to join a group.", at: "2026-07-29T21:00:00" };
  assert.equal(matchCast(cast, after, NOW)?.id, matchCast(cast, before, NOW)?.id);
  assert.equal(matchLine(line, after, NOW)?.id, matchLine(line, before, NOW)?.id);
});

// ── the rule that could never fire ─────────────────────────────────────────────

test("a rule nothing could reach becomes a raw-text rule", () => {
  // Reachable in the old model: cast off, fade off, line off. Its words were simply lost.
  const lost = settings([{ id: "x", spell: "the mystical path", enabled: true, onCast: false }]);
  const { settings: after, report } = upgradeWatches(lost);
  assert.equal(report.rescued, 1);
  assert.equal(after.watches[0].onLine, true);
  // …and it now actually catches the sentence it was written for.
  assert.equal(matchLine({ message: "The mystical path fades away.", at: "2026-07-29T21:00:00" }, after, NOW)?.id, "x");
});

test("a rule that could already fire is never re-pointed", () => {
  const { report } = upgradeWatches(settings(OLD));
  assert.equal(report.rescued, 0);
});

// ── looks ──────────────────────────────────────────────────────────────────────

test("a copy of the defaults is dropped: wearing the defaults is the same look", () => {
  // What the old 🎨 button did — copy the whole defaults into the watch, then let you edit it.
  const copied = settings([{ id: "a", spell: "Fear", enabled: true, style: { ...DEFAULTS } }]);
  const { settings: after, report } = upgradeWatches(copied);
  assert.equal(report.plain, 1);
  assert.equal(after.watches[0].style, undefined);
  assert.equal(after.watches[0].styleId, undefined);
  assert.deepEqual(alertStyle(after, after.watches[0]), DEFAULTS); // and looks the same as before
});

test("identical looks across rules become one saved style they all wear", () => {
  const loud = { ...DEFAULTS, color: "#a371f7", soundName: "alarm" };
  const before = settings([
    { id: "a", spell: "Fear", enabled: true, style: loud },
    { id: "b", spell: "Charm", enabled: true, style: { ...loud } },
    { id: "c", spell: "Root", enabled: true },
  ]);
  const { settings: after, report } = upgradeWatches(before);
  assert.equal(report.created, 1); // one style, not two
  assert.equal(report.styled, 2);
  assert.equal(after.styles?.length, 1);
  assert.equal(after.watches[0].styleId, after.watches[1].styleId);
  assert.equal(after.watches[0].style, undefined);
  // Nothing about how they look changed, which is the only way this is safe.
  assert.deepEqual(alertStyle(after, after.watches[0]), alertStyle(before, before.watches[0]));
  assert.deepEqual(alertStyle(after, after.watches[2]), DEFAULTS);
});

test("looks that differ stay separate styles", () => {
  const before = settings([
    { id: "a", spell: "Fear", enabled: true, style: { ...DEFAULTS, color: "#a371f7" } },
    { id: "b", spell: "Charm", enabled: true, style: { ...DEFAULTS, color: "#46c86b" } },
  ]);
  const after = upgradeWatches(before).settings;
  assert.equal(after.styles?.length, 2);
  assert.notEqual(after.watches[0].styleId, after.watches[1].styleId);
});

test("a partial look is resolved through the defaults before it's folded", () => {
  // An old watch could hold `{color}` alone; what it *looked like* was that over the defaults.
  const before = settings([{ id: "a", spell: "Fear", enabled: true, style: { color: "#a371f7" } }]);
  const after = upgradeWatches(before).settings;
  const saved = after.styles?.[0];
  assert.equal(saved?.style.color, "#a371f7");
  assert.equal(saved?.style.soundName, "chirp"); // filled in from the defaults
  assert.deepEqual(alertStyle(after, after.watches[0]), alertStyle(before, before.watches[0]));
});

test("a rule wearing a style *and* carrying its own layer is flattened into one style", () => {
  // Only reachable for a few hours between two builds, and the new picker can't describe it.
  const shared = { id: "loud", name: "Loud", style: { ...DEFAULTS, color: "#a371f7" } };
  const before = settings([{ id: "a", spell: "Fear", enabled: true, styleId: "loud", style: { durationMs: 9000 } }], {
    styles: [shared],
  });
  const after = upgradeWatches(before).settings;
  const worn = after.styles?.find((s) => s.id === after.watches[0].styleId);
  assert.equal(after.watches[0].style, undefined);
  assert.equal(worn?.style.color, "#a371f7");
  assert.equal(worn?.style.durationMs, 9000);
  assert.deepEqual(alertStyle(after, after.watches[0]), alertStyle(before, before.watches[0]));
  // The shared style itself is untouched — another rule may be wearing it.
  assert.deepEqual(after.styles?.find((s) => s.id === "loud"), shared);
});

test("an existing saved style is reused rather than duplicated", () => {
  const loud = { id: "loud", name: "Loud", style: { ...DEFAULTS, color: "#a371f7" } };
  const before = settings([{ id: "a", spell: "Fear", enabled: true, style: { ...loud.style } }], { styles: [loud] });
  const { settings: after, report } = upgradeWatches(before);
  assert.equal(report.created, 0);
  assert.equal(after.styles?.length, 1);
  assert.equal(after.watches[0].styleId, "loud");
});

test("an empty list is nothing to do", () => {
  const result = upgradeWatches(settings([]));
  assert.equal(result.changed, false);
});
