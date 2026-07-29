"use client";
import { useEffect, useState } from "react";
import { useCombatStats, useHpEstimate } from "@/lib/hooks";
import { api, resetSession } from "@/lib/api";
import DamageMeter, { type DamageView } from "./DamageMeter";
import SpellTable from "./SpellTable";
import DamageHistory from "./DamageHistory";
import Sparkline from "./Sparkline";
import AskValue from "./AskValue";
import type { DeathRecap, FightBest, FightStats, HpEstimate, StoredFight } from "@/shared/types";

/**
 * The damage meter. Two axes of choice, because they answer different questions:
 *   scope — this fight (what just happened) / the session / a past fight from history
 *   view  — damage dealt, damage taken, or the per-spell breakdown
 *
 * A stored fight renders through exactly the same views as a live one, so "dig into
 * last night" and "how's this pull going" are the same screen.
 */
type Scope = "fight" | "session" | "history";
type View = DamageView | "spells";

/** A fight is "live" while the log has shown damage within this window. */
const LIVE_MS = 10_000;

export default function DamagePanel() {
  const stats = useCombatStats();
  const [scope, setScope] = useState<Scope>("fight");
  const [view, setView] = useState<View>("dealt");
  const [picked, setPicked] = useState<StoredFight | null>(null);
  const live = useLiveFight(stats.fight.endedAt);
  const bests = useBests(stats.fight.startedAt);

  // The window on show: a live one, or the stored fight picked out of history.
  const window: FightStats | null = scope === "history" ? picked?.stats ?? null : stats[scope];
  const petShare = window ? petShareOfYours(window) : 0;
  // A personal best only means something for one fight against a named opponent.
  const opponent = scope === "history" ? picked?.label : biggestOpponent(stats.fight);
  const best = scope === "fight" && opponent ? bests.find((b) => b.label === opponent) : undefined;
  const fightDps = window?.durationSec ? Math.round((window.yourDealt / window.durationSec) * 10) / 10 : 0;
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
        </div>
        <div className="segmented">
          <button className={segCls(view === "dealt")} onClick={() => setView("dealt")}>
            Dealt
          </button>
          <button className={segCls(view === "taken")} onClick={() => setView("taken")}>
            Taken
          </button>
          <button className={segCls(view === "spells")} onClick={() => setView("spells")}>
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
        {scope !== "history" && (
          <button className="btn ghost sm" onClick={resetSession} title="Clear the live meter and the session counters (recorded fights are kept)">
            Reset
          </button>
        )}
      </div>

      {scope === "history" && <DamageHistory picked={picked} onPick={setPicked} />}

      {scope === "history" && picked && (
        <div className="hist-picked">
          <span className="hp-label">{picked.label}</span>
          <span className="muted small">
            {new Date(picked.stats.startedAt).toLocaleString()} · {picked.stats.durationSec}s
          </span>
        </div>
      )}

      {window && (
        <>
          <div className="stat-row">
            <StatTile
              label={view === "taken" ? "Damage on you" : "Your damage"}
              value={fmt(view === "taken" ? window.yourTaken : window.yourDealt)}
            />
            <StatTile label="Your DPS" value={yourDps(window)} />
            <StatTile label="All damage" value={fmt(window.totalDealt)} />
            <StatTile label="In combat" value={duration(window.durationSec)} />
            {petShare > 0 && (
              <StatTile
                label="Pet share"
                value={`${Math.round(petShare * 100)}%`}
                hint="Share of your side's damage dealt by your pet"
              />
            )}
          </div>

          {isBest && (
            <p
              className="pb-flag"
              title={`Previous best against ${opponent}: ${best.dps}/s on ${new Date(best.at).toLocaleString()}`}
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
            <div className="empty">
              <p>No combat yet{scope === "fight" ? " this fight" : " this session"}.</p>
              <p className="small">Swing at something — this fills in from the log as damage lands.</p>
            </div>
          ) : (
            <DamageMeter rows={window.byCombatant} view={view} />
          )}
        </>
      )}

      {window && window.deaths.length > 0 && <Deaths deaths={window.deaths} />}

      {scope === "history" && !picked && <p className="muted small">Pick a fight above to break it down.</p>}
    </div>
  );
}

function StatTile({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="stat-tile" title={hint}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
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
              {max ? ` · ${Math.round((d.totalTaken / max) * 100)}% of your health` : ""}
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

/** The fight's headline opponent — the same rule history uses to label a fight. */
function biggestOpponent(window: FightStats): string | undefined {
  const theirs = window.byCombatant.filter((c) => !c.mine);
  return (theirs.find((c) => c.dealt > 0) ?? theirs[0])?.name;
}

/** One line for guild chat — the numbers people actually paste. */
function summaryLine(window: FightStats, opponent?: string): string {
  const spell = window.spells.find((s) => s.dpc > 0);
  return [
    opponent ? `vs ${opponent}` : "",
    `${fmt(window.yourDealt)} dmg`,
    `${yourDps(window)} dps`,
    duration(window.durationSec),
    spell ? `top: ${spell.spell} ${spell.dpc}/s cast` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Personal bests, re-read when a fight ends — the only time they can change. */
function useBests(refreshKey: string): FightBest[] {
  const [bests, setBests] = useState<FightBest[]>([]);
  useEffect(() => {
    void api()?.combat.bests().then(setBests);
  }, [refreshKey]);
  return bests;
}

/** Your side's DPS over the window (you + pet), which is what people compare. */
function yourDps(window: FightStats): string {
  const sec = Math.max(1, window.durationSec);
  return window.yourDealt ? `${Math.round((window.yourDealt / sec) * 10) / 10}` : "—";
}

function duration(sec: number): string {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  return m > 0 ? `${m}m ${sec % 60}s` : `${sec}s`;
}

const fmt = (n: number): string => n.toLocaleString();

/** The shared segmented-control button (same one the Search tab uses). */
const segCls = (active: boolean): string => `seg ${active ? "active" : ""}`;

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
    const timer = setInterval(check, 2000);
    return () => clearInterval(timer);
  }, [endedAt]);
  return live;
}
