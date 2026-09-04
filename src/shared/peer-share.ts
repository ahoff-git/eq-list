/**
 * peer-share.ts — what one install will hand another, and what it takes on the way in.
 *
 * The room stopped being the channel in
 * [ADR 0141](../../specs/decisions/0141-the-room-is-a-meeting-place.md): a peer broadcasts a small
 * **catalogue** of what it has, and the data itself travels peer-to-peer on request. This module is
 * the pure half of that — the table of kinds, the three message shapes, a reader per kind, and the
 * two de-dupes — with no sockets, no storage and no clock, so every rule in it is a black box the
 * host, the main process and the panel all agree on rather than three approximations of.
 *
 * ## Three families, and why the table says which
 *
 * Every rule here follows from which family a kind is in, so `SHARE_KINDS` states it once:
 *
 *   - **authored** — somebody *made* it. Asked for by a person, landed in a tray, never applied on
 *     arrival. It is the one family where merging silently would change what the app *does*.
 *   - **observation** — pooled, and filed by `electron/contributions.ts` under the contributor who
 *     sent it. Tagging is not decoration: it is what makes "filter this one out later" possible at
 *     all ([ADR 0132](../../specs/decisions/0132-a-contribution-is-keyed-by-who-made-it.md)).
 *   - **live** — true on somebody else's machine right now. Held in memory, dropped with the peer.
 *   - **mirror** — neither made nor observed: a copy of a *third party's public page*, which anyone
 *     could fetch for themselves and which says the same thing to everyone. It is the only family
 *     applied silently on arrival, and it can be, because there is nothing personal in it and nothing
 *     it changes about what the app does — it fills a cache that would otherwise be filled by asking
 *     eqlwiki the same question a second time
 *     ([ADR 0160](../../specs/decisions/0160-a-room-fills-the-catalogue-once.md)). It is also the one
 *     family that is *checkable*: a page that looks wrong can be re-fetched from the source, and the
 *     TTL does exactly that on its own.
 *
 * ## Everything inbound is untrusted
 *
 * The same stance [watch-share.ts](./watch-share.ts) took for the clipboard, for the same reason and
 * mostly with the same code: unknown keys dropped, every value checked against what the type
 * actually allows, strings clamped, lists capped, ids regenerated where an id could collide. A kind
 * with no `read` cannot be received — which is the point of driving receipt off this table rather
 * than off a switch somewhere, since a kind added without a reader then fails closed instead of
 * arriving unchecked.
 */
import type {
  CastWatch,
  HighScore,
  ItemSource,
  KillRecord,
  KnownSpawn,
  NamedAlertStyle,
  ShoppingListEntry,
  SourceKind,
  WikiComponent,
  WikiPage,
  WikiPageKind,
} from "./types";
import type { MobObservation } from "./mob-stats";
import type { SharedKill } from "./kill-filters";
import type { BuffInstance, BuffRiseSource } from "./buff-tracking";
import type { RespawnLearning, SpawnTimer } from "./spawn-timers";
import { ON_PET, ON_UNKNOWN, ON_YOU, instanceKey } from "./buff-tracking";
import { decodeWatches } from "./watch-share";
import { PIN_TYPES, type MapPin, type PinKind } from "./map/pins";
import { SHARD_COUNT } from "./item-shards";
import { isPlottable } from "./kill-confidence";

/**
 * An item page as it crosses between peers.
 *
 * `fetchedAt` **travels with it**, which is the difference between a room that keeps itself fresh
 * and one whose cache is immortal: if each receiver stamped its own "now", a page could pass A → B →
 * C for months and never once be re-checked against the wiki. It is clamped on arrival to no later
 * than the receiver's own clock (`readSharedPage`), so the worst a peer can do with it is tell the
 * truth or make their copy look *older* than it is — and an older copy is simply re-fetched.
 */
export type SharedItemPage = Omit<WikiPage, "fetchedAt"> & { fetchedAt?: string };

/**
 * A `/time` reading as it crosses between peers — the same fact, whoever's log it came from.
 *
 * `at` **travels with it**, the same reasoning `SharedItemPage.fetchedAt` carries: a reading is only
 * worth anything next to the moment it was true, and a receiver stamping its own "now" on arrival
 * would turn every reading into "just now" — a ten-minute-old anchor would look as fresh as one from
 * this instant. Optional for the same reason `fetchedAt` is: absent, unreadable, or claiming a
 * moment later than the receiver's own clock (`readStamp`) is treated as "just now" on the way in —
 * the worst that fallback can do is make a stale reading look newer than it is, which a
 * same-or-newer-only merge rule already treats as no stronger a claim than that.
 */
export interface SharedGameTime {
  hour: number;
  at?: string;
}

// ─── The catalogue ──────────────────────────────────────────────────────────

export type ShareFamily = "authored" | "observation" | "live" | "mirror";

export type ShareKind =
  | "watches"
  | "styles"
  | "lists"
  | "pins"
  | "mobs"
  | "kills"
  | "respawns"
  | "timers"
  | "buffs"
  | "scores"
  | "items"
  | "gameTime";

/**
 * What the sender knows that a projection needs and a row does not carry.
 *
 * Only a name today, and it is here rather than passed as a bare string because the thing it is
 * needed for — resolving `ON_YOU` before a buff leaves — is a rule about *who the sender is*, and a
 * second such rule would otherwise arrive as a second positional argument on every projection.
 */
export interface ShareContext {
  /** The sender's display name, as the room sees it. */
  myName: string;
}

/**
 * One shareable kind: what it is, which family's rules it plays by, and how to read one off the
 * wire.
 *
 * `read` takes the raw rows a peer sent and returns only what survives checking — never throws,
 * never half-applies. `newId` is passed in rather than reached for, the same way `decodeWatches`
 * takes it: ids come from `crypto.randomUUID()` in a renderer and a test wants to know what it is
 * asserting on.
 *
 * ## Why identity and projection are on the table too
 *
 * `read` says what a row must survive to be *received*. It said nothing about what a row **is** or
 * what leaves, and both of those were written by hand somewhere else: the kill projection lived in
 * `shareSources` (and again, near enough, in the map window), the buff projection was a special case
 * inside the hub's `outbound`, and no kind stated its identity at all — which is why a `give` could
 * only ever be the whole kind. Stating all three here is what lets one hub serve every kind without
 * knowing what any of them are.
 */
export interface ShareKindSpec<T = unknown> {
  key: ShareKind;
  family: ShareFamily;
  /** Tab/toggle wording. */
  label: string;
  /** One line under the toggle, saying what the other person actually gets. */
  blurb: string;
  /** Singular noun for counts ("12 watches", "1 watch"). */
  noun: string;
  read: (rows: unknown, newId: () => string) => T[];
  /**
   * **What this row is**, as a string that is the same on two installs holding the same fact.
   *
   * The unit a delta is expressed in: a `give` that names changed rows has to name them, and a
   * receiver merging one has to know which held row it replaces. Content-derived wherever an id
   * would not survive the crossing — every `authored` kind has its ids **regenerated** by `read`
   * (`newId`), so a sender's `id` means nothing on the far side and keying on it would make every
   * row look new for ever.
   *
   * `undefined` for a row this kind cannot identify, which is not an error: such a row is simply
   * never sent as a delta, and its kind falls back to being sent whole.
   */
  rowKey?: (row: T) => string | undefined;
  /**
   * **What leaves**, given what we hold.
   *
   * The last chance to drop rows that are ours rather than the room's, and to reduce a row to the
   * conclusion the receiver can actually use. Absent means the rows travel as they are.
   *
   * Runs *before* identity and before the digest, so a change to a field that never leaves does not
   * make a row look changed — which is the difference between a delta that carries an evening's real
   * news and one that carries every local edit to a field nobody else can see.
   */
  project?: (rows: readonly unknown[], context: ShareContext) => unknown[];
  /**
   * Whether this kind is shared when nobody has said either way. **Off for everything but `items`.**
   *
   * Every other kind is *yours* — what you made, what you saw, what is true on your machine right
   * now — and a share of those has to be a decision somebody took. An item page is none of those: it
   * is a copy of a public eqlwiki page, byte-identical on every install, containing nothing about you
   * at all. There is nothing for "off by default" to protect, and a room where everybody has to find
   * a toggle before the network can divide the work is a room that mostly doesn't
   * ([ADR 0161](../../specs/decisions/0161-a-public-page-is-shared-by-default.md)).
   *
   * The toggle still exists and still works; only its resting position differs.
   */
  defaultOn?: boolean;
}

/** Caps. Generous for real use, small enough that a hostile peer can't be a denial of service. */
const MAX_ROWS: Record<ShareKind, number> = {
  watches: 50,
  styles: 50,
  lists: 500,
  pins: 500,
  mobs: 5000,
  kills: 5000,
  respawns: 2000,
  timers: 200,
  buffs: 200,
  scores: 200,
  // One shard is about eleven pages (`item-shards.ts`); the cap is generous headroom for an uneven
  // hash while still bounding what a single hostile `give` can cost us.
  items: 64,
  // There is only ever one clock — a second row would just be a lie somebody sent.
  gameTime: 1,
};

/**
 * Longest an item page's own text may be. Larger than `MAX_TEXT` because these are not names: a card
 * line is a whole tooltip row, and a source's `detail` is a zone with a revamp tag on it.
 */
const MAX_PAGE_TEXT = 400;

