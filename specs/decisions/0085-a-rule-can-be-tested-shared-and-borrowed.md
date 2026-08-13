# 0085: A rule can be tested, shared and borrowed

## Status

Accepted

## Context

[ADR 0084](./0084-a-watch-is-a-rule-not-a-substring.md) made a watch expressive. It did not make one
easy to get *right*, and those are different problems — the second one got harder, not easier, the
moment the first was solved.

Everything about writing an EQ alert rule is guesswork with a slow feedback loop:

- **The wording is unknowable from the outside.** EQ says "The spirit of wolf leaves you.", not
  "Spirit of Wolf faded". A rule is a guess about a sentence, and the only way to find out whether
  the guess was right was to go and play until the thing happened. For "a named pops" that is an
  evening per attempt.
- **A rule can be wrong in ways that look right.** A condition on `caster` in a fade-only watch can
  never hold. An exclusion that repeats the trigger can never pass. Both save, both look sensible on
  the row, and both are silent.
- **The rule that took ten minutes to get right is stuck in one player's settings file**, though the
  expensive part — knowing what the log actually prints — is exactly the part that transfers.
- **Nobody knows what a good rule looks like.** A delay, a cancel, an `any` fold: none of that is
  discoverable from an empty row, and a player who has never seen a cue doesn't know to want one.
- **The second rule is nearly always the first rule again**, with one word changed.
- **"How it looks" was a per-watch copy**, so six rules that should share one loud red look were six
  independent decisions, and changing your mind meant changing six.

## Decision

Six answers, all of them built on what the rule model already says about itself.

**A rule says what's wrong with it** (`watch-check.ts`, `checkWatch`). The static pass names the
combinations that cannot do what they look like, at two levels: an **error** cannot work (nothing to
match on, no prompts ticked, an exclusion that repeats the trigger), a **warning** probably won't
(a condition on a field this watch's events never carry, an unreadable delay, a repeat with no brake,
an inverted cancel, a raw-text trigger under four characters, another enabled watch aimed at exactly
the same thing). It is one implementation with two faces: the row's ⚠ chip and the ✓ drawer's list
are the same call, so they cannot disagree.

**A rule can be replayed against the log** (`dryRun`), which is the half that settles arguments. The
main process keeps the last 2000 lines in memory (`recent-lines.ts` — a ring, not a record: no disk,
no persistence, forgotten on restart), the renderer fetches them once, and the *judging is pure and
local*, so the answer re-computes on every keystroke while the rule is being written. It reuses the
real pipeline — `parseSplitLine` and the three matchers — so it can only be wrong in the same way the
live path is, with two deliberate differences: `now` is **the line's own timestamp** (every replayed
line is stale by definition, and staleness is a rule about live alerting, not about words), and the
rule is matched **alone and with alerts forced on**, since the question is what *this rule* does, not
what the app currently does. The zone is replayed from the buffer's own zone lines, so a
zone-scoped rule is tested against the evening you spent there. Cancelling lines are counted too: a
cue's brake is as testable as its trigger.

**A rule can be duplicated** (⧉), inserted next to its original and opened — a copy you can't tell
from its original is a trap. Its own tweaks come along; a saved style is shared by id, so the copy
wears the same one rather than forking it.

**A rule can be handed to somebody else** (`watch-share.ts`). One line — `EQLW1:<base64 JSON>` —
because the transport is a chat window and anything with newlines arrives mangled; bare JSON is
accepted on the way *in* so a rule can be hand-written or diffed, but never produced. Everything
imported is **untrusted**: unknown keys dropped, every value checked against what the type allows,
strings clamped, lists capped, and **ids regenerated** so an import can never collide with or
overwrite a rule already on the list. Imports are always **added**, never merged — there is no
sensible reconciliation between a stranger's rule and yours, and silently changing one you were
relying on is the worst thing this feature could do. A shared rule carries **no style**: a `styleId`
would point at something the recipient hasn't got, and a full style would impose the sender's colours.

**A rule can be borrowed from a library** (`watch-library.ts`) — whole worked examples, grouped, each
with the sentence that says why you'd want it. Several exist mainly to *demonstrate a mechanism*: the
re-mez cue is delay-plus-cancel, the invite rule is the `any` fold doing what ADR 0050 had to ship as
two chips. A rule needing one of the player's own words says so in `fill` and opens on being added,
because a preset that looks finished and matches nothing reads as a bug. **Every library rule is
tested with the same `checkWatch` a hand-made rule gets** — a preset that warns on arrival would
teach the mistake twice over.

**A look can be saved and worn** (`NamedAlertStyle`, `CastWatch.styleId`). `alertStyle` becomes three
layers — defaults, then the saved style, then the watch's own tweaks — so six rules can share one
look and changing it changes all six. A `styleId` that no longer resolves falls through to the
defaults, the same call a deleted custom spot already gets: an alert that can't be styled must still
be *seen*.

**One more field earned its place**: `CastWatch.includeSelf`, overriding the group setting per watch.
The entire class of self-cued reminders is only ever about your own casting, and reaching them by
turning your own casts on globally would make every other rule fire on you too.

**The UI is uniform because the parts are shared, not because they were made to match.** One
`ConfigRow` (label column, controls, and a note saying what the current choice *means*) is used by
every drawer and by the defaults block. One `WatchConditionRows` edits both a rule's conditions and
its cancelling lines — the same idea pointed in opposite directions — with `allowExclude` off for
cancels, the one real difference. One `.chip` definition serves the row's summary, the library's
cards and the replay's hits, so the library teaches the vocabulary of the rows while you read it.

## Consequences

Writing a rule stops being an experiment you run by playing. The loop is: type words, read what they
would have caught in the last few thousand lines, adjust. That is the difference between a feature
people configure once and give up on and one they keep.

**The replay is only as good as the buffer**, and says so: every answer is quoted as "N matches in M
lines". Right after a launch M is zero, and "no matches" then means nothing at all — which is why
the count is in the sentence rather than implied.

**Two thousand lines is roughly half an hour of busy play**, a few hundred KB, and it is handed over
IPC whole. That is cheap enough not to think about and small enough to lose without regret; a rule
about something genuinely rare still can't be tested this way, and the honest answer there is the
sentence the panel already shows.

**Sharing invites a rule from a stranger to run against your log.** The blast radius is small — a
rule can only decide whether a banner appears — but the parsing is the part with a real attack
surface, so it is whitelisted rather than validated, capped in three dimensions, and covered by tests
that paste junk, wrong types, prototype keys and 200 rules at it.

**A saved style is a shared mutable thing**, which is exactly what was asked for and also the usual
cost: editing one changes rules you may not be looking at. The count of wearers is shown beside each
style so that isn't a surprise, and a rule's *own* tweaks stay per rule.

**The library is content, and content rots.** Its phrases are real ones from real logs, but EQL
patches; the test that every preset passes `checkWatch` catches a rule that becomes structurally
wrong and cannot catch one that becomes merely *inaccurate*. That is what the ✓ drawer is for, and
why the library says to open a rule after adding it rather than trusting it.
