"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useCurrentZone, useLogVocabulary, useSettings, useSpawns } from "@/lib/hooks";
import {
  countdownMs,
  describeRespawn,
  formatCountdown,
  formatInterval,
  parseInterval,
  respawnCaveat,
  contradicted,
} from "@/shared/spawn-timers";
import { formatDuration } from "@/shared/duration";
import { when } from "@/shared/format";
import { Caret, Empty, PickField } from "./ui";
import SuggestField from "./SuggestField";
import ZonePicker from "./ZonePicker";
import { CURATED_ZONES, sortZones } from "@/shared/map/zones";
import type { Zone } from "@/shared/map/types";
import type { KnownSpawn, RunningSpawn, SpawnKind } from "@/shared/types";

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
 * **Three lists, because they answer three questions.** What's *running* is read at a glance
 * mid-camp and ordered by what matters next. What you *made* is a clock you operate. What's *known*
 * is read while deciding where to sit. A mob being camped is normally in the first and the third.
 *
 * The middle one exists because a hand-made timer was a mob with a mob's paperwork
 * ([ADR 0135](../../../specs/decisions/0135-a-countdown-is-an-instance-and-a-timer-is-its-own-kind.md)):
 * started by a button reading *Killed it*, offered *It's up* and *Not up yet* about something that
 * doesn't exist, and filed under "what we've learned" having taught nobody anything.
 */
