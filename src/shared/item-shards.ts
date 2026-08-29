/**
 * item-shards.ts — dividing the item catalogue so a room fills it once between them.
 *
 * [ADR 0153](../../specs/decisions/0153-the-catalogue-is-filled-by-a-gentle-trickle.md) made the
 * catalogue fillable: 11,136 wiki pages, one a second, about three hours. That is the right cost for
 * *one* person and the wrong cost for five, who between them would fetch the same eleven thousand
 * pages five times over — 55,000 requests to produce five identical caches
 * ([ADR 0160](../../specs/decisions/0160-a-room-fills-the-catalogue-once.md)).
 *
 * So the roster is cut into **shards**, and the room divides them up: you fetch the shards nobody
 * has, you *ask* for the shards somebody already has, and the wiki is asked for each page once
 * across the whole room rather than once per person.
 *
 * ## Why a hash and not a slice
 *
 * The obvious division — "you take the first two thousand titles, I'll take the next" — needs every
 * peer to agree on the *order and length* of the roster, and they do not: rosters are fetched at
 * different times, the category gains pages, and a `continue` cursor can return them differently.
 * One page added at the front would shift every index and silently re-map everybody's claims onto
 * each other's work.
 *
 * A shard is therefore a **property of the title itself** — `shardOf("Rusty Short Sword")` is the
 * same number on every install, for ever, with no agreement needed and nothing to synchronise. Two
 * peers with different rosters still agree completely about which shard any title they *both* have
 * belongs to.
 *
 * ## Why 1024
 *
 * It makes a shard about eleven pages: small enough that one shard fits comfortably in a single
 * peer-to-peer message (~15 KB), which is what lets this feature exist without the chunked bulk
 * transfer the [peers](../../specs/peers/README.md) spec correctly says we do not have. And 1024
 * bits of coverage is 128 bytes — 256 characters of hex — so "here is everything I hold" is a field
 * in a message that was already being broadcast, not a transfer of its own.
 *
 * ## Completeness is always self-assessed
 *
 * A peer marks a shard held when it holds **every title in its own roster** for that shard — never
 * because somebody said so. So a peer whose roster has one title more than yours can hand you their
 * shard, you notice you are still one short, and you fetch that one page yourself. Disagreement
 * about the roster costs a page, never a hole.
 *
 * Pure and DOM-free: no sockets, no storage, no clock beyond what is passed in.
 */

/**
 * How many shards the roster is cut into. **Changing this invalidates every coverage bitmap in the
 * room**, so it is a protocol constant rather than a tuning knob — see the module note for the two
 * measurements that set it.
 */
export const SHARD_COUNT = 1024;

/** Bytes in a coverage bitmap. */
const COVERAGE_BYTES = SHARD_COUNT / 8;

/**
 * How long a peer's "I am fetching this one" claim is believed.
 *
 * A shard is about eleven pages, so at the gentlest pace it takes well under a minute — but a peer
 * that crashes mid-shard must not reserve it for ever. Long enough to cover a slow shard, short
 * enough that a dead peer's claim clears before anybody notices.
 */
export const CLAIM_TTL_MS = 3 * 60 * 1000;

/**
 * The fold applied before hashing: lowercase, trimmed, inner whitespace collapsed.
 *
 * **This rule must never change.** It is not a display or matching decision — it decides which shard
 * a title lands in, and a room where two versions disagree about that would have peers claiming to
 * hold shards whose contents they do not share. Deliberately *not* `normalizeItemName`: that one is
 * free to evolve as the app learns more about how EQ writes item names, and this one is not.
 */
function foldTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * FNV-1a, 32-bit. Short enough to read, fast, and — the part that matters — trivially identical in
 * any language anybody might later reimplement this in.
 */
function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    // The FNV prime by shift-and-add: `h * 16777619` overflows a double's exact integer range.
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/**
 * MurmurHash3's 32-bit finalizer — the avalanche step, and it is not optional here.
 *
 * FNV-1a alone is a perfectly good *bucketing* hash but a poor one to take a **minimum** over, which
 * is exactly what `rank` does: measured, 200 peer ids picking the lowest-ranked of 64 shards landed
 * on only 25 distinct ones, clustering hard. That is the failure this whole scheme is supposed to
 * prevent — peers agreeing about what to do next — so the bits get properly mixed before anybody
 * compares them. With the finalizer the same measurement uses nearly all of them.
 */
function mix32(x: number): number {
  x = (x ^ (x >>> 16)) >>> 0;
  x = Math.imul(x, 0x85ebca6b) >>> 0;
  x = (x ^ (x >>> 13)) >>> 0;
  x = Math.imul(x, 0xc2b2ae35) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) >>> 0;
}

