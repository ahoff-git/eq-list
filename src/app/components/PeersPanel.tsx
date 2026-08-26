"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useSettings } from "@/lib/hooks";
import { hasOffered, offeredCount, offeredKinds, shortId, usePeerShare } from "@/lib/usePeerShare";
import { SHARE_KINDS, kindsOf, sharing, type ShareFamily, type ShareKind } from "@/shared/peer-share";
import { count } from "@/shared/format";
import { CheckField, Empty } from "./ui";
import PeerTray from "./PeerTray";
import PeerScores from "./PeerScores";
import type { AwariPeer, Settings } from "@/shared/types";

/**
 * The Peers tab: what you're handing out, who's here, and what they've handed you.
 *
 * The connection has been an app-level service since [ADR 0012](../../../specs/decisions/0012-awari-connection-owned-by-main-window.md)
 * and the room a meeting place since [ADR 0141](../../../specs/decisions/0141-the-room-is-a-meeting-place.md);
 * this is the first screen that treats it as one. It lives in the **main** window rather than beside
 * the map's dots, because what travels now is lists, rules, styles and scoreboards — none of which
 * are map things, and all of which are copied onto something in this window. The map keeps its own
 * Connected users panel for the job it has always done: who is where, and jumping there.
 *
 * Three sections, in the order the questions get asked:
 *
 *   1. **What you share** — a toggle per kind, off until switched on, with the count a peer would
 *      see beside it so "sharing my list" is a number rather than a promise.
 *   2. **Who's here** — the roster, each row saying what that person is offering and letting you
 *      ask for it. Asking is always a click: nothing authored arrives unrequested.
 *   3. **What's arrived** — the tray, per kind, with the copy actions. Nothing here is applied on
 *      its own; a rule you didn't choose firing at you is exactly what the family split exists to
 *      prevent.
 */
export default function PeersPanel({ focusPeer }: { focusPeer?: string | null }) {
  const settings = useSettings();
  const share = usePeerShare();
  const [openKind, setOpenKind] = useState<ShareKind | null>(null);

  if (!settings) return <p className="muted">Loading settings…</p>;

  if (!settings.connectPeers) {
    return (
      <Empty
        title="You're not connected to the peer network."
        hint={
          <>
            Turn on <b>Connect to the peer-to-peer network</b> in Settings. Nothing is shared until you
            switch a kind on below — connecting only makes you visible.
          </>
        }
      />
    );
  }

  return (
    <div className="peers">
      <MyShares settings={settings} offer={share.offer} onChanged={share.refresh} />
      <Roster peers={share.peers} onAsk={share.ask} focusPeer={focusPeer} />
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
  const on = SHARE_KINDS.filter((spec) => sharing(settings.share, spec.key)).length;

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
        What you share <span className="muted small">· {on} of {SHARE_KINDS.length} on</span>
      </h3>
      {(["authored", "observation", "live"] as ShareFamily[]).map((family) => (
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
  onAsk,
  focusPeer,
}: {
  peers: AwariPeer[];
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
      <h3>
        Who&rsquo;s here <span className="muted small">· {count(rows.length, "peer")}</span>
      </h3>
      {rows.length === 0 ? (
        <p className="muted small">
          Nobody else is in the room. Anyone else running EQ List with peer networking on shows up here.
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
        {peer.zone ? <span className="muted small">· {peer.zone}</span> : null}
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
