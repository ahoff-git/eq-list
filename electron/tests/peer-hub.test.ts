/**
 * The share hub — the half of peer sharing that has to be running.
 *
 * The *rules* about what may cross the wire have been tested since ADR 0141 (`peer-share.test.ts`,
 * over the pure module next door). The **holder** had nothing: what the catalogue says, who is
 * allowed to have what, what happens to an answer when it lands, and what a roster change does to
 * all of it were only ever exercised by running two copies of the app and looking.
 *
 * Every dependency is injected — the clock, both timers, and every store the hub reads — so what is
 * under test here is the hub's own judgement and nothing else. The tick is a minute and the tray a
 * half-hour; neither is waited for.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPeerShareHub, type PeerShareDeps, type PeerShareHub } from "../peer-share";
import { AWARI_MSG, type AwariPayload, type AwariPeer, type Settings } from "../../src/shared/types";
import type { ShareKind, ShareSettings } from "../../src/shared/peer-share";
import { ON_YOU } from "../../src/shared/buff-tracking";

/** One peer, addressable — a session id is what turns a listed peer into one you can talk to. */
const peer = (peerId: string, name?: string): AwariPeer => ({ peerId, sessionId: `s-${peerId}`, name });

interface Rig {
  hub: PeerShareHub;
  /** Everything the hub asked us to send, in order. */
  sent: { payload: AwariPayload; to?: string }[];
  /** Payloads filed as contributions rather than trayed. */
  filed: AwariPayload[];
  /** Item pages accepted straight into the cache (the one family that applies itself). */
  accepted: { pages: unknown[]; shard?: number }[];
  notices: { peerId: string; name: string; kinds: ShareKind[] }[];
  changes: number;
  /** Run the minute tick by hand. */
  tick: () => void;
  /** Run whatever debounce is pending — a catalogue re-publish, or a notice. */
  settle: () => void;
  /** Move the clock, in ms. */
  wait: (ms: number) => void;
  rows: Record<string, unknown[]>;
  settings: Settings;
  /** Only what the hub sent to one peer (or to the room, with `undefined`). */
  to: (peerId?: string) => AwariPayload[];
  /** The last payload of a kind the hub sent, if any. */
  last: (kind: string, peerId?: string) => AwariPayload | undefined;
}

const ALL_KINDS: ShareKind[] = ["watches", "styles", "lists", "pins", "mobs", "kills", "respawns", "timers", "buffs", "scores", "items"];

/**
 * A hub with nothing real behind it.
 *
 * `share` defaults to everything on, because the interesting refusals are the ones where a *toggle*
 * says no rather than where the fixture forgot to say yes.
 */
function rig(over: { share?: ShareSettings; rows?: Record<string, unknown[]>; connectPeers?: boolean; items?: PeerShareDeps["items"]; name?: string } = {}): Rig {
  const share: ShareSettings = over.share ?? Object.fromEntries(ALL_KINDS.map((k) => [k, true]));
  const settings = { connectPeers: over.connectPeers ?? true, share } as unknown as Settings;
  const rows: Record<string, unknown[]> = { watches: [], styles: [], lists: [], pins: [], mobs: [], kills: [], respawns: [], timers: [], buffs: [], scores: [], items: [], ...over.rows };

  const sent: Rig["sent"] = [];
  const filed: AwariPayload[] = [];
  const accepted: Rig["accepted"] = [];
  const notices: Rig["notices"] = [];
  let changes = 0;
  let clock = 1_000_000;
  let ticker: (() => void) | null = null;
  /** Pending debounces, newest last. Both hub debounces are single-shot. */
  let pending: (() => void)[] = [];

  const sources = Object.fromEntries(ALL_KINDS.map((k) => [k, () => rows[k]])) as PeerShareDeps["sources"];

  const hub = createPeerShareHub({
    getSettings: () => settings,
    getName: () => over.name ?? "Lucy",
    send: (payload, to) => void sent.push({ payload, to }),
    fileContribution: (payload) => void filed.push(payload),
    changed: () => void (changes += 1),
    offered: (n) => void notices.push(n),
    acceptItems: (pages, shard) => (accepted.push({ pages, shard }), pages.length),
    sources,
    items: over.items,
    now: () => clock,
    setInterval: (fn) => ((ticker = fn), "tick"),
    clearInterval: () => void (ticker = null),
    setTimeout: (fn) => {
      pending.push(fn);
      return pending.length;
    },
    clearTimeout: (h) => void (pending[(h as number) - 1] = () => {}),
  });

  const r: Rig = {
    hub,
    sent,
    filed,
    accepted,
    notices,
    get changes() {
      return changes;
    },
    tick: () => ticker?.(),
    settle: () => {
      const due = pending;
      pending = [];
      for (const fn of due) fn();
    },
    wait: (ms) => void (clock += ms),
    rows,
    settings,
    to: (peerId) => sent.filter((s) => s.to === peerId).map((s) => s.payload),
    last: (kind, peerId) => [...sent].reverse().find((s) => s.payload.kind === kind && s.to === peerId)?.payload,
  } as Rig;
  return r;
}

