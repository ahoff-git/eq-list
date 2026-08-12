"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRead, useReading } from "@/lib/hooks";
import type { FightSearch, SessionSummary, StoredFight } from "@/shared/types";

import { clock, count, dayTime, duration } from "@/shared/format";
import { Caret, Empty } from "./ui";
/** A stable empty, so a render before the answer lands doesn't look like a change. */
const NO_FIGHTS: StoredFight[] = [];

/** The same, for a search nobody has typed into yet. */
const NO_MATCHES: FightSearch = { fights: NO_FIGHTS, total: 0 };

/**
 * Browse past play: sessions (newest first) drill into their fights, and picking a
 * fight hands it back to the panel to render with the same meter/spell views as a live
 * one. Fights are filed by the main process as they end, so this survives restarts.
 *
 * **Searching cuts across sessions.** "Where did I fight those minotaurs" is a question about
 * the whole history, and answering it by opening a fortnight of sittings one at a time is no
 * answer — so a term replaces the session tree with the matching fights themselves, newest
 * first, each saying which day and zone it came from. Main does the matching, because main is
 * what holds every fight (the tree only ever loads the session you opened).
 */
export default function DamageHistory({
  picked,
  onPick,
}: {
  picked: StoredFight | null;
  onPick: (fight: StoredFight | null) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  /** Bumped when history changes underneath us (a log was eaten), to re-read both lists. */
  const [refresh, setRefresh] = useState(0);
  const needle = term.trim();

  // `null` until the first answer lands, which is what tells "no history yet" from "not asked yet".
  const sessions = useRead<SessionSummary[] | null>((a) => a.combat.sessions(), null, [refresh]);

  // A session's fights, read when it's expanded (the list is per-session, not eager). Reading through
  // the hook is what makes expanding B while A is still in flight safe — A's answer is discarded
  // rather than landing under B's heading.
  const fights = useRead((a) => (openId ? a.combat.fights(openId) : Promise.resolve(NO_FIGHTS)), NO_FIGHTS, [
    openId,
    refresh,
  ]);

  // Asked per keystroke — history lives in memory in main, and the hook drops the answers a newer
  // letter has already superseded, so there's nothing here a debounce would save. `loading` is only
  // used to keep the first letter typed from flashing "nothing matches" before any answer exists.
  const { value: found, loading: searching } = useReading<FightSearch>(
    (a) => (needle ? a.combat.searchFights(needle) : Promise.resolve(NO_MATCHES)),
    NO_MATCHES,
    [needle, refresh],
  );
  const unanswered = searching && found.total === 0;

  // Eating a log files whole evenings at once, and it happens on another tab — without this the
  // new sittings only appear on a reopen.
  useEffect(() => api()?.app.onDataChanged(() => setRefresh((n) => n + 1)), []);

  async function clearAll() {
    await api()?.combat.clearHistory();
    setOpenId(null);
    setTerm(""); // a search over nothing is just a box asking you why you typed in it
    onPick(null);
    // Re-read rather than trusting the returned list: main owns history, and one path to it is enough.
    setRefresh((n) => n + 1);
  }

  if (sessions === null) return <div className="muted small">Loading history…</div>;

  if (sessions.length === 0) {
    return (
      <Empty
        title="No past fights recorded yet."
        hint="Each fight is filed when it ends, so history builds up as you play."
      />
    );
  }

  return (
    <div className="history">
      <div className="row">
        <input
          className="field hist-search"
          placeholder="Search mob or zone…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          title="Show only fights whose mob name or zone matches — every word has to match, in either field"
        />
        <span className="muted small">
          {needle ? (unanswered ? "searching…" : matchTally(found)) : sessionTally(sessions.length)}
        </span>
        <span className="spacer" />
        <button className="btn ghost sm" onClick={clearAll}>
          Clear history
        </button>
      </div>

      {/* The list scrolls inside itself: it's an index, and a fortnight of play in an
          always-on-top float otherwise pushes the fight you picked off the bottom of the tab. */}
      <div className="hist-list">
        {needle ? (
          <Matches fights={found.fights} quiet={unanswered} picked={picked} onPick={onPick} />
        ) : (
          sessions.map((s) => (
            <Session
              key={s.sessionId}
              summary={s}
              open={openId === s.sessionId}
              onToggle={() => setOpenId(openId === s.sessionId ? null : s.sessionId)}
              fights={openId === s.sessionId ? fights : []}
              picked={picked}
              onPick={onPick}
            />
          ))
        )}
      </div>
    </div>
  );
}

/** "12 sessions recorded" — what the tree is a list of. */
const sessionTally = (sessions: number): string => `${count(sessions, "session")} recorded`;

/**
 * What the search found, and — when the store capped it — that what's on screen is only the
 * newest slice of it. A truncated list that reads like the whole answer would quietly turn
 * "I never fought that here" into a wrong conclusion.
 */
function matchTally(found: FightSearch): string {
  if (found.total === 0) return "no matching fights";
  const shown = found.fights.length;
  const matched = count(found.total, "matching fight");
  return shown < found.total ? `${matched} · newest ${shown} shown` : matched;
}

/** Search results: fights from across every session, so each one says which day it was. */
function Matches({
  fights,
  quiet,
  picked,
  onPick,
}: {
  fights: StoredFight[];
  /** No answer has landed yet — say nothing rather than "nothing matches", which isn't known. */
  quiet: boolean;
  picked: StoredFight | null;
  onPick: (fight: StoredFight | null) => void;
}) {
  if (fights.length === 0) {
    return quiet ? null : <p className="muted small">No fight&apos;s mob or zone matches that.</p>;
  }
  return (
    <div className="hist-fights hist-found">
      {fights.map((f) => (
        <Fight key={f.id} fight={f} when={dayTime(f.stats.startedAt)} withZone picked={picked} onPick={onPick} />
      ))}
    </div>
  );
}

/** One sitting: when it was, what it came to, and — open — the fights in it. */
function Session({
  summary,
  open,
  onToggle,
  fights,
  picked,
  onPick,
}: {
  summary: SessionSummary;
  open: boolean;
  onToggle: () => void;
  fights: StoredFight[];
  picked: StoredFight | null;
  onPick: (fight: StoredFight | null) => void;
}) {
  return (
    <div className={`hist-session ${open ? "open" : ""}`}>
      <div className="hist-head" onClick={onToggle}>
        <Caret open={open} />
        <span className="hist-when">{dayTime(summary.startedAt)}</span>
        <span className="muted small">
          {count(summary.fights, "fight")} · {duration(summary.combatSec, { seconds: true })} fighting
        </span>
        <span className="spacer" />
        <span className="hist-dmg">{summary.yourDealt.toLocaleString()} dealt</span>
      </div>
      {open && (
        <div className="hist-fights">
          {fights.map((f) => (
            // Inside a sitting the day is a given, so the row spends its width on the clock alone.
            <Fight key={f.id} fight={f} when={clock(f.stats.startedAt, { seconds: true })} picked={picked} onPick={onPick} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One fight in a list — the row you click to break it down. Shared by the session tree and the
 * search results so a fight looks and behaves the same however you found it; what differs is only
 * how much of *when* has to be spelled out, and whether the zone is worth a column.
 */
function Fight({
  fight,
  when,
  withZone = false,
  picked,
  onPick,
}: {
  fight: StoredFight;
  /** Already-formatted time — a clock within one sitting, a date and time across many. */
  when: string;
  /** Show the zone, for a list where it's why the row is here rather than a constant. */
  withZone?: boolean;
  picked: StoredFight | null;
  onPick: (fight: StoredFight | null) => void;
}) {
  const on = picked?.id === fight.id;
  return (
    <button className={`hist-fight ${on ? "on" : ""}`} onClick={() => onPick(on ? null : fight)}>
      <span className="hf-when">{when}</span>
      <span className="hf-label">{fight.label}</span>
      {withZone && <span className="hf-zone muted">{fight.zone ?? "—"}</span>}
      <span className="muted small">{fight.stats.durationSec}s</span>
      <span className="hf-dmg">{fight.stats.yourDealt.toLocaleString()}</span>
    </button>
  );
}