/** Caps within one shared page, so a single row cannot be a denial of service on its own. */
const MAX_PAGE_LINES = 40;
const MAX_PAGE_SOURCES = 60;
const MAX_PAGE_PARTS = 60;
/** Kael Drakkel lists 508 NPCs, the largest measured — so the cap is generous but still a cap. */
const MAX_PAGE_NPCS = 1000;

/** Longest any free-text field may be once it's ours. Matches `watch-share.ts`. */
const MAX_TEXT = 200;

// ─── Identity, one per kind ─────────────────────────────────────────────────

/**
 * Join the parts of a composite key. NUL-separated for the reason `kill-log.ts`'s `killKey` uses
 * one: a separator a name can contain is a separator a name can forge a collision with.
 *
 * Written as an **escape** rather than as the byte itself, which is the one thing not copied from
 * there: a literal NUL makes the whole file read as *binary* to git and to grep, and this one holds
 * a wire protocol whose diffs have to stay readable.
 */
const rowKeyOf = (...parts: (string | number | undefined)[]): string => parts.join("\u0000");

/**
 * A shopping-list entry, keyed the way `store.ts` keys one: **name plus origin**.
 *
 * Not `id`, which `readListEntry` regenerates on arrival, and not name alone — the same item can
 * legitimately sit under two quests, and folding those together would make one of them vanish from
 * a delta the first time the other changed.
 */
function listEntryKey(row: unknown): string | undefined {
  if (!isRecord(row) || typeof row.name !== "string") return undefined;
  const origin = isRecord(row.origin) ? rowKeyOf(str(row.origin.kind), str(row.origin.name)) : "";
  return rowKeyOf(row.name.toLowerCase(), origin);
}

/** A field-derived key, for a kind whose rows carry a usable one already. */
function fieldKey(row: unknown, field: string): string | undefined {
  if (!isRecord(row)) return undefined;
  const v = row[field];
  return typeof v === "string" && v ? v : undefined;
}

// ─── Projection, one per kind ───────────────────────────────────────────────

/**
 * The kills worth sharing, reduced to what a receiver can draw.
 *
 * **The one statement of this rule.** It was written twice — once here on the way out and once in
 * the map window to decide what to plot — and two copies of "which kills are worth a dot" is exactly
 * the sort of thing that drifts a threshold at a time.
 *
 * Two exclusions, and both are about not echoing:
 *
 *   - **Only your own.** A peer's kill re-shared under our name grows with every hop, and three
 *     clients in a room send it round for ever. `sharedBy` is the guard.
 *   - **Only placeable ones.** A position we haven't got is nothing the receiver can draw, so it is
 *     weight on the wire and a row in their store for no gain.
 */
export function shareableKills(kills: readonly KillRecord[]): SharedKill[] {
  const out: SharedKill[] = [];
  for (const k of kills) {
    if (k.sharedBy || !isPlottable(k)) continue;
    const zone = k.zone ?? "";
    if (!zone) continue;
    out.push({ zone, y: k.y, x: k.x, mob: k.mob, confidence: k.confidence });
  }
  return out;
}

/**
 * A learned respawn as it crosses — the conclusion, and none of the workings.
 *
 * Distinct from `RespawnLearning` on purpose: the two fields it lacks are `gaps` (the evidence, which
 * stays on the machine that saw it) and `crossedDifficulty` (a count of what *our* rule threw out,
 * which would be a sentence about a night the receiver never sat through). `readRespawn` fills both
 * with empties on arrival rather than letting a peer state them.
 */
export type SharedRespawn = Omit<RespawnLearning, "gaps" | "crossedDifficulty">;

/**
 * A learned respawn, reduced to the **conclusion**.
 *
 * A `KnownSpawn` also carries what this install decided *about* the camp — whether it alerts, what
 * it wears, how much padding somebody likes — and that is a setting, not an observation. `gaps` goes
 * for the reason a shared kill carries no time: the evidence stays on the machine that saw it, and
 * what travels is what it proved.
 */
export function shareableRespawns(known: readonly KnownSpawn[]): SharedRespawn[] {
  return known.map((k) => ({
    key: k.key,
    mob: k.mob,
    place: k.place,
    shortestSeconds: k.shortestSeconds,
    longestSeconds: k.longestSeconds,
    samples: k.samples,
    lastKillAt: k.lastKillAt,
  }));
}

/**
 * The kinds, in the order the Peers tab lists them: authored first (the things a person chose to
 * make), then what gets pooled, then what is merely true right now.
 */
export const SHARE_KINDS: ShareKindSpec[] = [
  {
    key: "watches",
    family: "authored",
    label: "Watch rules",
    blurb: "Your cast/log alert rules, without their looks — a rule travels, a style doesn't.",
    noun: "rule",
    read: (rows, newId) => readWatches(rows, newId),
    // **No identity, deliberately.** A rule has no name and no id that survives the crossing
    // (`readWatch` regenerates ids), and what is left — a spell, a message, a list of conditions —
    // is the whole rule rather than a handle on it. Keying on all of it would just be the content
    // digest the hub already falls back to, spelled out at greater length and with more ways to
    // disagree with `readWatch`'s clamping.
    //
    // Nothing is lost by it: the fallback is correct because keys **travel** rather than being
    // re-derived, and a delta would buy almost nothing on a kind capped at fifty rows that is only
    // ever fetched because somebody clicked.
  },
  {
    key: "styles",
    family: "authored",
    label: "Alert styles",
    blurb: "Your saved named looks — colour, sound, position, how long a banner stays up.",
    noun: "style",
    read: (rows, newId) => readList(rows, MAX_ROWS.styles, (raw) => readStyle(raw, newId)),
    // A named look is its name; ids are regenerated on arrival like every authored kind's.
    rowKey: (row) => (isRecord(row) ? fieldKey(row, "name") : undefined),
  },
  {
    key: "lists",
    family: "authored",
    label: "Shopping list",
    blurb: "What you're collecting and what it's for — counts reset, so it arrives as a fresh list.",
    noun: "entry",
    read: (rows, newId) => readList(rows, MAX_ROWS.lists, (raw) => readListEntry(raw, newId)),
    rowKey: listEntryKey,
  },
  {
    key: "pins",
    family: "authored",
    label: "Map pins",
    blurb: "Markers you've dropped on zone maps — camps, spawn points, warnings.",
    noun: "pin",
    read: (rows, newId) => readList(rows, MAX_ROWS.pins, (raw) => readPin(raw, newId)),
    // Where it is, in which zone, on which layer — a pin has no identity apart from its place.
    rowKey: (row) =>
      isRecord(row) ? rowKeyOf(str(row.zone), num(row.layer) ?? "", num(row.y) ?? "", num(row.x) ?? "") : undefined,
  },
  {
    key: "mobs",
    family: "observation",
    label: "Mob observations",
    blurb: "Drop counts, coin and roam areas — tallies, never your kills or your movements.",
    noun: "tally",
    read: (rows) => readList(rows, MAX_ROWS.mobs, readMobObservation),
    // Mob and zone **verbatim**, which is what `observeMobs` tallies by — the fold to a place is
    // `mergeObservations`' job on read, and keying a delta by the folded name would make two
    // spellings of a camp overwrite each other on the wire (ADR 0083).
    rowKey: (row) => (isRecord(row) ? rowKeyOf(str(row.mob), str(row.zone)) : undefined),
  },
  {
    key: "kills",
    family: "observation",
    label: "Kill positions",
    blurb: "Where things died, for a pooled heatmap. Carries no time and no loot.",
    noun: "position",
    read: (rows) => readList(rows, MAX_ROWS.kills, readSharedKill),
    project: (rows) => shareableKills(rows as readonly KillRecord[]),
    // A shared kill carries no time and no id, so its place *is* its identity.
    rowKey: (row) =>
      isRecord(row) ? rowKeyOf(str(row.zone), str(row.mob), num(row.y) ?? "", num(row.x) ?? "") : undefined,
  },
  {
    key: "respawns",
    family: "observation",
    label: "Respawn intervals",
    blurb: "How long a named took to come back, measured at your camp — the shortest gap you saw.",
    noun: "interval",
    read: (rows) => readList(rows, MAX_ROWS.respawns, readRespawn),
    project: (rows) => shareableRespawns(rows as readonly KnownSpawn[]),
    // `key` is the camp — one mob, one place — and is already the identity everything learned about
    // a respawn is filed under.
    rowKey: (row) => fieldKey(row, "key"),
  },
  {
    key: "timers",
    family: "live",
    label: "Running countdowns",
    blurb: "Clocks ticking at your camp right now, so the people sitting with you see the same one.",
    noun: "countdown",
    read: (rows) => readList(rows, MAX_ROWS.timers, readTimer),
    // The camp plus the death that started this clock. **Not `id`**, which is `key#slot` — local
    // bookkeeping that `readTimer` deliberately drops, so it is not a thing that exists on both
    // sides of the wire. The de-dupe that decides whether two peers' clocks are the same spawn is
    // `mergeTimers`, and stays there; this only has to tell one clock from another.
    rowKey: (row) => (isRecord(row) ? rowKeyOf(str(row.key), str(row.killedAt)) : undefined),
  },
  {
    key: "buffs",
    family: "live",
    label: "Buff board",
    blurb: "What's up on you and your pet, and what's lapsed. Nothing about anyone else.",
    noun: "buff",
    read: (rows) => readList(rows, MAX_ROWS.buffs, readBuff),
    // `ON_YOU` is resolved **before it leaves**, because only the sender knows whose board it is.
    // This is the outbound half of the rule `readBuff` enforces on the way in.
    project: (rows, context) => shareableBuffs(rows as readonly BuffInstance[], context.myName),
    // The same key the buff board files an instance under: what it is a buff of, and whose.
    rowKey: (row) => (isRecord(row) ? instanceKey(str(row.key), str(row.target)) : undefined),
  },
  {
    key: "scores",
    family: "live",
    label: "High scores",
    blurb: "Your personal bests, to sit beside other people's. Nothing merges into your board.",
    noun: "score",
    read: (rows) => readList(rows, MAX_ROWS.scores, readScore),
    // One record per category, which is what a board is.
    rowKey: (row) => fieldKey(row, "categoryId"),
  },
  {
    key: "items",
    family: "mirror",
    label: "Item pages",
    blurb:
      "Your cached eqlwiki item pages, so a room fills the 11,136-page catalogue once between everyone instead of each of you fetching all of it.",
    noun: "page",
    defaultOn: true,
    read: (rows) => readList(rows, MAX_ROWS.items, readSharedPage),
    // A page is its title. Stated for completeness rather than for use: `items` is addressed by
    // **shard** and never as "the whole kind" (ADR 0160), so it is the one kind a delta never runs
    // over — a shard is already the small unit a delta would otherwise have to invent.
    rowKey: (row) => fieldKey(row, "title"),
  },
  {
    key: "gameTime",
    family: "mirror",
    label: "Time of day",
    blurb:
      "The in-game clock's last known reading, so a room's own /time calls keep everyone's clock accurate without everyone having to type it themselves.",
    noun: "reading",
    // `mirror`'s other reason for defaulting on: this is a fact about the server, not about you
    // (ADR 0161's argument, unchanged) — there is nothing here "off until asked" would protect.
    defaultOn: true,
    read: (rows) => readList(rows, MAX_ROWS.gameTime, readSharedGameTime),
    // Always the same row — there is only one clock, so nothing needs a content-derived identity.
    rowKey: () => "gameTime",
  },
];

