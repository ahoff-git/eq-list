/**
 * awari-web.ts — the web build's `awari` + `peer` broker, standing in for Electron's IPC relay
 * (`electron/ipc.ts`'s `registerPeerIpc`) between `AwariHost` (the transport, unchanged — it already
 * runs entirely in the browser, see `src/lib/awari/host.tsx`) and the peer-share hub
 * (`src/shared/peer-share-hub.ts`, also unchanged: it was moved to `shared` for exactly this reuse).
 *
 * In Electron the hub lives in main because main is the one participant always running, and every
 * window reaches the one WebRTC socket over IPC (ADR 0012). A browser tab has neither a main process
 * nor a second window to relay to — there is exactly one participant — so this is the same wiring
 * with the IPC hop removed: `send()`/`onPublish` and `reportMessage`/`onMessage` are plain in-tab
 * event buses instead of `ipcRenderer` channels. `AwariHost` cannot tell the difference.
 *
 * This is also where a web visitor actually **contributes**: the hub answers `items`/`spells` shard
 * asks from the snapshot's page cache (`item-shard-source.ts`) and folds in pages a peer hands back,
 * so the room gets real value from a tab that has never touched eqlwiki directly.
 */
import { createPeerShareHub } from "@/shared/peer-share-hub";
import { rememberPage } from "./snapshot";
import { loadWebItemSources, type ItemShardSource } from "./item-shard-source";
import { getList, onListChanged } from "./local-store";
import type {
  AwariInbound,
  AwariOutbound,
  AwariPayload,
  AwariPeer,
  AwariStatus,
  EqlApi,
  Settings,
  Unsubscribe,
} from "@/shared/types";
import type { PeerOfferNotice, PeerVersionNotice, ReceivedShare, ShareKind } from "@/shared/peer-share";
import type { WikiPage } from "@/shared/types";

function emitter<T>() {
  const listeners = new Set<(v: T) => void>();
  return {
    on: (cb: (v: T) => void): Unsubscribe => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    emit: (v: T): void => {
      for (const cb of listeners) cb(v);
    },
  };
}

const EMPTY_SOURCE: ItemShardSource = {
  status: () => ({ pages: 0, cover: "" }),
  shard: () => [],
  shardTitles: () => [],
  shardNotItems: () => [],
  learnTitles: () => 0,
  learnNotItems: () => 0,
  fill: () => {},
};

/** Delegates to whatever `loadWebItemSources` swaps in — the hub captures this object once, by
 *  reference, so the indirection is what lets the snapshot finish loading *after* the hub is built. */
function proxySource(get: () => ItemShardSource): ItemShardSource {
  return {
    status: () => get().status(),
    shard: (s) => get().shard(s),
    shardTitles: (s) => get().shardTitles(s),
    shardNotItems: (s) => get().shardNotItems(s),
    learnTitles: (t) => get().learnTitles(t),
    learnNotItems: (t) => get().learnNotItems(t),
    fill: () => get().fill(),
  };
}

export function createAwariWeb(deps: { getSettings: () => Settings; getName: () => string }): {
  awari: EqlApi["awari"];
  peer: EqlApi["peer"];
} {
  const messageBus = emitter<AwariInbound>();
  const statusBus = emitter<AwariStatus>();
  const peersBus = emitter<AwariPeer[]>();
  const publishBus = emitter<AwariOutbound>();
  const rejoinBus = emitter<void>();
  const changedBus = emitter<void>();
  const offeredBus = emitter<PeerOfferNotice>();
  const outdatedBus = emitter<PeerVersionNotice>();

  let items: ItemShardSource = EMPTY_SOURCE;
  let spells: ItemShardSource = EMPTY_SOURCE;
  void loadWebItemSources().then((loaded) => {
    items = loaded.items;
    spells = loaded.spells;
    hub.touch(); // the catalogue line was `{pages:0}` until now — worth re-publishing once it isn't
  });

  const hub = createPeerShareHub({
    getSettings: deps.getSettings,
    getName: deps.getName,
    send: (payload, to) => publishBus.emit({ payload, to }),
    // No personal stores to file an observation into — a web tab pools nothing of its own (see the
    // `sources` table below), so nothing it receives here has anywhere to go either. Received but
    // not kept: the room's own `mirror` family (items/spells/gameTime) is the half that matters for
    // a visitor with no game running, and that half *is* wired, below.
    fileContribution: () => {},
    changed: () => changedBus.emit(),
    offered: (n) => offeredBus.emit(n),
    outdated: (n) => outdatedBus.emit(n),
    acceptItems: (pages) => {
      for (const p of pages) rememberPage(p as WikiPage);
      return pages.length;
    },
    acceptSpells: (pages) => {
      for (const p of pages) rememberPage(p as WikiPage);
      return pages.length;
    },
    // Not wired to a displayed clock yet (the web build has no `gameClock` view) — a follow-up, not a
    // silent drop: the reading simply isn't kept anywhere for now.
    acceptGameTime: () => {},
    sources: {
      watches: { rows: () => [] },
      styles: { rows: () => [] },
      // The one personal thing a web visitor has: a shopping list, kept in `localStorage`. Sharing it
      // costs nothing extra to wire and is exactly the kind of thing ADR 0141 built `lists` for.
      lists: { rows: () => getList().entries },
      pins: { rows: () => [] },
      mobs: { rows: () => [] },
      kills: { rows: () => [] },
      respawns: { rows: () => [] },
      timers: { rows: () => [] },
      buffs: { rows: () => [] },
      scores: { rows: () => [] },
      // Addressed by shard, never as a whole kind — present so the table has no hole in it.
      items: { rows: () => [] },
      spells: { rows: () => [] },
      gameTime: { rows: () => [] },
    },
    items: proxySource(() => items),
    spells: proxySource(() => spells),
  });

  onListChanged(() => hub.touch());

  return {
    awari: {
      send: (payload, to) => publishBus.emit({ payload, to }),
      onMessage: (cb) => messageBus.on(cb),
      onStatus: (cb) => statusBus.on(cb),
      onPeers: (cb) => peersBus.on(cb),
      onPublish: (cb) => publishBus.on(cb),
      onRejoin: (cb) => rejoinBus.on(cb),
      reportMessage: (msg) => {
        messageBus.emit(msg);
        hub.handle(msg.sender, msg.payload as AwariPayload);
      },
      reportStatus: (status) => {
        hub.noteStatus(status);
        statusBus.emit(status);
      },
      reportPeers: (peers) => {
        hub.roster(peers);
        peersBus.emit(peers);
      },
    },
    peer: {
      offer: async () => {
        const out: Record<string, { n: number; rev: number }> = {};
        for (const [k, v] of Object.entries(hub.offer())) if (v) out[k] = { n: v.n, rev: v.rev };
        return out;
      },
      room: async () => hub.room(),
      rejoin: () => rejoinBus.emit(),
      mine: async (kind: ShareKind) => hub.mine(kind),
      ask: (peerId, kind) => hub.ask(peerId, kind),
      received: async (peerId, kind): Promise<ReceivedShare[]> => hub.received(peerId, kind),
      clear: (peerId, kind) => hub.clear(peerId, kind),
      setPins: (pins) => hub.setPins(pins),
      onChanged: (cb) => changedBus.on(cb),
      onOffered: (cb) => offeredBus.on(cb),
      onOutdated: (cb) => outdatedBus.on(cb),
    },
  };
}
