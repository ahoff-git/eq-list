"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useSettings, useWatcherStatus } from "@/lib/hooks";
import { hasOffered, offeredCount, offeredKinds, shortId, usePeerShare } from "@/lib/usePeerShare";
import { SHARE_KINDS, kindsOf, sharing, type ShareFamily, type ShareKind } from "@/shared/peer-share";
import { count } from "@/shared/format";
import { characterFromLogFile } from "@/shared/log-parser";
import { CheckField } from "./ui";
import PeerTray from "./PeerTray";
import PeerScores from "./PeerScores";
import type { AwariPeer, AwariStatus, Settings } from "@/shared/types";

/**
 * The Peers tab: **everything** about the peer network, in one place.
 *
 * It grew here a piece at a time and was scattered across three screens for it — the connection and
 * the player name in Settings (where they had been since
 * [ADR 0011](../../../specs/decisions/0011-awari-peer-location-sharing.md)), two share toggles on the
 * map toolbar, and the rest of the feature here. That is one subject with three homes, and it made
 * every question about it start with "where is that?"
 * [ADR 0146](../../../specs/decisions/0146-one-home-for-the-peer-network.md) settled it: **a control
 * lives exactly once, and it lives here.**
 *
 * Four sections, in the order the questions get asked:
 *
 *   1. **Your connection** — whether you are in a room, who you are in it, and how to try again.
 *      Nothing here needs EverQuest running; the tab says so, because it is a thing people assume
 *      they cannot do.
 *   2. **What you share** — a toggle per kind, off until switched on, with the count a peer would
 *      see beside it so "sharing my list" is a number rather than a promise.
 *   3. **Who's here** — the roster, each row saying what that person is offering and letting you
 *      ask for it. Asking is always a click: nothing authored arrives unrequested.
 *   4. **What's arrived** — the tray, with the copy actions, and the scoreboard comparison. Nothing
 *      is applied on its own; a rule you didn't choose firing at you is exactly what the family
 *      split exists to prevent.
 *
 * What stays on the **map** is only what the map draws: peers' dots, their pings, their shared pins,
 * and the 👥 list of who is where — a live view you want while the game is full-screen and this
 * window is hidden. Views may live where they are needed; the controls behind them may not.
 */
export default function PeersPanel({ focusPeer }: { focusPeer?: string | null }) {
  const settings = useSettings();
  const share = usePeerShare();
  const [openKind, setOpenKind] = useState<ShareKind | null>(null);

  if (!settings) return <p className="muted">Loading settings…</p>;

  // Off is a whole screen rather than a disabled one: with no room there is nothing to list, nothing
  // to offer and nobody to offer it to, so every section below would be an empty box. The switch
  // itself is **here** now rather than in Settings — a person looking for the peer network looks at
  // the tab called Peers (ADR 0146).
  if (!settings.connectPeers) {
    return (
      <div className="peers">
        <section className="peers-block">
          <h3>Peer network</h3>
          <CheckField
            className="setting-check"
            label="Connect to the peer-to-peer network"
            checked={false}
            onChange={() => void api()?.settings.update({ connectPeers: true })}
          />
          <span className="hint">
            Off by default. Connecting only makes you <i>visible</i> — nothing leaves this machine
            until you switch a kind on, and nothing arrives that you didn&rsquo;t ask for. EverQuest
            doesn&rsquo;t need to be running.
          </span>
        </section>
      </div>
    );
  }

  return (
    <div className="peers">
      <YourConnection settings={settings} status={share.status} peers={share.peers.length} />
      <MyShares settings={settings} offer={share.offer} onChanged={share.refresh} />
      <Roster peers={share.peers} status={share.status} onAsk={share.ask} focusPeer={focusPeer} />
      <PeerTray
        received={share.received}
        open={openKind}
        onOpen={setOpenKind}
        onClear={share.clear}
      />
      <PeerScores received={share.received} />
    </div>
  );
}

