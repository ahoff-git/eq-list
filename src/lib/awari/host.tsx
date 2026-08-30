"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { connectToRoom, randomPeerId, ROOM_ID } from "@/lib/awari/net";
import { useSettings, useCurrentZone, usePlayerLoc, useWatcherStatus } from "@/lib/hooks";
import { createLogger } from "@/shared/logging";
import { characterFromLogFile } from "@/shared/log-parser";
import { AWARI_MSG } from "@/shared/types";
import type { AwariPayload, AwariPeer } from "@/shared/types";
import { readOffer } from "@/shared/peer-share";
import { createRoomWatch, spread, type RoomWatch } from "@/shared/room-watch";
import type { MessageRoute, RoomSession } from "@awari/protocol";

const log = createLogger("awari");

/**
 * How long to wait before re-joining after the room goes away under us — awari's
 * `onDisconnected`, or a join that never landed at all.
 *
 * Deliberately **unbounded**: being disconnected is never a resting state. The last delay repeats
 * for as long as the outage does, so a bootstrap service or a relay that is down costs one attempt
 * a minute rather than a spin — and the room heals by itself when it comes back, instead of
 * needing the player to guess that toggling Connect off and on is what fixes it.
 *
 * This is the **only** retry ladder left here. Wondering whether a room of one is really a room of
 * one used to be a second, differently-tuned ladder beside it (and a third in main); it is now a
 * question with an answer — see `src/shared/room-watch.ts`.
 */
const RECONNECT_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000];

/**
 * Backoff for the nth consecutive failure, holding at the last step rather than running out.
 *
 * Spread for the same reason every other wait here is: an outage everybody shares — the bootstrap
 * service restarting, a relay dropping — ends for everybody at once, and a room's worth of clients
 * retrying on the same schedule would all come back in the same instant and race each other into
 * fresh rooms, manufacturing the split this file spends the rest of its length curing.
 */
function reconnectWait(failures: number): number {
  return spread(RECONNECT_DELAYS_MS[Math.min(failures, RECONNECT_DELAYS_MS.length - 1)]);
}

/**
 * The app's single awari connection, owned by the always-alive main window — route
 * `/` (this component's host) renders ONLY there, so ownership needs no role check.
 * WebRTC only runs in a renderer, so centralizing the socket here (rather than in the
 * on-demand map window) makes peer networking an app-level service any window reaches
 * over the IPC broker (see ADR 0012). This component:
 *   - joins / leaves the room per Settings (`connectPeers`, `bootstrapUrl`), and re-joins on its
 *     own when the room drops or a join fails — awari recovers a leader handoff silently, but
 *     once it reports `onDisconnected` the room is gone until somebody re-joins, and that
 *     somebody is here (see ADR 0070);
 *   - keeps asking whether a room of one is really one, and re-joins when the answer is no — the
 *     only place with a transport to ask the question with (see `src/shared/room-watch.ts`);
 *   - relays inbound peer messages + connection status up to the broker, which fans
 *     them out to every window (`api.awari.reportMessage` / `reportStatus`);
 *   - keeps the room roster (who's connected, and the name/zone each announced) and
 *     reports it the same way, so any window can list connected users;
 *   - publishes payloads other windows ask to send (`api.awari.onPublish`);
 *   - broadcasts our own live location while sharing is on.
 * Renders nothing.
 */