const BY_KEY = new Map<string, ShareKindSpec>(SHARE_KINDS.map((k) => [k.key, k]));

/** The spec for a kind, or `undefined` for a kind we don't know — which is how receipt fails closed. */
export function shareKind(key: string): ShareKindSpec | undefined {
  return BY_KEY.get(key);
}

/** The kinds in one family, in catalogue order. */
export function kindsOf(family: ShareFamily): ShareKindSpec[] {
  return SHARE_KINDS.filter((k) => k.family === family);
}

/** Which toggles are on, by kind. A kind absent (or false) is not shared. */
export type ShareSettings = Partial<Record<ShareKind, boolean>>;

/**
 * Is this kind switched on?
 *
 * An explicit answer always wins, in both directions — the point of a toggle is that turning it off
 * stays off. Only the *absence* of one falls through to the kind's own default, which is off for
 * everything except public wiki pages (see `ShareKindSpec.defaultOn`).
 */
export function sharing(settings: ShareSettings | undefined, key: ShareKind): boolean {
  const said = settings?.[key];
  if (typeof said === "boolean") return said;
  return BY_KEY.get(key)?.defaultOn === true;
}

// ─── The three messages ─────────────────────────────────────────────────────

/**
 * One line of a peer's catalogue: how many rows they hold, and a revision that moves when they do.
 *
 * `rev` is a number **the sender chooses**, so it is a hint and not a guarantee — a peer that never
 * moves it is never re-fetched. That's acceptable in a co-operative room of players; the fetcher
 * rate-limits per peer per kind rather than trying to be clever about it (ADR 0141).
 */
export interface ShareEntry {
  n: number;
  rev: number;
  /**
   * `items` only: which **shards** of the item catalogue this peer holds, as hex
   * ([`item-shards.ts`](./item-shards.ts)).
   *
   * It rides in the catalogue rather than being a message of its own because it is 256 characters
   * and the catalogue was already being broadcast every minute. That is the whole coordination
   * channel: from this, every peer can work out what the room is missing without anybody asking
   * anybody anything ([ADR 0160](../../specs/decisions/0160-a-room-fills-the-catalogue-once.md)).
   */
  cover?: string;
  /**
   * `items` only: the shard this peer is fetching from the wiki right now — a claim, so nobody else
   * spends eleven requests on the same pages. A hint with a TTL, not a lock: a peer that dies mid
   * shard releases it by going quiet.
   */
  doing?: number;
  /**
   * Which **run** of the sender the `rev` counts within (see `ShareEpoch`).
   *
   * Absent from a peer too old to send one, which is exactly what makes the delta protocol safe to
   * deploy into a room of mixed builds: no epoch means no delta, and everything falls back to the
   * whole-kind exchange that has always worked.
   */
  epoch?: string;
}

/**
 * A sender's **run**, so a revision can be trusted to mean something.
 *
 * A `rev` is a counter, and a counter that restarts is a counter that lies: after a restart our
 * seventh revision and the one a peer remembers as "7" describe different data, and a delta computed
 * against it would silently skip everything that changed in between. The epoch is what makes that
 * detectable — it changes whenever the counter does not continue, so a peer holding a `since` from a
 * different epoch is told plainly that its number means nothing here and given the whole kind.
 *
 * **Deliberately per-run and not persisted.** A restart already costs one full exchange today — the
 * revision counters start from zero every launch — so keeping this in memory changes nothing about
 * what a restart costs, and buys the whole feature without a single store having to learn to write a
 * sequence number to disk. What deltas save is the *evening*: a room sitting together for four hours
 * exchanging one changed tally at a time, rather than five thousand once a minute.
 */
export type ShareEpoch = string;

/**
 * What this build can say and understand on the wire.
 *
 * **Not the app version**, for the reason [`data-provenance.ts`](./data-provenance.ts) spells out at
 * length about its own revisions: CI stamps a build number into every push to `main`
 * ([ADR 0064](../../specs/decisions/0064-every-build-has-a-number.md)), so `0.1.41` becomes `0.1.42`
 * for a CSS change. Comparing app versions would tell everybody in the room they were incompatible
 * with everybody else, all the time, which trains a person to ignore the one notice that matters.
 *
 * So this is a **number bumped by hand, and only when the wire actually moves**. Bump it when a
 * message gains a field an older peer would be worse off for not understanding — not when a kind is
 * added (an unknown kind already fails closed), and not when a reader gets stricter.
 *
 *   1. Everything up to and including the whole-kind exchange. Every build before deltas existed
 *      reports this by saying nothing at all — see `readProtocol`.
 *   2. Deltas: `epoch` on a catalogue line, `since`/`epoch` on an ask, `changes`/`gone`/`keys` on a
 *      give ([ADR 0171](../../specs/decisions/0171-a-shared-kind-states-what-a-row-is.md)).
 *   3. Roster titles on an `items` give: the names a peer knows are in the shard, whether or not it
 *      holds them ([ADR 0177](../../specs/decisions/0177-the-item-list-is-a-walk-not-a-listing.md)).
 *      A peer speaking 2 sends pages without them, which still works and simply teaches us nothing
 *      about items we have never heard of — a degradation, so it is worth a number.
 */
export const SHARE_PROTOCOL = 4;

/**
 * What a peer that names no protocol is speaking.
 *
 * Every build shipped before this one, which is why it is a real number rather than `undefined`:
 * "didn't say" and "said 1" describe the same client, and having one answer for both is what keeps
 * the comparison below from needing a special case.
 */
export const PROTOCOL_UNSTATED = 1;

/** Read a peer's protocol off their catalogue. Absent, malformed or absurd all mean "the first one". */
export function readProtocol(raw: unknown): number {
  if (!isRecord(raw)) return PROTOCOL_UNSTATED;
  const stated = int(raw.protocol);
  // A number below the floor is a peer describing a protocol that never existed; above it, one we
  // have not written yet — which is the case this whole feature is for, so it is kept as stated.
  return stated === undefined || stated < PROTOCOL_UNSTATED ? PROTOCOL_UNSTATED : stated;
}

/**
 * Somebody in the room is speaking a protocol this build has never heard of.
 *
 * **The one thing this app cannot fix by shipping a fix**, which is the whole reason it exists: a
 * client that is too old to understand a message is also too old to contain the code that would
 * notice. Nothing added today can make yesterday's build say anything. What it can do is make *this*
 * build, and every one after it, able to recognise the situation from the other side — so the next
 * time the wire moves, the people left behind are told rather than left wondering why sharing with
 * the rest of the camp went quiet.
 *
 * Deliberately about **us**, not about them. "Bran is running an old build" is not something a reader
 * can act on ([ADR 0143](../../specs/decisions/0143-a-notice-may-point-at-where-to-answer-it.md)'s
 * second narrowing: only what a reader has to act on), and it is on their row in the Peers tab for
 * anyone curious. "You are the old build" is a thing you can do something about.
 */
export interface PeerVersionNotice {
  /** The newest protocol anybody in the room is speaking. Always greater than `ours`. */
  theirs: number;
  /** What we speak — `SHARE_PROTOCOL` at the time of the notice. */
  ours: number;
  /** Who is speaking it, named for the notice. Never empty. */
  peers: string[];
}

/**
 * How a peer's build compares with ours, for a row that wants to say so.
 *
 * `same` is the overwhelmingly common answer and the panel says nothing for it — a room where
 * everybody is current should look like a room, not like a compatibility report.
 */
export type PeerVersionStanding = "same" | "older" | "newer";

/** Where a peer's protocol stands against ours. */
export function versionStanding(theirs: number | undefined, ours: number = SHARE_PROTOCOL): PeerVersionStanding {
  const said = theirs ?? PROTOCOL_UNSTATED;
  if (said === ours) return "same";
  return said > ours ? "newer" : "older";
}