/**
 * Your side of the connection: whether you are in a room, who you are in it, and how to try again.
 *
 * Every one of these used to be in Settings, several screens away from the roster they explain
 * ([ADR 0146](../../../specs/decisions/0146-one-home-for-the-peer-network.md)). They are here now,
 * and they are here **together**, because they are only ever read as a set: the light says whether
 * it works, the name says who you appear as, the button is what you do when the first two disagree
 * with what you expected.
 *
 * **None of this needs EverQuest to be running**, and that is worth saying on screen rather than
 * only being true. The room is joined off a setting, and the name is read off the *filename* of the
 * newest log in your folder — announced before a single line of it is parsed — so sitting in a room
 * with the game closed works, and always did.
 */
function YourConnection({
  settings,
  status,
  peers,
}: {
  settings: Settings;
  status: AwariStatus;
  peers: number;
}) {
  const watcher = useWatcherStatus();
  // The same rule the host and the hub use, so what this field's placeholder promises is what peers
  // actually see. A third spelling of "who am I" would be a third chance to disagree.
  const derived = characterFromLogFile(watcher.file) ?? "";
  const shown = (settings.playerName || "").trim() || derived;

  return (
    <section className="peers-block">
      <h3>
        Your connection
        <span
          className={`peer-light ${status.connected ? "on" : ""}`}
          title={status.connected ? `In the room as ${status.peerId}` : "Not in the room"}
        />
      </h3>
      <CheckField
        className="setting-check"
        label="Connect to the peer-to-peer network"
        checked={settings.connectPeers}
        onChange={(v) => void api()?.settings.update({ connectPeers: v })}
      />
      <div className="peer-conn">
        <span className="muted small">
          {status.connected
            ? `In the room${peers ? "" : " — alone so far"}.`
            : "Not in the room — joining, or unable to reach the network."}
        </span>
        {/* Always available, not only when the room looks wrong. It is the fallback for everything
            this feature can't diagnose, and a control you can only reach in the state that needs it
            is a control nobody finds. */}
        <button className="btn sm" onClick={() => api()?.peer.rejoin()} title="Leave the room and join it again">
          Retry connection
        </button>
      </div>
      <div className="peer-conn">
        <label className="muted small" htmlFor="peer-name">
          Shown to peers
        </label>
        <input
          id="peer-name"
          className="field"
          placeholder={derived || "Your name"}
          value={settings.playerName}
          onChange={(e) => void api()?.settings.update({ playerName: e.target.value })}
        />
      </div>
      <span className="hint">
        {shown
          ? "The game doesn't need to be running — you can sit in a room with EverQuest closed."
          : "Peers will see a short id until you put a name here. The game doesn't need to be running to sit in a room, but a name has to come from somewhere — your log folder, or this field."}
      </span>
      {/* Last, and only once connected. It is the one field here nobody should have to think about —
          blank is the live service — so it sits below the hint rather than between two things people
          actually use, and says what blank means instead of looking like a gap. */}
      <details className="peers-advanced">
        <summary className="muted small">Bootstrap service</summary>
        <input
          className="field"
          placeholder="awari bootstrap URL — blank uses the default"
          value={settings.bootstrapUrl}
          onChange={(e) => void api()?.settings.update({ bootstrapUrl: e.target.value })}
        />
        <span className="hint">
          Where clients find each other before connecting directly. Leave it blank unless you are
          running your own — and if two of you can&rsquo;t see each other, check you have the same
          value here.
        </span>
      </details>
    </section>
  );
}

/** The heading over each family, saying what the rules are for everything under it. */
const FAMILY_BLURB: Record<ShareFamily, { title: string; hint: string }> = {
  authored: {
    title: "Things you made",
    hint: "Handed over only when somebody asks, and never applied on their end without them choosing it.",
  },
  observation: {
    title: "What you've observed",
    hint: "Pooled into everyone's totals, tagged with your contributor id so any of it can be filtered out later.",
  },
  live: {
    title: "What's true right now",
    hint: "Held in memory on the other end and dropped when you disconnect. Nothing is written to their disk.",
  },
  mirror: {
    title: "Pages you've already fetched",
    hint: "Copies of eqlwiki's own item pages — nothing of yours. Sharing them is how a room fills the catalogue once between everyone instead of each of you fetching all 11,136.",
  },
};

