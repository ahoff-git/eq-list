"use client";
import { api } from "@/lib/api";
import { PickField } from "./ui";
import { duration, figure } from "@/shared/format";
import type { HarvestProgress } from "@/shared/types";

/**
 * The pace, named in hours/minutes rather than milliseconds — see `CatalogueHarvest`'s twin constant
 * for the reasoning. Same three gaps as items; the spell catalogue is smaller, so the labels mostly
 * read in minutes rather than hours.
 */
const GAPS = [2000, 1000, 500];

/**
 * Until a run has learned the roster, the measured size of a full one: `Category:Spells` holds 2,054
 * pages (confirmed against the live wiki, including its `Category:NPC_Only_Spells` subcategory).
 * Only a starting guess — the moment a run learns the real roster the labels are computed from that
 * instead ([ADR 0196](../../../specs/decisions/0196-spells-get-their-own-shard-addressed-mirror.md)).
 */
const ASSUMED_PAGES = 2_100;

const paceLabel = (gapMs: number, pages: number): string => {
  const hours = (pages * gapMs) / 3_600_000;
  const rounded = hours >= 1 ? `~${Math.round(hours)}h` : `~${Math.round(hours * 60)}m`;
  const name = gapMs >= 2000 ? "Very gentle" : gapMs >= 1000 ? "Gentle" : "Brisk";
  return `${name} — ${rounded}`;
};

const DEFAULT_PACE = "1000";

/**
 * The strip above the spell search: how much of the wiki's spell list we hold, and the button that
 * goes and gets the rest — the `spells` counterpart to `CatalogueHarvest`, sharing every piece of its
 * reasoning (honest about being a fetch, names the pace in time rather than milliseconds, never starts
 * on its own, only ever watches a run that lives in main) over the spell harvest instead.
 */
export default function SpellCatalogueHarvest({
  progress,
  held,
  pace,
  onPace,
}: {
  progress: HarvestProgress;
  /** How many spells the catalogue holds right now — the panel's own count, not the run's. */
  held: number;
  pace: string;
  onPace: (pace: string) => void;
}) {
  const running = progress.status === "running" || progress.status === "stopping";
  const total = progress.total;
  const done = total ? progress.at : held;
  const percent = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const shards = progress.shards;
  const roomPercent = shards.present ? Math.min(100, Math.round((shards.room / shards.present) * 100)) : 0;
  const roomAhead = roomPercent > percent + 1;

  const leftToFetch = total ? Math.max(0, total - progress.at) : ASSUMED_PAGES;
  const paces = GAPS.map((gapMs) => ({ value: String(gapMs), label: paceLabel(gapMs, leftToFetch) }));

  const start = (restart?: boolean) => void api()?.wiki.spellHarvestStart({ gapMs: Number(pace), restart });
  const stop = () => void api()?.wiki.spellHarvestStop();

  return (
    <div className="cat-harvest">
      <div className="row wrap cat-head">
        <span className="cat-count">
          <strong>{figure(held)}</strong>
          {total ? <span className="muted"> of {figure(total)} spells</span> : <span className="muted"> spells cached</span>}
        </span>

        {total > 0 && (
          <span
            className="cat-bar"
            title={
              roomAhead
                ? `You have ${percent}% of the wiki's spell list; the room has ${roomPercent}% between it`
                : `${percent}% of the wiki's spell list`
            }
          >
            {roomAhead && <span className="cat-bar-room" style={{ width: `${roomPercent}%` }} />}
            <span className="cat-bar-fill" style={{ width: `${percent}%` }} />
          </span>
        )}

        <span className="spacer" />

        {!running && (
          <PickField
            value={pace}
            onChange={onPace}
            blank={paces.find((p) => p.value === DEFAULT_PACE)!.label}
            blankValue={DEFAULT_PACE}
            options={paces.filter((p) => p.value !== DEFAULT_PACE)}
            title="How fast to ask the wiki for pages"
            className="select-sm"
          />
        )}

        {running ? (
          <button className="btn sm" onClick={stop} title="Stop after the page in flight — progress is kept">
            Stop
          </button>
        ) : (
          <button className="btn sm primary" onClick={() => start()} title="Fetch the spell pages we don't hold, one at a time">
            {progress.status === "done" ? "Check for new spells" : progress.at > 0 ? "Resume filling" : "Fill the catalogue"}
          </button>
        )}
      </div>

      <div className="row wrap cat-note muted small">
        {progress.error ? (
          <span className="bad">{progress.error}</span>
        ) : running ? (
          <>
            <span>
              {progress.status === "stopping"
                ? "Finishing this page…"
                : progress.from === "peer"
                  ? "Taking"
                  : "Fetching"}
              {progress.title ? ` ${progress.title}` : ""}
              {progress.from === "peer" ? " from a peer" : ""}
            </span>
            <span>· {figure(progress.fetched)} from the wiki</span>
            {progress.fromPeers > 0 && <span className="good">· {figure(progress.fromPeers)} from peers</span>}
            {progress.etaMs ? <span>· about {duration(Math.round(progress.etaMs / 1000))} left</span> : null}
          </>
        ) : progress.status === "done" ? (
          <span>
            Catalogue filled — {figure(progress.fetched)} from the wiki
            {progress.fromPeers > 0 ? `, ${figure(progress.fromPeers)} from peers` : ""}
            {progress.failed > 0 ? `, ${figure(progress.failed)} the wiki wouldn't give` : ""}.
          </span>
        ) : progress.at > 0 ? (
          <span>
            Stopped at {figure(progress.at)} of {figure(total)}. Resuming picks up where it left off.
          </span>
        ) : (
          <span>
            Sorting only works over spells we hold. Filling asks the wiki for its whole spell list, one
            page at a time with a pause between — it runs in the background and you can stop it.
          </span>
        )}
        {roomAhead && !running && (
          <span className="good">
            · Peers already hold {roomPercent}% between them — filling will take most of it from them
            rather than from the wiki.
          </span>
        )}
        {progress.failed > 0 && !running && progress.status !== "done" && (
          <span>· {figure(progress.failed)} failed</span>
        )}
        {progress.found > 0 && !running && (
          <span className="good">
            · {figure(progress.found)} {progress.found === 1 ? "spell" : "spells"} we had no record of
          </span>
        )}
      </div>
    </div>
  );
}
