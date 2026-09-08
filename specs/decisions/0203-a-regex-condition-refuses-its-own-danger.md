# 0203: A regex condition refuses its own danger

## Status

Accepted

## Context

`specs/todo.md`'s "From the neighbours" section flagged this as open, citing EQBuddy's
`TrackedRule.cs` (`RegexMatchTimeoutException`) as prior art: watch conditions can express "either
spelling of this raid call" and similar fixed shapes via `contains`/`exact`/`starts`/`ends`
([ADR 0084](./0084-a-watch-is-a-rule-not-a-substring.md)), but a genuine pattern — a number in the
sentence, a name shape — isn't expressible. The todo item named the real cost up front: "the watcher
polls twice a second on the main process's thread and a backtrack stalls log tailing outright," and
left the mitigation undecided between "reject patterns with the nested-quantifier shapes that
backtrack" and "match somewhere that can be abandoned" (a worker thread with a hard timeout).

Node has no built-in regex execution timeout — unlike .NET's `RegexMatchTimeoutException`, there is
no way to interrupt a `RegExp` mid-backtrack from the same thread, and the log watcher
(`electron/log-watcher.ts`) runs entirely synchronously on the main process's own thread, polling
every 500ms, evaluating every enabled watch's trigger and conditions against every new line. A
catastrophic-backtracking pattern anywhere in that chain doesn't just delay one alert — it stalls log
tailing for every feature that reads the log, indefinitely.

The threat model is not adversarial in the usual sense — a player writes their own patterns, the same
way they write their own `contains` text today — **except in one place**: `watch-share.ts`'s import
path explicitly exists to accept a rule from a stranger's clipboard paste, and its own header already
states the standard to hold imported data to: "a hostile paste can't be a denial of service."

## Decision

**Regex is a `WatchCondition` operator, not a change to the trigger.** `CastWatch.spell` stays plain
substring matching; a pattern is written as a condition (`field`, `op: "regex"`, `text`), which
already has its own field to point at (`subject`, `line`, and so on) — the same "shape people already
know from mail filters" `watch-conditions.ts` was built around, one more operator in the same picker.

**A dangerous pattern is never executed, not merely flagged.** `looksUnsafe()`
(`src/shared/watch-conditions.ts`) is a structural scan for the shape behind the large majority of
real ReDoS reports — a group that can repeat as a whole *and* can also repeat something inside it
(`(x+)+`, `(x*)+`, `(.*)+` and kin) — and `matchRegex()` asks it **first, unconditionally**, before a
`RegExp` is ever constructed. This runs for every caller alike: the editor, a shared rule import, a
hand-edited settings file. `checkWatch`'s static pass asks the same function and turns a "yes" into a
full-sentence **error** on the row, and `watch-share.ts`'s `readConditions` asks it too, silently
dropping an unsafe imported condition — the same "reported at the watch level, not the row level"
treatment every other malformed imported field already gets.

**This is the "cheap version," deliberately, not the "honest" worker-thread one.** A pattern that
avoids the nested-repetition shape can still be slow against a sufficiently adversarial input, and
`looksUnsafe` does not reason about alternation overlap (`(a|a)*` is a known ReDoS shape it misses).
Closing that gap needs an AST and a star-height calculation, or a worker thread with a hard kill —
both real engineering for a threat that, outside the one import path named above, is a well-meaning
player's own typo rather than an adversary's crafted payload. The residual risk is bounded in
practice by EQ's own log lines being short (a chat line, a combat line), which caps how much even an
uncaught pattern can cost per line.

**Case-insensitive by the `i` flag, not by lower-casing the pattern.** Every other operator here folds
case by lower-casing both sides before comparing; doing that to a *pattern* corrupts it (`\D` becomes
`\d`, the opposite character class). `matchRegex` keeps the haystack and pattern in their original
case and asks `RegExp` to fold instead — the one place this feature can't reuse `compare()` unchanged.

**An invalid pattern fails closed.** A syntax error is a `checkWatch` error (with the engine's own
message) so it's visible before it matters; at match time `matchRegex` still wraps construction in
`try`/`catch` and simply never matches, the same answer a blank condition already gives, for any
pattern that reaches it without having been checked first.

## Consequences

A watch can now express a real pattern, and the failure modes the todo item worried about are both
handled: a pattern that would hang the watcher is refused before it's ever run, wherever it came from;
a pattern that's merely wrong is named as an error on the row rather than silently never firing.

**The gap is real and stated rather than hidden.** `looksUnsafe` is conservative in one direction
(some safe patterns are refused for merely looking dangerous) and incomplete in the other
(alternation-based blowup isn't caught at all). If this ever proves insufficient in practice — a
report of an actual hang — the honest version from the todo item (matching on a thread that can be
abandoned) is the next step, not a patch to this heuristic.

No migration: `WatchOp` gained a variant additively, and no existing watch used it before this shipped.
