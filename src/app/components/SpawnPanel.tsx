"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useCurrentZone, useSpawns } from "@/lib/hooks";
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
  // `now` is main's clock as this window should read it: a row must agree with the process that
  // decides a timer is due, or it can read 0:00 while main still calls it waiting.
  const { view, now } = useSpawns();

  const bare = !view.running.length && !view.known.length && !view.dismissed.length;

  return (
    <div className="spawns">
      <AddTimer />

      {/* Said once, at the top, because "why is this list empty / why isn't that mob here" is the
          question the tab otherwise leaves you to guess at. Two routes in, and the automatic one
          needs no action at all — which is worth knowing before you go looking for a button. */}
      <p className="spawn-how small">
        Nameds are added <b>automatically</b>: kill one twice in the same place and the gap between
        your kills becomes its timer. Add one by hand for a camp you haven&rsquo;t killed through yet — or
        for anything else worth a countdown.
      </p>

      {bare && (
        <Empty
          title="No timers yet"
          hint="Go and kill a named twice, or add one above. Nothing else to set up — the log does the rest."
        />
      )}

      {view.running.length > 0 && (
        <section className="spawn-running">
          <h2>Coming up</h2>
          {view.running.map((timer) => (
            <RunningRow key={timer.key} timer={timer} now={now} />
          ))}
        </section>
      )}

      {view.known.length > 0 && (
        <section className="spawn-known">
          <h2>What we&rsquo;ve learned</h2>
          {view.known.map((known) => (
            <KnownRow key={known.key} known={known} />
          ))}
        </section>
      )}

      {view.dismissed.length > 0 && <NotTracked mobs={view.dismissed} />}
    </div>
  );
}

/**
 * Putting a timer on the board by hand.
 *
 * One form for two things the user asked for separately, because they turned out to be the same
 * thing: a **mob** you want timed before the log has seen you kill it twice, and a **custom timer**
 * for something that isn't a mob at all. A label no kill line will ever match simply never restarts
 * itself — so a boat, a port or a raid lockout behaves correctly without a single branch, while a
 * name that *is* a mob starts learning from the log the moment you kill it.
 *
 * The zone is optional for exactly that reason: not everything worth a countdown is somewhere. It
 * defaults to where you are, since a camp is the common case and re-typing your own zone is the
 * kind of friction that stops people using a feature.
 */
function AddTimer() {
  const zone = useCurrentZone();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [place, setPlace] = useState("");
  const [every, setEvery] = useState("");

  // Opening seeds the zone rather than binding to it: you might be adding a timer for somewhere
  // you're not standing, and a field that rewrites itself as you zone would be unusable.
  const start = () => {
    setPlace(zone ?? "");
    setName("");
    setEvery("");
    setOpen(true);
  };

  const seconds = parseDelay(every);
  const blankInterval = !every.trim();
  const badInterval = !blankInterval && (seconds === null || seconds <= 0);
  const canAdd = !!name.trim() && !badInterval;

  const submit = () => {
    if (!canAdd) return;
    void api()?.spawns.add(name.trim(), place.trim(), blankInterval ? null : seconds);
    setOpen(false);
  };

  if (!open) {
    return (
      <div className="spawn-add-bar">
        <button className="btn sm" onClick={start}>
          ＋ Add a timer
        </button>
      </div>
    );
  }

  return (
    <div className="spawn-add">
      <input
        autoFocus
        className="sa-name"
        value={name}
        placeholder="Name — a mob, or anything else"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") setOpen(false);
        }}
      />
      <input
        className="sa-place"
        value={place}
        placeholder="Where (optional)"
        onChange={(e) => setPlace(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") setOpen(false);
        }}
      />
      <input
        className="sa-every"
        value={every}
        placeholder="Every… e.g. 22m"
        onChange={(e) => setEvery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") setOpen(false);
        }}
      />
      <button className="btn sm" disabled={!canAdd} onClick={submit}>
        Add
      </button>
      <button className="btn ghost sm" onClick={() => setOpen(false)}>
        Cancel
      </button>
      <small className={badInterval ? "bad" : ""}>
        {badInterval
          ? "Can't read that — try 22m, 6m 30s, or a number of seconds."
          : "Leave the interval blank to add the row now and time it later."}
      </small>
    </div>
  );
}