/** A peer's catalogue as it arrives on the wire. */
const offerOf = (entries: Record<string, { n: number; rev: number }>, name = "Bran"): AwariPayload =>
  ({ kind: AWARI_MSG.offer, name, ...entries }) as unknown as AwariPayload;

// ── The catalogue ───────────────────────────────────────────────────────────

test("a kind that isn't switched on is absent from the catalogue, not zero", () => {
  // The catalogue *is* the toggle state (ADR 0141): "I share none" and "I don't share this" must
  // not look alike, or a peer asks for something it will be refused.
  const r = rig({ share: { watches: true, mobs: false }, rows: { watches: [{ id: "w" }] } });
  const offer = r.hub.offer();
  assert.deepEqual(offer.watches, { n: 1, rev: 1 });
  assert.equal("mobs" in offer, false);
  // Explicitly off is off, and so is never mentioned — except `items`, which is on by default.
  assert.equal("lists" in offer, false);
  assert.ok(offer.items === undefined, "no item source was wired, so there is nothing to offer");
});

test("a revision moves when a kind changes and holds still when it doesn't", () => {
  const r = rig({ rows: { watches: [{ id: "a" }] } });
  assert.equal(r.hub.offer().watches?.rev, 1);
  assert.equal(r.hub.offer().watches?.rev, 1, "measuring twice is not a change");

  r.rows.watches = [{ id: "a" }, { id: "b" }];
  assert.equal(r.hub.offer().watches?.rev, 2);
  // A revision only ever goes up, so a peer comparing them can trust the direction.
  r.rows.watches = [{ id: "a" }];
  assert.equal(r.hub.offer().watches?.rev, 3);
});

test("a source that throws costs its own kind and nothing else", () => {
  const r = rig({ rows: { watches: [{ id: "a" }] } });
  Object.defineProperty(r.rows, "styles", {
    get() {
      throw new Error("store is mid-write");
    },
  });
  const offer = r.hub.offer();
  assert.deepEqual(offer.styles, { n: 0, rev: 1 }, "a broken kind is empty, not missing and not fatal");
  assert.deepEqual(offer.watches, { n: 1, rev: 1 });
});

test("the item catalogue is offered by coverage, and its revision follows the coverage", () => {
  // A page re-fetched on its TTL moves the count and nothing a peer would want to re-ask about.
  let status = { pages: 100, cover: "ff00", doing: 3 };
  const r = rig({ items: { status: () => status, shard: () => [] } });
  assert.deepEqual(r.hub.offer().items, { n: 100, rev: 1, cover: "ff00", doing: 3 });

  status = { pages: 101, cover: "ff00", doing: 3 };
  assert.equal(r.hub.offer().items?.rev, 1, "more pages in the same shards is not new coverage");

  status = { pages: 112, cover: "ff01", doing: 4 };
  assert.equal(r.hub.offer().items?.rev, 2);
});

test("the catalogue carries our name, so a peer who missed our hello still learns it", () => {
  const r = rig({ name: "Tyrion" });
  r.tick();
  const published = r.last(AWARI_MSG.offer);
  assert.equal(published?.name, "Tyrion");
  assert.equal(r.sent.at(-1)?.to, undefined, "the catalogue is the one thing still broadcast");
});

test("nothing is published while the connection is switched off", () => {
  const r = rig({ connectPeers: false });
  r.tick();
  r.hub.touch();
  r.settle();
  assert.equal(r.sent.length, 0);
});

