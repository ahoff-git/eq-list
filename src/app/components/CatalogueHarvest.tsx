"use client";
import { api } from "@/lib/api";
import { PickField } from "./ui";
import { duration, figure } from "@/shared/format";
import type { HarvestProgress } from "@/shared/types";

/**
 * How gently to fill the catalogue. The middle one is the default, and the names say what the
 * number means, because "1000 ms" is not a thing anyone has an opinion about but "about three
 * hours, barely noticeable" is.
 *
 * The measurements behind them: a page is ~90 ms of the wiki's work and about 3 KB, and there are
 * 11,136 of them ([ADR 0153](../../../specs/decisions/0153-the-catalogue-is-filled-by-a-gentle-trickle.md)).
 */
/**
 * The pace, named in hours rather than milliseconds — "1000 ms" is not a thing anyone has an opinion
 * about, and "about four hours, barely noticeable" is.
 *
 * The hours are computed from the roster we actually have rather than written down, because the
 * roster grew: a run is items **plus** the mobs and quests they name, ~16,900 pages rather than
 * 11,136 ([ADR 0163](../../../specs/decisions/0163-an-item-wears-the-level-of-what-drops-it.md)).
 * A hard-coded "~3h" would have quietly become wrong the day that changed.
 */
const GAPS = [2000, 1000, 500];

/**
 * Until a run has learned the roster, the measured size of a full one: 11,136 items plus the 177
 * zones and 1,547 quests that give them their levels
 * ([ADR 0163](../../../specs/decisions/0163-an-item-wears-the-level-of-what-drops-it.md)).
 */
const ASSUMED_PAGES = 12_900;

const paceLabel = (gapMs: number, pages: number): string => {
  const hours = (pages * gapMs) / 3_600_000;
  const rounded = hours >= 1 ? `~${Math.round(hours)}h` : `~${Math.round(hours * 60)}m`;
  const name = gapMs >= 2000 ? "Very gentle" : gapMs >= 1000 ? "Gentle" : "Brisk";
  return `${name} — ${rounded}`;
};

const DEFAULT_PACE = "1000";

/**
 * The strip above the item search: how much of the wiki's item list we hold, and the button that
 * goes and gets the rest.
 *
 * The Items tab searches items by their stats, and its corpus is whatever pages have been fetched —
 * which without this is whatever you happened to have clicked on, a couple of hundred out of eleven
 * thousand. That is the difference between "the best ring I could wear" and "the best ring among the
 * ones I already looked at", and only one of those is worth sorting.
 *
 * It is **honest about being a fetch of someone else's pages**: it names the pace in hours rather
 * than milliseconds, it says what it is doing while it does it, and it never starts on its own. The
 * run lives in the main process, so leaving the tab (or closing the window) doesn't stop it — which
 * is why this component only ever watches and never owns the state.
 */
export default function CatalogueHarvest({
  progress,
  held,
  pace,
  onPace,
}: {
  progress: HarvestProgress;
  /** How many items the catalogue holds right now — the panel's own count, not the run's. */
  held: number;
  pace: string;
  onPace: (pace: string) => void;
}) {
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
  const leftToFetch = total ? Math.max(0, total - progress.at) : ASSUMED_PAGES;
  const paces = GAPS.map((gapMs) => ({ value: String(gapMs), label: paceLabel(gapMs, leftToFetch) }));

  const start = (restart?: boolean) => void api()?.wiki.harvestStart({ gapMs: Number(pace), restart });
  const stop = () => void api()?.wiki.harvestStop();

  return (
    <div className="cat-harvest">
      <div className="row wrap cat-head">
        <span className="cat-count">
          <strong>{figure(held)}</strong>
          {total ? <span className="muted"> of {figure(total)} items</span> : <span className="muted"> items cached</span>}
        </span>

        {total > 0 && (
          <span
            className="cat-bar"
            title={
              roomAhead
                ? `You have ${percent}% of the wiki's item list; the room has ${roomPercent}% between it`
                : `${percent}% of the wiki's item list`
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
          <button className="btn sm primary" onClick={() => start()} title="Fetch the item pages we don't hold, one at a time">
            {progress.status === "done" ? "Check for new items" : progress.at > 0 ? "Resume filling" : "Fill the catalogue"}
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
            Searching stats only works over items we hold. Filling asks the wiki for its whole item
            list, one page at a time with a pause between — it runs in the background and you can stop it.
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
      </div>
    </div>
  );
}
