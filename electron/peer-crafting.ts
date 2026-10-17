/**
 * peer-crafting.ts — crafting success rates other players have shared (ADR 0303).
 *
 * The receiving half of the `crafting` share kind, on exactly the terms `peer-respawns.ts` keeps
 * shared respawns: keyed by contributor id, replaced per report, kept when someone stops sharing,
 * vetted on arrival, capped per contributor (`contributions.ts`'s five rules).
 *
 * A rate is safe to pool for the reason a respawn is: it is a count, never the evidence behind it.
 * The worst a bad one can do is put a wrong percentage beside an item in somebody's crafting log —
 * and it sits in its own "the room" column, never mixed into your own figures.
 */
import path from "node:path";
import { createLogger } from "../src/shared/logging";
import { isAdminAudit, type AdminAudit } from "../src/shared/admin";
import type { SharedCraftRate } from "../src/shared/tradeskills/craft-rates";
import type { Contributor } from "../src/shared/contributors";
import { createContributions } from "./contributions";
import { createArrayAdminStore, type AdminStore } from "./admin";

const log = createLogger("peer-crafting");

/** Per contributor — the same ceiling the share kind itself caps a give at. */
const MAX_RATES_PER_PEER = 5000;

const wholeAtLeast = (v: unknown, min: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min;

/**
 * Keep only rates that could be true: named, at a reachable skill, with no more successes than
 * combines. The same checks `readCraftRate` makes on the way in, made again here for the reason
 * `sanitizeRespawns` gives — we cannot see how a peer made theirs.
 *
 * `trustAdmin` is true only when re-reading our own saved file, never for a report a peer just sent.
 */
export function sanitizeCraftRates(input: unknown[], trustAdmin: boolean): SharedCraftRate[] {
  const out: SharedCraftRate[] = [];
  for (const r of input) {
    if (!r || typeof r !== "object") continue;
    const row = r as Record<string, unknown>;
    if (typeof row.skill !== "string" || !row.skill.trim()) continue;
    if (typeof row.item !== "string" || !row.item.trim()) continue;
    if (!wholeAtLeast(row.level, 0) || row.level > 400) continue;
    if (!wholeAtLeast(row.attempts, 1) || row.attempts > 1_000_000) continue;
    if (!wholeAtLeast(row.ok, 0) || row.ok > row.attempts) continue;
    const clean: SharedCraftRate & { __admin?: AdminAudit } = {
      skill: row.skill,
      item: row.item,
      level: row.level,
      attempts: row.attempts,
      ok: row.ok,
    };
    if (trustAdmin && isAdminAudit(row.__admin)) clean.__admin = row.__admin;
    out.push(clean);
  }
  return out;
}

export interface PeerCraftingStore {
  /** Everyone's shared rates, each credited to whoever made the combines. */
  all(): SharedCraftRate[];
  /** File a contributor's rates, replacing whatever they shared before. */
  report(by: Contributor, rates: unknown[]): void;
  /** Forget one contributor's rates, or everybody's. */
  forget(id?: string): void;
  flush(): void;
  /** The hidden admin panel's view — see `electron/admin.ts`. */
  admin: AdminStore;
}

export function createPeerCrafting(userDataDir: string): PeerCraftingStore {
  const store = createContributions<SharedCraftRate>({
    file: path.join(userDataDir, "peer-crafting.json"),
    what: "peer crafting rates",
    concern: "peer-knowledge",
    cap: MAX_RATES_PER_PEER,
    sanitize: sanitizeCraftRates,
    credit: (rate, by) => ({ ...rate, by: by.name, byId: by.id }),
  });

  return {
    all: () => store.pooled(),
    report(by, rates) {
      store.report(by, rates);
      log.debug("peer crafting rates filed", { by: by.id, name: by.name });
    },
    forget: (id) => store.forget(id),
    flush: () => store.flush(),
    admin: createArrayAdminStore(
      "Peer crafting rates",
      () =>
        store.all().flatMap(({ by, data }) =>
          data.map((r, row) => Object.assign(r, { contributorId: by.id, contributorName: by.name, __row: row })),
        ),
      {
        idOf: (r) => `${r.contributorId}:${r.__row}`,
        summaryOf: (r) => `${r.item} at ${r.skill} ${r.level}: ${r.ok}/${r.attempts} (from ${r.contributorName})`,
        editable: ["attempts", "ok"],
        remove: (r) => store.removeItem(r.contributorId, r.__row),
        save: () => store.flush(),
      },
    ),
  };
}