/**
 * The toggles, and what each one would actually hand over.
 *
 * The count beside a toggle is read from our own catalogue rather than counted here, so what the
 * label says and what a peer would receive are the same number by construction — a panel that
 * counted for itself would be a second opinion, and the first one to be wrong after a change
 * somewhere else.
 */
function MyShares({
  settings,
  offer,
  onChanged,
}: {
  settings: Settings;
  offer: Record<string, { n: number; rev: number }>;
  onChanged: () => void;
}) {
  // Counted with the location toggle, because the heading is answering "how much of me is going
  // out" and the one thing that is broadcast rather than requested must not be the one left out.
  const on = SHARE_KINDS.filter((spec) => sharing(settings.share, spec.key)).length + (settings.shareLocation ? 1 : 0);
  const total = SHARE_KINDS.length + 1;

  const set = (key: ShareKind, value: boolean) => {
    void api()
      ?.settings.update({ share: { [key]: value } })
      // The catalogue is measured in main on a debounce, so a re-read has to wait for it; without
      // this the count beside a toggle stays blank until something else moves.
      .then(() => setTimeout(onChanged, 2000));
  };

  return (
    <section className="peers-block">
      <h3>
        What you share <span className="muted small">· {on} of {total} on</span>
      </h3>
      {/**
       * Your live location, which is **not** a `ShareKind` and sits above the ones that are.
       *
       * Every kind below is handed over on request; this one is *broadcast continuously at
       * everybody* (ADR 0141 keeps them apart for that reason). That is a different thing to consent
       * to, and putting it in the list would quietly imply it behaves like the others — so it is
       * here, first, saying what it actually does.
       */}
      <div className="peers-family">
        <div className="peers-family-head">
          <b>Where you are</b>
          <span className="hint">
            The one thing that is broadcast rather than handed over on request.
          </span>
        </div>
        <div className="peers-toggle">
          <CheckField
            className="setting-check"
            label="Live location"
            checked={settings.shareLocation}
            onChange={(v) => void api()?.settings.update({ shareLocation: v })}
          />
          <span className="hint">
            Your position as you type <kbd>/loc</kbd>, drawn on peers&rsquo; maps. Needs the game
            running, unlike everything else here — the log is the only thing that knows where you are.
          </span>
        </div>
      </div>
      {(["authored", "observation", "live", "mirror"] as ShareFamily[]).map((family) => (
        <div key={family} className="peers-family">
          <div className="peers-family-head">
            <b>{FAMILY_BLURB[family].title}</b>
            <span className="hint">{FAMILY_BLURB[family].hint}</span>
          </div>
          {kindsOf(family).map((spec) => {
            const held = offer[spec.key];
            return (
              <div key={spec.key} className="peers-toggle">
                <CheckField
                  className="setting-check"
                  label={
                    <>
                      {spec.label}
                      {held ? <span className="muted small"> · {count(held.n, spec.noun)}</span> : null}
                    </>
                  }
                  checked={sharing(settings.share, spec.key)}
                  onChange={(v) => set(spec.key, v)}
                />
                <span className="hint">{spec.blurb}</span>
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}

/**
 * Who else is in the room, and what they say they have.
 *
 * A peer with no catalogue yet is listed all the same — presence is a fact on its own, which is the
 * whole point of [ADR 0015](../../../specs/decisions/0015-peer-presence-via-hello.md) — and says so,
 * because "hasn't told us" and "shares nothing" look identical and mean opposite things.
 */
function Roster({
  peers,
  status,
  onAsk,
  focusPeer,
}: {
  peers: AwariPeer[];
  /** Whether we are **actually** in a room, which is not the same as having asked to be. */
  status: AwariStatus;
  onAsk: (peerId: string, kind: ShareKind) => void;
  /** The peer a notice sent us here to look at, picked out until the reader moves on (ADR 0143). */
  focusPeer?: string | null;
}) {
  const rows = useMemo(
    () =>
      [...peers].sort((a, b) => (a.name || shortId(a.peerId)).localeCompare(b.name || shortId(b.peerId))),
    [peers],
  );

  return (
    <section className="peers-block">
      {/* The light and the retry live once, above, in `YourConnection` — two of each would be two
          places to read the same fact and one of them eventually stale. */}
      <h3>
        Who&rsquo;s here <span className="muted small">· {count(rows.length, "peer")}</span>
      </h3>
      {rows.length === 0 ? (
        // **Two different situations, and they used to look identical.** An empty list while the app
        // is still joining reads as "this is broken"; an empty list in a working room reads as
        // "nobody's on". Saying which is the whole difference between a feature that looks unfinished
        // and one that is merely quiet — and it's what makes a real connection fault visible at all
        // ([ADR 0070](../../../specs/decisions/0070-a-dropped-room-rejoins-itself.md) left this
        // unanswered, and answering it here is what "0 peers with two clients up" needed). What the
        // connected copy can now promise is a *measurement* rather than a wait — see
        // [ADR 0162](../../../specs/decisions/0162-a-room-of-one-is-checked-not-guessed-at.md).
        <p className="muted small">
          {status.connected
            ? "Nobody else is in the room yet. Anyone else running EQ List with peer networking on shows up here — and if you both started the app at the same moment you can end up in two separate rooms, which the app checks for within about half a minute and fixes on its own. Retry connection does it immediately."
            : "Not in the room yet — still joining, or unable to reach the network. It keeps retrying on its own; turn on Debug logging in the tray if it stays this way."}
        </p>
      ) : (
        rows.map((peer) => (
          <PeerRow key={peer.peerId} peer={peer} onAsk={onAsk} focused={peer.peerId === focusPeer} />
        ))
      )}
    </section>
  );
}

function PeerRow({
  peer,
  onAsk,
  focused,
}: {
  peer: AwariPeer;
  onAsk: (peerId: string, kind: ShareKind) => void;
  focused?: boolean;
}) {
  const kinds = offeredKinds(peer);
  const name = peer.name?.trim() || shortId(peer.peerId);
  const row = useRef<HTMLDivElement>(null);

  // Arriving from a notice, bring the row into view. A roster of one fits on screen and a roster of
  // twenty does not, and "which of these was it?" is the question the notice was answering.
  useEffect(() => {
    if (focused) row.current?.scrollIntoView({ block: "nearest" });
  }, [focused]);

  return (
    <div className={`peer-row${focused ? " focused" : ""}`} ref={row}>
      <div className="peer-head">
        <span className="u-name">{name}</span>
        {/* Their zone is a **button**, because "where is everyone" is nearly always followed by "let
            me look" — the same reasoning the map's own 👥 list has always used. It opens the map
            there, so moving the share toggles off that window costs nothing: the one thing it could
            do that this tab couldn't, this tab can now do too (ADR 0146). */}
        {peer.zone ? (
          <button
            className="btn ghost sm"
            title={`Show ${peer.zone} on the map`}
            onClick={() => void api()?.map.openAt(peer.zone!)}
          >
            {peer.zone}
          </button>
        ) : null}
        {/* A peer we can't address is one whose session id never reached us — they can be listed
            but not asked, so the row says so rather than offering a button that does nothing. */}
        {!peer.sessionId && <span className="muted small" title="No direct route to them yet">· not reachable</span>}
      </div>
      {!hasOffered(peer) ? (
        <span className="hint">Hasn&rsquo;t said what they share yet.</span>
      ) : kinds.length === 0 ? (
        <span className="hint">Sharing nothing.</span>
      ) : (
        <div className="peer-kinds">
          {kinds.map((kind) => {
            const spec = SHARE_KINDS.find((s) => s.key === kind)!;
            return (
              <button
                key={kind}
                className="btn ghost sm"
                disabled={!peer.sessionId}
                title={`Ask ${name} for their ${spec.label.toLowerCase()}`}
                onClick={() => onAsk(peer.peerId, kind)}
              >
                {spec.label} <span className="muted">{offeredCount(peer, kind)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