const hash32 = (text: string): number => mix32(fnv1a(text));

/** Which shard a title belongs to. The same answer on every install, for ever. */
export function shardOf(title: string): number {
  return hash32(foldTitle(title)) % SHARD_COUNT;
}

/** A set of shards, one bit each. */
export type Coverage = Uint8Array;

export const emptyCoverage = (): Coverage => new Uint8Array(COVERAGE_BYTES);

export function hasShard(coverage: Coverage, shard: number): boolean {
  if (shard < 0 || shard >= SHARD_COUNT) return false;
  return (coverage[shard >> 3] & (1 << (shard & 7))) !== 0;
}

export function setShard(coverage: Coverage, shard: number, on = true): Coverage {
  if (shard < 0 || shard >= SHARD_COUNT) return coverage;
  if (on) coverage[shard >> 3] |= 1 << (shard & 7);
  else coverage[shard >> 3] &= ~(1 << (shard & 7));
  return coverage;
}

/** How many shards are set — what a "3% of the catalogue" figure is counted from. */
export function countShards(coverage: Coverage): number {
  let n = 0;
  for (const byte of coverage) {
    // Brian Kernighan's: one iteration per *set* bit, which on a mostly-empty bitmap is nearly none.
    for (let b = byte; b; b &= b - 1) n++;
  }
  return n;
}

/** The shards a set of titles falls into — how a roster becomes "which shards exist". */
export function coverageOf(titles: Iterable<string>): Coverage {
  const out = emptyCoverage();
  for (const title of titles) setShard(out, shardOf(title));
  return out;
}

/**
 * Hex, because it is the one encoding that needs no library and behaves identically in the main
 * process and a renderer. 256 characters for the whole catalogue's coverage — small enough to ride
 * along with a message that was already being sent.
 */
export function encodeCoverage(coverage: Coverage): string {
  let out = "";
  for (const byte of coverage) out += byte.toString(16).padStart(2, "0");
  return out;
}

/** The inverse, and **untrusted**: anything malformed reads as "they hold nothing", never as a throw. */
export function decodeCoverage(hex: unknown): Coverage {
  const out = emptyCoverage();
  if (typeof hex !== "string" || !/^[0-9a-f]*$/i.test(hex)) return out;
  for (let i = 0; i < COVERAGE_BYTES && i * 2 + 1 < hex.length; i++) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isFinite(byte)) out[i] = byte;
  }
  return out;
}

/** What one peer has told the room about its share of the work. */
export interface PeerCoverage {
  peerId: string;
  /** Shards they hold complete, by their own roster. */
  have: Coverage;
  /** The shard they are fetching from the wiki right now, if any — a claim, not a promise. */
  doing?: number;
  /** When they last said so, ms. A claim older than `CLAIM_TTL_MS` is ignored. */
  at: number;
}

/**
 * What to do next.
 *
 * `ask` and `fetch` are deliberately different actions rather than one "get shard N": asking a peer
 * costs the wiki nothing and takes a second, and fetching costs eleven requests and takes a minute.
 * A planner that blurred them would have no way to prefer the free one.
 */
export type ShardStep =
  | { action: "ask"; shard: number; from: string }
  | { action: "fetch"; shard: number }
  /** Every gap left is claimed by somebody else right now. Wait rather than duplicate their work. */
  | { action: "wait" }
  /** Nothing left to do — every shard the roster touches is held. */
  | { action: "done" };

/**
 * A per-peer ordering over shards, so two peers starting at the same instant with the same
 * information do not walk into each other.
 *
 * This is the mechanism that actually prevents duplicate pulls; the claims below are a refinement on
 * top of it. Without it, every peer would sort the gaps identically, all pick the lowest, and the
 * room would fetch one shard eight times and the rest never. Mixing the peer's own id into the rank
 * gives each of them a different pseudo-random walk over the same set, so they spread out with no
 * negotiation at all — and, being a pure function of `(shard, peerId)`, they do it without a single
 * extra message.
 */
function rank(shard: number, peerId: string): number {
  // The peer's id and the shard are mixed as *numbers* rather than concatenated as a string: FNV
  // consumes a string left to right, so `"57:peer-a"` and `"57:peer-b"` share a long prefix and end
  // up close together. Combining two already-hashed values and re-avalanching them does not.
  return mix32((fnv1a(peerId) ^ Math.imul(shard, 0x9e3779b1)) >>> 0);
}

