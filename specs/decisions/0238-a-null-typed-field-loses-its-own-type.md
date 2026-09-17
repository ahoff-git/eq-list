# 0238: A null-typed field loses its own type

## Status

Accepted

## Context

A third round of auditing — this one deliberately checking each store against its own documented
contract rather than hunting for old-vs-new divergence, since that vein was already thoroughly mined
across two earlier rounds — found a real gap left open by [ADR 0235](./0235-a-migrated-ledgers-permanent-keys-migrate-too.md)'s
own fix.

`src/shared/admin.ts`'s `adminFieldType`/`coerceAdminValue` infer a field's type from its **current**
JS value, not from any declared schema — the whole point being that a store never has to say in
advance what a field's shape is allowed to be. That design has a blind spot: a field that's currently
`null` reads as `"null"` type regardless of what it will hold once set, and `coerceAdminValue` falls
through to its free-text branch, handing back whatever string was typed *verbatim*, not coerced to
any particular type.

ADR 0235's `KillAdminRow`/`FightAdminRow` conversion (`toAdminRow` in both `kill-log.ts` and
`combat-history.ts`) restores `named`/`killerNamed`/`mine`/`unsourced` to real JS booleans **when the
row's current value is already `true` or `false`** — that fixed the admin panel showing a number box
instead of a toggle, and both stores' own `applyPatch` correctly folds a genuine boolean back to the
`0`/`1` these columns actually store. But when the field is still `null` — the ordinary starting state
for all of these (`unsourced` is `null` for every fight until `rederive` marks one; `named`/
`killerNamed`/`mine` are `null` for any record a legacy migration didn't capture them on) —
`adminFieldType(null)` is `"null"`, not `"boolean"`, so:

1. The admin panel renders a free-text `<input>`, not the `true`/`false` `<select>`.
2. `coerceAdminValue(null, "false")` hits its string-fallback branch and returns the **string**
   `"false"`, not the boolean `false`.
3. The old `applyPatch`'s `typeof value === "boolean" ? ... : value` guard only folded real booleans;
   a string sailed through unchanged and bound straight into the `INTEGER` column as text.
4. Read back, `triNull()`/`toAdminRow`'s `!!v` treats any non-empty string as truthy — `!!"false"` is
   `true`. Typing "true" happened to still read back correctly (any non-empty string is truthy), but
   typing "false" — the entire point of the edit — silently produced the opposite of what was typed.

Reachability is not a corner case: `combat-history.ts`'s `unsourced` starts `null` for essentially
every fight, and `kill-log.ts`'s three fields reach `null` via any legacy-JSON migration for a record
that predates them being captured. Confirmed against real `better-sqlite3`: binding the string
`"false"` into an `INTEGER` column stores literal text rather than being coerced — SQLite's type
affinity auto-converts a well-formed numeric string like `"500"`, but not `"false"`.

## Decision

**Both stores' `applyPatch` re-coerce a raw `"true"`/`"false"` string back to a real boolean before
folding it to `0`/`1`**, gated by a small `BOOLEAN_FIELDS` set naming exactly the columns that are
genuinely boolean (`named`/`killerNamed`/`mine` in `kill-log.ts`; `unsourced` in `combat-history.ts`).
This is deliberately a store-level fix, not a change to `admin.ts`'s shared `coerceAdminValue`: the
generic function has no way to know a field is "really" boolean when its current value gives no such
signal, but each store's own `applyPatch` already knows exactly which fixed columns it's writing to
— it's the one place positioned to correct this without touching every other admin-editable field in
the app, string or number, that shares the exact same "still null" blind spot and has never been
reported as a problem for them.

## Consequences

- Editing `named`/`killerNamed`/`mine`/`unsourced` through the hidden admin panel now produces the
  typed value, whether the field started `true`, `false`, or `null` — verified by new regression tests
  that patch a still-`null` field to `"false"` and confirm it reads back `false`, not `true`.
- The admin panel's `<input>`-vs-`<select>` choice for a still-`null` boolean field is unchanged (it
  still renders free text, since `adminFieldType` still can't tell "unset boolean" from "unset
  string" from the value alone) — only the *outcome* of typing "true"/"false" into that free-text box
  is fixed, not the control itself. A `<select>` for a `null`-typed field would need `admin.ts`'s
  generic layer to accept a declared type hint per field, which is a larger change than this gap
  warrants on its own.
- The same blind spot exists for any other store's admin-editable field that is logically typed
  (boolean or otherwise) but can currently hold `null`/`undefined` — this fix only closes it for the
  four fields ADR 0235 already touched. A future field in the same situation needs the same
  `BOOLEAN_FIELDS`-style guard in its own `applyPatch`, not an assumption that `toAdminRow`'s
  conversion alone is enough.