/** What a peer says it has. Kinds it isn't sharing are simply absent — the catalogue is the toggle. */
export type ShareOffer = Partial<Record<ShareKind, ShareEntry>>;

/**
 * "Send me this kind."
 *
 * `since` is the revision the asker already has. It means "everything up to here I have already" —
 * so a sender whose data has not moved answers *unchanged*, and one whose data has moved answers
 * with **just what moved**, provided `epoch` says the two are counting within the same run.
 */
export interface ShareAsk {
  what: ShareKind;
  since?: number;
  /**
   * The epoch `since` was counted in — the one the asker read off our catalogue.
   *
   * Absent means "I cannot do deltas, or I have nothing of yours": either way the honest answer is
   * the whole kind. Never assumed, never inferred — a `since` whose epoch we cannot match is treated
   * as no `since` at all, because guessing here is how a receiver ends up quietly missing rows.
   */
  epoch?: ShareEpoch;
  /**
   * `items` only: which shard is wanted. The one kind where "send me this kind" is not a sensible
   * request — nobody wants eleven thousand pages in a message — so the ask names the ~11-page slice
   * it can actually carry.
   */
  shard?: number;
}

/**
 * One row in a delta: what it is, and what it now says.
 *
 * The key travels rather than being recomputed on arrival, and that is load-bearing. Every
 * `authored` kind has its ids **regenerated** by `read`, and several kinds drop fields on the way
 * out — so the receiver frequently cannot derive the sender's key from what it received, and a
 * receiver that tried would file every update as a new row. The sender owns identity; the receiver
 * only has to file by it.
 */
export interface ShareChange {
  /** The row's key, as `ShareKindSpec.rowKey` computed it on the sender. */
  k: string;
  /** The row. Validated on arrival by the kind's own `read`, exactly like a whole-kind row. */
  r: unknown;
}

/**
 * The answer to an `ask`, in one of three moods.
 *
 * - **unchanged** — `rows` and `changes` both absent. A real answer, and the cheapest one.
 * - **whole** — `rows` present. Everything, and what a peer that asked without an epoch always gets.
 * - **delta** — `changes` and/or `gone` present, with the `epoch` they are counted in. Only what
 *   moved since the `since` that was asked with.
 *
 * A `give` never carries both `rows` and `changes`: they are two ways of saying what we hold, and a
 * message that said both would need a rule about which wins.
 */
export interface ShareGive {
  what: ShareKind;
  rev: number;
  /** The sender's display name at the time, so a tray row can say who a thing came from. */
  from?: string;
  rows?: unknown;
  /**
   * The keys of `rows`, positionally, for a whole send.
   *
   * Sent so that a receiver holding a whole set can later have a delta applied to it: the delta
   * names rows by the sender's key, and a receiver that had filed them under keys of its own making
   * would match none of them. Positional rather than embedded so the `rows` array keeps the exact
   * shape a peer too old to know about any of this already reads.
   *
   * Best-effort by contract — a receiver that gets a short, long or absent list falls back to
   * deriving keys itself, which works because every `rowKey` here is derived from what the row says
   * rather than from an id that would not survive the crossing.
   */
  keys?: string[];
  /** The rows that changed, for a delta. */
  changes?: ShareChange[];
  /** The keys of rows that are **gone**, for a delta. */
  gone?: string[];
  /** The run `rev` counts within — present on a delta, so a receiver can check it still matches. */
  epoch?: ShareEpoch;
  /** `items` only: which shard these rows are, echoed back so an answer can't be mis-filed. */
  shard?: number;
  /**
   * `items` only: the **roster titles** the sender believes are in this shard.
   *
   * Not the titles of `rows` — those are already there. These are what the sender's category walk
   * found, including pages it has not managed to fetch, which is exactly the set worth passing on:
   * one install discovering that `Mistmoore Heirloom Ring` exists is a fact the whole room can use,
   * and re-walking the category graph on every install to rediscover it is the waste this avoids
   * ([ADR 0177](../../specs/decisions/0177-the-item-list-is-a-walk-not-a-listing.md)).
   *
   * A title is only ever *added* to the receiver's roster, never used to remove one, and never taken
   * as evidence that the page exists — completeness stays self-assessed, so the worst a bad title
   * can do is cost one 404 and land in `failed`.
   */
  titles?: string[];
  /**
   * `items` only: titles in this shard the sender has checked and found **not** to be items
   * ([ADR 0180](../../specs/decisions/0180-the-wiki-has-a-shape-and-it-moves.md)).
   *
   * The counterpart to `titles`, and the more valuable half by volume. A zone page links to thousands
   * of pages the category walk never files as items, and finding out what one is costs a fetch — but
   * the answer is the same for everybody, and it is *no* for the overwhelming majority. Without this
   * every install in a room independently pays for the same few thousand dead ends, which is exactly
   * the once-per-person waste [ADR 0160](../../specs/decisions/0160-a-room-fills-the-catalogue-once.md)
   * exists to end.
   *
   * A refusal, like a title, is a claim about the **wiki** and not about the peer, and it is only
   * ever used to *skip* a fetch — never to remove anything or to contradict a page we hold. The worst
   * a lying peer achieves is that we don't discover an item we would otherwise have found, which is
   * the position every install was in before this existed.
   */
  notItems?: string[];
}

/**
 * What a peer handed us, as it arrived.
 *
 * Deliberately **not merged and not typed per kind**: the tray holds answers, and the panel that
 * draws one merges it with `mergeTimers` / `mergeBuffs` / `compareScores`. Keeping the rows loose
 * here is what lets one tray serve nine kinds without the main process having an opinion about any
 * of them.
 */
export interface ReceivedShare {
  peerId: string;
  kind: ShareKind;
  /** Their display name when they answered, for a tray row that can say who a thing came from. */
  from: string;
  rows: unknown[];
  rev: number;
  /** When it landed, ms. Drives the sweep, and lets a panel say how fresh an answer is. */
  at: number;
}

/**
 * What we should ask a peer for again, because what they hold has moved past what we have.
 *
 * **The gap this closes is "nothing ever re-checks".** An `ask` was only ever triggered by an
 * `offer` arriving with a moved revision, which assumes every offer is seen and every answer
 * arrives. Neither is guaranteed: a `give` can be lost, we can restart mid-conversation, the offer
 * can land during a moment when `connectPeers` was off. Any of those and the two installs simply
 * disagree for ever, quietly, with both sides believing they are up to date.
 *
 * So the reconciliation is stated as a **comparison of what is, not a reaction to an event** — the
 * shape that cannot drift. `heldRev` answers "what revision of this kind do I already have from
 * them", with `undefined` for none.
 *
 * Observations only, and for the same reason the automatic fetch is: they are the family that is
 * wanted by default and filed without anybody looking. Re-fetching somebody's watch rules behind
 * their reader's back would fill a tray nobody asked to fill (ADR 0141).
 */
export function outOfDate(offer: ShareOffer, heldRev: (kind: ShareKind) => number | undefined): ShareKind[] {
  return SHARE_KINDS.filter((spec) => {
    if (spec.family !== "observation") return false;
    const entry = offer[spec.key];
    if (!has(entry)) return false;
    const held = heldRev(spec.key);
    // Strictly greater: an equal revision is what "up to date" looks like, and a *lower* one is a
    // peer whose store was reset — asking again would fetch what we already have, and their `give`
    // would say "unchanged" anyway.
    return held === undefined || entry!.rev > held;
  }).map((spec) => spec.key);
}

/**
 * Somebody is newly offering something, as a notice says it
 * ([ADR 0143](../../specs/decisions/0143-a-notice-may-point-at-where-to-answer-it.md)).
 *
 * Carries the `peerId` as well as the name, because the notice's action opens the Peers tab **with
 * that peer picked out** — "who was it?" is the question a reader asks second, and a tab of eight
 * strangers doesn't answer it. The name is for reading; the id is for finding the row.
 */
export interface PeerOfferNotice {
  peerId: string;
  /** Their announced name, or a short id when they haven't said. */
  name: string;
  /** What's newly on offer, in catalogue order. Never empty — no notice is raised without one. */
  kinds: ShareKind[];
}

/**
 * What in a peer's catalogue is worth interrupting somebody about
 * ([ADR 0143](../../specs/decisions/0143-a-notice-may-point-at-where-to-answer-it.md)).
 *
 * Three narrowings, and each of them is a way this feature would otherwise become noise:
 *
 *   - **Newly on offer, not merely changed.** A catalogue's counts move whenever a peer kills
 *     something, so announcing catalogues would mean announcing somebody's evening. The event is a
 *     kind appearing that wasn't there — which is a person deciding to share something.
 *   - **Only what a reader has to act on.** An observation fetches and pools itself, so a notice
 *     about one would be telling you about something already done, with nowhere to go.
 *   - **Only what they actually hold.** A kind switched on over an empty list is an offer of
 *     nothing, and "Bob is sharing 0 pins" is a notice that wastes the one thing a toast has.
 *
 * `before` being **undefined** means we have never heard from this peer, which is not the same as
 * their having offered nothing: a first catalogue is the interesting case, since somebody who was
 * already sharing when you connected is exactly who you want to know about.
 */
export function newlyOffered(now: ShareOffer, before: ShareOffer | undefined): ShareKind[] {
  return SHARE_KINDS.filter((spec) => {
    if (spec.family === "observation") return false;
    if (!has(now[spec.key])) return false;
    // Compared on **whether there was anything to ask for**, not on whether the entry existed. A
    // toggle switched on over an empty list offers nothing, so the moment it acquires a row is the
    // first moment there is news — and treating the empty entry as "already offered" would mean
    // somebody who armed the switch early is never announced at all.
    return !has(before?.[spec.key]);
  }).map((spec) => spec.key);
}