/**
 * The next thing this peer should do, given what it holds and what the room says it holds.
 *
 * The order of preference is the whole decision:
 *
 *  1. **Ask a peer for a shard they have and we don't.** Free for us, free for the wiki, and it is
 *     how a newcomer to a room that has already done the work catches up in minutes instead of hours.
 *  2. **Fetch a shard nobody has**, chosen by our own rank so we are unlikely to pick what somebody
 *     else just picked, and skipping any shard a live claim covers.
 *  3. **Wait**, when every remaining gap is somebody's live claim. Waiting is the point: the
 *     alternative is fetching pages the room is already fetching, which is the thing this exists to
 *     stop.
 *  4. **Done.**
 */
export function planShardStep(opts: {
  /** Shards we hold every roster title for. */
  mine: Coverage;
  /** Shards our roster actually has titles in — a shard with nothing in it is not a gap. */
  present: Coverage;
  peers: readonly PeerCoverage[];
  myId: string;
  now: number;
  /**
   * "Have we asked this peer for this shard lately?" — injected rather than tracked here, because it
   * is about messages in flight and this module is pure.
   *
   * Without it a peer whose catalogue says they hold a shard but who never answers would be asked
   * for it on every pass, for ever, and the run would never reach the wiki. With it, the ask expires
   * and the shard falls through to being fetched like any other gap.
   */
  asked?: (shard: number, peerId: string) => boolean;
  /**
   * "Have we already fetched this shard through and still not completed it?"
   *
   * The guard against a shard that can never be finished. eqlwiki has pages in `Category:Items`
   * that 404 or won't parse, and a shard containing one is never *complete* — so without this the
   * planner hands it back for ever and the run spins on the same eleven pages, never reaching the
   * rest of the catalogue. Excluded from **fetching** only: a peer may well hold the page the wiki
   * refused us, so it stays worth asking for.
   */
  exhausted?: (shard: number) => boolean;
}): ShardStep {
  const { mine, present, peers, myId, now, asked, exhausted } = opts;

  const gaps: number[] = [];
  for (let shard = 0; shard < SHARD_COUNT; shard++) {
    if (hasShard(present, shard) && !hasShard(mine, shard)) gaps.push(shard);
  }
  if (!gaps.length) return { action: "done" };

  // 1. Anything a peer can just hand us. Whoever holds the most is asked first — not for fairness
  //    but because a peer far along is the one most likely to still be there for the next ask, and
  //    spraying one shard each at eight peers costs eight round trips to fill eight shards.
  const holders = [...peers].sort((a, b) => countShards(b.have) - countShards(a.have));
  for (const peer of holders) {
    const shard = gaps.find((s) => hasShard(peer.have, s) && !asked?.(s, peer.peerId));
    if (shard !== undefined) return { action: "ask", shard, from: peer.peerId };
  }

  // 2. Nobody has any of it, so somebody has to pay the wiki. Take ours in our own order, avoiding
  //    whatever the room is visibly working on and whatever we have already failed to complete.
  const fetchable = gaps.filter((s) => !exhausted?.(s));
  // Every gap left is one we have already tried and cannot finish. There is nothing further to do:
  // the run is as complete as this wiki allows, and saying `done` is what stops it spinning.
  if (!fetchable.length) return { action: "done" };

  const claimed = new Set<number>();
  for (const peer of peers) {
    if (peer.doing !== undefined && now - peer.at < CLAIM_TTL_MS) claimed.add(peer.doing);
  }
  const free = fetchable.filter((s) => !claimed.has(s));
  if (!free.length) return { action: "wait" };

  let best = free[0];
  let bestRank = rank(best, myId);
  for (const shard of free) {
    const r = rank(shard, myId);
    if (r < bestRank) {
      best = shard;
      bestRank = r;
    }
  }
  return { action: "fetch", shard: best };
}

/**
 * How much of the roster the room holds between it, and how much of that is ours.
 *
 * The number the panel leads with, because it is the one that says whether joining a room was worth
 * it: "the room has 94% of the catalogue" is a different and much more useful fact than "you have
 * 12%".
 */
export function roomCoverage(opts: {
  mine: Coverage;
  present: Coverage;
  peers: readonly PeerCoverage[];
}): { present: number; mine: number; room: number } {
  const between = emptyCoverage();
  for (let i = 0; i < COVERAGE_BYTES; i++) {
    let byte = opts.mine[i];
    for (const peer of opts.peers) byte |= peer.have[i];
    // Only shards the roster actually touches count towards either figure.
    between[i] = byte & opts.present[i];
  }
  const mineInPresent = emptyCoverage();
  for (let i = 0; i < COVERAGE_BYTES; i++) mineInPresent[i] = opts.mine[i] & opts.present[i];
  return {
    present: countShards(opts.present),
    mine: countShards(mineInPresent),
    room: countShards(between),
  };
}