// ── Answering an ask ────────────────────────────────────────────────────────

test("the toggle is re-read when the ask arrives, not trusted from the catalogue we published", () => {
  // An offer is a cache of a setting; the setting is the truth, and the gap between them is exactly
  // a toggle somebody switched off ten seconds ago.
  const r = rig({ rows: { watches: [{ id: "a" }] } });
  assert.deepEqual(r.hub.offer().watches, { n: 1, rev: 1 });

  (r.settings.share as ShareSettings).watches = false;
  r.hub.handle("bran", { kind: AWARI_MSG.ask, what: "watches" } as unknown as AwariPayload);
  assert.equal(r.sent.length, 0, "a kind switched off must not be handed over");
});

test("an answer goes to the asker alone, and carries the revision it answers at", () => {
  const r = rig({ rows: { lists: [{ id: "x", name: "Fungi Staff" }] } });
  r.hub.handle("bran", { kind: AWARI_MSG.ask, what: "lists" } as unknown as AwariPayload);
  const give = r.last(AWARI_MSG.give, "bran");
  assert.equal(give?.what, "lists");
  assert.equal(give?.rev, 1);
  assert.equal((give?.rows as unknown[]).length, 1);
  assert.equal(r.to(undefined).length, 0, "an answer is peer-routed, never broadcast");
});

test("'nothing has changed since the revision you hold' is an answer, and a cheap one", () => {
  const r = rig({ rows: { lists: [{ id: "x" }] } });
  const rev = r.hub.offer().lists!.rev;
  r.hub.handle("bran", { kind: AWARI_MSG.ask, what: "lists", since: rev } as unknown as AwariPayload);
  const give = r.last(AWARI_MSG.give, "bran");
  assert.equal("rows" in give!, false, "an unchanged answer carries no rows");
  assert.equal(give?.rev, rev);
});

test("an ask for a kind nobody has heard of is ignored rather than guessed at", () => {
  const r = rig();
  assert.equal(r.hub.handle("bran", { kind: AWARI_MSG.ask, what: "passwords" } as unknown as AwariPayload), true);
  assert.equal(r.sent.length, 0);
});

test("an items ask has to name a shard — 'send me all eleven thousand' is not a request", () => {
  const r = rig({ items: { status: () => ({ pages: 5, cover: "f0" }), shard: (n) => [{ page: n }] } });
  r.hub.handle("bran", { kind: AWARI_MSG.ask, what: "items" } as unknown as AwariPayload);
  assert.equal(r.sent.length, 0);

  r.hub.handle("bran", { kind: AWARI_MSG.ask, what: "items", shard: 7 } as unknown as AwariPayload);
  const give = r.last(AWARI_MSG.give, "bran");
  assert.equal(give?.shard, 7);
  assert.deepEqual(give?.rows, [{ page: 7 }]);
});

test("a buff's 'on you' is resolved to our name before it leaves", () => {
  // A relative target crossing a machine boundary is a lie: replayed verbatim, every peer's
  // self-buffs collapse onto the receiver's.
  const r = rig({
    name: "Arya",
    rows: {
      buffs: [
        { key: "spirit of wolf", spell: "Spirit of Wolf", target: ON_YOU, up: true, at: "2024-01-01T00:00:00.000Z", since: "2024-01-01T00:00:00.000Z", source: "landed", byYou: false, permanent: false, onEnemy: false },
      ],
    },
  });
  r.hub.handle("bran", { kind: AWARI_MSG.ask, what: "buffs" } as unknown as AwariPayload);
  const rows = r.last(AWARI_MSG.give, "bran")?.rows as { target: string }[];
  assert.equal(rows[0].target, "Arya");
});

// ── Keeping what arrives ────────────────────────────────────────────────────

test("an observation goes into the pipeline, tagged with who sent it — never into the tray", () => {
  const r = rig();
  r.hub.handle("bran", {
    kind: AWARI_MSG.give,
    what: "mobs",
    rev: 4,
    id: "contrib-1",
    name: "Bran",
    rows: [{ zone: "gfaydark", mob: "a bat", y: 1, x: 2 }],
  } as unknown as AwariPayload);
  assert.equal(r.filed.length, 1);
  assert.equal(r.filed[0].id, "contrib-1");
  assert.equal(r.hub.received().length, 0, "an observation is pooled, not trayed");
});