/** Is this catalogue line an offer of something, rather than a switch on over an empty list? */
const has = (entry: ShareEntry | undefined): boolean => !!entry && entry.n > 0;

/**
 * The kinds, worded for a notice: `Watch rules, Alert styles and 2 more`.
 *
 * Names the first two and counts the rest, because a card has one line for this and a peer who has
 * just switched everything on would otherwise fill it with a list nobody reads to the end. Two is
 * enough to say *what sort of thing* has arrived, which is what decides whether you go and look.
 */
export function offerSummary(kinds: readonly ShareKind[]): string {
  const labels = kinds.map((k) => shareKind(k)?.label ?? k);
  if (labels.length <= 2) return labels.join(" and ");
  return `${labels[0]}, ${labels[1]} and ${labels.length - 2} more`;
}

/**
 * Longest an epoch may be once it's ours. It is an opaque token we only ever compare for equality,
 * so the only thing worth checking is that a peer can't make it a payload.
 */
const MAX_EPOCH = 64;

/** An epoch off the wire: a short opaque token, or nothing. Never interpreted, only compared. */
function readEpoch(v: unknown): ShareEpoch | undefined {
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed && trimmed.length <= MAX_EPOCH ? trimmed : undefined;
}

/**
 * Read a peer's catalogue, keeping only kinds we know and counts that are numbers.
 *
 * `cover`, `doing` and `epoch` are kept, which they were not: the hub had grown its own inline
 * reader precisely because this one dropped the two fields ADR 0160's coordination needs, and the
 * inline one checked nothing. One reader, and it keeps the whole line.
 */
export function readOffer(raw: unknown): ShareOffer {
  const offer: ShareOffer = {};
  if (!isRecord(raw)) return offer;
  for (const spec of SHARE_KINDS) {
    const entry = raw[spec.key];
    if (!isRecord(entry)) continue;
    const n = int(entry.n);
    const rev = int(entry.rev);
    if (n === undefined || rev === undefined || n < 0) continue;
    const line: ShareEntry = { n, rev };
    // Only `items` coordinates by coverage, but the check is on the shape rather than on the kind:
    // a hex string of the right length is the only thing `decodeCoverage` can read anyway.
    const cover = typeof entry.cover === "string" ? entry.cover : undefined;
    if (cover && /^[0-9a-fA-F]+$/.test(cover) && cover.length <= SHARD_COUNT) line.cover = cover;
    const doing = shardNumber(entry.doing);
    if (doing !== undefined) line.doing = doing;
    const epoch = readEpoch(entry.epoch);
    if (epoch) line.epoch = epoch;
    offer[spec.key] = line;
  }
  return offer;
}

/** Read an inbound `ask`. Null for a kind we don't know — the reader is what makes a kind receivable. */
export function readAsk(raw: unknown): ShareAsk | null {
  if (!isRecord(raw)) return null;
  const what = typeof raw.what === "string" ? shareKind(raw.what) : undefined;
  if (!what) return null;
  return {
    what: what.key,
    since: int(raw.since),
    // An epoch that isn't ours is caught by the sender, which compares it with its own. Reading it
    // here only bounds what a peer can put in the field.
    epoch: readEpoch(raw.epoch),
    shard: shardNumber(raw.shard),
  };
}

/**
 * What an inbound `give` turned out to be, once it had been checked.
 *
 * Three moods, and they are kept apart because they mean genuinely different things to a store:
 * `unchanged` says the tally has not moved, `whole` says *this is all of it* (an empty `whole` being
 * the un-share [ADR 0056](../../specs/decisions/0056-a-dropped-record-keeps-what-it-taught.md)
 * reads as "stop counting me", not "unsay it"), and `delta` says *this much of it moved*.
 */
export type ShareDelivery = {
  what: ShareKind;
  rev: number;
  from: string;
  shard?: number;
  /**
   * `items` only: the roster titles the sender says are in this shard (ADR 0177).
   *
   * On the head rather than inside `whole`, because it is true of every mood: a peer that holds no
   * page at all in a shard still knows which titles belong to it, and that answer is worth having.
   */
  titles?: string[];
  /** `items` only: titles the sender checked and found not to be items (ADR 0180). */
  notItems?: string[];
} & (
  | { mode: "unchanged" }
  | { mode: "whole"; rows: unknown[]; keyed: { key: string; row: unknown }[]; epoch?: ShareEpoch }
  | { mode: "delta"; epoch: ShareEpoch; changes: { key: string; row: unknown }[]; gone: string[] }
);

/**
 * Read an inbound `give` into rows that are safe to keep, through the reader for that kind.
 *
 * **A delta's rows go through exactly the same `read` as a whole one.** The saving is in what
 * crosses, never in what is checked — a row that arrived as "just this one changed" is no more
 * trustworthy than one that arrived in a batch of five thousand, and a delta path that validated
 * less would be a way to get an unchecked row in by asking for it differently.
 *
 * A `give` claiming to be a delta without an epoch is read as `unchanged` rather than applied: we
 * cannot tell what it is a delta *of*, and the reconciliation tick will ask again.
 */
export function readGive(raw: unknown, newId: () => string): ShareDelivery | null {
  if (!isRecord(raw)) return null;
  const spec = typeof raw.what === "string" ? shareKind(raw.what) : undefined;
  if (!spec) return null;
  const rev = int(raw.rev) ?? 0;
  const from = str(raw.from);
  const shard = shardNumber(raw.shard);
  // Only `items` is addressed by shard and only `items` carries a roster, so reading titles off any
  // other kind would be accepting a field that has no meaning there.
  const titles = spec.key === "items" ? readShardTitles(raw.titles) : undefined;
  // Refusals are read exactly as titles are — same cap, same de-dupe, same "items only" rule. They
  // are a list of names and nothing more, and they can only ever cause a fetch **not** to happen
  // ([ADR 0180](../../specs/decisions/0180-the-wiki-has-a-shape-and-it-moves.md)).
  const notItems = spec.key === "items" ? readShardTitles(raw.notItems) : undefined;
  const head = { what: spec.key, rev, from, shard, titles, notItems } as const;

  // A whole set wins if it is there at all: it is the older shape, and a message carrying both is
  // one we have no rule for — so we take the one that can be applied without a held state to merge
  // into. Nothing we send ever carries both.
  if (raw.rows !== undefined && raw.rows !== null) {
    const cap = MAX_ROWS[spec.key];
    const sent = Array.isArray(raw.rows) ? raw.rows.slice(0, cap) : [];
    const keys = Array.isArray(raw.keys) ? raw.keys : undefined;
    const rows: unknown[] = [];
    const keyed: { key: string; row: unknown }[] = [];
    // Row by row rather than through `readList`, so a row that doesn't survive takes its key with it
    // and the pairing cannot slip. The validation is identical — the same `read`, the same cap.
    sent.forEach((entry, i) => {
      const [row] = spec.read([entry], newId);
      if (row === undefined) return;
      rows.push(row);
      // The sender's key, then one derived from what we were actually given, then the position. The
      // fallbacks matter for a peer too old to send keys at all: every `rowKey` here reads the row's
      // own words, so deriving one on this side lands on the same string the sender would have.
      const key = text(keys?.[i]) || spec.rowKey?.(row) || `#${i}`;
      keyed.push({ key, row });
    });
    return { ...head, mode: "whole", rows, keyed, epoch: readEpoch(raw.epoch) };
  }

  const hasDelta = Array.isArray(raw.changes) || Array.isArray(raw.gone);
  if (!hasDelta) return { ...head, mode: "unchanged" };

  const epoch = readEpoch(raw.epoch);
  if (!epoch) return { ...head, mode: "unchanged" };

  const cap = MAX_ROWS[spec.key];
  const changes: { key: string; row: unknown }[] = [];
  if (Array.isArray(raw.changes)) {
    for (const entry of raw.changes.slice(0, cap)) {
      if (!isRecord(entry)) continue;
      const key = text(entry.k);
      if (!key) continue;
      // One at a time through the kind's own reader: a row that doesn't survive is dropped and the
      // rest of the delta still lands, which is the same forgiveness `readList` gives a whole set.
      const [row] = spec.read([entry.r], newId);
      if (row === undefined) continue;
      changes.push({ key, row });
    }
  }

  const gone: string[] = [];
  if (Array.isArray(raw.gone)) {
    for (const k of raw.gone.slice(0, cap)) {
      const key = text(k);
      if (key) gone.push(key);
    }
  }

  return { ...head, mode: "delta", epoch, changes, gone };
}

// ─── Readers, one per kind ──────────────────────────────────────────────────

/** Run `read` over a capped list, dropping whatever couldn't be read rather than failing the lot. */
function readList<T>(rows: unknown, cap: number, read: (raw: unknown) => T | null): T[] {
  if (!Array.isArray(rows)) return [];
  const out: T[] = [];
  for (const raw of rows.slice(0, cap)) {
    const item = read(raw);
    if (item) out.push(item);
  }
  return out;
}

/**
 * Watches go through `decodeWatches`, not a second implementation.
 *
 * It already regenerates ids, strips both kinds of style and checks every field against what the
 * type allows — the arrival being a socket rather than a clipboard changes nothing about what a
 * stranger's rule needs doing to it. Its `errors` are dropped here because a `give` has no reader
 * to show them to; the tray shows what arrived, which is the same information from the other end.
 */
