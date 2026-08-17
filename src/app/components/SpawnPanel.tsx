"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useSpawns } from "@/lib/hooks";
import {
  countdownMs,
  describeRespawn,
  formatCountdown,
  formatInterval,
  respawnCaveat,
} from "@/shared/spawn-timers";
import { parseDelay } from "@/shared/alert-schedule";
import { when } from "@/shared/format";
import { Empty } from "./ui";
import type { KnownSpawn, RunningSpawn } from "@/shared/types";

/**
 * Respawn timers — what's due, and what we've worked out about each named you camp.
 *
 * The whole tab hangs off one honesty problem, and every choice on screen follows from it. A
 * learned interval is the **shortest gap we have ever seen between two of your kills**, which is an
 * *upper bound*, not a respawn: you cannot kill a mob before it spawns, so every gap is you
 * arriving some unknown amount late
 * ([ADR 0092](../../../specs/decisions/0092-a-named-s-respawn-is-learned-from-your-own-kills.md)).
 * And the game keeps widening those gaps for reasons no parser can see — a placeholder popped
 * instead, the mob spawned on time and walked, you got up for a drink
 * ([ADR 0094](../../../specs/decisions/0094-a-spawn-timer-is-a-window-not-an-instant.md)).
 *
 * So the screen never states a spawn as a fact. A figure carries its sample the way a drop rate
 * carries its kill count ([ADR 0024](../../../specs/decisions/0024-mob-knowledge.md)); gaps that
 * **disagree** show as a range with the likely reasons named under it; and the countdown runs to a
 * **window** the player sized themselves, because how early to start watching is the one part of
 * this we have no observation to support and no business guessing at.
 *
 * **Two lists, because they answer different questions.** The top one is what's *running*, read at
 * a glance mid-camp and ordered by what matters next. The bottom is what's *known*, read while
 * deciding where to sit. A mob is normally in both.
 */
export default function SpawnPanel() {
  const { view, tick } = useSpawns();
  // Main's clock at the last fetch, carried forward by this window's own second hand — so a row
  // agrees with the process that decides a timer is due rather than with this machine's `Date`.
  const now = Date.parse(view.now) + tick * 1000;

  if (!view.running.length && !view.known.length) {
    return (
      <Empty
        title="No spawn timers yet"
        hint="Kill a named twice in the same place and its respawn is timed from the gap between them. Nothing to set up — the log does it."
      />
    );
  }

  return (
    <div className="spawns">
      {view.running.length > 0 && (
        <section className="spawn-running">
          <h2>Coming up</h2>
          {view.running.map((timer) => (
            <RunningRow key={timer.key} timer={timer} now={now} />
          ))}
        </section>
      )}

      <section className="spawn-known">
        <h2>What we&rsquo;ve learned</h2>
        {view.known.map((known) => (
          <KnownRow key={known.key} known={known} />
        ))}
      </section>
    </div>
  );
}

/** What the clock on a running row is counting to, and what to call it. */
const PHASE: Record<RunningSpawn["state"], { label: string; cls: string }> = {
  waiting: { label: "", cls: "" },
  // The honest word: the window is open, so it *could* be up — that's the whole reason it exists.
  window: { label: "may be up", cls: "window" },
  up: { label: "", cls: "due" },
  stale: { label: "", cls: "" },
};

/** One countdown. The loud state is `up`; `window` is a quieter "start paying attention". */
function RunningRow({ timer, now }: { timer: RunningSpawn; now: number }) {
  const phase = PHASE[timer.state];
  const up = timer.state === "up";
  // The provenance travels with the countdown: a learned due time is only as good as the bound
  // behind it, and a bare clock would read as a fact about the mob rather than a guess from you.
  const note = up
    ? `due ${when(timer.dueAt)}`
    : describeRespawn({
        seconds: timer.seconds,
        source: timer.source,
        samples: timer.samples,
        spreadSeconds: timer.spreadSeconds,
      });
  return (
    <div className={`spawn-row ${phase.cls}`}>
      <span className="spawn-clock">{up ? "UP" : formatCountdown(countdownMs(timer, now))}</span>
      <span className="spawn-name">
        {timer.mob}
        <small>{timer.place}</small>
      </span>
      <span className="spawn-note">
        {phase.label && <b className="spawn-phase">{phase.label}</b>} {note}
      </span>
      <button className="link" title="Take this off the board" onClick={() => void api()?.spawns.stop(timer.key)}>
        clear
      </button>
    </div>
  );
}

/** Which editor a row has open, if any. One at a time — two open number fields read as a form. */
type Editing = "interval" | "pad" | null;