export default function AwariHost() {
  const settings = useSettings();
  const connected = settings?.connectPeers ?? false;
  const sharing = settings?.shareLocation ?? false;
  const bootstrapUrl = settings?.bootstrapUrl ?? "";
  const zone = useCurrentZone();
  const loc = usePlayerLoc();
  const watcher = useWatcherStatus();
  // Same rule the map uses: an explicit name wins, else the log's character name.
  const myName = (settings?.playerName || "").trim() || characterFromLogFile(watcher.file) || "";

  const sessionRef = useRef<RoomSession | null>(null);
  /** Who else is in the room: awari's roster, enriched by their `hello` payloads. */
  const rosterRef = useRef(new Map<string, AwariPeer>());
  /** Peers we've already answered, so a mutual greeting settles instead of ping-ponging. */
  const greetedRef = useRef(new Set<string>());

  /**
   * The last payload of each kind that couldn't be sent because the room wasn't up yet.
   *
   * Joining takes a few seconds, and every window announces itself the moment it mounts, so
   * the opening `hello` and the initial pins/kills/mobs broadcasts all landed before there
   * was anywhere to send them. They were dropped and nothing re-sent them: someone who left
   * sharing switched on shared *nothing* until they happened to kill something new.
   *
   * Keyed by kind and last-write-wins, because these are all "here is my current state"
   * messages — replaying a backlog of them would be wrong; replaying the newest is exactly
   * right.
   */
  const pendingRef = useRef(new Map<string, AwariPayload>());

  /**
   * Publish a payload, to the room or to one peer, or hold it until there's a room to publish to.
   *
   * **A direct send is never held.** The held map is last-write-wins per *kind*, which is exactly
   * right for "here is my current state" broadcasts and exactly wrong for a conversation: two asks
   * to two different peers would collapse into one, and an answer replayed minutes later to a peer
   * that has moved on is noise. So a direct send with nowhere to go is simply dropped and logged —
   * an unanswered `ask` costs a retry, where a mis-delivered `give` costs correctness (ADR 0141).
   */
  const publish = useCallback((payload: AwariPayload, to?: string) => {
    const s = sessionRef.current;
    if (!s) {
      if (to) return void log.debug("direct send dropped - no room:", payload.kind, "->", to);
      pendingRef.current.set(payload.kind, payload);
      return void log.debug("publish held until the room is up:", payload.kind);
    }
    // A direct route needs the session id too, and the roster is where a peer id becomes a peer.
    // Somebody who has left has no row, and their message simply isn't sent.
    const peer = to ? rosterRef.current.get(to) : undefined;
    if (to && !peer?.sessionId) {
      return void log.debug("direct send dropped - peer not addressable:", to, payload.kind);
    }
    const route: MessageRoute = peer?.sessionId
      ? { type: "peer", peer: { peerId: peer.peerId, sessionId: peer.sessionId } }
      : { type: "room" };
    void s.publish(route, payload).catch((e) => log.debug("publish failed:", (e as Error).message));
  }, []);

  const reportRoster = useCallback(() => {
    api()?.awari.reportPeers([...rosterRef.current.values()]);
  }, []);

  // Our announced identity, in a ref so `sayHello` stays stable across renames/zoning.
  const identityRef = useRef({ name: myName, zone: zone ?? "" });
  identityRef.current = { name: myName, zone: zone ?? "" };

  /** Announce who we are (and where) so peers can list us by name, not by peer id. */
  const sayHello = useCallback(() => {
    publish({ kind: AWARI_MSG.hello, ...identityRef.current });
  }, [publish]);
  // The inbound handler is created when we join and must not be rebuilt to reach a newer
  // `sayHello`; a ref keeps it current without re-joining the room.
  const sayHelloRef = useRef(sayHello);
  sayHelloRef.current = sayHello;


  /**
   * Bumped to re-run the join effect. *Why* we're re-joining lives in the state below rather than
   * in this number, because it must survive a re-join to pace the next one — and a counter the
   * effect depends on would re-join every time it moved.
   */
  const [joinGeneration, setJoinGeneration] = useState(0);
  /** Consecutive drops / failed joins, pacing `reconnectWait`. Reset once a room reaches someone. */
  const failuresRef = useRef(0);
  /**
   * Whether a room of one is worth doubting yet, and what a look at the directory settled.
   *
   * Outlives the join effect on purpose: the rung it is on has to survive a re-join to pace the one
   * after it. Holding it in the effect is what the two ladders this replaces did, and it is why one
   * of them spent its budget without ever refunding it while the other had its five-minute clock
   * reset by every re-join the first one made.
   */
  const watchRef = useRef<RoomWatch | null>(null);
  // Built on first use rather than passed to `useRef`, which would construct one on every render —
  // and this component re-renders on every position line the log yields.
  watchRef.current ??= createRoomWatch();

  // Join / leave. Re-runs when the connection is toggled, the bootstrap URL changes, or a dropped
  // room, a failed join, or a look that found us in the wrong room prompts a retry.
  useEffect(() => {
    const a = api();
    if (!a) return;
    if (!connected) {
      a.awari.reportStatus({ connected: false, peerId: null });
      return;
    }
    let cancelled = false;
    /** The next look at whether this room of one is really one (see `room-watch.ts`). */
    let look: ReturnType<typeof setTimeout> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let session: RoomSession | null = null;
    /** Set once awari says the room is unreachable — a dead session gets no graceful leave. */
    let dropped = false;
    const myPeerId = randomPeerId();
    // The Map instance itself never changes; hold it locally so the cleanup below
    // clears the same roster this join populated.
    const roster = rosterRef.current;
    const greeted = greetedRef.current;
    const pending = pendingRef.current;

    /** Re-run this effect, which tears the old session down and joins again from a fresh peer id. */
    const rejoinNow = () => {
      if (!cancelled) setJoinGeneration((n) => n + 1);
    };

    /** Forget the room and come back after a backoff. Shared by a drop and a join that failed. */
    const recoverFrom = (what: string) => {
      if (cancelled) return;
      const wait = reconnectWait(failuresRef.current);
      failuresRef.current += 1;
      log.debug(what, "- re-joining in", wait, "ms");
      retry = setTimeout(rejoinNow, wait);
    };

    void connectToRoom({
      roomId: ROOM_ID,
      peerId: myPeerId,
      bootstrapUrl,
      onMessage: (m) => {
        const sender = m.sender?.peerId;
        // Never echo ourselves — consumers get a clean peer-only stream. Compared against *this*
        // join's id rather than the newest one: a handler belongs to the session that created it,
        // and reading a ref would have it filtering by whoever we became after a re-join.
        if (!sender || sender === myPeerId) return;
        // A peer we have heard from is addressable, whether or not `onPeerJoined` reached us first
        // — the envelope carries the whole `PeerRef`, so this is the same fact from a second source
        // and costs nothing to keep current.
        const known = roster.get(sender);
        if (m.sender.sessionId && known?.sessionId !== m.sender.sessionId) {
          roster.set(sender, { ...known, peerId: sender, sessionId: m.sender.sessionId });
          reportRoster();
        }
        const payload = (m.payload ?? {}) as { kind: string; name?: unknown; zone?: unknown };
        // A `hello` is how a peer id gets a name — fold it into the roster (a peer we
        // haven't been told about yet still gets a row, keyed by id).
        if (payload.kind === AWARI_MSG.hello) {
          const prev = roster.get(sender) ?? { peerId: sender };
          roster.set(sender, {
            ...prev,
            name: typeof payload.name === "string" ? payload.name : prev.name,
            zone: typeof payload.zone === "string" ? payload.zone : prev.zone,
          });
          reportRoster();
          // Answer a hello with our own, once per peer. The greeting sent from `onPeerJoined`
          // races the data channel actually opening and is simply lost when it loses, which
          // left whoever joined first permanently nameless to whoever joined second. A reply
          // can't lose that race — their hello arriving is proof the channel is up — and
          // "once per peer" is what stops the two of us greeting each other forever.
          if (!greeted.has(sender)) {
            greeted.add(sender);
            sayHelloRef.current();
          }
        }
        // A catalogue is roster data, not a message anybody draws — fold it in and let the panel
        // read it off the peer row, the same way a name is.
        if (payload.kind === AWARI_MSG.offer) {
          const prev = roster.get(sender) ?? { peerId: sender };
          roster.set(sender, {
            ...prev,
            // A catalogue names its sender as well, redundantly with `hello` and on purpose: a peer
            // who missed the one `hello` we sent on joining would otherwise stay nameless for the
            // whole session, and a nameless row is what makes the Peers tab unreadable. The
            // catalogue comes round every minute, so this heals by itself.
            name: typeof payload.name === "string" && payload.name ? payload.name : prev.name,
            offer: readOffer(payload),
          });
          reportRoster();
        }
        a.awari.reportMessage({ sender, payload: payload as { kind: string } });
      },
    })
      .then(({ session: s, probe }) => {
        if (cancelled) return void s.close();
        session = s;
        sessionRef.current = s;
        a.awari.reportStatus({ connected: true, peerId: myPeerId });
        // Presence: awari replays every already-active peer to a fresh handler, so
        // this seeds the roster as well as tracking later joins/leaves.
        s.onPeerJoined((peer) => {
          if (peer.peerId === myPeerId) return;
          // A room that reached somebody is a working room: the next outage starts its backoff
          // from the top instead of inheriting the cooldown of an old one.
          failuresRef.current = 0;
          // The session id arrives here and nowhere else in the roster's life, and it is what
          // makes a peer *addressable* rather than merely listed (ADR 0141) — so a rejoin under a
          // fresh session must overwrite it rather than be skipped as "already known".
          roster.set(peer.peerId, { ...roster.get(peer.peerId), peerId: peer.peerId, sessionId: peer.sessionId });
          log.debug("peer joined:", peer.peerId, "- room now", roster.size);
          reportRoster();
          sayHello(); // a new arrival doesn't know us yet
        });
        s.onPeerLeft((peer) => {
          roster.delete(peer.peerId);
          log.debug("peer left:", peer.peerId, "- room now", roster.size);
          greeted.delete(peer.peerId); // a returning peer gets greeted again
          reportRoster();
        });
        // awari has exhausted its own leader recovery: every contact it could resolve failed, so
        // this peer cannot reach the room again without re-joining. **Nothing used to listen for
        // this**, which is the whole "it still says connected but nobody sees my ping": the app
        // went on reporting `connected: true` over a dead session, publishing into it (the
        // rejection went to a debug line), and showing a roster of people who could no longer
        // hear us. The only re-join that existed was the cold-start lonely timer, and that
        // switches itself off the moment a peer is seen — so the first drop was permanent.
        s.onDisconnected((reason) => {
          if (cancelled) return;
          dropped = true;
          log.warn("dropped out of the awari room:", reason.message);
          // Held payloads are the right home for anything published during the outage: they're
          // last-write-wins per kind, so what flushes on re-join is our current state, not a
          // backlog. Clearing the roster is what makes the map empty out (see ADR 0012's brokered
          // status) rather than leaving ghosts on screen.
          sessionRef.current = null;
          roster.clear();
          greeted.clear();
          a.awari.reportStatus({ connected: false, peerId: null });
          reportRoster();
          // Hold the watch's clock: an outage must not bank time towards a look there is no
          // transport left to take, and the recovery backoff owns this stretch.
          watchRef.current!.saw({ connected: false, peers: 0 });
          recoverFrom("room unreachable");
        });
        sayHello();
        // Anything that tried to go out while we were still joining, now that it can.
        const held = [...pending.values()];
        pending.clear();
        for (const payload of held) publish(payload);
        if (held.length) log.debug("flushed", held.length, "held payload(s)");

        /**
         * Keep asking whether this room of one is the room the world can find.
         *
         * Re-armed every time round rather than scheduled once, which is the bug the single
         * `setTimeout` here used to have: a peer who happened to be present at the instant it
         * fired cancelled the only look this session would ever take, so a client that met
         * somebody for a minute and was then left alone had nothing watching it at all.
         *
         * The looking is what makes this affordable. A look costs one bootstrap POST and one dial;
         * only an answer re-joins, so a genuinely solitary player never tears anything down.
         */
        const takeALook = async () => {
          look = null;
          if (cancelled || dropped) return;
          const watch = watchRef.current!;
          if (watch.saw({ connected: true, peers: roster.size }) === "probe") {
            const found = await probe();
            if (cancelled || dropped) return;
            const verdict = watch.probed(found);
            // A probe takes seconds, and somebody can arrive during them. Re-joining then would
            // drop a room that had just started working to go looking for a better one.
            if (verdict === "rejoin" && roster.size > 0) {
              log.debug("a peer arrived while we were looking - staying where we are");
            } else if (verdict === "rejoin" && found.reached) {
              log.warn("we are not in the room everybody else is in - it has", found.peers, "- re-joining");
              return void rejoinNow();
            } else {
              log.debug("room of one confirmed - nothing else answers under this id; next look in", watch.waiting(), "ms");
            }
          }
          look = setTimeout(takeALook, Math.max(1_000, watch.waiting()));
        };
        look = setTimeout(takeALook, Math.max(1_000, watchRef.current!.waiting()));
      })
      .catch((e) => {
        log.warn("could not join the awari room:", (e as Error).message);
        // A join that never landed is the same outage as one that dropped — a bootstrap cold
        // start that times out, say. This used to be terminal: the effect simply ended, and the
        // only way back was toggling Connect off and on.
        recoverFrom("join failed");
      });

    return () => {
      cancelled = true;
      if (look) clearTimeout(look);
      if (retry) clearTimeout(retry);
      sessionRef.current = null;
      roster.clear();
      greeted.clear();
      // Held payloads describe a room we're leaving; a later join re-announces from scratch.
      pending.clear();
      a.awari.reportStatus({ connected: false, peerId: null });
      reportRoster();
      // `leaveRoom` rather than a bare `close`: if we happen to be the room's leader it hands
      // leadership off first, so everyone still in the room resumes through the new leader
      // instead of having to convict us dead by missed heartbeats and rotate reactively. Since
      // room traffic routes through the leader, that gap is exactly a stretch of "connected, but
      // nobody sees my ping" for every remaining peer — and the leader is often whoever quits
      // first. A session awari has already declared unreachable has nothing to hand off and no
      // way to say so, so that one just closes.
      if (session) {
        void (dropped ? session.close() : session.leaveRoom()).catch((e) =>
          log.debug("leaving the room failed:", (e as Error).message),
        );
      }
    };
    // `sayHello` reads the latest name/zone through a ref, so re-joining on a rename
    // isn't needed (or wanted).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, bootstrapUrl, publish, reportRoster, joinGeneration]);

  // Switching Connect off ends the session's history: coming back is a cold start, not the
  // continuation of whatever went wrong last time.
  useEffect(() => {
    if (connected) return;
    failuresRef.current = 0;
    watchRef.current = createRoomWatch();
    setJoinGeneration(0);
  }, [connected]);

  // Publish payloads main asks us to send (nothing else has a socket). Main decides the route —
  // the room, or one peer — and we only know how to address it (ADR 0141).
  useEffect(() => {
    const a = api();
    if (!a) return;
    return a.awari.onPublish((out) => publish(out.payload, out.to));
  }, [publish]);

  /**
   * Somebody asked for a fresh join (the Peers tab's "Retry connection").
   *
   * Bumping the generation is exactly what the watch does when it finds us in the wrong room — tear
   * the session down and come back under a new peer id — so this reuses it rather than adding a
   * second way to re-join. It stays as the fallback for everything the app cannot diagnose, and a
   * person asking is treated as a cold start: both the backoff and the watch begin again, because
   * the one thing a click tells us is that whatever we concluded is not what they are seeing.
   */
  useEffect(() => {
    const a = api();
    if (!a) return;
    return a.awari.onRejoin(() => {
      log.debug("re-joining on request");
      failuresRef.current = 0;
      watchRef.current = createRoomWatch();
      setJoinGeneration((n) => n + 1);
    });
  }, []);

  // Keep the room's picture of us current: a rename or a zone change re-announces.
  useEffect(() => {
    if (!connected) return;
    sayHello();
  }, [connected, myName, zone, sayHello]);

  // Broadcast our own live location while connected + sharing (peers plot it).
  useEffect(() => {
    if (!connected || !sharing || !zone || !loc) return;
    publish({ kind: AWARI_MSG.loc, zone, y: loc.y, x: loc.x });
  }, [connected, sharing, zone, loc, publish]);

  return null;
}
