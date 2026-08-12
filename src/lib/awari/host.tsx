"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { connectToRoom, randomPeerId, ROOM_ID } from "@/lib/awari/net";
import { useSettings, useCurrentZone, usePlayerLoc, useWatcherStatus } from "@/lib/hooks";
import { createLogger } from "@/shared/logging";
import { characterFromLogFile } from "@/shared/log-parser";
import { AWARI_MSG } from "@/shared/types";
import type { AwariPayload, AwariPeer } from "@/shared/types";
import type { RoomSession } from "@awari/protocol";

const log = createLogger("awari");

/**
 * How long to sit in a silent room before trying the join again, and how many times.
 *
 * Two clients that start at the same instant can each create their own room and never
 * discover the other — measured, and it does not heal on its own: two minutes in both were
 * "connected", both alone, with one leader hint registered that only one of them was behind.
 * That's the everyday case of two people launching the app together, so a lone client re-joins
 * a few times; by the second attempt the other's hint is registered and resolves.
 *
 * Bounded, because genuinely being the only player online is normal and must not become an
 * endless reconnect loop. After the last attempt we settle and stop churning.
 */
const REJOIN_DELAYS_MS = [20_000, 45_000, 90_000];

/**
 * Retrying on a fixed schedule doesn't help two clients that started together: being equally
 * lonely, they re-join in lockstep and race each other into a fresh room every time. Measured
 * — three synchronised retries, still two rooms. Spreading each wait over a wide random range
 * breaks the tie, so one of them registers its hint while the other is still waiting and the
 * later arrival simply finds it.
 */
function rejoinWait(attempt: number): number {
  const base = REJOIN_DELAYS_MS[attempt];
  return base === undefined ? base : Math.round(base * (0.5 + Math.random()));
}

/**
 * How long to wait before re-joining after the room goes away under us — awari's
 * `onDisconnected`, or a join that never landed at all.
 *
 * Deliberately **unbounded**, unlike the lonely retries above, and the asymmetry is the point:
 * being the only player online is a normal resting state worth settling into, whereas being
 * disconnected never is. The last delay repeats for as long as the outage does, so a bootstrap
 * service or a relay that is down costs one attempt a minute rather than a spin — and the room
 * heals by itself when it comes back, instead of needing the player to guess that toggling
 * Connect off and on is what fixes it.
 */
const RECONNECT_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000];

/** Backoff for the nth consecutive failure, holding at the last step rather than running out. */
function reconnectWait(failures: number): number {
  return RECONNECT_DELAYS_MS[Math.min(failures, RECONNECT_DELAYS_MS.length - 1)];
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
  const peerIdRef = useRef<string>("");
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

  /** Publish to the room, or hold the payload until there's a room to publish to. */
  const publish = useCallback((payload: AwariPayload) => {
    const s = sessionRef.current;
    if (!s) {
      pendingRef.current.set(payload.kind, payload);
      return void log.debug("publish held until the room is up:", payload.kind);
    }
    void s.publish({ type: "room" }, payload).catch((e) => log.debug("publish failed:", (e as Error).message));
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
   * Bumped to re-run the join effect. *Why* we're re-joining lives in the two counters below
   * rather than in this number, because they must survive a re-join to pace the next one — and
   * a counter the effect depends on would re-join every time it moved.
   */
  const [joinGeneration, setJoinGeneration] = useState(0);
  /** Lonely retries spent since we last had a working connection (see `REJOIN_DELAYS_MS`). */
  const lonelyTriesRef = useRef(0);
  /** Consecutive drops / failed joins, pacing `reconnectWait`. Reset once a room reaches someone. */
  const failuresRef = useRef(0);

  // Join / leave. Re-runs when the connection is toggled, the bootstrap URL changes, or a
  // silent room, a dropped room, or a failed join prompts a retry.
  useEffect(() => {
    const a = api();
    if (!a) return;
    if (!connected) {
      a.awari.reportStatus({ connected: false, peerId: null });
      return;
    }
    let cancelled = false;
    let lonely: ReturnType<typeof setTimeout> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let session: RoomSession | null = null;
    /** Set once awari says the room is unreachable — a dead session gets no graceful leave. */
    let dropped = false;
    const myPeerId = randomPeerId();
    peerIdRef.current = myPeerId;
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
      // A recovered connection re-enters what looks like an empty room, exactly as a cold start
      // does, so it deserves the same cold-start retries rather than a spent budget.
      lonelyTriesRef.current = 0;
      log.debug(what, "- re-joining in", wait, "ms");
      retry = setTimeout(rejoinNow, wait);
    };

    void connectToRoom({
      roomId: ROOM_ID,
      peerId: myPeerId,
      bootstrapUrl,
      onMessage: (m) => {
        const sender = m.sender?.peerId;
        // Never echo ourselves — consumers get a clean peer-only stream.
        if (!sender || sender === peerIdRef.current) return;
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
        a.awari.reportMessage({ sender, payload: payload as { kind: string } });
      },
    })
      .then((s) => {
        if (cancelled) return void s.close();
        session = s;
        sessionRef.current = s;
        a.awari.reportStatus({ connected: true, peerId: myPeerId });
        // Presence: awari replays every already-active peer to a fresh handler, so
        // this seeds the roster as well as tracking later joins/leaves.
        s.onPeerJoined((peer) => {
          if (peer.peerId === peerIdRef.current) return;
          // A room that reached somebody is a working room: the next outage starts its backoff
          // from the top instead of inheriting the cooldown of an old one.
          failuresRef.current = 0;
          if (!roster.has(peer.peerId)) roster.set(peer.peerId, { peerId: peer.peerId });
          reportRoster();
          sayHello(); // a new arrival doesn't know us yet
        });
        s.onPeerLeft((peer) => {
          roster.delete(peer.peerId);
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
          recoverFrom("room unreachable");
        });
        sayHello();
        // Anything that tried to go out while we were still joining, now that it can.
        const held = [...pending.values()];
        pending.clear();
        for (const payload of held) publish(payload);
        if (held.length) log.debug("flushed", held.length, "held payload(s)");

        const attempt = lonelyTriesRef.current;
        const wait = rejoinWait(attempt);
        if (wait !== undefined) {
          lonely = setTimeout(() => {
            if (cancelled || dropped || roster.size > 0) return;
            log.debug("room still empty after", wait, "ms - re-joining (attempt", attempt + 2, "of", REJOIN_DELAYS_MS.length + 1, ")");
            lonelyTriesRef.current += 1;
            rejoinNow();
          }, wait);
        }
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
      if (lonely) clearTimeout(lonely);
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

  // A fresh connection gets a fresh set of retries, of both kinds.
  useEffect(() => {
    if (connected) return;
    lonelyTriesRef.current = 0;
    failuresRef.current = 0;
    setJoinGeneration(0);
  }, [connected]);

  // Publish payloads other windows ask us to send (they have no socket of their own).
  useEffect(() => {
    const a = api();
    if (!a) return;
    return a.awari.onPublish(publish);
  }, [publish]);

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
