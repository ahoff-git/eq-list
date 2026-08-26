"use client";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { describeCoins, formatCoins } from "@/shared/money";
import ItemLink from "./ItemLink";
import { dropKey, dropSources, roamWhy, type MobKnowledge } from "@/shared/mob-stats";
import { dropRate, rateConfidence, rateWhy } from "@/shared/drop-truth";
import { filterMobKnowledge, matchesDrop, mobChoices, type KillFilters } from "@/shared/kill-filters";
import { count, countOf } from "@/shared/format";
import type { KillEmphasis } from "@/shared/types";
import KillFilterBar from "./KillFilterBar";
import { Caret } from "./ui";

/**
 * What killing things has taught us: how often each mob drops what, what it carries, and
 * roughly where it lives. All three are *observed* — the wiki's rates are someone else's
 * sample, these are yours (pooled with any peers sharing theirs).
 *
 * Coin here is the mob's own money per kill, never what its drops vendor for: those come from
 * different lines, pool differently, and answer different questions (ADR 0047).
 *
 * A rate is only as good as its denominator, so every row leads with the kill count and says
 * how much of it you saw yourself. Three kills is not a drop rate, and the display shouldn't
 * let anyone pretend otherwise.
 *
 * **Pointing at a row shows it on the map** (`onEmphasize`), and both directions of the panel answer:
 * a mob rings its own kills, and a *drop* rings the kills of every mob known to give it up
 * (`dropSources`). "Where do snake fangs come from" is one question with several answers, so it lights
 * them all at once rather than making you open each mob to find out who else has it. The list is what
 * this panel knows; the map is where that knowledge is.
 *
 * Headed by the **same bar as the ☠ kill list** (`KillFilterBar`), sharing the map window's one set of
 * filters. It used to spend a whole row on "14 mobs observed in Kerra Ridge" and a button, so opening
 * both panels cost two rows that said two different things before either list began. The count now sits
 * in a bar that also filters, and the 📖 in front of it is what says which toolbar button you're looking
 * at the panel for.
 */