export default function SpawnPanel() {
  // `now` is main's clock as this window should read it: a row must agree with the process that
  // decides a timer is due, or it can read 0:00 while main still calls it waiting.
  const { view, now } = useSpawns();

  const bare = !view.running.length && !view.known.length && !view.dismissed.length;
  // Split before the markup, so the JSX stays a shape rather than a decision.
  const camps = view.known.filter((k) => k.kind === "mob");
  const made = view.known.filter((k) => k.kind === "custom");
  // How many clocks each camp is running. A placeholder camp has several and its rows have to be
  // tellable apart; every other camp has one and must not be labelled as though it were a set.
  const clocks = new Map<string, number>();
  for (const timer of view.running) clocks.set(timer.key, (clocks.get(timer.key) ?? 0) + 1);

  return (
    <div className="spawns">
      <AddTimer />

      {/* Said once, at the top, because "why is this list empty / why isn't that mob here" is the
          question the tab otherwise leaves you to guess at. Two routes in, and the automatic one
          needs no action at all — which is worth knowing before you go looking for a button. */}
      <p className="spawn-how small">
        Nameds are added <b>automatically</b>: kill one twice in the same place and the gap between
        your kills becomes its timer. Add one by hand for a camp you haven&rsquo;t killed through yet — or
        add a <b>plain timer</b> for anything else worth a countdown, which starts when you say and
        repeats if you ask.
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
            <RunningRow
              key={timer.id}
              timer={timer}
              now={now}
              several={(clocks.get(timer.key) ?? 1) > 1}
            />
          ))}
        </section>
      )}

      {made.length > 0 && (
        <section className="spawn-custom">
          <h2>Your timers</h2>
          {made.map((timer) => (
            <CustomRow key={timer.key} timer={timer} />
          ))}
        </section>
      )}

      {camps.length > 0 && (
        <section className="spawn-known">
          <h2>What we&rsquo;ve learned</h2>
          {camps.map((known) => (
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
 * One form for two things, and it **asks which** rather than working it out later. A **mob** is
 * timed before the log has seen you kill it twice; a **plain timer** is a clock you made — a boat, a
 * port, a lockout, an egg timer — and wears none of a mob's controls
 * ([ADR 0135](../../../specs/decisions/0135-a-countdown-is-an-instance-and-a-timer-is-its-own-kind.md)).
 *
 * Leaving it to be inferred was the old answer and the wrong one. "A label no kill line will ever
 * match simply never restarts itself" is true and buys nothing: the row still called itself a named,
 * still offered *It's up* about a boat, and still left behind a claim that the label was a mob.
 *
 * The answer defaults from your own log — a name you have killed is a mob, a name you haven't is a
 * timer — so the common case is one click and the guess is never silent.
 *
 * The zone is optional, because not everything worth a countdown is somewhere. It defaults to where
 * you are, since a camp is the common case and re-typing your own zone is the kind of friction that
 * stops people using a feature.
 */
/** Every zone the app knows, shaped and sorted the way the map's picker expects. */
const ZONE_OPTIONS: Zone[] = sortZones(
  CURATED_ZONES.map((z) => ({ name: z.name, key: z.file, file: z.file, sortingStr: z.sortingStr })),
);

function AddTimer() {
  const zone = useCurrentZone();
  // The same words the alert rules complete against, from your own log — and mob names are already
  // in it, because a kill line's target is filed under `target` alongside a fade's. Nobody can
  // spell this game's nameds from memory, which is the whole reason `SuggestField` exists.
  const vocabulary = useLogVocabulary();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [place, setPlace] = useState("");
  const [every, setEvery] = useState("");
  // `null` means "however the name reads" — the toggle only pins an answer once someone disagrees
  // with it, so typing a mob's name after choosing *timer* doesn't undo the choice.
  const [kind, setKind] = useState<SpawnKind | null>(null);

  // Opening seeds the zone rather than binding to it: you might be adding a timer for somewhere
  // you're not standing, and a field that rewrites itself as you zone would be unusable.
  const start = () => {
    setPlace(zone ?? "");
    setName("");
    setEvery("");
    setKind(null);
    setOpen(true);
  };

  const typed = name.trim();
  // "Has your log seen you kill this?" — the vocabulary's own answer, asked of the whole word rather
  // than of a prefix, so `Ghoul` doesn't count as having killed `Ghoul Lord`.
  const killed = !!typed && vocabulary.suggest(typed, "target", 1)[0]?.toLowerCase() === typed.toLowerCase();
  const chosen: SpawnKind = kind ?? (killed ? "mob" : "custom");

  const seconds = parseInterval(every);
  const blankInterval = !every.trim();
  const badInterval = !blankInterval && (seconds === null || seconds <= 0);
  const canAdd = !!typed && !badInterval;

  const submit = () => {
    if (!canAdd) return;
    void api()?.spawns.add(typed, place.trim(), blankInterval ? null : seconds, chosen);
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
      {/* `target` is the mob vocabulary — what kills and fades named — so it completes the nameds
          you've actually fought rather than every word in the log. A custom timer's label simply
          matches nothing, which costs the typist nothing: no suggestion is offered and the text
          stands as typed. */}
      <SuggestField
        autoFocus
        slot="sa-name"
        className="field"
        value={name}
        onChange={setName}
        vocabulary={vocabulary}
        kind="target"
        placeholder="Name — a mob, or anything else"
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {/* The app's zone picker, not a second idea of one: same `fuzzyRank` matching, same
          file-name search (`gukbottom` finds Lower Guk), same list the map and Hunt offer. Blank is
          a real choice here and means **anywhere** — a boat has no camp — rather than the map's
          "follow the log", which is why `currentZone` is not passed. */}
      <ZonePicker
        zones={ZONE_OPTIONS}
        value={place}
        onPick={(name) => setPlace(name ?? "")}
        blankLabel="Anywhere"
        placeholder="Where (optional)"
        align="left"
      />
      <input
        className="sa-every"
        value={every}
        placeholder="Every… e.g. 22m, 4h"
        onChange={(e) => setEvery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {/* Two words rather than a checkbox, because neither answer is the "off" one — and it shows
          the default it worked out for itself, so choosing is confirming rather than discovering. */}
      <span className="sa-kind" role="group" aria-label="What this is">
        <button
          className={`btn sm ${chosen === "mob" ? "" : "ghost"}`}
          title="A mob: it learns its respawn from your kills, and you can correct what it learns"
          onClick={() => setKind("mob")}
        >
          Mob
        </button>
        <button
          className={`btn sm ${chosen === "custom" ? "" : "ghost"}`}
          title="A plain timer: you start it, it can repeat, and nothing about it is a claim about a mob"
          onClick={() => setKind("custom")}
        >
          Timer
        </button>
      </span>
      <button className="btn sm" disabled={!canAdd} onClick={submit}>
        Add
      </button>
      <button className="btn ghost sm" onClick={() => setOpen(false)}>
        Cancel
      </button>
      <small className={badInterval ? "bad" : ""}>
        {badInterval
          ? "Can't read that — try 22m, 4h, 6m 30s, or a number of seconds."
          : chosen === "mob"
            ? "A mob: your kills will keep teaching it. Leave the interval blank to time it later."
            : "A plain timer: it starts when you say so, and can repeat."}
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
 *
 * A plain timer has no such distinction to make and must not appear to: nothing spawned, so it says
 * **DONE** where a mob says UP, and its window is "nearly" rather than "may be up" (ADR 0135). Two
 * small tables rather than one with conditionals at every read, because what a state *reads as* is
 * exactly the thing that differs between the two kinds.
 */
const PHASE: Record<SpawnKind, Record<RunningSpawn["state"], { clock: string; label: string; cls: string }>> = {
  mob: {
    waiting: { clock: "", label: "", cls: "" },
    // The honest word: the window is open, so it *could* be up — that's the whole reason it exists.
    window: { clock: "", label: "may be up", cls: "window" },
    up: { clock: "UP", label: "", cls: "due" },
    alive: { clock: "ALIVE", label: "you marked it up", cls: "alive" },
    stale: { clock: "", label: "", cls: "" },
  },
  custom: {
    waiting: { clock: "", label: "", cls: "" },
    window: { clock: "", label: "nearly", cls: "window" },
    up: { clock: "DONE", label: "", cls: "due" },
    // Unreachable — nothing can be *sighted* — but a total table can't be read wrong later.
    alive: { clock: "DONE", label: "", cls: "due" },
    stale: { clock: "", label: "", cls: "" },
  },
};

/**
 * One countdown: a mob you're waiting on, or a clock you started.
 *
 * `several` is whether this camp is running more than one — a placeholder cycle — and is the only
 * thing that puts a slot number on screen. A camp with one clock must not be labelled as though it
 * were a set, and the number means nothing about *which* spawn point it is (ADR 0135).
 */
function RunningRow({ timer, now, several }: { timer: RunningSpawn; now: number; several: boolean }) {
  const phase = PHASE[timer.kind][timer.state];
  const alive = timer.state === "alive";
  const custom = timer.kind === "custom";
  // The provenance travels with the countdown: a due time is only as good as the bound behind it,
  // and a bare clock would read as a fact about the mob rather than a guess from you. Once you've
  // *seen* it, the guess is beside the point and the row says when instead.
  const note = custom
    ? // Nothing was measured, so there is no provenance to carry — what a reader wants instead is
      // how long the thing runs for and when this run began.
      timer.state === "up"
      ? `finished ${when(timer.dueAt)}`
      : `${formatInterval(timer.seconds)} · started ${when(timer.killedAt)}`
    : alive
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
        {/* The slot rides *inside* the name — `.spawn-name` is a column, so a bare sibling would
            drop to its own line. Shown only where it disambiguates: the clocks are interchangeable,
            so this is a handle to click, not an order, and never reads as "the 2nd one". */}
        <span>
          {timer.mob}
          {several && <em className="spawn-slot"> #{timer.slot}</em>}
        </span>
        <small>{timer.place}</small>
      </span>
      <span className="spawn-note">
        {phase.label && <b className="spawn-phase">{phase.label}</b>} {note}
      </span>
      {/* The sighting controls are a mob's. There is nothing to see, and nothing to be evidence
          about, on a clock the player made. */}
      {!custom && !alive && (
        <button
          className="btn sm"
          title="You can see it — end the countdown and use this as evidence"
          onClick={() => void api()?.spawns.markUp(timer.key, timer.id)}
        >
          It&rsquo;s up
        </button>
      )}
      {/* Disagreeing with the clock. Offered whenever the row isn't already showing a sighting —
          including while it still says *waiting*, since "not up at 12m" is worth recording however
          little the countdown was claiming. It is the only lower bound the app has. */}
      {!custom && !alive && (
        <button
          className="btn ghost sm"
          title="You're there and it hasn't popped — the window can't open before now"
          onClick={() => void api()?.spawns.markNotUp(timer.key, timer.id)}
        >
          Not up yet
        </button>
      )}
      {/* The way back from any of it: the clock starts again from now. For a mob that's "killed it"
          — also the undo for a mis-clicked "it's up", since a fresh countdown clears the sighting —
          and for a timer it's simply the reset the whole thing was missing. */}
      <button
        className="btn ghost sm"
        title={
          custom
            ? "Start this timer again from now"
            : "Killed it just now — restart the countdown from this moment"
        }
        onClick={() => void api()?.spawns.markDead(timer.key)}
      >
        {custom ? "Restart" : "Killed it"}
      </button>
      <button
        className="btn ghost sm"
        title="Take this countdown off the board"
        onClick={() => void api()?.spawns.stop(timer.key, timer.id)}
      >
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
  // The looks are the alert tab's own, because there is exactly one place a look is made or edited
  // (ADRs 0086, 0090) — a timer *picks* one, and never grows an editor of its own.
  const styles = useSettings()?.castAlerts.styles ?? [];
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
        {/* Only meaningful once something will actually be raised, so it appears with the thing it
            describes rather than sitting greyed out beside it. */}
        {known.notify && (
          <PickField
            value={known.styleId ?? ""}
            blank="Spawn timer (default)"
            options={styles.map((st) => ({ value: st.id, label: st.name }))}
            onChange={(styleId) => void api()?.spawns.style(known.key, styleId || null)}
            title="Which look its banner wears — a saved style from the Alerts tab, where every look is edited"
          />
        )}
        {/* A separate question from Notify, and deliberately not folded into it: one is a moment,
            the other is a dial you glance at. A camper often wants the countdown and no banner. */}
        <label className="spawn-notify" title="Keep this countdown on screen, over the game">
          <input
            type="checkbox"
            checked={known.onScreen}
            onChange={(e) => void api()?.spawns.showOnScreen(known.key, e.target.checked)}
          />
          On screen
        </label>
        {/* The placeholder camp, and the only control here that changes what an arriving *kill*
            does. Off by default because restarting is right for a named, and whether these three
            pops are three spawn points is knowledge only the player at the camp has (ADR 0135). */}
        <label
          className="spawn-notify"
          title="Placeholders: each kill starts its own countdown instead of restarting the last"
        >
          <input
            type="checkbox"
            checked={known.queue}
            onChange={(e) => void api()?.spawns.queue(known.key, e.target.checked)}
          />
          Several at once
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

      {caveat && (
        <p className={`spawn-caveat ${known.respawn && contradicted(known.respawn) ? "bad" : ""}`}>{caveat}</p>
      )}

      <Evidence known={known} />

      {open === "relearn" && (
        <Confirm
          // Says the cost in the units the player earned it in, because "are you sure?" doesn't
          // tell anyone whether they mind.
          cost={`Forget everything measured for ${known.mob} — ${gapCount(known.samples)}${known.seen ? " and every sighting" : ""}, over ${lastKilled(known)}? The figure goes back to unknown and is learned again from your next kills. Anything you typed is kept.`}
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
 * One clock the player made — a boat, a port, a lockout, an egg timer.
 *
 * Deliberately **not** `KnownRow` with conditionals through it. Almost every control there is about
 * evidence — the figure and where it came from, the sightings, the gaps, the corrections — and none
 * of that exists here: nothing was measured, so there is nothing to judge, relearn, contradict or
 * throw out ([ADR 0135](../../../specs/decisions/0135-a-countdown-is-an-instance-and-a-timer-is-its-own-kind.md)).
 * What is left is a length, a button that starts it, and whether it should do that by itself.
 *
 * The vocabulary follows: **Start** and **Restart**, never "Killed it"; the running clock reads DONE
 * rather than UP; and removing it needs no confirmation, because a row you typed in is yours and
 * takes nothing with it but itself.
 */
function CustomRow({ timer }: { timer: KnownSpawn }) {
  // Same wardrobe as everything else that can raise a banner: the Alerts tab's saved looks, picked
  // rather than edited (ADRs 0086, 0090).
  const styles = useSettings()?.castAlerts.styles ?? [];
  const [editing, setEditing] = useState(false);
  const length = timer.stated;
  const timed = length !== undefined;

  return (
    <div className="spawn-known-row spawn-made">
      <span className="spawn-name">
        {timer.mob}
        {/* A timer needs no place, so an empty one shows nothing rather than an empty line. */}
        {timer.place && <small>{timer.place}</small>}
      </span>
      <span className="spawn-figure">
        {timed ? formatInterval(length) : <em>no length yet</em>}
        {timer.repeat && timed ? <span className="spawn-pad"> · repeats</span> : null}
        {timer.lead ? <span className="spawn-pad"> · {formatInterval(timer.lead)} early</span> : null}
      </span>
      <span className="spawn-seen">{timer.running ? "running" : ""}</span>
      <span className="spawn-actions">
        <label className="spawn-notify" title="Raise a banner when this timer finishes">
          <input
            type="checkbox"
            checked={timer.notify}
            onChange={(e) => void api()?.spawns.notify(timer.key, e.target.checked)}
          />
          Notify
        </label>
        {timer.notify && (
          <PickField
            value={timer.styleId ?? ""}
            blank="Spawn timer (default)"
            options={styles.map((st) => ({ value: st.id, label: st.name }))}
            onChange={(styleId) => void api()?.spawns.style(timer.key, styleId || null)}
            title="Which look its banner wears — a saved style from the Alerts tab, where every look is edited"
          />
        )}
        <label className="spawn-notify" title="Keep this countdown on screen, over the game">
          <input
            type="checkbox"
            checked={timer.onScreen}
            onChange={(e) => void api()?.spawns.showOnScreen(timer.key, e.target.checked)}
          />
          On screen
        </label>
        {/* The thing a stopwatch has and a respawn cannot: when it finishes, it goes again. Chained
            from its own end rather than restarted from the moment we noticed, so a timer left
            running all evening is still on the beat it started on. */}
        <label className="spawn-notify" title="When it finishes, start it again">
          <input
            type="checkbox"
            checked={timer.repeat}
            onChange={(e) => void api()?.spawns.repeat(timer.key, e.target.checked)}
          />
          Repeat
        </label>

        <button
          className="btn ghost sm"
          title={timed ? "Start the clock from now" : "Set a length first — there's nothing to count down to"}
          disabled={!timed}
          onClick={() => void api()?.spawns.markDead(timer.key)}
        >
          {timer.running ? "Restart" : "Start"}
        </button>
        {timer.running && (
          <button
            className="btn ghost sm"
            title="Take it off the board, keeping the timer itself"
            onClick={() => void api()?.spawns.stop(timer.key)}
          >
            Stop
          </button>
        )}
        <button className="btn ghost sm" onClick={() => setEditing((o) => !o)}>
          {timed ? "Edit length" : "Set length"}
        </button>

        <span className="spacer" />

        <button
          className="btn sm"
          title="Take this timer off the board"
          onClick={() => void api()?.spawns.remove(timer.key)}
        >
          Remove
        </button>
      </span>

      {editing && (
        <SecondsField
          initial={length}
          placeholder="e.g. 22m, 4h"
          whenSet="How long it runs for. Restart it to use the new length."
          whenBlank="Empty clears it, and the timer waits until you give it a length."
          onSave={(seconds) => api()?.spawns.state(timer.key, seconds)}
          onDone={() => setEditing(false)}
        />
      )}
    </div>
  );
}

/**
 * A number of seconds, typed — the respawn you're claiming, or how early you want telling.
 *
 * One component for all three because they are the same act and the same syntax, and copies of it
 * would have drifted the moment one grew a rule. It reads `parseInterval` — `20m`, `4h`, `6m 30s`, a
 * bare number of seconds — which is the alert rules' syntax with this feature's own limits: hours and
 * days, and no thirty-minute ceiling. Borrowing the *cue* parser is what used to make a typed `4h`
 * unreadable and a typed `240m` quietly become 30m
 * ([ADR 0135](../../../specs/decisions/0135-a-countdown-is-an-instance-and-a-timer-is-its-own-kind.md)).
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
  // `formatDuration`, not `formatInterval`: a box you type in has to round-trip, and the figure
  // rounds to whole minutes because nobody camps to the second. Right for reading, wrong for editing.
  const [text, setText] = useState(initial ? formatDuration(initial) : "");
  const seconds = parseInterval(text);
  const blank = !text.trim();
  const bad = !blank && (seconds === null || seconds <= 0);

  const submit = () => {
    if (bad) return;
    onSave(blank ? null : seconds);
    onDone();
  };

  // What the field would do if you committed it now, computed before the markup so the JSX stays
  // a shape rather than a decision.
  const hint = bad ? "Can't read that — try 22m, 4h, 6m 30s, or a number of seconds." : blank ? whenBlank : whenSet;

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
 * What each source of evidence says, and how to drop one without dropping the rest.
 *
 * The row above shows the figure that **won**; this shows why. Without it a number that has gone
 * wonky is unfixable in practice — you cannot tell whether it came from a kill gap, a mis-clicked
 * sighting or something you typed months ago, so the only move left is to throw the lot away and
 * re-camp. Each line clears only itself.
 *
 * Nothing is shown when there is nothing to judge: a mob with no measurements and no typed figure
 * has no evidence, and an empty box under every row would be noise on the common case.
 */
function Evidence({ known }: { known: KnownSpawn }) {
  const [open, setOpen] = useState(false);
  const measured =
    known.shortestSeconds === undefined
      ? null
      : known.shortestSeconds === known.longestSeconds
        ? formatInterval(known.shortestSeconds)
        : `${formatInterval(known.shortestSeconds)}–${formatInterval(known.longestSeconds ?? known.shortestSeconds)}`;
  if (!measured && !known.seen && !known.floor && known.stated === undefined) return null;

  return (
    <div className="spawn-evidence">
      <span className="se-label">Evidence</span>
      {(measured || known.gaps.length > 0) && (
        <button
          className="link se-item"
          title="Show the gaps behind this figure — one bad pull can be thrown out without losing the rest"
          onClick={() => setOpen((o) => !o)}
        >
          <Caret open={open} className="se-caret" />
          {gapCount(known.samples)}
          {measured ? (
            <>
              : <b>{measured}</b>
            </>
          ) : (
            ": none left"
          )}
        </button>
      )}
      {known.floor && (
        <span className="se-item">
          still down at{" "}
          <b>{formatInterval(known.floor.seconds)}</b>
          {known.floor.count > 1 && ` (${known.floor.count}×)`}
          <button
            className="link"
            title="Forget the “not up yet” observations, keeping everything else"
            onClick={() => void api()?.spawns.forgetFloor(known.key)}
          >
            ✕
          </button>
        </span>
      )}
      {known.seen && (
        <span className="se-item">
          seen up {known.seen.count === 1 ? "once" : `${known.seen.count} times`}:{" "}
          <b>{formatInterval(known.seen.seconds)}</b>
          {/* The narrow undo. One stray "It's up" — or a consider of the wrong thing — records a
              bound that can only tighten, and before this the only way back was to throw away the
              camp's whole measured history with it. */}
          <button
            className="link"
            title="Forget the sightings, keeping what the kill gaps taught"
            onClick={() => void api()?.spawns.forgetSightings(known.key)}
          >
            ✕
          </button>
        </span>
      )}
      {open && <GapList known={known} />}
      {known.stated !== undefined && (
        <span className="se-item">
          yours: <b>{formatInterval(known.stated)}</b>
          <button
            className="link"
            title="Clear the figure you typed, falling back to what was measured"
            onClick={() => void api()?.spawns.state(known.key, null)}
          >
            ✕
          </button>
        </span>
      )}
    </div>
  );
}

/**
 * The individual gaps behind a figure, each of which can be thrown out or put back.
 *
 * The finest correction the feature has, and the one that keeps a camp's history. `relearn` draws a
 * line under *everything* measured — right when a whole evening was nonsense, far too blunt for the
 * one pull that was really the placeholder, or the night two people were killing it between them.
 *
 * A dropped gap stays listed, struck through: an exclusion you can't see is one you can't undo, which
 * is the same rule the dismissed-mob list is built on. Shortest first, because the shortest gap *is*
 * the figure and is what anyone opening this came to check.
 */
function GapList({ known }: { known: KnownSpawn }) {
  const inForce = known.gaps.find((g) => !g.dropped);
  return (
    <div className="se-gaps">
      {known.gaps.map((gap) => (
        <span key={gap.id} className={`se-gap ${gap.dropped ? "out" : ""}`}>
          <b>{formatInterval(gap.seconds)}</b>
          <small>{when(gap.endedAt)}</small>
          {/* Which one is actually setting the figure, since "shortest wins" is invisible until
              you can see the list it won against. */}
          {gap === inForce && <em className="se-inforce">in force</em>}
          <button
            className="link"
            title={gap.dropped ? "Count this gap again" : "Throw this gap out, keeping the rest"}
            onClick={() => void api()?.spawns.setGapDropped(known.key, gap.id, !gap.dropped)}
          >
            {gap.dropped ? "↺" : "✕"}
          </button>
        </span>
      ))}
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
