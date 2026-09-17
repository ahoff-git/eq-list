/**
 * peer-archive.ts — what an authored share still says, after the peer who handed it over is gone.
 *
 * `watches`/`styles`/`lists`/`pins` are the one family this install never applies on its own
 * (ADR 0141) — a person reviews what arrived and copies in whatever they want, on purpose. Until now
 * that review had to happen while the peer was still connected: what landed lived only in the tray's
 * in-memory `Map`, gone after thirty quiet minutes (`peer-share-hub.ts`'s `sweep`) or a restart
 * either way. Somebody who asked at 9pm and got called away could no longer see it at 9:35.
 *
 * This is the archive that fixes that, without touching either of ADR 0141's rules: nothing here is
 * ever applied automatically, and nothing here is ever handed to a third peer — `shareSources`
 * (`peer-share-hub.ts`) reads none of it, so an authored kind still only ever leaves as *your own*
 * watches, styles, lists and pins (`specs/peers/README.md`'s "no merging of somebody else's board
 * into yours", unchanged). It only remembers **the last thing each name handed over**, on the same
 * terms `contributions.ts` already keeps a contributor's observations: replaced whole on the next
 * report, kept until asked to forget.
 *
 * **Keyed by display name, not a contributor id.** Authored data carries no id at all
 * ([ADR 0132](../specs/decisions/0132-a-contribution-is-keyed-by-who-made-it.md) — the id rides only
 * on `mobs`/`kills`/`respawns`), and a name is the only thing left to hang a memory on. That is
 * honestly weaker: a rename starts a fresh entry, and two players who chose the same name share one.
 * Accepted for the reason `contributions.ts` already accepts an unverified name as a *label* — the
 * alternative is remembering nothing at all, which is worse.
 */
import path from "node:path";
import type { ShareKind } from "../src/shared/peer-share";
import { createContributions } from "./contributions";

/** The share kinds this archive covers — the whole `authored` family, and nothing else. */
const ARCHIVED_KINDS = ["watches", "styles", "lists", "pins"] as const;
type ArchivedKind = (typeof ARCHIVED_KINDS)[number];

/**
 * Rows per name, per kind. Generous rather than tight: the tray already bounds what a single `give`
 * can hold to a kind's own `MAX_ROWS` (`peer-share.ts`), so this is a backstop against a store that
 * changed shape underneath it, not the rule actually doing the limiting.
 */
const MAX_ROWS = 500;

/** A name, normalized to something two reports from "the same" peer will agree on. */
function nameKey(name: string): string {
  return name.trim().toLowerCase().slice(0, 40);
}

function isArchivedKind(kind: ShareKind): kind is ArchivedKind {
  return (ARCHIVED_KINDS as readonly string[]).includes(kind);
}

/** Rows already vetted on the way into the tray (each kind's own `read`, `peer-share.ts`) — only the shape survives here. */
function sanitizeArchived(raw: unknown[]): unknown[] {
  return raw.filter((row) => row !== null && typeof row === "object");
}

/** One name's last word on a kind, as `received()` wants to show it. */
export interface ArchivedShare {
  name: string;
  rows: unknown[];
  /** When they last gave us this, ISO. */
  seenAt: string;
}

export interface PeerArchive {
  /** Remember what a peer just handed over — replacing whatever that name last gave for this kind. */
  record(kind: ShareKind, name: string, rows: unknown[]): void;
  /** Everything remembered for a kind, newest first. Empty for a kind outside the `authored` family. */
  entries(kind: ShareKind): ArchivedShare[];
  /** Forget one name's memory of one kind, a whole kind (every name), or everything archived. */
  clear(name?: string, kind?: ShareKind): void;
  flush(): void;
}

export function createPeerArchive(userDataDir: string): PeerArchive {
  const stores = new Map(
    ARCHIVED_KINDS.map((kind) => [
      kind,
      createContributions<unknown>({
        file: path.join(userDataDir, `peer-archive-${kind}.json`),
        what: `archived ${kind}`,
        concern: "peer-knowledge",
        cap: MAX_ROWS,
        sanitize: sanitizeArchived,
        // No per-row stamping: `entries()` reads who-and-when off the contributor bucket itself
        // (`store.all()`), never off an individual row.
        credit: (row) => row,
      }),
    ]),
  );

  return {
    record(kind, name, rows) {
      if (!isArchivedKind(kind)) return;
      const key = nameKey(name);
      // Nothing to hang a memory on — the same "fails closed" `contributors.ts` applies to an id
      // with no shape, applied here to a name with no content.
      if (!key) return;
      stores.get(kind)!.report({ id: key, name: name.trim() }, rows);
    },

    entries(kind) {
      if (!isArchivedKind(kind)) return [];
      return stores
        .get(kind)!
        .all()
        .map(({ by, seenAt, data }): ArchivedShare => ({ name: by.name, rows: data, seenAt }));
    },

    clear(name, kind) {
      const kinds = kind ? (isArchivedKind(kind) ? [kind] : []) : ARCHIVED_KINDS;
      for (const k of kinds) stores.get(k)!.forget(name ? nameKey(name) : undefined);
    },

    flush() {
      for (const store of stores.values()) store.flush();
    },
  };
}
