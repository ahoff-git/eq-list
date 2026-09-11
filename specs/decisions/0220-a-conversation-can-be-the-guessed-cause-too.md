# 0220: A conversation can be the guessed cause too

## Status

Accepted

## Context

[ADR 0219](./0219-a-faction-cause-is-a-guess-from-timing.md) guessed a faction hit's cause from the
kill that landed shortly before it. The user asked for the obvious next case: a quest turn-in raises
or lowers a faction too, and has no kill behind it at all — "do something similar to the neighbor
[eql-log-reader's quest-dialogue matching]. If there is dialog that matches with the rep gains... go
ahead and assign the gains to that quest. But don't scan every line of dialog ever — only when there
is a rep gain or money record without a source."

Two things had to be checked before building anything, the same discipline ADR 0219 was held to:

**Is there a real captured line to build a dialogue matcher from?** Yes, partially:
`fixtures/sample-eqlog.txt` has one real captured line, `Bristlebane tells you, 'The trickster smiles
upon you.'`, and the general "Name says/tells, 'text'" grammar is one of the most universal, stable
conventions across the whole EverQuest family — including this repo's own eqlwiki quest-page fixtures
(`fixtures/wiki/quest-*.html`), which transcribe NPC dialogue the same way. That's enough to build a
raw-line detector from with reasonable (not certain) confidence.

**Can a matched line be tied to a *specific quest*, the way eql-log-reader ties one to
`QuestState.confirmed`?** No — and this is the part that changed the plan. A survey of a dozen real
eqlwiki quest pages (done for this ADR) found dialogue scattered across `<dl><dd>`, plain `<p>`,
`<ul><li>` and `<blockquote>` inconsistently; the same `<dl><dd>` tag reused on the same pages for
non-dialogue content (turn-in checklists, "You get the X." narrator lines); and hand-transcribed text
with missing quotes and stray markup in several places. It's a wiki editor's prose summary of a
dialogue tree, not a verbatim capture of what the live log prints — eql-log-reader's own version of
this idea uses a purpose-built quest database (`eql_quest.py`/`eql_quest_db.json.gz`, sourced from
Project Quarm's quest *scripts*, not from wiki prose) for exactly this reason. Matching live log text
against text nothing has confirmed matches it would be exactly the mistake "real captured line first"
exists to prevent, just moved one level up — guessing that the *match* is real, instead of guessing
that the *grammar* is real.

**What does "a money record without a source" refer to?** A real, already-existing, reachable case:
`kill-log.ts`'s `noteCoin` returns `false` when corpse coin can't be tied to any of your own recent
kills — looting a corpse more than `LOOT_WINDOW_MS` (120s) after your last kill, or one that was never
yours (ADR 0047 calls this out explicitly: "coin that finds no corpse still counts towards the session
total and is simply not attributed to a mob"). No new, unverified coin-line wording had to be invented.

## Decision

Extend `src/shared/faction-cause.ts` (not a new module — one tracker, two signals) with a second,
looser guess, and use the *existing* unsourced-coin case as the second trigger, without building a
quest-name matcher or any wiki integration:

- **Dialogue capture**: `noteLine(line: LogLine)` tests every raw line against `/^(?<npc>.+?)
  (?:tells you|says),?\s+'(?<text>.+?)'\.?$/` and, on a match, overwrites a single remembered slot
  (`{npc, text, at}`) — no history, no accumulation, a cheap regex test per line exactly like every
  other raw-line reader in this app (`achievements.line`, `buffs.line`).
- **`resolve()`'s order**: a kill is checked first (unchanged from ADR 0219); only when nothing kill-
  shaped explains the hit is the remembered dialogue line checked, against a **wider** window —
  `DIALOGUE_WINDOW_SEC` (15s) vs. the kill's 3s — because a turn-in is a multi-step interaction
  (hailing, clicking dialogue options, handing an item over), not an instant the way a kill's
  adjustment is.
- **`FactionCause` becomes a union**: `{kind: "kill", mob, gapSec}` (unchanged) or `{kind: "dialogue",
  npc, text, gapSec}` — the actual quoted line rides along, so the reader judges for themselves
  whether it reads like a quest turn-in, rather than trusting a bare name. `FactionCauseTally` is
  keyed by `kind` + a generic `source` (mob or NPC), so the two guesses never collide in a standing's
  rollup even if a mob and an NPC happen to share a name.
- **The ambiguity is real and stated, not hidden**: nothing here can tell an NPC's reply from a
  nearby player's `says` or a friend's private `tells you` — there is no NPC name registry to check
  against the way `mob-knowledge.ts` has learned mob names from kills, and `cast-alerts.ts`'s
  `isNamedCaster` already documents the identical player-vs-NPC ambiguity for a caster's name. This is
  why dialogue is only ever a *fallback* behind the tighter kill signal, and why it's labeled a guess
  everywhere it's shown, the same as the kill guess.
- **Unsourced coin gets the guess too, but only as a debug-log line.** `main.ts`'s `watcher.onCoin`
  handler now calls `factionCause.explainUnsourcedCoin(event.at)` when `killLog.noteCoin` returns
  `false` for a genuine corpse-coin case, and logs the result at debug level. No new ledger, no new
  tab: there is nothing today that tracks *why* you got money the way `faction-log.ts` tracks a
  faction's standing, and building one wasn't asked for — this is visibility for someone with Debug
  logging on, not a shipped feature surface.
- **Wired into both paths**, live (`main.ts`'s `onLine`) and replayed (`log-import.ts`, which now
  splits every line via `splitLine`/`parseSplitLine` directly instead of the combined `parseLine`, so
  an unmatched dialogue line is still offered to the tracker before being discarded) — a digested log
  gets the same guesses a watched one would have.
- **Not built**: any extraction of dialogue from wiki quest pages, any `WikiClient` method to
  enumerate cached quests, and any attempt to name a specific quest. If a real EQ Legends log ever
  turns up a captured turn-in sequence with reliable, game-stated quest identity (unlikely — nothing
  in the log names a quest at all, as far as anything captured here shows), that would be the moment
  to revisit this, not before.

## Consequences

- The Faction tab can now show *some* explanation for a hit that has no kill behind it — an NPC name
  and what they said — which is real, useful evidence even without a confirmed quest title.
- The dialogue guess is strictly weaker than the kill guess and is presented that way: it can be a
  bystander's chat, a private tell, or genuinely unrelated conversation that happened to precede a hit
  by coincidence within 15 seconds. The tooltip says this in words every time.
- `DIALOGUE_WINDOW_SEC` is, like `CORRELATION_WINDOW_SEC`, a starting guess rather than a measurement
  — the same real-log verification ADR 0219 asked for applies here, doubly so.
- Unsourced-money causation exists but is invisible to an ordinary player (debug log only) — if a
  future "why did I get this money" feature is ever built, this guess is already sitting there ready
  to feed it, but building that feature itself is unstarted work, not implied by this ADR.
- The wiki's quest-dialogue text remains unused for this purpose. Anyone tempted to revisit that
  should re-read the survey in this ADR's Context first — the HTML is real and it is genuinely messy,
  not merely under-explored.