function readWatches(rows: unknown, newId: () => string): CastWatch[] {
  if (!Array.isArray(rows)) return [];
  return decodeWatches(JSON.stringify(rows.slice(0, MAX_ROWS.watches)), newId).watches;
}

const ANIMATIONS = new Set(["pulse", "wiggle", "float", "none"]);
const POSITIONS = new Set(["top", "top-left", "top-right", "center", "bottom-left", "bottom-right"]);
/** A banner that never leaves, or one gone before it's read, are both worse than the default. */
const DURATION_MS = { min: 500, max: 60_000 };

/**
 * A saved look. Ids are regenerated for the same reason a watch's are — a peer's style id colliding
 * with one of yours would silently repaint every rule wearing yours.
 *
 * A **custom placement can't travel**: `loc:<id>` names a spot in the sender's own
 * `castAlerts.locations`, which we haven't got, so such a position would resolve to nothing. It
 * lands at `top` instead, which is a look the recipient can then move — where a dangling reference
 * is a banner that never appears.
 */
function readStyle(raw: unknown, newId: () => string): NamedAlertStyle | null {
  if (!isRecord(raw)) return null;
  const style = isRecord(raw.style) ? raw.style : raw;
  const name = str(raw.name) || str(style.name);
  if (!name) return null;
  const position = str(style.position);
  return {
    id: newId(),
    name,
    style: {
      sound: style.sound === true,
      flash: style.flash === true,
      color: str(style.color) || "#f0b429",
      soundName: str(style.soundName) || "levelup",
      position: (POSITIONS.has(position) ? position : "top") as NamedAlertStyle["style"]["position"],
      durationMs: clamp(int(style.durationMs) ?? 5000, DURATION_MS.min, DURATION_MS.max),
      animation: (ANIMATIONS.has(str(style.animation)) ? style.animation : "none") as NamedAlertStyle["style"]["animation"],
    },
  };
}

const PAGE_KINDS = new Set(["item", "quest", "recipe", "mob", "zone", "spell", "page"]);

/**
 * The page kinds the item catalogue is made of, and therefore the only ones that may cross under the
 * `items` share. Deliberately narrower than `PAGE_KINDS`.
 */
const CATALOGUE_KINDS = new Set(["item", "recipe", "mob", "quest", "zone"]);

/** The source kinds an inbound page may claim. Anything else becomes `unknown` rather than itself. */
const SOURCE_KINDS = new Set(["drop", "quest", "recipe", "vendor", "forage", "ground", "unknown"]);
/** Nobody needs nine thousand Bone Chips, and a bad number here is a list row that can never finish. */
const MAX_NEEDED = 999;

/**
 * A list entry, as a fresh row on the recipient's list.
 *
 * **`obtained` does not travel, and neither does `lastSeenAt`.** They are a record of the sender's
 * log, and copying them would hand you a list that is already three-fifths done on evidence you
 * have never seen — the opposite of what a shopping list is. What's worth having is *what to
 * collect and what it's for*; the counting is yours to do. `notify` stays off for the same reason a
 * new entry's does (ADR 0105): arming twenty rows is a decision, not a default.
 */
function readListEntry(raw: unknown, newId: () => string): ShoppingListEntry | null {
  if (!isRecord(raw)) return null;
  const name = str(raw.name);
  if (!name) return null;
  const origin = isRecord(raw.origin) && PAGE_KINDS.has(str(raw.origin.kind)) && str(raw.origin.name)
    ? { kind: str(raw.origin.kind) as WikiPageKind, name: str(raw.origin.name) }
    : undefined;
  return {
    id: newId(),
    name,
    kind: raw.kind === "mob" ? "mob" : "item",
    wikiPath: str(raw.wikiPath) || undefined,
    needed: clamp(int(raw.needed) ?? 1, 1, MAX_NEEDED),
    obtained: 0,
    note: str(raw.note) || undefined,
    origin,
    addedAt: new Date(0).toISOString(),
  };
}

const PIN_KINDS = new Set<string>(PIN_TYPES.map((p) => p.key));
/** EQ coordinates run to a few thousand; anything past this is a bad parse, not a far corner. */
const MAX_COORD = 100_000;

function readPin(raw: unknown, newId: () => string): MapPin | null {
  if (!isRecord(raw)) return null;
  const zone = str(raw.zone);
  const y = coord(raw.y);
  const x = coord(raw.x);
  if (!zone || y === undefined || x === undefined) return null;
  return {
    id: newId(),
    kind: (PIN_KINDS.has(str(raw.kind)) ? raw.kind : "note") as PinKind,
    zone,
    layer: int(raw.layer),
    y,
    x,
    title: str(raw.title) || undefined,
    note: str(raw.note) || undefined,
  };
}

/**
 * A mob tally. Counts only, and every one of them checked to be a non-negative number — the vetting
 * that decides whether a tally is *possible* (a drop counted more often than the mob was killed)
 * belongs to `electron/contributions.ts` and is deliberately not repeated here.
 */
function readMobObservation(raw: unknown): MobObservation | null {
  if (!isRecord(raw)) return null;
  const mob = str(raw.mob);
  const zone = str(raw.zone);
  const kills = int(raw.kills);
  if (!mob || !zone || kills === undefined || kills < 0) return null;
  const drops: Record<string, number> = {};
  if (isRecord(raw.drops)) {
    for (const [item, n] of Object.entries(raw.drops)) {
      const count = int(n);
      if (item && count !== undefined && count >= 0) drops[item.slice(0, MAX_TEXT)] = count;
    }
  }
  return {
    mob,
    zone,
    kills,
    drops,
    copper: nonNegative(raw.copper),
    // An area with no usable centre is dropped whole rather than kept with a zeroed one: a roam
    // area at `0, 0` is a claim about a real place, and a wrong one.
    area: readArea(raw.area),
    lastAt: str(raw.lastAt),
  };
}

function readArea(raw: unknown): MobObservation["area"] {
  if (!isRecord(raw)) return undefined;
  const y = coord(raw.y);
  const x = coord(raw.x);
  if (y === undefined || x === undefined) return undefined;
  return { y, x, spread: nonNegative(raw.spread) ?? 0, samples: int(raw.samples) ?? 0 };
}

function readSharedKill(raw: unknown): SharedKill | null {
  if (!isRecord(raw)) return null;
  const zone = str(raw.zone);
  const mob = str(raw.mob);
  const y = coord(raw.y);
  const x = coord(raw.x);
  if (!zone || !mob || y === undefined || x === undefined) return null;
  return { zone, mob, y, x, confidence: clamp(num(raw.confidence) ?? 0, 0, 1) };
}

/** A day is longer than any respawn in the game; a gap past it measured something else. */
const MAX_RESPAWN_SEC = 86_400;

/**
 * A learned interval. The two bounds are checked **against each other** as well as against the
 * range — a shortest longer than the longest is not a weak claim, it is an impossible one, and
 * `spawn-timers.ts` is explicit that one invented short value is permanent against a bound that
 * only ever falls.
 */
function readRespawn(raw: unknown): RespawnLearning | null {
  if (!isRecord(raw)) return null;
  const key = str(raw.key);
  const mob = str(raw.mob);
  if (!key || !mob) return null;
  const shortest = seconds(raw.shortestSeconds);
  const longest = seconds(raw.longestSeconds);
  if (shortest !== undefined && longest !== undefined && shortest > longest) return null;
  return {
    key,
    mob,
    place: str(raw.place),
    shortestSeconds: shortest,
    longestSeconds: longest,
    samples: clamp(int(raw.samples) ?? 0, 0, 100_000),
    lastKillAt: str(raw.lastKillAt) || undefined,
    gaps: [],
    // A peer sends a figure, not the workings behind it — so nothing here was thrown out by *our*
    // difficulty rule, and claiming otherwise would put a sentence on the row about a night we
    // never sat through.
    crossedDifficulty: 0,
  };
}

const TIMER_SOURCES = new Set(["stated", "seen", "killed"]);

/**
 * A running countdown. Its `id` is **not** kept: `key#slot` is local bookkeeping
 * ([ADR 0135](../../specs/decisions/0135-a-countdown-is-an-instance-and-a-timer-is-its-own-kind.md)),
 * and a peer's slot number means nothing here. `key` is what identifies the camp, and is what the
 * merge below groups on.
 */
function readTimer(raw: unknown): SpawnTimer | null {
  if (!isRecord(raw)) return null;
  const key = str(raw.key);
  const mob = str(raw.mob);
  const dueAt = iso(raw.dueAt);
  if (!key || !mob || !dueAt) return null;
  return {
    id: key,
    key,
    mob,
    place: str(raw.place),
    killedAt: iso(raw.killedAt) ?? dueAt,
    watchFrom: iso(raw.watchFrom) ?? dueAt,
    dueAt,
    seconds: clamp(int(raw.seconds) ?? 0, 0, MAX_RESPAWN_SEC),
    source: (TIMER_SOURCES.has(str(raw.source)) ? raw.source : "killed") as SpawnTimer["source"],
    samples: clamp(int(raw.samples) ?? 0, 0, 100_000),
    spreadSeconds: seconds(raw.spreadSeconds),
    lead: clamp(int(raw.lead) ?? 0, 0, MAX_RESPAWN_SEC),
    seenAt: iso(raw.seenAt) ?? undefined,
  };
}

const BUFF_SOURCES = new Set(["landed", "cast"]);
const BUFF_REASONS = new Set(["faded", "died", "recast"]);

