# 0047: Money is copper, counted in two ledgers

## Status

Accepted

## Context

248 lines of a real 13,000-line log were money and went unparsed, so the camp report answered
"is this camp worth it" with experience only — half the question. The log states money in three
places, and the differences between them turn out to matter more than the parsing:

```
You receive 3 silver and 2 copper from the corpse.                          ← the mob's money
You looted a Snake Egg from an asp's corpse and sold it for 4 copper.       ← the item's price
You receive 4 copper from that item.                                        ← the same 4 copper
```

Three things fall out of that.

**The log itself distinguishes the mob's money from an item's.** Not by naming them — neither
`You receive` line names a mob or an item — but by its tail: `from the corpse` versus `from that
item`. That distinction is real and worth keeping. "This gnoll carries 3 silver" and "this
gnoll's fangs vendor for 4 copper each" are different facts, gathered differently: coin is a
property of the *mob* and has to be averaged over kills, while a price is a property of the
*item* and holds wherever it dropped. Blend them into one number and neither survives — you can
no longer tell a mob that pays cash from one that drops good trash, which is exactly the
comparison a player is making when they pick a camp.

**An auto-sell states its coins twice.** The loot line prices the item, and a bare "from that
item" line repeats the amount. Summing both doubles every sale. Only the loot line names the
item, so only the loot line can answer "what does this fetch" — which settles which of the two
is the one to count.

**Denominations are how the log talks, not how the questions work.** Every use is arithmetic:
sum a session, divide by minutes, average over kills, compare two camps. Four parallel counters
(platinum/gold/silver/copper) would need normalising at every one of those, and any two places
that normalised differently would disagree.

Attribution is the hard part, because a coin line names nothing. Experience has the same problem
and is credited to the most recent kill ([ADR 0017](./0017-camp-efficiency-and-asking-the-player.md));
coin needs a variant of that, but coin arrives when the player gets round to looting, not the
second the mob dies.

## Decision

**Coin is an integer count of copper, everywhere.** `src/shared/money.ts` owns the conversion
(1p = 10g = 100s = 1000c) and is the only place denominations exist: `parseCoins` reads the log's
prose, `formatCoins` writes it compactly for a table, `describeCoins` writes it in full for a
hover. Nothing rounds, because copper is the smallest unit the game has. The todo asked for a
"money type rather than a bare number" — this is that type, with the denominations preserved in
the formatter rather than in four fields that could drift apart.

**Two ledgers, kept apart to the surface.** Every money figure carries both: `copper` for coin
off corpses, `soldCopper` for what auto-sold drops fetched. They are only ever summed at the
point of display, and only where the sum is the actual question — an evening's income, a mob's
coin-per-minute. Per-mob and per-item figures stay split, and a hover always says which is which.

**`CoinEvent.from` is load-bearing.** `parseCoin` records whether the money came off a corpse or
an item, and everything downstream branches on it: `from: "item"` is dropped by both the mob
ledger and the session ledger, because the loot line already counted those coins. Nothing
re-reads the sentence to work this out.

**A price comes from the auto-sell line, not the coin line.** `LootEvent.soldFor` is parsed at
the boundary alongside the item name. Per-item prices are then **derived** from the loot ledger
already on disk (`lootLog.prices()`) rather than kept in a second store — the same
"one record, nothing to drift" argument as
[ADR 0016](./0016-combat-history-and-spell-analytics.md).

**Corpse coin is placed by what the log was doing, in two steps.** First choice: the corpse an
item was taken from moments earlier (within 10s) — coin and items come off a corpse together, so
an item line names the payer, and a name beats any timing argument. Failing that: the newest kill
of *yours* inside the two-minute loot window. Strangers' corpses are never candidates; you didn't
loot them. Coin that finds no corpse still counts towards the session total and is simply not
attributed to a mob.

**Per-mob coin is learned knowledge, like a drop rate.** It's stored on the `KillRecord`, rolls
into `MobObservation.copper`, and pools with peers by addition — so `copperPerKill` across a group
is one bigger sample, never an average of averages ([ADR 0024](./0024-mob-knowledge.md)). Coin you
took is also proof the corpse was yours, so it counts a kill someone else landed, exactly as a
drop does ([ADR 0027](./0027-only-your-kills-count.md)).

## Consequences

The camp report can answer the money half of "is this camp worth it": coin and coin-per-minute
per mob this session, coin-per-minute per zone across all history, and coin plus coin-per-hour on
the Session tab. The Loot tab gains a prices table — what your trash is actually worth, from your
own sales. The mob panel shows coin-per-kill beside the drop rates.

**Two attribution guesses are now in the code, and they fail differently.** A sale is exact — the
item names its corpse. Corpse coin is inferred, and in a busy camp where several mobs died within
the window it can land on the wrong one. The failure is bounded (the session total is always
right; only the per-mob split can be wrong) and it self-corrects across many kills, which is the
only figure per-mob coin is ever read as. It is still a guess, and the reason coin and sales are
not merged into one column: one of them is evidence and the other is an estimate.

**Under-counting is the chosen way to be wrong.** A coin line's dedup key is its timestamp and
amount — that's the whole identity available — so two identical amounts in the same second
collapse into one. Doubling money on every re-import would be worse, and invisible.

**Fights recorded before this have no coin figures**, so an all-time zone table reads low until
its history turns over. The tooltip says so. Eating an old log *does* backfill per-mob coin, since
that goes through the kill log like a drop rate.

Twenty-seven new tests cover the money helpers, the coin grammar, both attribution paths, the
double-count guard and the pooling; the suite is 396 green. What none of them prove is the
wording: the "from that item" form is recorded in the todo's note of a real log and is now in
this repo's fixture, but it came from that log rather than from a line re-read since. If money
reads low in a real session, that tail is the first thing to check — see the
[manual QA checklist](../testing/manual-qa.md).
