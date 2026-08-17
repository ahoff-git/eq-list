"use client";
import { useEffect, useState } from "react";
import { useCombatStats, useHpEstimate, useRead } from "@/lib/hooks";
import { api, resetSession } from "@/lib/api";
import DamageMeter, { type DamageView } from "./DamageMeter";
import SpellTable from "./SpellTable";
import DamageHistory from "./DamageHistory";
import HighScoreBoard from "./HighScoreBoard";
import Sparkline from "./Sparkline";
import AskValue from "./AskValue";
import { opponentOf } from "@/shared/damage-tree";
import type { DamageAxis, DeathRecap, FightBest, FightStats, HpEstimate, StoredFight } from "@/shared/types";

import { Empty, segCls, StatTile } from "./ui";
import { duration, percent, when } from "@/shared/format";
import { ratio } from "@/shared/numbers";
/**
 * The damage meter. Two axes of choice, because they answer different questions:
 *   scope — this fight (what just happened) / the session / a past fight from history
 *   view  — which way the damage is fanned out (see `LAYOUTS`), or the per-spell table
 *
 * **Targets leads**, because that's the question a fight actually poses: what did we damage,
 * and then — one click in — who hurt it and with what (ADR 0053). Opening on the dealer list
 * put a row of party members where the enemy should be, and made "how much did we do to *that*"
 * a number you had to assemble yourself.
 *
 * A stored fight renders through exactly the same views as a live one, so "dig into
 * last night" and "how's this pull going" are the same screen.
 */
/**
 * `records` sits beside the three windows on damage rather than in a tab of its own: it is the same
 * question asked over your whole history — *what is the best this has ever been* — and the tab bar
 * already collapses at this window's default width, so a ninth tab would have pushed a feature into
 * the » menu to make room for one that lives two clicks from the same data.
 */
type Scope = "fight" | "session" | "history" | "records";
type View = keyof typeof LAYOUTS | "spells";

/**
 * The ways damage fans out. Every one is the *same* cells rolled up along different axes
 * (ADR 0053), so adding a question is a row here rather than a new component — and no two
 * of them can disagree about a total.
 *
 * `bars` is which number the top-level rows show, and therefore what they're a list of;
 * `drill` is the order below. **Abilities** exists because of area spells: the log writes
 * Firestorm as one line per target, so every target-first order splits one cast four ways
 * before you can see what the cast was worth. Putting the ability above the target adds it
 * back up, and still says which mobs it landed on.
 */
const LAYOUTS = {
  taken: {
    label: "Targets",
    hint: "What took damage — open a row for who hurt it, how, and with what",
    bars: "taken",
    drill: ["attacker", "kind", "source"],
  },
  dealt: {
    label: "Dealers",
    hint: "Who dealt the damage — open a row for what it hit, how, and with what",
    bars: "dealt",
    drill: ["target", "kind", "source"],
  },
  abilities: {
    label: "Abilities",
    hint: "Who dealt the damage — open a row for how, with what, and then what it landed on (area spells add up here)",
    bars: "dealt",
    drill: ["kind", "source", "target"],
  },
} as const satisfies Record<string, { label: string; hint: string; bars: DamageView; drill: DamageAxis[] }>;

/** A fight is "live" while the log has shown damage within this window. */
const LIVE_MS = 10_000;

/**
 * How often to re-ask "is this fight still live?".
 *
 * Nothing arrives to say a fight went quiet — the label flips because time passed — so this is the
 * resolution of "This fight" becoming "Last fight". Fine enough not to look stuck, coarse enough that
 * an idle window isn't doing arithmetic every frame.
 */
const LIVE_CHECK_MS = 2_000;

/** A stable empty, so a render that hasn't heard back yet doesn't look like a change. */
const NO_BESTS: FightBest[] = [];