/**
 * A buff on the sender's board.
 *
 * The target arrives **already resolved** to a name (see `shareableBuffs`), because `ON_YOU` means
 * *the sender* and would otherwise land on your own row. A buff that reaches here still relative,
 * or on nobody in particular, is dropped: an anonymous buff on an unknown target is not a row worth
 * having, and guessing whose it is would be inventing state.
 */
function readBuff(raw: unknown): BuffInstance | null {
  if (!isRecord(raw)) return null;
  const key = str(raw.key);
  const spell = str(raw.spell);
  const target = str(raw.target);
  if (!key || !spell || !target || target === ON_YOU || target === ON_PET || target === ON_UNKNOWN) return null;
  const at = iso(raw.at);
  if (!at) return null;
  return {
    key,
    spell,
    target,
    up: raw.up === true,
    at,
    since: iso(raw.since) ?? at,
    reason: BUFF_REASONS.has(str(raw.reason)) ? (raw.reason as BuffInstance["reason"]) : undefined,
    source: (BUFF_SOURCES.has(str(raw.source)) ? raw.source : "cast") as BuffRiseSource,
    byYou: false, // never *your* cast, whoever cast it
    permanent: raw.permanent === true,
    // Never on an enemy, and not because we distrust the sender: `shareableBuffs` only ever sends
    // what was on **them or their pet**, so a shared buff cannot be on something they were fighting.
    // Taking it off the wire would let a bad sender mark a buff urgent on somebody else's screen.
    onEnemy: false,
  };
}

/** A record standing on somebody's board. Never merged into yours — only laid beside it. */
function readScore(raw: unknown): HighScore | null {
  if (!isRecord(raw)) return null;
  const categoryId = str(raw.categoryId);
  const value = num(raw.value);
  if (!categoryId || value === undefined) return null;
  return {
    categoryId,
    value,
    at: iso(raw.at) ?? "",
    detail: str(raw.detail) || undefined,
    zone: str(raw.zone) || undefined,
    beaten: clamp(int(raw.beaten) ?? 1, 0, 100_000),
    unsettled: raw.unsettled === true,
  };
}

// ─── Preparing our own, on the way out ──────────────────────────────────────

/**
 * Our buff board as it should look to somebody else: relative labels resolved, the rest dropped.
 *
 * This is the outbound half of the rule `readBuff` enforces on the way in, and it lives on this
 * side on purpose — **only the sender can resolve `ON_YOU`**, because only the sender knows whose
 * board it is. Doing it on receipt would mean trusting a `by` field to say who "you" was, which is
 * exactly the name-as-a-key mistake [ADR 0132](../../specs/decisions/0132-a-contribution-is-keyed-by-who-made-it.md)
 * spent an ADR getting rid of.
 *
 * Buffs on *other* people are dropped rather than forwarded: they are the sender's observation of a
 * third party, they go stale invisibly, and two peers both reporting them is a disagreement nothing
 * can settle.
 */
export function shareableBuffs(buffs: readonly BuffInstance[], myName: string): BuffInstance[] {
  const me = myName.trim();
  if (!me) return [];
  return buffs
    .filter((b) => b.target === ON_YOU || b.target === ON_PET)
    .map((b) => ({ ...b, target: b.target === ON_PET ? `${me}'s pet` : me }));
}

// ─── De-dupe ────────────────────────────────────────────────────────────────

/**
 * How close two countdowns for one camp have to be to be the same spawn.
 *
 * Generous, and deliberately so. Two people at one camp measure the same respawn from the same
 * death but through different learned intervals and different `lead` paddings, so their `dueAt`
 * differ by however much their evidence does — while the *next* spawn is a full respawn away, and
 * the shortest respawn worth a countdown is far longer than this. Being too tight shows the camp
 * two rows for one mob, which is the bug this exists to prevent.
 */
export const SAME_SPAWN_MS = 4 * 60_000;

/** A countdown with who it came from — `undefined` for our own. */
export interface PeerTimer {
  timer: SpawnTimer;
  /** The peer's display name; absent means it's ours. */
  by?: string;
  /** Everyone whose clock agreed, ours included, in display order. */
  agreeing: string[];
}

/**
 * One row per spawn, out of everybody's clocks.
 *
 * Grouped by `key` — the camp, one mob one place — because that is the only part of a timer's
 * identity that means anything on another machine. Within a key, two clocks are the **same spawn**
 * when their `dueAt` are within `SAME_SPAWN_MS`; further apart and they are two spawns, which a
 * placeholder camp really can have.
 *
 * Which clock survives is the evidence order [spawn-timers.ts](./spawn-timers.ts) already argues
 * for, and none of the three steps is arbitrary:
 *
 *   1. **A `seenAt` wins.** Somebody can *see* it. That is an observation and it outranks every
 *      countdown's opinion, including a better-evidenced one.
 *   2. **Then more `samples`.** More gaps behind the interval is more reason to believe it.
 *   3. **Then the earlier `dueAt`.** The estimate is a bound that only ever falls, so the tightest
 *      honest one is the shortest — the same ratchet, applied across people instead of across
 *      nights.
 *
 * Ours is preferred at every tie, because a row that flickers between two identical clocks
 * depending on packet order is worse than one that is merely somebody else's.
 */
export function mergeTimers(mine: readonly SpawnTimer[], theirs: readonly PeerTimer[]): PeerTimer[] {
  const all: PeerTimer[] = [
    ...mine.map((timer) => ({ timer, agreeing: [] as string[] })),
    ...theirs.map((t) => ({ ...t, agreeing: [] as string[] })),
  ];
  const byKey = new Map<string, PeerTimer[]>();
  for (const entry of all) {
    const group = byKey.get(entry.timer.key);
    if (group) group.push(entry);
    else byKey.set(entry.timer.key, [entry]);
  }

  const merged: PeerTimer[] = [];
  for (const group of byKey.values()) {
    // Earliest first, so each cluster is walked in due order and a straggler joins the cluster it
    // is actually near rather than whichever happened to be seen first.
    group.sort((a, b) => due(a.timer) - due(b.timer));
    let cluster: PeerTimer[] = [];
    const flush = () => {
      if (cluster.length) merged.push(pickTimer(cluster));
      cluster = [];
    };
    for (const entry of group) {
      if (cluster.length && due(entry.timer) - due(cluster[0].timer) > SAME_SPAWN_MS) flush();
      cluster.push(entry);
    }
    flush();
  }
  return merged.sort((a, b) => due(a.timer) - due(b.timer));
}

const due = (t: SpawnTimer): number => Date.parse(t.dueAt) || 0;

/** The best-evidenced clock in a cluster, carrying everyone who agreed with it. */
function pickTimer(cluster: PeerTimer[]): PeerTimer {
  const best = cluster.reduce((a, b) => (betterTimer(b.timer, a.timer, !b.by, !a.by) ? b : a));
  const agreeing = cluster.map((c) => c.by ?? "You");
  return { ...best, agreeing };
}

/** Is `b` a better-evidenced clock than `a`? `mine` breaks every tie in our own favour. */
function betterTimer(b: SpawnTimer, a: SpawnTimer, bMine: boolean, aMine: boolean): boolean {
  if (!!b.seenAt !== !!a.seenAt) return !!b.seenAt;
  if (b.samples !== a.samples) return b.samples > a.samples;
  if (due(b) !== due(a)) return due(b) < due(a);
  return bMine && !aMine;
}

/** A buff with who it belongs to. */
export interface PeerBuff {
  buff: BuffInstance;
  /** The peer who reported it; absent means it's ours. */
  by?: string;
}

/**
 * One row per buff-on-a-target, out of everybody's boards.
 *
 * Keyed by `instanceKey(spell, target)` — the same key the local board uses — which works across
 * machines only because the target was resolved to a name before it was sent (`shareableBuffs`).
 * Where two reports collide the **later `at`** wins: a buff board is a running account of state
 * changes, so the freshest report is the one that has seen the most of them, and ours is preferred
 * on an exact tie for the same anti-flicker reason the timers are.
 */
export function mergeBuffs(mine: readonly BuffInstance[], theirs: readonly PeerBuff[]): PeerBuff[] {
  const byInstance = new Map<string, PeerBuff>();
  const consider = (entry: PeerBuff) => {
    const id = instanceKey(entry.buff.key, entry.buff.target);
    const held = byInstance.get(id);
    if (!held || fresher(entry, held)) byInstance.set(id, entry);
  };
  for (const buff of mine) consider({ buff });
  for (const entry of theirs) consider(entry);
  return [...byInstance.values()];
}

function fresher(candidate: PeerBuff, held: PeerBuff): boolean {
  const [a, b] = [Date.parse(candidate.buff.at) || 0, Date.parse(held.buff.at) || 0];
  return a === b ? !candidate.by && !!held.by : a > b;
}

// ─── Scores, laid side by side ──────────────────────────────────────────────

/** One person's figure in one category. */
export interface ScoreColumn {
  /** The character whose board it is, as their log spells it. */
  character: string;
  /** Absent means they have no record in this category, which is different from a zero. */
  score?: HighScore;
  mine: boolean;
}

/** One category, with everybody's figure in it and who is ahead. */
export interface ScoreRow {
  categoryId: string;
  columns: ScoreColumn[];
  /** The character holding the biggest figure. Absent when nobody has one, or nothing is settled. */
  leader?: string;
}

