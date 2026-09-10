"use client";
import { PickField } from "./ui";
import { duration, figure } from "@/shared/format";
import type { HarvestProgress } from "@/shared/types";

/**
 * The strip above a wiki-backed search: how much of a category's page list we hold, and the button
 * that goes and gets the rest. Shared by `CatalogueHarvest` (items) and `SpellCatalogueHarvest`
 * (spells) — the two used to be nearly a byte-for-byte copy of each other, differing only in the
 * noun, the assumed roster size, one sentence about what filling is *for*, and which pair of IPC
 * calls a run starts and stops.
 *
 * It is **honest about being a fetch of someone else's pages**: it names the pace in hours rather
 * than milliseconds, it says what it is doing while it does it, and it never starts on its own. The
 * run lives in the main process, so leaving the tab (or closing the window) doesn't stop it — which
 * is why this component only ever watches and never owns the state.
 */
const GAPS = [2000, 1000, 500];

const DEFAULT_PACE = "1000";

/**
 * The pace, named in hours/minutes rather than milliseconds — "1000 ms" is not a thing anyone has an
 * opinion about, and "about four hours, barely noticeable" is.
 */
const paceLabel = (gapMs: number, pages: number): string => {
  const hours = (pages * gapMs) / 3_600_000;
  const rounded = hours >= 1 ? `~${Math.round(hours)}h` : `~${Math.round(hours * 60)}m`;
  const name = gapMs >= 2000 ? "Very gentle" : gapMs >= 1000 ? "Gentle" : "Brisk";
  return `${name} — ${rounded}`;
};

export interface CatalogueHarvestPanelProps {
  progress: HarvestProgress;
  /** How many rows the catalogue holds right now — the panel's own count, not the run's. */
  held: number;
  pace: string;
  onPace: (pace: string) => void;
  /** Singular, for "item list"/"item pages" — the shape everything but a bare count reads in. */
  noun: string;
  /** Plural, for a count ("of 11,847 items") or a header ("items cached"). */
  nounPlural: string;
  /**
   * Until a run has learned the real roster, the measured (or estimated) size of a full one — only
   * a starting guess, since the moment a run learns the roster the labels are computed from that
   * instead, which is why either caller's figure being a little wrong costs nothing.
   */
  assumedPages: number;
  /**
   * What this catalogue is *for*, said only while nothing has ever been fetched and nothing is
   * running — `CatalogueHarvest`'s is about item-stat search, `SpellCatalogueHarvest`'s about spell
   * sorting, so the two can't share one sentence. The shared "Filling asks the wiki…" continuation
   * follows it.
   */
  idleHint: string;
  onStart: (restart?: boolean) => void;
  onStop: () => void;
}

export default function CatalogueHarvestPanel({
  progress,
  held,
  pace,
  onPace,
  noun,
  nounPlural,
  assumedPages,
  idleHint,
  onStart,
  onStop,
}: CatalogueHarvestPanelProps) {
  const running = progress.status === "running" || progress.status === "stopping";
  const total = progress.total;
  // Before a run has ever asked, we don't know the roster — so the bar is drawn against what we
  // hold rather than inventing a denominator.
  const done = total ? progress.at : held;
  const percent = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  /**
   * What the **room** holds between it, as a second, fainter bar behind our own.
   *
   * It is the figure that answers "was joining a room worth it": a newcomer to a room that has done
   * the work sees a nearly-full pale bar behind an empty solid one, which is exactly the situation
   * where the answer is "yes, and it will take minutes" (ADR 0160).
   */
  const shards = progress.shards;
  const roomPercent = shards.present ? Math.min(100, Math.round((shards.room / shards.present) * 100)) : 0;
  const roomAhead = roomPercent > percent + 1;

  // What is left to *fetch*, since that is what the time is spent on — a mostly-filled catalogue
  // should not be advertised as another four hours.
  const leftToFetch = total ? Math.max(0, total - progress.at) : assumedPages;
  const paces = GAPS.map((gapMs) => ({ value: String(gapMs), label: paceLabel(gapMs, leftToFetch) }));

  return (
    <div className="cat-harvest">
      <div className="row wrap cat-head">
        <span className="cat-count">
          <strong>{figure(held)}</strong>
          {total ? (
            <span className="muted"> of {figure(total)} {nounPlural}</span>
          ) : (
            <span className="muted"> {nounPlural} cached</span>
          )}
        </span>

        {total > 0 && (
          <span
            className="cat-bar"
            title={
              roomAhead
                ? `You have ${percent}% of the wiki's ${noun} list; the room has ${roomPercent}% between it`
                : `${percent}% of the wiki's ${noun} list`
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
          <button className="btn sm" onClick={onStop} title="Stop after the page in flight — progress is kept">
            Stop
          </button>
        ) : (
          <button
            className="btn sm primary"
            onClick={() => onStart()}
            title={`Fetch the ${noun} pages we don't hold, one at a time`}
          >
            {progress.status === "done" ? `Check for new ${nounPlural}` : progress.at > 0 ? "Resume filling" : "Fill the catalogue"}
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
            {idleHint} Filling asks the wiki for its whole {noun} list, one page at a time with a pause
            between — it runs in the background and you can stop it.
          </span>
        )}
        {/* The room's contribution, said plainly wherever it is true: it changes what the button is
            about to cost from hours to minutes, which is worth knowing *before* pressing it. */}
        {roomAhead && !running && (
          <span className="good">
            · Peers already hold {roomPercent}% between them — filling will take most of it from them
            rather than from the wiki.
          </span>
        )}
        {progress.failed > 0 && !running && progress.status !== "done" && (
          <span>· {figure(progress.failed)} failed</span>
        )}
        {/* What exploring the wiki actually turned up. Said only when there is something to say:
            the walk re-runs weekly and most weeks finds nothing, and "0 new items" every time would
            train people to stop reading the line
            ([ADR 0177](../../../specs/decisions/0177-the-item-list-is-a-walk-not-a-listing.md)). */}
        {progress.found > 0 && !running && (
          <span className="good">
            · {figure(progress.found)} {progress.found === 1 ? noun : nounPlural} we had no record of
          </span>
        )}
      </div>
    </div>
  );
}
