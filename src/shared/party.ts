/**
 * party.ts — who is in your group, assembled from the log's own announcements.
 *
 * The log states membership only as it *changes* (`parseParty`), so a roster is always
 * partial: a group formed before the app started is invisible until somebody joins, leaves
 * or talks. That's fine, and it's why nothing here is allowed to be authoritative about who
 * *isn't* in your group — `has` answering false means "not known to be", never "isn't".
 * The damage meter leans on that: it treats an unknown player as an outsider only for the
 * fights nobody on your side is in (see `fight-scope.ts`).
 *
 * A group-mate's pet counts as the group-mate, the same way your own does — the log writes
 * both as "<Owner>`s warder" and neither is a stranger.
 *
 * Stateful, because membership is memory; pure otherwise (no I/O, no clock), so it's a black
 * box the tracker feeds and reads.
 */
import { isTheirs } from "./combat-parser";
import type { PartyEvent } from "./types";

export interface Party {
  /** Fold in one party line. */
  note(event: PartyEvent): void;
  /** Is this name a group-mate, or a group-mate's pet? */
  has(name: string): boolean;
  /** Current membership, in the order people joined. Excludes you. */
  members(): string[];
  clear(): void;
}

export function createParty(): Party {
  /** Lowercased name → the spelling the log used, so a re-announcement can't duplicate a member. */
  const members = new Map<string, string>();

  return {
    note(event) {
      const who = event.who?.trim();
      if (event.change === "cleared") return void members.clear();
      if (!who) return;
      const key = who.toLowerCase();
      // First spelling wins, as everywhere else a name is remembered (`name-registry.ts`):
      // the log capitalizes a name to start a sentence, and a member re-announced by a chat
      // line shouldn't come back under a second spelling.
      if (event.change === "joined") {
        if (!members.has(key)) members.set(key, who);
      } else members.delete(key);
    },
    has(name) {
      if (!name) return false;
      if (members.has(name.toLowerCase())) return true;
      // Not a member by name — but it may be a member's pet, which only a per-member
      // check can tell (the owner is a prefix, not the whole name).
      for (const member of members.values()) if (isTheirs(name, member)) return true;
      return false;
    },
    members: () => [...members.values()],
    clear: () => members.clear(),
  };
}