/** One named we know something about, and the corrections a player can make to it. */
function KnownRow({ known }: { known: KnownSpawn }) {
  const [editing, setEditing] = useState<Editing>(null);
  const done = () => setEditing(null);
  const toggle = (which: Exclude<Editing, null>) => setEditing((e) => (e === which ? null : which));
  // Said out loud under the figure rather than hidden in a tooltip: when the gaps disagree this
  // badly, "22m" is the wrong thing to have read, and the reasons are things you can act on.
  const caveat = known.respawn ? respawnCaveat(known.respawn) : null;

  return (
    <div className="spawn-known-row">
      <span className="spawn-name">
        {known.mob}
        <small>{known.place}</small>
      </span>
      <span className="spawn-figure">
        {known.respawn ? describeRespawn(known.respawn) : <em>not timed yet</em>}
        {known.lead ? <span className="spawn-pad"> · {formatInterval(known.lead)} early</span> : null}
      </span>
      <span className="spawn-seen">{known.lastKillAt ? `last killed ${when(known.lastKillAt)}` : ""}</span>
      <span className="spawn-actions">
        <button className="link" onClick={() => toggle("interval")}>
          {known.stated ? "edit" : "set"}
        </button>
        <button className="link" title="Start warning me this long before it's due" onClick={() => toggle("pad")}>
          pad
        </button>
        {/* Only offered once there's something to throw away. It's the only way *up* from a bound
            that observation can only ever tighten, so it says what it does rather than "reset". */}
        {known.shortestSeconds !== undefined && (
          <button
            className="link"
            title="Forget the gaps measured so far and learn again from now"
            onClick={() => void api()?.spawns.relearn(known.key)}
          >
            relearn
          </button>
        )}
        <button
          className="link"
          title="This isn't a named — stop timing it"
          onClick={() => void api()?.spawns.markNamed(known.mob, false)}
        >
          not a named
        </button>
      </span>

      {caveat && <p className="spawn-caveat">{caveat}</p>}

      {editing === "interval" && (
        <SecondsField
          initial={known.stated}
          placeholder="e.g. 22m"
          whenSet="Yours, and nothing observed will overwrite it."
          whenBlank={clearsTo(known)}
          onSave={(seconds) => api()?.spawns.state(known.key, seconds)}
          onDone={done}
        />
      )}
      {editing === "pad" && (
        <SecondsField
          initial={known.lead}
          placeholder="e.g. 2m"
          whenSet="You'll be told this long before it's due, and the row says “may be up” until then."
          whenBlank="Empty means no warning — you hear about it when it's due."
          onSave={(seconds) => api()?.spawns.pad(known.key, seconds)}
          onDone={done}
        />
      )}
    </div>
  );
}

/**
 * A number of seconds, typed — the respawn you're claiming, or how early you want telling.
 *
 * One component for both because they are the same act and the same syntax, and two of these would
 * have drifted the moment one of them grew a rule. It reads `parseDelay`'s syntax — `20m`,
 * `6m 30s`, a bare number of seconds — rather than a second one of its own, because the player has
 * already learned it in the alert rules and both of these are exactly that kind of quantity.
 *
 * Unreadable text is refused *here* rather than saved and ignored, which is the opposite of the
 * call [ADR 0082](../../../specs/decisions/0082-an-alert-can-be-scheduled.md) makes for a cue —
 * there, firing late beats never firing; here, a wrong number quietly outranks everything observed.
 */
function SecondsField({
  initial,
  placeholder,
  whenSet,
  whenBlank,
  onSave,
  onDone,
}: {
  initial?: number;
  placeholder: string;
  /** What committing a value would mean. */
  whenSet: string;
  /** What committing an empty box would mean — never "nothing happens"; it always falls back to something. */
  whenBlank: string;
  onSave: (seconds: number | null) => void;
  onDone: () => void;
}) {
  const [text, setText] = useState(initial ? formatInterval(initial) : "");
  const seconds = parseDelay(text);
  const blank = !text.trim();
  const bad = !blank && (seconds === null || seconds <= 0);

  const submit = () => {
    if (bad) return;
    onSave(blank ? null : seconds);
    onDone();
  };

  // What the field would do if you committed it now, computed before the markup so the JSX stays
  // a shape rather than a decision.
  const hint = bad ? "Can't read that — try 22m, 6m 30s, or a number of seconds." : blank ? whenBlank : whenSet;

  return (
    <div className="spawn-edit">
      <input
        autoFocus
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") onDone();
        }}
      />
      <button className="link" disabled={bad} onClick={submit}>
        save
      </button>
      <small className={bad ? "bad" : ""}>{hint}</small>
    </div>
  );
}

/** What clearing the interval field would leave behind — never nothing, if we learned something (ADR 0056). */
function clearsTo(known: Pick<KnownSpawn, "shortestSeconds">): string {
  if (known.shortestSeconds === undefined) return "Empty clears it; nothing has been learned yet.";
  return `Empty falls back to what was learned (${formatInterval(known.shortestSeconds)}).`;
}