/**
 * What the clock on a running row reads, and how loudly.
 *
 * `alive` and `up` look different on purpose, and the difference is the one this whole tab is
 * about: **`up` is the countdown's opinion, `alive` is yours.** One says "on the evidence it should
 * have spawned by now", the other says "I can see it" — so `alive` shows a fact where the others
 * show a clock, and nothing about elapsed time can talk it out of that.
 */
const PHASE: Record<RunningSpawn["state"], { clock: string; label: string; cls: string }> = {
  waiting: { clock: "", label: "", cls: "" },
  // The honest word: the window is open, so it *could* be up — that's the whole reason it exists.
  window: { clock: "", label: "may be up", cls: "window" },
  up: { clock: "UP", label: "", cls: "due" },
  alive: { clock: "ALIVE", label: "you marked it up", cls: "alive" },
  stale: { clock: "", label: "", cls: "" },
};

/** One countdown, or one mob you've said is standing there. */
function RunningRow({ timer, now }: { timer: RunningSpawn; now: number }) {
  const phase = PHASE[timer.state];
  const alive = timer.state === "alive";
  // The provenance travels with the countdown: a due time is only as good as the bound behind it,
  // and a bare clock would read as a fact about the mob rather than a guess from you. Once you've
  // *seen* it, the guess is beside the point and the row says when instead.
  const note = alive
    ? `seen ${when(timer.seenAt ?? timer.dueAt)} · killed ${when(timer.killedAt)}`
    : timer.state === "up"
      ? `due ${when(timer.dueAt)}`
      : describeRespawn({
          seconds: timer.seconds,
          source: timer.source,
          samples: timer.samples,
          spreadSeconds: timer.spreadSeconds,
        });
  return (
    <div className={`spawn-row ${phase.cls}`}>
      <span className="spawn-clock">{phase.clock || formatCountdown(countdownMs(timer, now))}</span>
      <span className="spawn-name">
        {timer.mob}
        <small>{timer.place}</small>
      </span>
      <span className="spawn-note">
        {phase.label && <b className="spawn-phase">{phase.label}</b>} {note}
      </span>
      {/* Offered right up until you've said it — including while the row still reads as waiting,
          because spotting a mob early is exactly the case that teaches us the timer is too long. */}
      {!alive && (
        <button
          className="btn sm"
          title="You can see it — end the countdown and use this as evidence"
          onClick={() => void api()?.spawns.markUp(timer.key)}
        >
          It&rsquo;s up
        </button>
      )}
      {/* The way back from any of it: killed again, so the clock restarts from now. Also the undo
          for a mis-clicked "it's up", since a fresh countdown clears the sighting off the row. */}
      <button
        className="btn ghost sm"
        title="Killed it just now — restart the countdown from this moment"
        onClick={() => void api()?.spawns.markDead(timer.key)}
      >
        Killed it
      </button>
      <button className="btn ghost sm" title="Take this off the board" onClick={() => void api()?.spawns.stop(timer.key)}>
        Stop
      </button>
    </div>
  );
}

/**
 * What a row currently has open. One at a time, and **one list for both kinds** — an editor and a
 * confirmation are alternatives, so opening a confirmation has to close a half-typed field rather
 * than stack under it.
 */
type Open = "interval" | "pad" | "relearn" | "dismiss" | null;

/**
 * One named we know something about, and the corrections a player can make to it.
 *
 * **The two kinds of action are kept apart, and they don't look alike.** `set` and `pad` open a
 * text box and change nothing until you save. `relearn` and `not a named` destroy something on the
 * spot — measurements that took an evening of camping, and the mob's place on the list — so each
 * asks first, in the panel, with the answer worded as *what it costs* rather than "OK". No native
 * `confirm()`: this window is frameless and always-on-top, so a modal over the game is worse than
 * the thing it guards — the same call `ForgetData` in `SettingsPanel` and the scoreboard's reset
 * already make.
 */
