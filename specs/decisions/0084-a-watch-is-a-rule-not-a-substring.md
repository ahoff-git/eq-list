# 0084: A watch is a rule, not a substring

## Status

Accepted

## Context

A watch was one case-insensitive substring plus a few ticks. That is the right size for "Fear", and
it has been the wrong size for every request that followed it — each of which asked for a *second*
thing to say about the same match:

- **not that one.** "Charm, but not from my own warder." "Any tell, except from a guild-mate."
  Today the only way to not-match something is to not write a watch, so a trigger that is too wide is
  simply too wide.
- **only there.** "Tell me about this raid call, but only in the raid zone." Zone is app state, and
  nothing about a watch could reach it.
- **either of these.** Two invite wordings share no words at all
  ([ADR 0050](./0050-a-watch-can-read-a-whole-log-line.md)), so they ship as two chips, two rows and
  two of everything.
- **stop telling me.** [ADR 0082](./0082-an-alert-can-be-scheduled.md) made a watch able to remind you
  to re-mez in 25 s. Nothing could call that off when the mob died first, which is the moment the
  reminder turns from useful into wrong.

Each is small on its own, and answering them one at a time is how a settings panel grows a checkbox
per request until nobody can find anything. They are also all the same shape: *another clause*. The
model was one clause, and no amount of ticks fixes that.

## Decision

**A watch is a rule: a trigger, any number of conditions, and a timing.** The shape is the one people
already know from mail filters — a field, an operator, some text, and a way to say *not*.

**Conditions.** `CastWatch.conditions` is a list of `{ field, op, text, exclude? }`.

- **Fields** (`WatchField`): `subject` — whatever the trigger itself reads, the spell name for a cast
  or a fade and the sentence for a raw-text watch — plus `caster`, `target`, `line` and `zone`. A
  field the event hasn't got reads as empty, so `caster` on a bare line matches nothing rather than
  everything, and an *excluded* `caster` is satisfied, which is the honest reading of "not from
  BunnySlayer" about a line that names nobody.
- **Operators** (`WatchOp`): `contains` (what every watch always did), `exact`, `starts`, `ends`.
  `exact` is what finally separates `BunnySlayer` from `Bunnyslayerson`.
- **`match: "all" | "any"`** folds the trigger *and* the included conditions. `all` is the default and
  is narrowing; `any` is how one watch covers a family the trigger can't spell.
- **An exclusion is always `and not`**, whatever `match` says. "Any of these, or not that" is not a
  thing anyone means, and a watch that fired because an exclusion didn't apply would read as a bug.
- **Blank rows say nothing.** A half-typed condition can't narrow, can't carry an `any`, and can't
  veto — because a rule that changes meaning between keystrokes is a rule you can't edit.
- **A blank trigger steps aside** rather than failing: a watch may now be nothing but conditions
  ("anything BunnySlayer casts"), which no substring can express. What it must never do is match
  everything, so a watch with neither trigger nor condition matches nothing — the rule blank watches
  always had, kept for a shape that can now reach it two ways (`watchSpeaks`).

**Cancelling, and the rest of the timing.** [ADR 0082](./0082-an-alert-can-be-scheduled.md)'s cue
grows the three things a timer needs to be usable rather than merely late:

- **`cancelWhen`** — conditions matched against **whole log lines** as they arrive, which call a
  waiting cue off. Lines rather than typed events because by the time a cue is waiting, the thing
  that should stop it is rarely the shape of the thing that started it, and the log's own words are
  the escape hatch that already covers everything ([ADR 0050](./0050-a-watch-can-read-a-whole-log-line.md)).
  **A cancel is never inverted**: "stop unless the line says X" would end the cue on the very next
  line, so the flag is refused in the model, ignored in the queue, and not offered in the UI.
- **`retrigger`** — what a second match does while a cue is waiting: `restart` (the default: re-mez
  and the countdown is wrong), `queue` (two placeholders died, two cues are due), or `ignore`.
- **`repeat`** — say it again, one delay apart, bounded at `MAX_REPEAT`. **A repeat must be
  stoppable** — a cancelling line, or a death that will cancel it — enforced in `alertCue` rather
  than in the UI, because it is the one combination here that could make the overlay unusable.
- **`cancelOnDeath`** becomes `auto | always | never`. `auto` is [ADR 0082](./0082-an-alert-can-be-scheduled.md)'s
  length rule, unchanged and still the default; the other two are for the cue it guesses wrong.

**The split follows the question, not the feature.** `watch-conditions.ts` is pure and knows only
about a watch and a `WatchSubject`; `cast-alerts.ts` keeps everything that is about *the event* — your
own casts, named casters, the live window — and builds the subject each matcher hands over. Neither
grew: `matchCast`, `matchFade` and `matchLine` are now three eligibility rules over one shared spine,
and their signatures are unchanged but for an optional context carrying the zone.
`watch-summary.ts` says a rule back in a few words, and `alert-queue.ts` gained only the state a
cancel needs.

**Every field is optional and absent means the old behaviour**, so no settings file needs migrating
and no shipped watch changes what it does. That is asserted, not assumed: the matcher tests that
predate all of this run untouched.

**The UI is a summary and three drawers.** A row shows the two fields that are edited constantly —
trigger and message — plus chips saying what the rule currently *does* (`cast · fades`, `2
conditions`, `25s ×3`). Behind ⚟ / ⏱ / 🎨 sit what sets it off, when it speaks, and how it looks; one
drawer is open at a time across the whole list. Timing controls past the delay stay hidden until
there is a delay, so an ordinary watch is still one empty box rather than four questions.

**A rule that won't do what it looks like says so.** `summarizeWatch().problems` names the silent
combinations where they were typed — a delay it can't read, a repeat with no brake, a watch that
fires on nothing, an inverted cancel that was ignored — as a ⚠ chip on the row and in full when the
watch is open. This is the price of admission for a rule language: expressiveness that fails quietly
is worse than no expressiveness at all.

## Consequences

The four requests above are all one mechanism now, and so is the next one. "Charm, but not from my
warder, only in Lower Guk, and stop reminding me once it's dead" is one watch, with the same colour,
sound, position, wording and Test button every watch has had since
[ADR 0035](./0035-cast-alert-overlay-window.md).

**Zone became something a watch can read**, which required handing the matchers a context they can't
look up — `cast-alerts.ts` still holds no state, and a caller that doesn't track the zone simply has
no zone conditions.

**The queue now reads lines.** A cue with cancelling words makes the watcher's line channel matter to
the main process even when no watch is pointed at lines; both "is anyone listening?" checks run
before the line is touched, so the cost when nothing is waiting is unchanged.

**What this does not add is a regex**, and the `todo.md` item for one is now smaller rather than
answered: alternation — the case that item leads with — is `match: "any"`, and the anchors are
`starts`/`ends`. What remains is genuine patterns, whose hazard is unchanged (Node has no regex
timeout and the watcher polls on the main thread), so it stays its own decision.

**Two costs, stated plainly.** A watch can now be got wrong in ways a substring couldn't — which is
what the warnings are for, and they can only catch the combinations we thought of. And the Suggested
chips still ship one wording each, though `any` now makes a single "party invite" chip covering both
sentences possible; leaving that alone is a deliberate small debt, since the chips are also how the
exact sentences are discovered.
