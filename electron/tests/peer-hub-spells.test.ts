/**
 * The share hub's `spells` kind — the shard-addressed mirror ADR 0196 adds beside `items`.
 *
 * A separate, self-contained rig rather than an extension of `peer-hub.test.ts`'s shared one: that
 * file's `rig()` is used by dozens of existing tests, and `PeerShareDeps.sources` now has to cover
 * `spells` too — safer to give this new kind its own small fixture than to touch a rig that much of
 * the suite already depends on. Mirrors that file's style and the specific `items` tests this kind
 * copies the shape of.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPeerShareHub, type PeerShareDeps } from "../peer-share";
import { AWARI_MSG, type AwariPayload, type AwariPeer, type Settings } from "../../src/shared/types";
import type { ShareKind, ShareSettings } from "../../src/shared/peer-share";

const ALL_KINDS: ShareKind[] = [
  "watches", "styles", "lists", "pins", "mobs", "kills", "respawns", "timers", "buffs", "scores",
  "items", "spells", "gameTime",
];

const noTitles = { shardTitles: () => [] as string[], learnTitles: () => 0 };

const peer = (peerId: string, name?: string): AwariPeer => ({ peerId, sessionId: `s-${peerId}`, name });

function rig(over: { spells?: PeerShareDeps["spells"] } = {}) {
  const share: ShareSettings = Object.fromEntries(ALL_KINDS.map((k) => [k, true]));
  const settings = { connectPeers: true, share } as unknown as Settings;
  const rows = Object.fromEntries(ALL_KINDS.map((k) => [k, [] as unknown[]]));
  const sent: { payload: AwariPayload; to?: string }[] = [];
  const acceptedSpells: { pages: unknown[]; shard?: number }[] = [];

  const hub = createPeerShareHub({
    getSettings: () => settings,
    getName: () => "Lucy",
    send: (payload, to) => void sent.push({ payload, to }),
    fileContribution: () => {},
    changed: () => {},
    offered: () => {},
    outdated: () => {},
    acceptSpells: (pages, shard) => (acceptedSpells.push({ pages, shard }), pages.length),
    sources: Object.fromEntries(ALL_KINDS.map((k) => [k, { rows: () => rows[k] }])) as PeerShareDeps["sources"],
    spells: over.spells,
    now: () => 1_000_000,
    // Fake timers, same as `peer-hub.test.ts`'s rig — without these the hub's real 60s tick and
    // debounces are genuine `setInterval`/`setTimeout` handles that keep the process alive forever.
    setInterval: () => "tick",
    clearInterval: () => {},
    setTimeout: () => "timeout",
    clearTimeout: () => {},
  });

  return {
    hub,
    acceptedSpells,
    to: (peerId?: string) => sent.filter((s) => s.to === peerId).map((s) => s.payload),
    last: (kind: string, peerId?: string) => [...sent].reverse().find((s) => s.payload.kind === kind && s.to === peerId)?.payload,
  };
}

test("a spells ask has to name a shard, same as items", () => {
  const r = rig({ spells: { status: () => ({ pages: 5, cover: "f0" }), shard: (n) => [{ page: n }], ...noTitles } });
  r.hub.handle("bran", { kind: AWARI_MSG.ask, what: "spells" } as unknown as AwariPayload);
  assert.equal(r.to("bran").length, 0);

  r.hub.handle("bran", { kind: AWARI_MSG.ask, what: "spells", shard: 7 } as unknown as AwariPayload);
  const give = r.last(AWARI_MSG.give, "bran");
  assert.equal(give?.shard, 7);
  assert.deepEqual(give?.rows, [{ page: 7 }]);
});

test("askSpellShard sends a shard ask with no cooldown, mirroring askShard", () => {
  const r = rig();
  r.hub.askSpellShard("bran", 4);
  r.hub.askSpellShard("bran", 4);
  assert.deepEqual(
    r.to("bran").map((p) => ({ kind: p.kind, what: p.what, shard: p.shard })),
    [
      { kind: AWARI_MSG.ask, what: "spells", shard: 4 },
      { kind: AWARI_MSG.ask, what: "spells", shard: 4 },
    ],
  );
});

test("the spell room is what each peer's catalogue claims, aged from when it arrived", () => {
  const r = rig();
  r.hub.roster([peer("bran")]);
  r.hub.handle("bran", { kind: AWARI_MSG.offer, name: "Bran", spells: { n: 40, rev: 1, cover: "0f", doing: 2 } } as unknown as AwariPayload);
  const [row] = r.hub.spellRoom();
  assert.equal(row.peerId, "bran");
  assert.equal(row.doing, 2);
  assert.ok(row.at > 0, "a claim's TTL is measured from when the catalogue landed");
});

test("a spell page applies itself, the same as an item page", () => {
  const r = rig();
  r.hub.handle("bran", {
    kind: AWARI_MSG.give,
    what: "spells",
    rev: 1,
    shard: 3,
    rows: [{ title: "Chant of Battle", card: { title: "Chant of Battle", lines: ["Mana: 0"] } }],
  } as unknown as AwariPayload);
  assert.equal(r.acceptedSpells.length, 1);
  assert.equal(r.acceptedSpells[0].shard, 3);
});

test("titles a peer sends for spells are folded into our roster", () => {
  const learned: string[][] = [];
  const r = rig({
    spells: {
      status: () => ({ pages: 0, cover: "" }),
      shard: () => [],
      shardTitles: () => [],
      learnTitles: (titles) => {
        learned.push([...titles]);
        return titles.length;
      },
    },
  });

  r.hub.handle("bran", {
    kind: AWARI_MSG.give,
    what: "spells",
    shard: 3,
    rows: [],
    titles: ["Minor Healing", "Spirit of Wolf"],
  } as unknown as AwariPayload);

  assert.deepEqual(learned, [["Minor Healing", "Spirit of Wolf"]]);
});

test("a spells give never carries notItems — there is no shape-discovery for spells", () => {
  const r = rig();
  r.hub.handle("bran", {
    kind: AWARI_MSG.give,
    what: "spells",
    shard: 3,
    rows: [],
    notItems: ["should be ignored"],
  } as unknown as AwariPayload);
  // No throw, and nothing to assert taken — `readGive` only reads `notItems` for `items`.
  assert.equal(r.acceptedSpells.length, 1);
});
