# 0087: An old rule is converted once, and the alert path is one module

## Status

Accepted

## Context

Two loose ends from the four decisions that turned a watch into a rule
([0082](./0082-an-alert-can-be-scheduled.md), [0084](./0084-a-watch-is-a-rule-not-a-substring.md),
[0085](./0085-a-rule-can-be-tested-shared-and-borrowed.md),
[0086](./0086-editing-a-shared-style-from-a-rule-forks-it.md)).

**A rule's meaning was still partly in what it didn't say.** Every new field is optional and absent
means the old behaviour — that promise is what let four decisions land without migrating anybody's
settings, and it is asserted by the matcher tests, which predate all of it and still run untouched.
The cost is that a shipped watch relies on unstated defaults: `onCast` absent means casts are on, a
style copied out of the defaults means a look shared with nobody, and a watch with every prompt
switched off means one that can never fire at all. That was fine while the code was the only reader.
Now the panel *shows a rule back to you in words*, so "it says nothing about casts, therefore it does
them" is a sentence the UI has to keep translating rather than a fact it can display — and three of
those states are indistinguishable from mistakes.

**And the alert path had grown past the file it lived in.** Main held three handlers with four steps,
two orderings that matter and the payload built three times over. Main is wiring; this had become a
pipeline, and the rules inside it — a death cancels before anything else, a line is offered for
cancelling *before* matching, the banner is settled at the moment of the match — were exactly the
things no test could reach, because reaching them meant standing up Electron.

## Decision

**A one-time conversion makes the implicit explicit.** [watch-upgrade.ts](../../src/shared/watch-upgrade.ts)
is pure; `migrations.ts` runs it once against `settings.json` behind its own schema stamp, having
copied the file aside first. It:

- **writes `onCast` down** as the true or false it always meant;
- **makes a rule nothing could reach a raw-text rule.** With no prompt ticked, no log line can arrive
  at it — it is a rule someone wrote and lost. This is the one conversion that is a *guess*, and it is
  the honest one: raw text is the escape hatch that can match anything the game prints
  ([0050](./0050-a-watch-can-read-a-whole-log-line.md)), so the words get a chance to mean something
  instead of staying silently dead;
- **folds duplicated looks into saved styles.** The old 🎨 button copied the whole defaults into each
  watch, so six rules "with their own style" were six identical copies needing six edits. Identical
  looks become one shared style they all wear ([0086](./0086-editing-a-shared-style-from-a-rule-forks-it.md));
  a copy that never diverged from the defaults is dropped, since wearing the defaults is the same look
  and one less thing to carry;
- **flattens a rule wearing a style *and* carrying its own layer** into a single saved style — a state
  reachable only for a few hours between two builds, which the new picker can't describe.

Two properties make it safe, and both are tested: it is **idempotent** (the schema stamp would
otherwise be a lie), and **no rule changes what it matches** — the tests match the same events against
the settings either side of the conversion. It is not a rescue. An un-migrated file works; this is a
rewrite of how a rule is *written down*.

**The alert path becomes one module.** [alert-router.ts](../../electron/alert-router.ts) owns match →
build → schedule, with the queue inside it, and main is left with two lines that say what order
things happen in. The payload is built **once** per kind instead of three times, and the Test button's
sample is built beside the live ones (`sampleAlert`) so a preview can't drift into showing a banner
the real alert never draws — it now previews a fade as a fade for the same reason it already
previewed a line as a line.

**Four other duplications went with it**, each of which was the same knowledge written twice:

- `alertStyle` moves to `alert-styles.ts`, the module that is *about* looks. `cast-alerts.ts` is now
  matching and nothing else, and the dependency inverts: the styles module stops importing the matcher.
- **`usableCancels`** — "the cancelling rows that can actually cancel" — was written out in three
  places that had to agree: the queue carries them, `alertCue` counts them to decide whether a repeat
  is safe, and the checker reports the ones it dropped.
- **`wantsCast`** has one home, in `watch-conditions.ts`, rather than a definition and a re-export.
- The checker's warnings are the *only* description of what's wrong with a rule; `summarizeWatch`
  carries them rather than keeping its own list, so the row's ⚠ and the drawer's list cannot disagree.

**No magic numbers in this area.** Every threshold, cap, factor and unit conversion is a named
constant with the reasoning attached: `SHORTEST_RAW_TRIGGER`, `DEFAULT_HITS`, `MS_PER_SECOND`,
`SECONDS_PER_MINUTE`, `SLACK` (the ring buffer's amortised trim), and in the tests
`SHORTEST_EXPLANATION` and friends. `formatDelayMs` exists so that nothing outside `alert-schedule.ts`
divides by a thousand. The repeated pixel widths in the drawers became **three named CSS classes**
(`.pick`, `.pick.wide`, `.time`) rather than three named JS constants: a size belongs in the
stylesheet, and five arbitrary widths collapsing to three named ones is a simplification rather than a
rename.

## Consequences

A rule now reads the same to the panel, to the checker and to a person: what a watch does is written
in the watch. The three states that used to be indistinguishable from mistakes — no prompts, a copied
look, unstated casts — are gone from converted data and reported by `checkWatch` when hand-made.

**The conversion writes to `settings.json`, which no migration had touched before.** It reads with
`JSON.parse` rather than the store's forgiving reader (whose fallback answers "empty", which would let
a stamp replace a file somebody could otherwise have rescued in an editor), copies the file to
`settings.pre-schema-1.json`, and stamps the schema even when nothing needed changing so the check
costs one read per install rather than one per launch.

**The router's tests are the ones that were missing**, and they found nothing — which is the honest
outcome to report: the behaviour was already right, and it is now *pinned*, including the two orderings
that a later refactor would otherwise be free to swap.

`main.ts` lost about seventy lines. That is not the point, but it is the visible part: what the file
now says about alerts is *when* they happen relative to the meter, which is the only thing about them
that is main's business.
