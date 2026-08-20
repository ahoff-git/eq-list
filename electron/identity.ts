/**
 * identity.ts — this install's contributor id: the one thing about us peers may keep.
 *
 * Minted once, on first need, and then never again — the whole value of it is that it outlives a
 * rename, a reconnect and a restart, so that observations we shared last week and observations we
 * share tonight land in the same pile on someone else's disk (`contributors.ts` says why a name
 * cannot do that job).
 *
 * **Its own file, deliberately.** It is not a setting — nothing in the UI edits it and nothing
 * about it is a preference — and putting it in `settings.json` would mean a player who resets
 * their settings quietly becomes a different contributor to everyone they play with, which is a
 * confusing way to lose a shared tally.
 *
 * **On privacy.** This is a stable identifier, and
 * [ADR 0015](../specs/decisions/0015-peer-presence-via-hello.md) went out of its way to keep the
 * *transport* id per-session so a player couldn't be followed between sessions. That reasoning
 * still holds, which is why this id is attached to **data payloads only** — the messages you send
 * because you chose to share observations — and never to `hello`. Connect to the room without
 * sharing and nothing stable about you is broadcast at all.
 */
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createLogger } from "../src/shared/logging";
import { contributorId, isContributorId } from "../src/shared/contributors";
import { readJson, writeJson } from "./json-store";

const log = createLogger("identity");

interface StoredIdentity {
  contributorId?: string;
}

/**
 * Read this install's contributor id, minting and saving one the first time.
 *
 * A file that is missing, unreadable, or holds something that isn't one of our ids gets a fresh
 * one. Losing the old id costs a shared tally its history on other people's machines and nothing
 * else — so the failure mode is "start contributing again", never "refuse to start".
 */
export function readIdentity(userDataDir: string): string {
  const file = path.join(userDataDir, "identity.json");
  const stored = readJson<StoredIdentity>(file, {});
  if (isContributorId(stored.contributorId)) return stored.contributorId;

  const minted = contributorId(randomUUID());
  writeJson(file, { contributorId: minted });
  log.debug("minted a contributor id", { minted, had: stored.contributorId ?? null });
  return minted;
}