export default function DamagePanel() {
  const stats = useCombatStats();
  const [scope, setScope] = useState<Scope>("fight");
  const [view, setView] = useState<View>("taken");
  const [picked, setPicked] = useState<StoredFight | null>(null);
  const live = useLiveFight(stats.fight.endedAt);
  const bests = useBests(stats.fight.startedAt);

  // The window on show: a live one, or the stored fight picked out of history. The scoreboard is not
  // a damage window at all — it spans every fight ever — so it has none, and everything below that
  // renders a window sits out.
  const window: FightStats | null =
    scope === "history" ? picked?.stats ?? null : scope === "records" ? null : stats[scope];
  const petShare = window ? petShareOfYours(window) : 0;
  // A personal best only means something for one fight against a named opponent. `opponentOf` is
  // the same rule history labels a fight by, so the ★ flag and the list agree on who you fought.
  const opponent = scope === "history" ? picked?.label : opponentOf(stats.fight);
  const best = scope === "fight" && opponent ? bests.find((b) => b.label === opponent) : undefined;
  const fightDps = ratio(window?.yourDealt ?? 0, window?.durationSec ?? 0, 1);
  const isBest = !!best && fightDps >= best.dps && fightDps > 0;

  return (
    <div>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <div className="segmented">
          <button className={segCls(scope === "fight")} onClick={() => setScope("fight")}>
            {live ? "This fight" : "Last fight"}
          </button>
          <button className={segCls(scope === "session")} onClick={() => setScope("session")}>
            Session
          </button>
          <button className={segCls(scope === "history")} onClick={() => setScope("history")}>
            History
          </button>
          <button
            className={segCls(scope === "records")}
            title="Your personal bests — the biggest hit, the longest streak, the best fight you've ever had"
            onClick={() => setScope("records")}
          >
            🏆 Records
          </button>
        </div>
        {/* Which way damage fans out is a question about a *window* of damage; the scoreboard isn't
            one, so the toggle would be a row of controls that did nothing. */}
        <div className="segmented" hidden={scope === "records"}>
          {entries(LAYOUTS).map(([key, layout]) => (
            <button key={key} className={segCls(view === key)} title={layout.hint} onClick={() => setView(key)}>
              {layout.label}
            </button>
          ))}
          <button
            className={segCls(view === "spells")}
            title="Your spells, cast by cast: cast time, damage per second of casting, resist rate"
            onClick={() => setView("spells")}
          >
            Spells
          </button>
        </div>
        <span className="spacer" />
        {window && window.totalDealt > 0 && (
          <button
            className="btn ghost sm"
            title="Copy a one-line summary (for guild chat)"
            onClick={() => void navigator.clipboard?.writeText(summaryLine(window, opponent))}
          >
            Copy
          </button>
        )}
        {/* The scoreboard has a Reset of its own, for the records — two buttons called Reset meaning
            different things is worse than one being somewhere else. */}
        {scope !== "history" && scope !== "records" && (
          <button className="btn ghost sm" onClick={resetSession} title="Clear the live meter and the session counters (recorded fights are kept)">
            Reset
          </button>
        )}
      </div>

      {scope === "records" && <HighScoreBoard />}

      {scope === "history" && <DamageHistory picked={picked} onPick={setPicked} />}

      {scope === "history" && picked && (
        <div className="hist-picked">
          <span className="hp-label">{picked.label}</span>
          <span className="muted small">
            {when(picked.stats.startedAt)} · {picked.stats.durationSec}s
          </span>
        </div>
      )}

      {window && (
        <>
          {/* Both directions, always — a tile that changes meaning with the view is a tile you
              have to re-read every time you flip. */}
          <div className="stat-row">
            <StatTile label="Your damage" value={fmt(window.yourDealt)} hint="Dealt by you and your pet" />
            <StatTile label="Your DPS" value={yourDps(window)} />
            <StatTile label="Damage on you" value={fmt(window.yourTaken)} hint="Taken by you and your pet" />
            <StatTile
              label="All damage"
              value={fmt(window.totalDealt)}
              hint="Every hit in your party's fights, whoever landed it — and the 100% the shares below are taken against. Another group's fight at the same camp isn't counted."
            />
            <StatTile label="In combat" value={inCombat(window.durationSec)} />
            {petShare > 0 && (
              <StatTile
                label="Pet share"
                value={percent(petShare)}
                hint="Share of your side's damage dealt by your pet"
              />
            )}
          </div>

          {isBest && (
            <p
              className="pb-flag"
              title={`Previous best against ${opponent}: ${best.dps}/s on ${when(best.at)}`}
            >
              ★ Best DPS on {opponent} — {fightDps}/s
            </p>
          )}

          {/* Shape beats a single number: a steady grind and a burst that fell off a
              cliff can share a DPS figure but never a silhouette. */}
          {window.yourPerSec.length > 1 && (
            <Sparkline
              values={window.yourPerSec}
              title={`Your damage per second · peak ${Math.max(...window.yourPerSec).toLocaleString()}`}
            />
          )}

          {view === "spells" ? (
            <SpellTable window={window} />
          ) : window.byCombatant.length === 0 ? (
            <Empty
              title={`No combat yet${scope === "fight" ? " this fight" : " this session"}.`}
              hint="Swing at something — this fills in from the log as damage lands."
            />
          ) : (
            <DamageMeter
              rows={window.byCombatant}
              view={LAYOUTS[view].bars}
              drill={LAYOUTS[view].drill}
              cells={window.damageCells}
            />
          )}
        </>
      )}

      {window && window.deaths.length > 0 && <Deaths deaths={window.deaths} />}

      {scope === "history" && !picked && <p className="muted small">Pick a fight above to break it down.</p>}
    </div>
  );
}