test("an item page applies itself; nothing authored ever does", () => {
  const r = rig();
  r.hub.handle("bran", {
    kind: AWARI_MSG.give,
    what: "items",
    rev: 1,
    shard: 3,
    rows: [{ title: "Fungi Tunic", kind: "item", at: 999_000, sources: [] }],
  } as unknown as AwariPayload);
  assert.equal(r.accepted.length, 1);
  assert.equal(r.accepted[0].shard, 3);

  r.hub.handle("bran", { kind: AWARI_MSG.give, what: "watches", rev: 1, from: "Bran", rows: [{ id: "w", name: "boat" }] } as unknown as AwariPayload);
  assert.equal(r.accepted.length, 1, "an authored artifact is not applied");
  assert.equal(r.hub.received("bran", "watches").length, 1, "it waits in the tray");
});

test("an unchanged answer leaves the tray exactly as it was", () => {
  const r = rig();
  const give = { kind: AWARI_MSG.give, what: "lists", rev: 2, from: "Bran", rows: [{ id: "a", name: "x" }] };
  r.hub.handle("bran", give as unknown as AwariPayload);
  const before = r.hub.received("bran", "lists")[0];
  r.hub.handle("bran", { kind: AWARI_MSG.give, what: "lists", rev: 2, from: "Bran" } as unknown as AwariPayload);
  assert.deepEqual(r.hub.received("bran", "lists")[0], before);
});

test("a tray entry ages out, and says so once", () => {
  const r = rig();
  r.hub.handle("bran", { kind: AWARI_MSG.give, what: "lists", rev: 1, from: "Bran", rows: [{ id: "a" }] } as unknown as AwariPayload);
  assert.equal(r.hub.received().length, 1);

  r.wait(29 * 60_000);
  r.tick();
  assert.equal(r.hub.received().length, 1, "half an hour is the tray's TTL, not twenty-nine minutes");

  r.wait(2 * 60_000);
  r.tick();
  assert.equal(r.hub.received().length, 0);
});

// ── The roster, and what leaving costs ──────────────────────────────────────

test("somebody who leaves loses their catalogue and keeps their tray", () => {
  // What they already handed over is ours to look at; losing a list you were halfway through
  // copying because they logged off is worse than a slightly stale row.
  const r = rig();
  r.hub.roster([peer("bran", "Bran")]);
  r.hub.handle("bran", offerOf({ lists: { n: 3, rev: 1 } }));
  r.hub.handle("bran", { kind: AWARI_MSG.give, what: "lists", rev: 1, from: "Bran", rows: [{ id: "a" }] } as unknown as AwariPayload);
  assert.equal(r.hub.room().peers.length, 1);

  r.hub.roster([]);
  assert.equal(r.hub.room().peers.length, 0);
  assert.equal(r.hub.received("bran").length, 1, "their tray survives them");
  r.tick();
  assert.equal(r.to("bran").filter((p) => p.kind === AWARI_MSG.ask).length, 0, "nobody asks a peer who has gone");
});

test("a newcomer is sent the catalogue rather than waiting out the minute", () => {
  const r = rig({ rows: { lists: [{ id: "a" }] } });
  r.hub.roster([peer("bran")]);
  r.settle();
  assert.equal(r.last(AWARI_MSG.offer)?.kind, AWARI_MSG.offer);
});

test("a room we are no longer in has no roster and no catalogues, but still has its tray", () => {
  const r = rig();
  r.hub.roster([peer("bran", "Bran")]);
  r.hub.handle("bran", offerOf({ mobs: { n: 5, rev: 2 } }));
  r.hub.handle("bran", { kind: AWARI_MSG.give, what: "lists", rev: 1, from: "Bran", rows: [{ id: "a" }] } as unknown as AwariPayload);

  r.hub.noteStatus({ connected: false, peerId: null });
  assert.deepEqual(r.hub.room(), { status: { connected: false, peerId: null }, peers: [] });
  assert.equal(r.hub.itemRoom().length, 0);
  assert.equal(r.hub.received().length, 1);
});

