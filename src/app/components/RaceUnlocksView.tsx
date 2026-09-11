"use client";
import { useMemo, type MouseEvent } from "react";
import { api } from "@/lib/api";
import { usePersistentState } from "@/lib/usePersistentState";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import { computeRaceUnlockProgress, type RaceUnlockProgress } from "@/shared/faction-unlock-progress";
import { RACE_UNLOCK_SOURCE, wikiLinksIn, type RaceUnlockMethod, type RaceUnlockRequirement } from "@/shared/race-unlocks";
import type { FactionStanding } from "@/shared/types";
import AskValue from "./AskValue";
import ItemLink from "./ItemLink";

/** Bounds a stated faction total is clamped to — generous enough for any real EQ faction range,
 *  which never approaches this on either side; just enough to catch a typo. */
const FACTION_CORRECTION_BOUNDS = 20_000;

/**
 * Which factions each race's unlock needs maxed, joined against what the ledger has actually seen —
 * Alanna's Race Unlock Guide ([ADR 0222](../../../specs/decisions/0222-a-race-unlock-guide-is-generated-static-data.md)),
 * folded onto the Faction tab's own Standings rather than left as a separate lookup.
 *
 * **Useful with zero hits recorded, unlike the other two views.** `RACE_UNLOCKS` is static reference
 * data, so this reads fine on a fresh install (every faction shows 0 of 2000) — it's the reason
 * `FactionPanel` doesn't gate this view behind "any hits yet" the way Hits/Standings are.
 *
 * **Every number here is a floor, not a total.** `f.net` is only what this app has watched change —
 * see `faction-unlock-progress.ts`'s header — so a bar reading 40% never means "60% left to actually
 * do"; it means "40% of the target has been *observed* moving since tracking started". The bar and
 * the raw `net / target` beside it both say the same thing on purpose, so neither reads as more exact
 * than the other.
 *
 * **The `net / target` figure is also the fix for that gap — click it to state the real total.**
 * `f.net` already includes any correction the player has stated (`faction.setCorrection`,
 * `src/shared/faction-correction.ts`), so a character who had standing before this app ever watched
 * isn't stuck reading a permanently-low bar. `AskValue` is the same ask-once, self-correcting control
 * `xp`/`hp` use ([ADR 0017](../../../specs/decisions/0017-camp-efficiency-and-asking-the-player.md)),
 * except a faction has no "level up" to reset it at — so it's offered every time, not just once.
 *
 * The 🔔 toggle is a per-race opt-in for `RaceUnlockAlerts`, persisted the same way a spawn timer's
 * `notify` is — silent until asked, and it only ever reports a faction moving, never a threshold
 * crossed (same caveat).
 */
export default function RaceUnlocksView({ standings }: { standings: FactionStanding[] }) {
  const [watchedRaces, setWatchedRaces] = usePersistentState<string[]>(STORAGE_KEYS.watchedRaceUnlocks, []);
  const progress = useMemo(() => computeRaceUnlockProgress(standings), [standings]);
  const watched = useMemo(() => new Set(watchedRaces), [watchedRaces]);

  function toggleWatch(race: string) {
    setWatchedRaces((prev) => (prev.includes(race) ? prev.filter((r) => r !== race) : [...prev, race]));
  }

  return (
    <div className="ru-list">
      <div className="row wrap ru-sources muted small">
        <span>
          Source: <ItemLink title={RACE_UNLOCK_SOURCE.title} label="Alanna's Race Unlock Guide" /> on eqlwiki
        </span>
        <span className="spacer" />
        {/* External, not an in-app wiki page — its own IPC handler opens exactly this one URL
            (`electron/ipc.ts`, `CH.raceUnlocksOpenCheatSheet`), the same "↗" pattern every other
            external reference in the app uses (`wiki.openInBrowser`, `lucy.openInBrowser`). Used to
            verify the scraper's own reading of the wiki page — not itself scraped. */}
        <button
          className="btn ghost sm"
          title="Open the community cheat-sheet summary on necrotalk.com"
          onClick={() => void api()?.raceUnlocks.openCheatSheet()}
        >
          ↗ Cheat sheet
        </button>
      </div>
      {progress.map((p) => (
        <RaceRow key={p.race} progress={p} watching={watched.has(p.race)} onToggleWatch={() => toggleWatch(p.race)} />
      ))}
    </div>
  );
}

