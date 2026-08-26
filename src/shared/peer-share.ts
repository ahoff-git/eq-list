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
import type { CastWatch, HighScore, NamedAlertStyle, ShoppingListEntry, WikiPageKind } from "./types";
import type { MobObservation } from "./mob-stats";
import type { SharedKill } from "./kill-filters";
import type { BuffInstance, BuffRiseSource } from "./buff-tracking";
import type { RespawnLearning, SpawnTimer } from "./spawn-timers";
import { ON_PET, ON_UNKNOWN, ON_YOU, instanceKey } from "./buff-tracking";
import { decodeWatches } from "./watch-share";
import { PIN_TYPES, type MapPin, type PinKind } from "./map/pins";

// ─── The catalogue ──────────────────────────────────────────────────────────

export type ShareFamily = "authored" | "observation" | "live";

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
  | "scores";

/**
 * One shareable kind: what it is, which family's rules it plays by, and how to read one off the
 * wire.
 *
 * `read` takes the raw rows a peer sent and returns only what survives checking — never throws,
 * never half-applies. `newId` is passed in rather than reached for, the same way `decodeWatches`
 * takes it: ids come from `crypto.randomUUID()` in a renderer and a test wants to know what it is
 * asserting on.
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
};

/** Longest any free-text field may be once it's ours. Matches `watch-share.ts`. */
const MAX_TEXT = 200;

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
  },
  {
    key: "styles",
    family: "authored",
    label: "Alert styles",
    blurb: "Your saved named looks — colour, sound, position, how long a banner stays up.",
    noun: "style",
    read: (rows, newId) => readList(rows, MAX_ROWS.styles, (raw) => readStyle(raw, newId)),
  },
  {
    key: "lists",
    family: "authored",
    label: "Shopping list",
    blurb: "What you're collecting and what it's for — counts reset, so it arrives as a fresh list.",
    noun: "entry",
    read: (rows, newId) => readList(rows, MAX_ROWS.lists, (raw) => readListEntry(raw, newId)),
  },
  {
    key: "pins",
    family: "authored",
    label: "Map pins",
    blurb: "Markers you've dropped on zone maps — camps, spawn points, warnings.",
    noun: "pin",
    read: (rows, newId) => readList(rows, MAX_ROWS.pins, (raw) => readPin(raw, newId)),
  },
  {
    key: "mobs",
    family: "observation",
    label: "Mob observations",
    blurb: "Drop counts, coin and roam areas — tallies, never your kills or your movements.",
    noun: "tally",
    read: (rows) => readList(rows, MAX_ROWS.mobs, readMobObservation),
  },
  {
    key: "kills",
    family: "observation",
    label: "Kill positions",
    blurb: "Where things died, for a pooled heatmap. Carries no time and no loot.",
    noun: "position",
    read: (rows) => readList(rows, MAX_ROWS.kills, readSharedKill),
  },
  {
    key: "respawns",
    family: "observation",
    label: "Respawn intervals",
    blurb: "How long a named took to come back, measured at your camp — the shortest gap you saw.",
    noun: "interval",
    read: (rows) => readList(rows, MAX_ROWS.respawns, readRespawn),
  },
  {
    key: "timers",
    family: "live",
    label: "Running countdowns",
    blurb: "Clocks ticking at your camp right now, so the people sitting with you see the same one.",
    noun: "countdown",
    read: (rows) => readList(rows, MAX_ROWS.timers, readTimer),
  },
  {
    key: "buffs",
    family: "live",
    label: "Buff board",
    blurb: "What's up on you and your pet, and what's lapsed. Nothing about anyone else.",
    noun: "buff",
    read: (rows) => readList(rows, MAX_ROWS.buffs, readBuff),
  },
  {
    key: "scores",
    family: "live",
    label: "High scores",
    blurb: "Your personal bests, to sit beside other people's. Nothing merges into your board.",
    noun: "score",
    read: (rows) => readList(rows, MAX_ROWS.scores, readScore),
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

/** Is this kind switched on? Every kind is off until somebody says otherwise. */
export function sharing(settings: ShareSettings | undefined, key: ShareKind): boolean {
  return settings?.[key] === true;
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
}

/** What a peer says it has. Kinds it isn't sharing are simply absent — the catalogue is the toggle. */
export type ShareOffer = Partial<Record<ShareKind, ShareEntry>>;

/** "Send me this kind." `since` is the revision the asker already has, so an unchanged kind can say so. */
export interface ShareAsk {
  what: ShareKind;
  since?: number;
}

/**
 * The answer to an `ask`. `rows` absent means "nothing changed since the revision you named" — which
 * is a real answer and not a failure, and is why it is distinguishable from an empty list.
 */
export interface ShareGive {
  what: ShareKind;
  rev: number;
  /** The sender's display name at the time, so a tray row can say who a thing came from. */
  from?: string;
  rows?: unknown;
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

/** Read a peer's catalogue, keeping only kinds we know and counts that are numbers. */
export function readOffer(raw: unknown): ShareOffer {
  const offer: ShareOffer = {};
  if (!isRecord(raw)) return offer;
  for (const spec of SHARE_KINDS) {
    const entry = raw[spec.key];
    if (!isRecord(entry)) continue;
    const n = int(entry.n);
    const rev = int(entry.rev);
    if (n === undefined || rev === undefined || n < 0) continue;
    offer[spec.key] = { n, rev };
  }
  return offer;
}

/** Read an inbound `ask`. Null for a kind we don't know — the reader is what makes a kind receivable. */
export function readAsk(raw: unknown): ShareAsk | null {
  if (!isRecord(raw)) return null;
  const what = typeof raw.what === "string" ? shareKind(raw.what) : undefined;
  if (!what) return null;
  return { what: what.key, since: int(raw.since) };
}

/**
 * Read an inbound `give` into rows that are safe to keep, through the reader for that kind.
 *
 * `stale` is the "nothing changed" answer, kept apart from an empty `rows` because they mean
 * opposite things: one says the tally is unchanged, the other says it is now empty (which
 * `contributions.ts` treats as an un-share that keeps what it taught, per ADR 0056).
 */
export function readGive(
  raw: unknown,
  newId: () => string,
): { what: ShareKind; rev: number; from: string; rows: unknown[]; stale: boolean } | null {
  if (!isRecord(raw)) return null;
  const spec = typeof raw.what === "string" ? shareKind(raw.what) : undefined;
  if (!spec) return null;
  const rev = int(raw.rev) ?? 0;
  const from = str(raw.from);
  if (raw.rows === undefined || raw.rows === null) return { what: spec.key, rev, from, rows: [], stale: true };
  return { what: spec.key, rev, from, rows: spec.read(raw.rows, newId), stale: false };
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
