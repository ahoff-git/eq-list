# 0134: A map reference resolves to a place, never to a name we couldn't read

## Status

Accepted

## Context

[ADR 0057](./0057-a-grade-is-not-an-identity.md) settled the rule: a zone's difficulty describes
*this copy* of the zone, not which zone it is, so it folds away wherever names are matched. One map
draws Blackburrow however hard its gnolls hit — the five tiers the server runs (D0, and D1 *Awakened*
through D4 *Refined*) are one geometry.

`findZone` obeys that rule and returns the right **file** for `Blackburrow 3`. But a map reference
needs a **name**, not a file: the string that scopes this window's pins and kills, goes in the title,
is remembered as the picker's choice, and is handed to the wiki. `findZone` can't supply one for a
zone it has no file for — and every caller wrote its own answer to that, all of them the same:

```ts
findZone(name, zones)?.name ?? name
```

The `?? name` is the bug. It is the log's wording, difficulty and ruleset intact, so **for any zone
with no map file the difficulty was a map of its own.** Seven references had their own copy of it, and
they disagreed about what happened next:

- **The scope key** (`zone?.name ?? zoneName`) is what pins are stamped with, what the kill and mob
  panels are read by, and what a shared kill is tagged with. Standing in an unmapped `Blackburrow 3`,
  a pin dropped there was filed under a different zone than one dropped in `Blackburrow` — pooled back
  together only because the *reader* happened to use `samePlace`. The write side and the read side were
  keeping different rules.
- **The Project 1999 link**, the one thing offered for a zone we can't draw, built its URL straight
  from that name: `wiki.project1999.com/Blackburrow_3` is not a page. The fallback for having no map
  was broken by the same thing that caused it.
- **The hand-set height window** was keyed on the raw name, so walking back into the camp at another
  difficulty threw away the window and re-fitted the view.
- **"Follow me as I travel"** cleared your zone override on `previous !== currentZone`, so a difficulty
  change — the same map — snapped you off the map you were studying, exactly like travel.
- The **title**, the **empty-state text**, the **picker's remembered value** and the **travel panel's
  default destination** each read the raw name too, so the window could name the zone four ways at once.

Meanwhile the fold that answers all of this already existed and was already load-bearing elsewhere:
`placeName` / `placeKey` ([ADR 0083](./0083-a-zone-name-is-stored-raw-and-grouped-on-read.md)), which
resolves a recorded name against the gazetteer and falls back to the base name — difficulty and
ruleset off — for a zone no table knows. Nothing in the map layer reached for it.

## Decision

**One translation, and its floor is a place.** `mapZoneName(name, zones)` in
[`src/shared/map/zones.ts`](../../src/shared/map/zones.ts) is the single answer to "what is the zone
this map reference means called":

```ts
findZone(name, zones)?.name ?? placeName(name)
```

The map's own name where we have a file, the **place** otherwise, and never the log's wording. An
empty name stays empty, because "no zone yet" is not a place. Every reference in the map window goes
through it — the scope key, the title, the picker's value, "is this here?", a zone asked for from
another window, a peer's zone, the floors, the travel survey, the empty state and the wiki link — so
there is no longer a per-call-site fallback to disagree about. `findZone` keeps its one remaining
caller, the question it actually answers: *which file do we draw?*

**The boundary folds too.** `map:openP99` applies `placeName` in the IPC handler rather than trusting
its caller, because it is the last point before an external URL and a wrong name there is a 404 rather
than a visible mistake.

**A difficulty change is not travel.** The follow-me effect compares by `samePlace`, so only a change
of place puts the map back on you.

**The difficulty is shown, not merely preserved.** It is already *kept* — kill records, stored fights
and pooled observations hold the log's wording verbatim (ADR 0083), so `zoneDifficulty` recovers it
retroactively from anything ever recorded, which is what makes it available for analytics. What was
missing is that folding the map's name would have made it invisible in the one window that used to
show it. So `zoneDifficultyLabel` (`shared/names.ts`) names the tier — the supplied table D0–D4, with
the log's own ruleset tag winning wherever it wrote one — and the map's titlebar carries it as its own
token beside the name: **`🗺 Blackburrow · D3 Fused`**. The name says which map; the token says which
copy of the zone. This answers the last consequence bullet of ADR 0057, which noted that nothing yet
showed the difficulty as a distinct figure.

Rejected alternatives:

- **Fold inside `findZone`, returning a synthetic `Zone` for an unmapped place.** Makes "we have a map
  for this" untrue of a `Zone`, and that predicate is what decides whether a canvas is drawn at all.
- **Fold at the log watcher, so `currentZone` never carries a difficulty.** Cheapest, and it destroys
  the difficulty for every consumer — the exact mistake ADR 0057 rejected. The wording has to survive
  to the recorder.
- **Leave the fallbacks and rely on `samePlace` at every read.** What the code was already doing, and
  the reason a pin's stored `zone` and a wiki URL were wrong: a *filter* being generous doesn't fix a
  *key* that was written wrong.
- **Show the difficulty inside the title** (`Blackburrow 3`). Reads as the name, which is precisely the
  confusion — and it would be the one string a reader might copy into the picker.

## Consequences

- A zone with no map file behaves like one place at every difficulty: one set of pins, one kill scope,
  one mob panel, one working wiki link. Pins already stored under a raw name still show, because the
  read side matches by `samePlace` and always did — they simply stop being *created* that way.
- The map window names the zone one way in all six places it names it.
- The difficulty gained a display, and with it a first real consumer for `zoneDifficulty`. A tier past
  the supplied table reads as a bare `D7` rather than being dropped, so a build that adds one is
  legible without a code change.
- `mapZoneName` scans the zone list per call, like the `findZone` idiom it replaces — unchanged cost,
  and the one hot caller (`zoneMatch`, once per marker) was already paying it.
- The rule is now enforceable by reading imports: a new map reference that folds nothing is a call to
  `findZone` outside `zones.ts`, and there is exactly one of those.