test("the room can be asked for, not only listened to", () => {
  // A panel that opens on a tab click has missed every push by then — which showed as
  // "Who's here · 0 peers" in a full room (ADR 0144).
  const r = rig();
  r.hub.noteStatus({ connected: true, peerId: "me" });
  r.hub.roster([peer("bran", "Bran"), peer("arya", "Arya")]);
  const room = r.hub.room();
  assert.equal(room.status.connected, true);
  assert.deepEqual(room.peers.map((p) => p.name).sort(), ["Arya", "Bran"]);
});

// ── Fetching, reconciling, and not being chatty ─────────────────────────────

test("an offer fetches observations by itself and leaves everything authored alone", () => {
  const r = rig();
  r.hub.roster([peer("bran", "Bran")]);
  r.hub.handle("bran", offerOf({ mobs: { n: 5, rev: 2 }, watches: { n: 3, rev: 1 }, timers: { n: 2, rev: 1 } }));
  const asks = r.to("bran").filter((p) => p.kind === AWARI_MSG.ask).map((p) => p.what);
  assert.deepEqual(asks, ["mobs"], "a watch rule fetched behind its reader's back is a tray nobody asked to fill");
});

test("a kind offered over an empty store is nothing to fetch", () => {
  const r = rig();
  r.hub.roster([peer("bran")]);
  r.hub.handle("bran", offerOf({ mobs: { n: 0, rev: 9 } }));
  assert.equal(r.to("bran").length, 0);
});

test("one ask per cooldown, however much a peer's revision flaps", () => {
  const r = rig();
  r.hub.roster([peer("bran")]);
  for (let rev = 1; rev <= 5; rev++) r.hub.handle("bran", offerOf({ mobs: { n: 5, rev } }));
  assert.equal(r.to("bran").length, 1);

  r.wait(31_000);
  r.hub.handle("bran", offerOf({ mobs: { n: 5, rev: 6 } }));
  assert.equal(r.to("bran").length, 2);
});

test("a person clicking ask is not rate-limited — they can see it didn't work", () => {
  const r = rig();
  r.hub.roster([peer("bran")]);
  r.hub.ask("bran", "watches");
  r.hub.ask("bran", "watches");
  assert.equal(r.to("bran").length, 2);
});

test("the tick asks again for anything a peer holds past what we have", () => {
  // A comparison of what is, not a reaction to an event: a lost `give`, a restart, or an offer that
  // arrived while the connection was off all heal here instead of never (ADR 0145).
  const r = rig();
  r.hub.roster([peer("bran")]);
  r.hub.handle("bran", offerOf({ mobs: { n: 5, rev: 4 } }));
  assert.equal(r.to("bran").length, 1);

  // Their answer never lands. A minute later, and past the cooldown, we ask again.
  r.wait(61_000);
  r.tick();
  assert.equal(r.to("bran").filter((p) => p.kind === AWARI_MSG.ask).length, 2);
});

test("reconciling stops once the answer has landed", () => {
  const r = rig();
  r.hub.roster([peer("bran")]);
  r.hub.handle("bran", offerOf({ mobs: { n: 5, rev: 4 } }));
  // An observation is filed rather than trayed, so what we hold of it is not the tray — the ask
  // repeats until the offer stops moving past us, which is the cooldown's job to pace.
  r.hub.handle("bran", { kind: AWARI_MSG.give, what: "lists", rev: 4, from: "Bran", rows: [] } as unknown as AwariPayload);
  r.wait(61_000);
  r.tick();
  const asks = r.to("bran").filter((p) => p.kind === AWARI_MSG.ask).map((p) => p.what);
  assert.equal(asks.includes("lists"), false, "nothing authored is re-fetched on a tick");
});

test("a peer we cannot address is not asked anything, and the refusal costs no cooldown", () => {
  // A catalogue and the roster row it belongs to are two IPC messages with no ordering guarantee.
  // Asking a peer we cannot yet reach would be dropped by the owner window *and* would write the
  // cooldown, so the moment they became reachable we would refuse to ask again for half a minute.
  const r = rig();
  r.hub.roster([{ peerId: "bran" } as AwariPeer]);
  r.hub.handle("bran", offerOf({ mobs: { n: 5, rev: 1 } }));
  assert.equal(r.to("bran").length, 0);

  r.hub.roster([peer("bran")]);
  r.tick();
  assert.deepEqual(r.to("bran").filter((p) => p.kind === AWARI_MSG.ask).map((p) => p.what), ["mobs"]);
});