function KnownRow({ known }: { known: KnownSpawn }) {
  const [open, setOpen] = useState<Open>(null);
  const done = () => setOpen(null);
  const toggle = (which: Exclude<Open, null>) => setOpen((o) => (o === which ? null : which));
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
        {/* The one control that changes what the app *does* rather than what it knows, so it leads
            and is a checkbox rather than a button: it's a standing state, not an action. */}
        <label className="spawn-notify" title="Raise a banner when this one is due">
          <input
            type="checkbox"
            checked={known.notify}
            onChange={(e) => void api()?.spawns.notify(known.key, e.target.checked)}
          />
          Notify
        </label>

        {/* Telling the tracker what's true right now. Here as well as on a running row, because
            this is where a mob sits when nothing is counting down — which is exactly when you need
            to seed one: the app wasn't watching when you killed it, or you've walked up to a camp
            someone else was holding. */}
        <button
          className="btn ghost sm"
          title={
            known.respawn
              ? "Killed it just now — start the countdown from this moment"
              : "Nothing to count down to yet: kill it twice, or set a timer below"
          }
          disabled={!known.respawn}
          onClick={() => void api()?.spawns.markDead(known.key)}
        >
          Killed it
        </button>
        {known.running && (
          <button
            className="btn ghost sm"
            title="You can see it — end the countdown and use this as evidence"
            onClick={() => void api()?.spawns.markUp(known.key)}
          >
            It&rsquo;s up
          </button>
        )}

        {/* Editors next, and styled as the mild things they are: they open a box and commit
            nothing until you say so. */}
        <button className="btn ghost sm" onClick={() => toggle("interval")}>
          {known.stated ? "Edit timer" : "Set timer"}
        </button>
        <button className="btn ghost sm" title="Start warning me this long before it's due" onClick={() => toggle("pad")}>
          {known.lead ? "Edit warning" : "Warn early"}
        </button>

        <span className="spacer" />

        {/* Then the two that destroy something, set apart and asking first. `relearn` is only
            offered once there's something to throw away — it is the only way *up* from a bound
            observation can only ever tighten, so it says what it does rather than "reset". */}
        {known.shortestSeconds !== undefined && (
          <button className="btn sm" title="Throw away the gaps measured so far" onClick={() => toggle("relearn")}>
            Relearn…
          </button>
        )}
        {/* A hand-added row is the player's own; removing it takes back exactly what they typed,
            so it needs no confirmation and no "not a named" framing — that button is about
            correcting the log, and there is no log entry here to correct. */}
        {known.added ? (
          <button
            className="btn sm"
            title="Take this timer off the board"
            onClick={() => void api()?.spawns.remove(known.key)}
          >
            Remove
          </button>
        ) : (
          <button className="btn sm" title="Stop timing this mob" onClick={() => toggle("dismiss")}>
            Not a named…
          </button>
        )}
      </span>

      {caveat && <p className="spawn-caveat">{caveat}</p>}

      {open === "relearn" && (
        <Confirm
          // Says the cost in the units the player earned it in, because "are you sure?" doesn't
          // tell anyone whether they mind.
          cost={`Forget ${gapCount(known.samples)} measured over ${lastKilled(known)}? The figure goes back to unknown and is learned again from your next kills.`}
          go="Forget them"
          keep="Keep them"
          onGo={() => api()?.spawns.relearn(known.key)}
          onDone={done}
        />
      )}
      {open === "dismiss" && (
        <Confirm
          cost={`Stop timing ${known.mob}? Its countdown goes, but nothing measured is lost — it stays listed under “Not tracked”, and tracking it again brings its history back.`}
          go="Stop timing it"
          keep="Keep timing it"
          onGo={() => api()?.spawns.markNamed(known.mob, false)}
          onDone={done}
        />
      )}

      {open === "interval" && (
        <SecondsField
          initial={known.stated}
          placeholder="e.g. 22m"
          whenSet="Yours, and nothing observed will overwrite it."
          whenBlank={clearsTo(known)}
          onSave={(seconds) => api()?.spawns.state(known.key, seconds)}
          onDone={done}
        />
      )}
      {open === "pad" && (
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
      <button className="btn sm" disabled={bad} onClick={submit}>
        Save
      </button>
      {/* An explicit way out, offered only when there's something to undo. Emptying the box and
          saving does the same thing, but nobody discovers that — which made a figure you'd typed
          feel permanent even though clearing it always worked. A setting you can't see how to
          unset is a setting you can't change your mind about. */}
      {initial !== undefined && (
        <button
          className="btn ghost sm"
          onClick={() => {
            onSave(null);
            onDone();
          }}
        >
          Clear
        </button>
      )}
      <button className="btn ghost sm" onClick={onDone}>
        Cancel
      </button>
      <small className={bad ? "bad" : ""}>{hint}</small>
    </div>
  );
}

/**
 * A destructive action, asked inline.
 *
 * The two answers are **both worded as outcomes** — "Forget them" / "Keep them" — rather than
 * yes/no, so the one you want is readable without re-reading the question above it. The keeping
 * answer is the plain button and the destroying one is `danger`, matching `ForgetData`; and there
 * is no third "cancel", because "keep" already is one.
 */
function Confirm({
  cost,
  go,
  keep,
  onGo,
  onDone,
}: {
  cost: string;
  go: string;
  keep: string;
  onGo: () => void;
  onDone: () => void;
}) {
  return (
    <div className="spawn-confirm">
      <span className="spawn-cost">{cost}</span>
      <button
        className="btn danger sm"
        onClick={() => {
          onGo();
          onDone();
        }}
      >
        {go}
      </button>
      <button className="btn ghost sm" onClick={onDone}>
        {keep}
      </button>
    </div>
  );
}

/**
 * The mobs taken off the list, and the way back.
 *
 * Kept on screen because dismissing one **removes its row**, and the control that would undo it
 * lived there — so without this the button is a trap rather than a decision. Folded to the bottom
 * and worded quietly, since it's a list nobody needs until they need it badly.
 */
function NotTracked({ mobs }: { mobs: string[] }) {
  return (
    <section className="spawn-dismissed">
      {/* Counted in the heading so the section reads as somewhere things *went*, rather than as a
          footnote — it is the undo for a button that removes a row, and an undo nobody notices is
          the same as no undo. */}
      <h2>
        Not tracked ({mobs.length})
      </h2>
      <p className="small">
        You said these aren&rsquo;t nameds, so nothing times them. Nothing was lost — track one again and its
        history comes back with it.
      </p>
      <div className="spawn-dismissed-rows">
        {mobs.map((mob) => (
          <span key={mob} className="spawn-dismissed-row">
            {mob}
            <button className="btn ghost sm" onClick={() => void api()?.spawns.markNamed(mob, true)}>
              Track again
            </button>
          </span>
        ))}
      </div>
    </section>
  );
}

/** Gaps, counted in words — the unit the player earned them in, so the cost of losing them lands. */
function gapCount(samples: number): string {
  return samples === 1 ? "the 1 gap measured" : `all ${samples} gaps measured`;
}

/** How long this mob's evidence has been accumulating, for the same reason. */
function lastKilled(known: Pick<KnownSpawn, "lastKillAt">): string {
  return known.lastKillAt ? `up to ${when(known.lastKillAt)}` : "your kills so far";
}

/** What clearing the interval field would leave behind — never nothing, if we learned something (ADR 0056). */
function clearsTo(known: Pick<KnownSpawn, "shortestSeconds">): string {
  if (known.shortestSeconds === undefined) return "Empty clears it; nothing has been learned yet.";
  return `Empty falls back to what was learned (${formatInterval(known.shortestSeconds)}).`;
}