function RaceRow({
  progress,
  watching,
  onToggleWatch,
}: {
  progress: RaceUnlockProgress;
  watching: boolean;
  onToggleWatch: () => void;
}) {
  const { race, requirement, factions } = progress;
  return (
    <details className="ru-race">
      <summary className="ru-summary">
        {/* Stops here, the same reason `ItemLink`'s click does: the summary's whole width is already
            the details toggle, and a click meant for the star must not also collapse the row. */}
        <button
          className="btn ghost sm"
          onClick={(e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            onToggleWatch();
          }}
          title={watching ? "Alerting when a required faction moves — click to silence" : "Alert me when a required faction moves"}
          aria-pressed={watching}
        >
          {watching ? "🔔" : "🔕"}
        </button>
        <b className="ru-race-name">{race}</b>
        <span className="muted small">{requirementSummary(requirement)}</span>
      </summary>
      <div className="ru-body">
        {factions.length > 0 && (
          <div className="ru-factions">
            {factions.map((f) => (
              <div className="ru-faction" key={f.faction}>
                <span className="ru-faction-name">
                  <ItemLink title={f.faction} />
                </span>
                <div className="ru-bar" title={`${f.net} of ${f.target} observed since tracking began`}>
                  <div className="ru-fill" style={{ width: `${Math.max(0, Math.min(100, (f.net / f.target) * 100))}%` }} />
                </div>
                <span className="ru-progress">
                  <AskValue
                    prompt={`${f.net} / ${f.target}`}
                    why={`This app can only count what it has watched change since it started tracking — if you know ${f.faction}'s real current standing (a GM told you, a guildmate checked, or you tracked it before this app existed), state it here and every view of it, this bar included, updates from there.`}
                    initial={f.net}
                    min={-FACTION_CORRECTION_BOUNDS}
                    max={FACTION_CORRECTION_BOUNDS}
                    onSubmit={(value) => void api()?.faction.setCorrection(f.faction, value)}
                  />
                </span>
              </div>
            ))}
          </div>
        )}
        <MethodView method={requirement.method} />
      </div>
    </details>
  );
}

function requirementSummary(r: RaceUnlockRequirement): string {
  if (r.kind === "factions") return `${r.factions.length} faction${r.factions.length === 1 ? "" : "s"} to max`;
  if (r.kind === "prerequisite-race") return `Requires: ${r.requires.join(" or ")}`;
  return `Task: ${r.task}`;
}

/** The guide's own recommended steps, each rendered with its own quest/item/NPC names as `ItemLink`s
 *  inline (`wikiLinksIn`) rather than a separate, disconnected list — and every faction-point
 *  breakdown found underneath, grouped exactly as the guide grouped them (see the header on
 *  `race-unlocks.generated.ts` for why nothing here is merged across groups). */
function MethodView({ method }: { method: RaceUnlockMethod }) {
  if (!method.steps.length && !method.hitGroups.length) return null;
  return (
    <div className="ru-method">
      {method.steps.length > 0 && (
        <ol className="ru-steps">
          {method.steps.map((s, i) => (
            <li key={i}>
              <LinkedText text={s} />
            </li>
          ))}
        </ol>
      )}
      {method.hitGroups.map((g, i) => (
        <div className="ru-group" key={i}>
          <div className="muted small">{g.label}</div>
          <div className="ru-hits">
            {g.hits.map((h, j) => (
              <span className="ru-hit" key={j} title={h.note}>
                <ItemLink title={h.faction} />{" "}
                <span className={h.amount > 0 ? "num-accent" : "num-bad"}>{h.amount > 0 ? `+${h.amount}` : h.amount}</span>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** A guide step's raw text, with each `[[Title]]`/`[[Title|Display]]` it names rendered as a real
 *  `ItemLink` in place, so "Aid [[Feskr Drinkmaker]]" reads as prose with one clickable name in it
 *  instead of a plain sentence plus a link nobody can tell it belongs to. */
function LinkedText({ text }: { text: string }) {
  return (
    <>
      {wikiLinksIn(text).map((seg, i) =>
        seg.link ? <ItemLink key={i} title={seg.link.title} label={seg.link.display} /> : <span key={i}>{seg.text}</span>,
      )}
    </>
  );
}
