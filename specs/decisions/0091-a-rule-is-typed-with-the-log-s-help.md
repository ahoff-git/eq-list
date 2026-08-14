# 0091: A rule is typed with the log's help

## Status

Accepted

## Context

Three complaints about the same act — writing a rule — reported from using it.

**The caret jumped to the end of the box on every keystroke.** Every field on the Alerts tab was
bound straight to Settings, so a letter went `onChange` → IPC → the main store → a broadcast back →
`useSettings` → re-render. Until that lap finished, React re-rendered the input with the value it had
*before* the keystroke; a rewritten DOM value puts the caret at the end. Editing the middle of a word
was therefore impossible, which is most of what editing a rule is.

**The trigger is the one field nobody can fill from memory.** EQ prints "Mesmerization", not
"Mesmerize"; the root line here is "Instill"; and this game's spelling defeats people who *do*
remember. [ADR 0089](./0089-a-rule-is-checked-against-the-log-file.md)'s replay tells you afterwards
that a guess was wrong. It doesn't help you guess.

**The check's hit list wasted its slots.** It showed the last twenty matching *lines*, and for the
rules people actually write that is twenty copies of one sentence — while the differently-worded
line that would have told you something sat just off the end.

## Decision

**A text box owns its own text.** `TextField` keeps the typed value locally and only *pushes*
upward, adopting an upstream value when it isn't the echo of what it last sent. The round trip stops
fighting the typist, and a rule arriving from elsewhere — an import, a library rule, a duplicate —
still lands in the field.

**Completions come from the log**, gathered into `log-vocabulary.ts`: every spell named, everyone who
cast one, everyone a fade wore off, and every zone entered. Nothing is a list we maintain, so it is
exactly as current as the server is — a spell renamed in a patch, a mob only this camp has.

The structure is a **trie**, and that is the point of it. A completion is produced on every
keystroke; scanning a few thousand terms per letter makes typing feel heavy, while a trie answers in
the length of what you typed however much log it was built from. Each node carries the best term
beneath it, decided at build time: seen most, ties to the shorter (a completion you have to delete
back out of is worse than one you have to extend), then alphabetically so the same log always gives
the same answer.

**Two ways of offering, because one can't cover it:**

- **A ghost** — the rest of the word, greyed, behind the caret — when what you typed *starts* a term.
  Tab or → takes it.
- **A list** — for everything a ghost cannot express. A term that *contains* what you typed ("sme" →
  Mesmerization) has no remainder to grey, and neither does a near-miss spelling. Both are real
  matches, so they get a dropdown: ↑/↓ and Enter, Escape to dismiss.

The passes run in the order a person wants them — **starts with**, then **contains**, then **fuzzy** —
each filling only what the last left, so an exact prefix is never pushed down by a cleverer match.
The fuzzy pass is `fuzzy.ts`, the app's own scorer, at a **higher floor than the search box uses**
(0.6): a search can afford a wrong guess among results, while a rule is a thing you commit to, and an
offer that isn't nearly right is worse than none. Neither slower pass runs under three characters,
where "me" is inside half of everything and a fuzzy score is noise.

**Nothing is accepted implicitly.** A rule that silently became a longer rule than you typed is the
worst outcome available here.

**The check's hit list is one row per distinct sentence**, folded by `lineShape` — the same digit
rule the unread-line tally uses — with a count. The list is read for *variety*: is it catching what I
meant, and what else is it catching. Twenty identical rows answer neither. The newest example of each
shape is kept, since its numbers are the ones worth seeing.

**Inputs inherit the app's font.** They never had: a browser gives an input its own, so every box in
the app was set in a different typeface from everything around it. Invisible until typed text and
rendered text had to sit on top of each other, at which point the ghost was obviously not the same
text in a different colour. `font: inherit` on `.field`, and every property that decides where a
glyph lands copied onto the ghost rather than approximated.

## Consequences

Writing a rule is now: type a few letters, read what the log actually calls it, Tab. The two features
that used to answer "was I right?" after the fact — the replay and the checker — are joined by one
that answers before it.

**The vocabulary is only as good as the slice read.** It is built once when the tab opens, from the
same first step of the log the check starts at, so a term from three evenings ago isn't offered. The
count is shown ("17 words learned from your log") for the same reason the check quotes how many lines
it read: "no suggestion" and "nothing to suggest from" look identical in an empty box, and only one
of them is about your typing.

**Fuzzy matching can offer a wrong word confidently**, which is why nothing is accepted implicitly
and why the floor is raised. The failure mode is a suggestion you ignore, not a rule you didn't write.

**`font: inherit` changes every input in the app**, not just this tab. That is a fix rather than a
side effect — the boxes were the only text in the app not in its own typeface — but it is a visible
change everywhere and worth knowing it came from here.