test("a shard is asked for once, by the planner, with no cooldown to hide a bad plan", () => {
  const r = rig();
  r.hub.askShard("bran", 4);
  r.hub.askShard("bran", 4);
  assert.deepEqual(r.to("bran").map((p) => p.shard), [4, 4]);
});

test("the item room is what each peer's catalogue claims, aged from when it arrived", () => {
  const r = rig();
  r.hub.roster([peer("bran")]);
  r.hub.handle("bran", { kind: AWARI_MSG.offer, name: "Bran", items: { n: 40, rev: 1, cover: "0f", doing: 2 } } as unknown as AwariPayload);
  const [row] = r.hub.itemRoom();
  assert.equal(row.peerId, "bran");
  assert.equal(row.doing, 2);
  assert.ok(row.at > 0, "a claim's TTL is measured from when the catalogue landed");
});

// ── Notices ─────────────────────────────────────────────────────────────────

test("a newly offered kind is one notice per peer, once per name, and only for what needs a click", () => {
  const r = rig();
  r.hub.roster([peer("bran", "Bran")]);
  r.hub.handle("bran", offerOf({ watches: { n: 2, rev: 1 }, styles: { n: 1, rev: 1 }, mobs: { n: 9, rev: 1 } }));
  r.settle();
  assert.equal(r.notices.length, 1, "one notice per peer, not one per kind");
  assert.deepEqual(r.notices[0].kinds, ["watches", "styles"], "an observation fetches itself and needs no notice");
  assert.equal(r.notices[0].name, "Bran");

  // The same peer under a fresh id — a re-join takes a new one, and keying by id would re-announce
  // everybody every time the network hiccuped.
  r.hub.roster([peer("bran2", "Bran")]);
  r.hub.handle("bran2", offerOf({ watches: { n: 2, rev: 1 } }));
  r.settle();
  assert.equal(r.notices.length, 1);
});

test("a count moving is somebody's evening, not an offer", () => {
  const r = rig();
  r.hub.roster([peer("bran", "Bran")]);
  r.hub.handle("bran", offerOf({ watches: { n: 2, rev: 1 } }));
  r.settle();
  r.hub.handle("bran", offerOf({ watches: { n: 40, rev: 9 } }));
  r.settle();
  assert.equal(r.notices.length, 1);
});

test("nobody is announced who left before the notice went out", () => {
  const r = rig();
  r.hub.roster([peer("bran", "Bran")]);
  r.hub.handle("bran", offerOf({ watches: { n: 2, rev: 1 } }));
  r.hub.roster([]);
  r.settle();
  assert.equal(r.notices.length, 0, "a notice would point at a row that isn't there");
});

// ── Clearing, pins, and shutting down ───────────────────────────────────────

test("the tray clears by peer, by kind, or entirely", () => {
  const r = rig();
  for (const [peerId, what] of [["bran", "lists"], ["bran", "watches"], ["arya", "lists"]] as const) {
    r.hub.handle(peerId, { kind: AWARI_MSG.give, what, rev: 1, from: peerId, rows: [{ id: "a" }] } as unknown as AwariPayload);
  }
  assert.equal(r.hub.received().length, 3);
  r.hub.clear("bran", "lists");
  assert.equal(r.hub.received().length, 2);
  r.hub.clear("arya");
  assert.equal(r.hub.received().length, 1);
  r.hub.clear();
  assert.equal(r.hub.received().length, 0);
});

test("pins are the one kind main cannot read for itself, so the map reports them in", () => {
  const r = rig();
  assert.deepEqual(r.hub.mine("pins"), []);
  r.hub.setPins([{ id: "p1", zone: "gfaydark", y: 1, x: 2 } as never]);
  assert.equal(r.hub.mine("pins").length, 1);
  assert.equal(r.hub.offer().pins?.n, 1);
});

test("a stopped hub stops ticking", () => {
  const r = rig();
  r.hub.stop();
  r.tick();
  assert.equal(r.sent.length, 0);
});
