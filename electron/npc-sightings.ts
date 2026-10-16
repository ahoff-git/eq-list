/**
 * npc-sightings.ts — the sightings store: every name you've hailed, heard, or considered, by zone,
 * with where you were standing at the time.
 *
 * The pairing of a line with a `/loc` is `src/shared/npc/npc-sightings.ts`; this keeps what it
 * settles. Fed live by `main.ts` and on a log re-read by `log-import.ts`, through the same placer, so
 * an evening reads the same either way
 * ([ADR 0298](../specs/decisions/0298-npc-sightings-place-what-you-never-kill.md)).
 *
 * Local only: never shared with peers. A consider or a `/say` can name a player, and where somebody
 * stood is theirs to share, not ours.
 */
import path from "node:path";
import { createLogger } from "../src/shared/logging";
import { mobKey } from "../src/shared/mob/mob-stats";
import { addSample, sightingKey, type NpcSighting, type PlacedSighting } from "../src/shared/npc/npc-sightings";
import type { ForgetScope } from "../src/shared/types";
import { createSaver, readJson } from "./json-store";

const log = createLogger("npc-sightings");

/** Considers come in bursts at a camp; coalesced like every other log-fed store. */
const WRITE_DEBOUNCE_MS = 5000;

export interface NpcSightings {
  add(s: PlacedSighting): void;
  /** Every zone this name has been seen in, most recently seen first. */
  of(name: string): NpcSighting[];
  clear(scope?: ForgetScope): void;
  flush(): void;
}

interface StoreFile {
  entries?: Record<string, NpcSighting>;
}

export function createNpcSightings(userDataDir: string): NpcSightings {
  const file = path.join(userDataDir, "npc-sightings.json");
  let entries: Record<string, NpcSighting> = readJson<StoreFile>(file, {}).entries ?? {};
  const saver = createSaver(file, "npc sightings", () => ({ entries }), WRITE_DEBOUNCE_MS, { concern: "npc-sightings" });

  const lastAt = (e: NpcSighting) => Date.parse(e.samples[e.samples.length - 1]?.at ?? e.first.at);

  return {
    add(s) {
      const key = sightingKey(s.name, s.zone);
      const before = entries[key];
      const after = addSample(before, s);
      if (after === before) return;
      entries[key] = after;
      if (!before) log.debug("first sighting", { name: s.name, zone: s.zone, how: s.sample.how });
      saver.save();
    },

    of(name) {
      const key = mobKey(name);
      return Object.values(entries)
        .filter((e) => mobKey(e.name) === key)
        .sort((a, b) => lastAt(b) - lastAt(a));
    },

    // Everything here is derived from the logs, so "records" and "everything" alike start it over —
    // a re-read puts back whatever the logs on disk still hold.
    clear() {
      entries = {};
      saver.flush();
    },

    flush() {
      saver.flush();
    },
  };
}
