# 0381: A sale for free is a price of zero

## Status

Accepted

## Context

The auto-sell line states what the vendor paid, and when it paid nothing it says so in words: `You looted a
Micro Servo from a clockwork's corpse and sold it for free.` `parseCoins` finds coins in text and, with none
to find, returns `null`, so the line came out as a sale with no price. Everything downstream treats "no price"
as "unknown": `soldFor` was stored as `NULL`, and `priceOfRow` — which falls back to re-reading the detail text
for old rows — read "free" as no coin as well and **skipped the row**.

In the real 94 MB log that is 441 of its 4,788 sales (9%), and the items that only ever sold for free could not
appear in the Sells-for table at all: 84 item names, grade variants included (a Micro Servo, a Sealed Note, a
Black Silk Gloves +2). The app's own convention is the opposite — "Nothing at all reads as `0c` … so a real zero
can't be mistaken for a gap in the data" (`formatCoins`) — and the log had stated the price exactly.

## Decision

- **`parseSalePrice` reads an auto-sell's tail**: its coins, or zero for the whole word `free` (any case), or
  `null` for anything that names neither. `parseCoins` stays what it was — coins in text — because "free" is the
  game's word for a vendor price, not a coin amount.
- **The parser and the price table both use it.** `parseLoot` stores `soldFor: 0` for a free sale, and
  `priceOfRow` reads `free` from the detail of a row already stored with a `NULL` price. The ledger needed no
  migration: the 441 existing rows are priced the next time prices are computed.
- **The Loot table shows a zero price as `0c`**; only a row with no price at all shows the dash.

## Consequences

- On a copy of the real ledger: items priced go from 618 to 702; the 84 new ones are all 0c, from 441 sales;
  none dropped out. No item was both sold for free and sold for coin, so no existing price moved.
- Prices for an item that does vendor sometimes for nothing and sometimes for coin (one that exists at several
  grades) now average the free sales in, which is what its sales were.
- Nothing else reads `soldFor` as a truth value except the session coin tally, which already ignores a zero.