export default function MobKnowledgePanel({
  zone,
  known: all,
  filters,
  onFilters,
  onMarkMob,
  onEmphasize,
}: {
  zone: string | undefined;
  /**
   * What's been learned here, read and followed by the map window (`useZoneMobs`) rather than by
   * this panel — the hunt pins on the canvas are drawn from the same rows, and a panel with its own
   * copy would be a second answer to one question, arriving at its own moment.
   */
  known: MobKnowledge[];
  /** The map window's one set of kill filters — see `filterMobKnowledge` for which apply here. */
  filters: KillFilters;
  onFilters: (next: KillFilters) => void;
  /** Mark a mob's roam area on the map. */
  onMarkMob?: (mob: MobKnowledge) => void;
  /** Ring some kills on the map while a row is pointed at — `null` takes the ask back. */
  onEmphasize?: (emphasis: KillEmphasis | null) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const mobs = useMemo(() => filterMobKnowledge(all, filters), [all, filters]);
  // The picker offers what's here *before* filtering, or choosing a mob would empty its own list.
  const names = useMemo(() => mobChoices(all), [all]);
  /**
   * Which mobs drop what, indexed once. Built from everything known here rather than from the
   * filtered rows: "where does this come from" is a question about the zone, and narrowing the list
   * to one mob shouldn't quietly narrow the answer to that mob too.
   */
  const sources = useMemo(() => dropSources(all), [all]);

  // A typed drop is a *search for an item*, so the rows it matched open themselves and the line that
  // matched is marked. Left closed, the panel answers "these four mobs" to a question that asked
  // about one item, and finding it means clicking a caret on every row.
  const searching = filters.drop.trim() !== "";
  const showDrops = (key: string) => searching || open === key;

  /** Ring this mob's kills on the map. */
  const emphasizeMob = (mob: string) => onEmphasize?.({ mobs: [mob] });
  /** Ring the kills of everything that drops this — the map's answer to "where is it from". */
  const emphasizeDrop = (item: string) => onEmphasize?.({ mobs: sources.get(dropKey(item)) ?? [] });

  if (all.length === 0) {
    return (
      <div className="mob-knowledge no-drag">
        <p className="muted small">
          Nothing learned here yet. Kill something — drop rates and roam areas build up from your
          own kills, and pool with anyone sharing theirs.
        </p>
      </div>
    );
  }

  return (
    // Leaving the panel clears the emphasis outright, the same backstop the ☠ list has: the rows hand
    // it back and forth between a mob and one of its drops, so without this, walking the cursor out
    // of a drop row would leave the map lit up with nothing pointing at it.
    <div className="mob-knowledge no-drag" onMouseLeave={() => onEmphasize?.(null)}>
      {/* The same bar the ☠ list is headed by. A time window and a position floor are facts about one
          kill, and this is a lifetime tally of many, so neither is offered here. */}
      <KillFilterBar
        icon="📖"
        what="learned"
        toggledBy="shows and hides this"
        filters={filters}
        onFilters={onFilters}
        mobs={names}
        withWindow={false}
        withPosition={false}
        tally={
          <>
            {countOf(mobs.length, all.length, "mob")} observed{zone ? ` in ${zone}` : ""}
          </>
        }
      >
        <button
          className="btn ghost sm"
          title="Forget what peers have told us. Your own observations are kept."
          onClick={() => void api()?.mobs.forgetPeers()}
        >
          Forget peers&apos;
        </button>
      </KillFilterBar>

      {mobs.length === 0 && (
        <p className="muted small">
          Nothing here matches the filters — {count(all.length, "mob is", "mobs are")} known in this zone.
        </p>
      )}

      {mobs.map((mob) => {
        const key = `${mob.mob}|${mob.zone}`;
        const pooled = mob.kills - mob.myKills;
        return (
          <div className={`mob-row ${showDrops(key) ? "open" : ""}`} key={key}>
            <div
              className="mob-head"
              title="Rings this mob's kills on the map — click for what it drops"
              onClick={() => setOpen(open === key ? null : key)}
              onMouseEnter={() => emphasizeMob(mob.mob)}
            >
              <Caret open={showDrops(key)} />
              {/* A link, like the mob's name in the ☠ list beside it — the head still opens the row. */}
              <ItemLink title={mob.mob} className="mob-name" />
              <span
                className="muted small"
                title={
                  pooled > 0
                    ? `${mob.myKills} of these were yours; ${pooled} came from ${mob.contributors.join(", ")}`
                    : "All your own kills"
                }
              >
                {count(mob.kills, "kill")}
                {pooled > 0 ? ` (${mob.myKills} yours)` : ""}
              </span>
              {mob.copper > 0 && (
                <span
                  className="muted small"
                  title={`${describeCoins(mob.copper)} off ${mob.kills} corpses — the coin it carried, not what its drops sell for`}
                >
                  {formatCoins(mob.copperPerKill)}/kill
                </span>
              )}
              <span className="spacer" />
              {mob.area && onMarkMob && (
                <button
                  className="btn ghost sm"
                  title={`${roamWhy(mob.area)} — click to pin it on the map`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMarkMob(mob);
                  }}
                >
                  ±{mob.area.spread}
                </button>
              )}
            </div>

            {showDrops(key) && (
              <div className="mob-drops">
                {mob.drops.length === 0 ? (
                  <span className="muted small">Never seen it drop anything.</span>
                ) : (
                  mob.drops.map((drop) => {
                    const from = sources.get(dropKey(drop.item)) ?? [];
                    // The line the search was for, marked — with several rows open at once, the item
                    // you typed is otherwise just one more line among their whole loot tables.
                    const hit = searching && matchesDrop(drop.item, filters.drop);
                    return (
                      <div
                        className={`mob-drop ${hit ? "hit" : ""}`}
                        key={drop.item}
                        title={`Where ${drop.item} comes from — rings every kill of it on the map`}
                        onMouseEnter={() => emphasizeDrop(drop.item)}
                      >
                        <ItemLink title={drop.item} />
                        <span className="spacer" />
                        {from.length > 1 && (
                          <span className="md-from muted small" title={alsoFrom(drop.item, mob.mob, from)}>
                            {count(from.length, "source")}
                          </span>
                        )}
                        <span className="md-count muted small">
                          {drop.count}/{mob.kills}
                        </span>
                        <span className={`md-rate ${rateConfidence(mob.kills)}`} title={rateWhy(mob.kills)}>
                          {dropRate(drop.rate)}
                        </span>
                      </div>
                    );
                  })
                )}
                {mob.contributors.length > 0 && (
                  <span className="muted small">pooled with {mob.contributors.join(", ")}</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Who *else* drops this, for the badge that says how many do.
 *
 * The row sits under one mob and can't otherwise admit it's speaking for one of several — so without
 * this, the ring that lights three camps when you hover looks like it had gone wrong. The mob whose
 * row this is comes out of the list: you're reading it, and "also" is the useful half.
 */
function alsoFrom(item: string, mob: string, from: string[]): string {
  const others = from.filter((name) => name !== mob);
  return `${item} also comes off ${others.join(", ")} here — hovering rings every one of their kills`;
}
