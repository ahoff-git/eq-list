/**
 * contributors.ts — who told us something, when the answer isn't "we saw it ourselves".
 *
 * Pooling makes almost every figure in this app better and none of them more verifiable, so the
 * rule everywhere is that a contribution is **kept apart and credited**, never blended into your
 * own record (`mob-knowledge.ts`, [ADR 0024](../../specs/decisions/0024-mob-knowledge.md)). That
 * only works if a contributor can be *told apart*, and until now they couldn't be: their tally was
 * filed under the display name they announced, which is neither unique nor stable. Two players
 * called "Bob" were one row, a rename orphaned a tally under the old name, and anyone could file
 * their observations under yours by typing your name into Settings.
 *
 * So a contributor has **two** identifiers and they do different jobs:
 *
 *   - **`id`** — a random one, minted once per install (`electron/identity.ts`) and never derived
 *     from anything a person can type. It is the key. Nothing about it is meaningful, which is the
 *     point: it can't collide, it survives a rename, and it says nothing about who you are.
 *   - **`name`** — what they call themselves. A **label**, only ever shown. It may change between
 *     one report and the next, may be blank, and may be a lie.
 *
 * This is deliberately *not* the awari peer id, which
 * [ADR 0015](../../specs/decisions/0015-peer-presence-via-hello.md) keeps deliberately per-session:
 * that one identifies a *connection*, this one identifies a *source of data we keep*. Keeping them
 * apart is what lets a peer reconnect — with a fresh transport id every time — and still be
 * recognised as the same observer whose tally we already hold.
 *
 * Pure, so main files contributions with it and the renderer renders them with it.
 */

/** Who told us. `id` keys everything; `name` is only ever shown. */
export interface Contributor {
  id: string;
  name: string;
}

/** One contributor's latest set of something, as it is stored. */
export interface Contribution<T> {
  /** Their display name as of the last report. A label, never a key. */
  name: string;
  /** When they last reported, ISO. Present even for a report that turned out to be empty. */
  seenAt: string;
  data: T[];
}

/** Everything everyone has contributed, keyed by contributor id. */
export type Contributions<T> = Record<string, Contribution<T>>;

/**
 * One contributor and how much they have told us — a row for a list that credits them, and the
 * thing a "forget this person" button is hung off.
 *
 * Here rather than beside the store that builds it, because the panel that draws it and the store
 * that fills it are in different processes: a shape crossing the IPC boundary has to be describable
 * from both sides.
 */
export interface KnowledgeContributor {
  by: Contributor;
  /** When they last reported, ISO. Empty for a tally inherited from before this was recorded. */
  seenAt: string;
  /** Rows they've shared: mobs-in-zones, not kills. */
  observations: number;
  /** Kills behind those rows — the size of the sample they are adding to yours. */
  kills: number;
}

/** Shown for a contributor who never said what to call them. */
export const UNKNOWN_CONTRIBUTOR = "Someone";

/**
 * How long a name may be before it stops being a name.
 *
 * A display name arrives from a peer, is stored, and is drawn in a list — so it is untrusted text
 * on all three counts. Capping it here (rather than in the list that draws it) means the cap is
 * part of *filing* a contribution, and a caller can't forget it.
 */
const MAX_NAME = 40;

/** The shape a minted id has: our prefix plus a UUID, so a stray string can't pass for one. */
const ID_RE = /^c-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Mint an id from a UUID. Separate from generating the UUID so this file stays pure and testable. */
export function contributorId(uuid: string): string {
  return `c-${uuid.toLowerCase()}`;
}

/** Is this an id we minted — i.e. one a peer could legitimately be announcing? */
export function isContributorId(v: unknown): v is string {
  return typeof v === "string" && ID_RE.test(v);
}

/**
 * The id to file a tally under that arrived before contributors had ids — the display name it was
 * stored beside, marked as what it is.
 *
 * Marked, rather than silently reused as an id, because the two are worth different amounts and a
 * reader has to be able to tell: a legacy row is "whoever was calling themselves Bob", which is
 * exactly the ambiguity ids were added to end. It keeps months of pooled observations rather than
 * throwing them away at the migration, and it stops being used the moment that peer reports again
 * under their real id.
 */
export function legacyContributorId(name: string): string {
  return `name:${name.trim().toLowerCase()}`;
}

/** Was this id inherited from the name-keyed era? */
export function isLegacyContributorId(id: string): boolean {
  return id.startsWith("name:");
}

/** Trim an announced name to something safe to store and draw. Blank becomes the stand-in. */
export function contributorName(name: unknown): string {
  const clean = typeof name === "string" ? name.trim().slice(0, MAX_NAME) : "";
  return clean || UNKNOWN_CONTRIBUTOR;
}

/**
 * Read the identity off an untrusted peer payload.
 *
 * **Fails closed**: a payload with no valid id is nobody, and returns `null` rather than being
 * filed under their name as it used to be. That is the right way round — this decides what gets
 * *written to disk under a key we will keep trusting*, and a peer running a build too old to
 * announce an id costs us one tally, where accepting a name as a key costs us the property that
 * makes the key worth having.
 */
export function readContributor(payload: { id?: unknown; name?: unknown }): Contributor | null {
  return isContributorId(payload.id) ? { id: payload.id, name: contributorName(payload.name) } : null;
}