/**
 * What killed you, and what was landing in the seconds before. The log names a killer
 * but never a reason — the run-up is the reason.
 *
 * The damage only means something against your health, which the log also never states —
 * so it's shown against the **inferred** maximum (what you've survived, what has killed
 * you), with the evidence on hover and a click to correct it.
 */
function Deaths({ deaths }: { deaths: DeathRecap[] }) {
  const hp = useHpEstimate();
  const max = usableMax(hp);

  return (
    <div className="deaths">
      <h3 className="section-head">
        Deaths
        <span className="hp-note">
          {max ? `· health ${hpLabel(hp)}` : "· health unknown"}
          <AskValue
            prompt={max ? "set" : "tell me"}
            why={hpWhy(hp)}
            suffix=" hp"
            min={1}
            max={100000}
            initial={max || undefined}
            onSubmit={(value) => api()?.hp.set(value)}
          />
          <AskValue
            prompt={hp.regenPerTick ? `regen ${hp.regenPerTick}` : "regen?"}
            why="Health ticks back every ~6 seconds, which lets a long fight absorb more than you actually have — so it inflates the figures on the left. Tell me your in-combat regeneration per tick and I'll discount it. Left blank, nothing is assumed."
            suffix=" /tick"
            min={0}
            max={1000}
            initial={hp.regenPerTick}
            onSubmit={(value) => api()?.hp.setRegen(value)}
          />
        </span>
      </h3>
      {deaths.map((d) => (
        <div className="death" key={d.at}>
          <div className="row">
            <span className="death-killer">{d.killer ?? "unknown"}</span>
            <span className="muted small">{new Date(d.at).toLocaleTimeString()}</span>
            <span className="spacer" />
            <span className="muted small">
              {fmt(d.totalTaken)} taken in the last {d.windowSec}s
              {max ? ` · ${percent(ratio(d.totalTaken, max))} of your health` : ""}
            </span>
          </div>
          <div className="death-sources">
            {d.incoming.slice(0, 5).map((i) => (
              <span key={i.source}>
                {i.source} <span className="muted">{fmt(i.amount)}</span>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The best single number to compare damage against, or 0 when nothing is known yet. */
function usableMax(hp: HpEstimate): number {
  if (hp.stated) return hp.stated;
  // With both bounds, the midpoint is the least-wrong single figure; with only a floor,
  // the floor itself understates by definition — which is the safer direction.
  if (hp.atMost) return Math.round((hp.atLeast + hp.atMost) / 2);
  return hp.atLeast;
}

function hpLabel(hp: HpEstimate): string {
  if (hp.stated) return `${fmt(hp.stated)}`;
  if (hp.atMost) return `${fmt(hp.atLeast)}–${fmt(hp.atMost)}`;
  return `${fmt(hp.atLeast)}+`;
}

/** Say where the figure came from — it's inferred, and the reader should know that. */
function hpWhy(hp: HpEstimate): string {
  if (hp.stated) return `You told me ${hp.stated}. Click to change it; levelling up clears it.`;
  const parts = [
    hp.atLeast ? `you've survived ${hp.atLeast} damage in one stretch without healing` : "",
    hp.atMost ? `${hp.atMost} has killed you from full health` : "",
  ].filter(Boolean);
  const evidence = parts.length ? `Worked out from the log: ${parts.join(", and ")}.` : "Nothing to go on yet.";
  const regen = hp.regenPerTick
    ? `Discounting ${hp.regenPerTick} regen per 6s tick.`
    : "Passive regeneration is not discounted (tell me the rate and it will be).";
  return `${evidence} ${regen} Buffs the log doesn't announce keep it approximate — click to set it outright.`;
}

/** Share of your side's damage that came from the pet rather than you. */
function petShareOfYours(window: FightStats): number {
  const mine = window.byCombatant.filter((c) => c.mine);
  const total = mine.reduce((n, c) => n + c.dealt, 0);
  if (!total) return 0;
  return mine.filter((c) => c.name !== "You").reduce((n, c) => n + c.dealt, 0) / total;
}

/** One line for guild chat — the numbers people actually paste. */
function summaryLine(window: FightStats, opponent?: string): string {
  const spell = window.spells.find((s) => s.dpc > 0);
  return [
    opponent ? `vs ${opponent}` : "",
    `${fmt(window.yourDealt)} dmg`,
    `${yourDps(window)} dps`,
    inCombat(window.durationSec),
    spell ? `top: ${spell.spell} ${spell.dpc}/s cast` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Personal bests, re-read when a fight ends — the only time they can change. */
function useBests(refreshKey: string): FightBest[] {
  return useRead((a) => a.combat.bests(), NO_BESTS, [refreshKey]);
}

/** Your side's DPS over the window (you + pet), which is what people compare. */
function yourDps(window: FightStats): string {
  const sec = Math.max(1, window.durationSec);
  return window.yourDealt ? `${ratio(window.yourDealt, sec, 1)}` : "—";
}

const fmt = (n: number): string => n.toLocaleString();

/**
 * How long the window spent fighting — a dash rather than "0s" when it hasn't.
 *
 * The dash is this panel's call, not the formatter's: "In combat: 0s" reads like a measurement, while a
 * dash reads like the absence it is. `duration` used to be reimplemented here just to fold that in, which
 * left three different answers to `duration(0)` across the app.
 */
const inCombat = (sec: number): string => (sec ? duration(sec, { seconds: true }) : "—");

/** The shared segmented-control button (same one the Search tab uses). */


/** `Object.entries` that keeps the key type, so the layout buttons stay exhaustive. */
const entries = <T extends object>(o: T): [keyof T, T[keyof T]][] => Object.entries(o) as [keyof T, T[keyof T]][];

/**
 * Whether the current fight is still running. The log only reveals a lull when the
 * next swing lands, so freshness is judged here against the wall clock — and re-checked
 * on a timer so the label flips from "This fight" to "Last fight" on its own.
 */
function useLiveFight(endedAt: string): boolean {
  const [live, setLive] = useState(false);
  useEffect(() => {
    const check = () => setLive(!!endedAt && Date.now() - Date.parse(endedAt) < LIVE_MS);
    check();
    const timer = setInterval(check, LIVE_CHECK_MS);
    return () => clearInterval(timer);
  }, [endedAt]);
  return live;
}