/**
 * Every score anyone offered, arranged category by category.
 *
 * **Nothing merges.** A peer's figure cannot beat, seed or touch your board — it is laid beside it
 * and the reader draws their own conclusion (ADR 0141). A `leader` is named because a comparison
 * with no answer is a table nobody reads, but it is arithmetic over what people typed, and an
 * `unsettled` figure is excluded from winning: a provisional number
 * ([ADR 0130](../../specs/decisions/0130-data-in-doubt-says-so.md)) should not take a crown it may
 * not be owed.
 *
 * Rows are only produced for categories **somebody actually has**, so a fresh install compares the
 * handful of things it has done rather than showing forty empty lines.
 */
export function compareScores(
  mine: { character: string; scores: readonly HighScore[] },
  theirs: readonly { character: string; scores: readonly HighScore[] }[],
  order: (categoryId: string) => number,
): ScoreRow[] {
  const boards = [{ ...mine, mine: true }, ...theirs.map((t) => ({ ...t, mine: false }))].filter(
    (b) => b.character,
  );
  const categories = new Set<string>();
  for (const board of boards) for (const s of board.scores) categories.add(s.categoryId);

  return [...categories]
    .sort((a, b) => order(a) - order(b))
    .map((categoryId) => {
      const columns = boards.map((board) => ({
        character: board.character,
        score: board.scores.find((s) => s.categoryId === categoryId),
        mine: board.mine,
      }));
      const contenders = columns.filter((c) => c.score && !c.score.unsettled);
      const best = contenders.reduce<ScoreColumn | undefined>(
        (a, c) => (!a || (c.score?.value ?? 0) > (a.score?.value ?? 0) ? c : a),
        undefined,
      );
      return { categoryId, columns, leader: best?.character };
    });
}

// ─── Small readers ──────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** A trimmed, clamped string — `""` for anything that isn't one. */
/**
 * One eqlwiki item page, as a peer sent it.
 *
 * This is a **mirror** of a public page rather than anybody's opinion, so it is applied without a
 * person looking at it — which is exactly why it is checked as hard as anything here. Every field is
 * rebuilt from scratch: unknown keys never survive, every string is clamped, every list is capped,
 * and the page `kind` must be one we know. A row that fails any of it is dropped rather than
 * repaired, because a half-read item page is a card with a hole in it that nothing downstream would
 * know to distrust.
 *
 * `fetchedAt` is kept but **clamped to no later than now**. The clamp is the whole safety: a peer who
 * claimed next year would otherwise pin their copy in our cache for ever. Keeping the real age is
 * what stops the opposite failure — a page relayed between peers indefinitely, each hop resetting the
 * clock, never once re-checked against the wiki
 * ([ADR 0160](../../specs/decisions/0160-a-room-fills-the-catalogue-once.md)). A stamp we cannot read
 * is dropped, and the caller then treats the page as arriving now.
 */
/**
 * The roster titles off an `items` give — a plain list of names, read as strictly as any row.
 *
 * Capped at the same number as the pages, because a shard is the same eleven-ish titles either way
 * and a peer sending ten thousand of them is not describing a shard. De-duplicated and stripped of
 * blanks here rather than by the caller, so the one thing the wiki client receives is a clean list
 * ([ADR 0177](../../specs/decisions/0177-the-item-list-is-a-walk-not-a-listing.md)).
 */
export function readShardTitles(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out = new Set<string>();
  for (const value of raw.slice(0, MAX_ROWS.items)) {
    const title = str(value);
    if (title) out.add(title);
  }
  return [...out];
}

function readSharedPage(raw: unknown): SharedItemPage | null {
  if (!isRecord(raw)) return null;
  const title = str(raw.title);
  const kind = PAGE_KINDS.has(str(raw.kind)) ? (str(raw.kind) as WikiPageKind) : undefined;
  // Items and recipes, **and the pages that give them a level**: a zone page states the level of
  // every mob in it, and a quest page states its own requirement
  // ([ADR 0163](../../specs/decisions/0163-an-item-wears-the-level-of-what-drops-it.md)). Mob pages
  // are here because we *read* them when we have them, not because anything fetches them. Spells are
  // still refused — nothing in the Items tab reads one, and a peer filling a cache nobody asked them
  // to fill is what this list exists to prevent.
  if (!title || !kind || !CATALOGUE_KINDS.has(kind)) return null;

  const card = isRecord(raw.card)
    ? {
        title: text(raw.card.title) || title,
        icon: text(raw.card.icon) || undefined,
        lines: Array.isArray(raw.card.lines)
          ? raw.card.lines.slice(0, MAX_PAGE_LINES).map(text).filter(Boolean)
          : [],
      }
    : undefined;

  const sources = Array.isArray(raw.sources)
    ? raw.sources
        .slice(0, MAX_PAGE_SOURCES)
        .map((row): ItemSource | null => {
          if (!isRecord(row)) return null;
          const where = text(row.where);
          if (!where) return null;
          return {
            kind: SOURCE_KINDS.has(str(row.kind)) ? (str(row.kind) as SourceKind) : "unknown",
            where,
            detail: text(row.detail) || undefined,
          };
        })
        .filter((row): row is ItemSource => !!row)
    : [];

  const components = Array.isArray(raw.components)
    ? raw.components
        .slice(0, MAX_PAGE_PARTS)
        .map((row): WikiComponent | null => {
          if (!isRecord(row)) return null;
          const name = text(row.name);
          if (!name) return null;
          return {
            name,
            qty: clamp(int(row.qty) ?? 1, 1, 999),
            wikiPath: text(row.wikiPath) || undefined,
            dropRate: text(row.dropRate) || undefined,
          };
        })
        .filter((row): row is WikiComponent => !!row)
    : [];

  return {
    kind,
    title,
    wikiPath: text(raw.wikiPath) || `/${title.replace(/ /g, "_")}`,
    sources,
    components,
    // Rewards belong to quests, and a quest page is now one of the kinds that travels — but nothing
    // in the item catalogue reads them (a level comes off the card), so they are dropped rather than
    // validated. Surface we do not need is surface we do not want.
    rewards: [],
    card,
    outOfEra: raw.outOfEra === true,
    fetchedAt: readStamp(raw.fetchedAt),
    /**
     * The page's outbound links — the shape a receiver reads candidates out of (ADR 0180).
     *
     * It has to be rebuilt here or it does not travel at all, and the failure would be silent and
     * self-sustaining: a received page is written under the **current** `CACHE_VERSION`, so a
     * link-less zone page taken from a peer looks perfectly current and is never re-fetched to gain
     * one. An install that filled from the room would then have no shape to explore, for ever.
     *
     * Names only, de-duplicated, and deliberately **not capped**: a truncated shape loses candidates
     * precisely on the pages that have most of them, and the duplication is nearly all *between*
     * pages — thirty zone pages naming the same guard — which the receiver's own set folds away for
     * nothing. A link is a claim about the wiki that costs at worst one fetch to disprove, and the
     * verdict is written down, so this is read on exactly the terms the roster titles beside it are.
     */
    links: Array.isArray(raw.links)
      ? [...new Set(raw.links.map((l) => text(l)).filter((l): l is string => !!l))]
      : undefined,
    // A zone page's whole value here is its NPC roster: one table, every mob's level. Capped and
    // rebuilt field by field like everything else.
    npcs: Array.isArray(raw.npcs)
      ? raw.npcs
          .slice(0, MAX_PAGE_NPCS)
          .map((row): { name: string; level: string } | null => {
            if (!isRecord(row)) return null;
            const who = text(row.name);
            const level = text(row.level);
            return who && level ? { name: who, level } : null;
          })
          .filter((row): row is { name: string; level: string } => !!row)
      : undefined,
  };
}

function readSharedGameTime(raw: unknown): SharedGameTime | null {
  if (!isRecord(raw)) return null;
  const hour = int(raw.hour);
  if (hour === undefined || hour < 0 || hour > 23) return null;
  return { hour, at: readStamp(raw.at) };
}

/**
 * A peer's timestamp, believed only as far as it can go wrong in our favour.
 *
 * Anything unparseable, and anything in the future, becomes `undefined` — which the receiver reads as
 * "arrived now". A stamp in the *past* is taken at face value, because a page that is older than it
 * claims only ever costs a re-fetch.
 */
function readStamp(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const at = Date.parse(v);
  if (!Number.isFinite(at) || at > Date.now()) return undefined;
  return new Date(at).toISOString();
}

/** `str`, but at an item page's own length rather than a name's. */
function text(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, MAX_PAGE_TEXT) : "";
}

/** A shard index, or `undefined` for anything that isn't one. Bounds-checked: it indexes a bitmap. */
function shardNumber(v: unknown): number | undefined {
  const n = int(v);
  return n === undefined || n < 0 || n >= SHARD_COUNT ? undefined : n;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, MAX_TEXT) : "";
}

/** A finite number, or `undefined`. Rejects NaN and both infinities, which JSON can carry as nulls. */
function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function int(v: unknown): number | undefined {
  const n = num(v);
  return n === undefined ? undefined : Math.round(n);
}

function nonNegative(v: unknown): number | undefined {
  const n = num(v);
  return n === undefined || n < 0 ? undefined : n;
}

function seconds(v: unknown): number | undefined {
  const n = int(v);
  return n === undefined || n <= 0 || n > MAX_RESPAWN_SEC ? undefined : n;
}

function coord(v: unknown): number | undefined {
  const n = num(v);
  return n === undefined || Math.abs(n) > MAX_COORD ? undefined : n;
}

/** A timestamp we can actually do arithmetic on — an unparseable one is worse than none. */
function iso(v: unknown): string | null {
  const s = typeof v === "string" ? v : "";
  return s && !Number.isNaN(Date.parse(s)) ? s : null;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
