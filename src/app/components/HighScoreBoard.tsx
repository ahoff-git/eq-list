"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRead, useSettings, useWatcherStatus } from "@/lib/hooks";
import { SCORE_CATEGORIES, SCORE_GROUPS, categoryOf, formatScore, marginOf } from "@/shared/high-scores";
import { figure, when } from "@/shared/format";
import { CheckField, Empty, PickField, StatTile } from "./ui";
import type { HighScore, ScoreBoard } from "@/shared/types";

/** A stable empty board, so a render that hasn't heard back yet doesn't look like a change. */
const NO_BOARD: ScoreBoard = { character: "", scores: [], streak: 0, seeded: false };

/**
 * The scoreboard: your character's personal bests, grouped, newest-beaten flagged.
 *
 * It reads like a trophy cabinet rather than a table because that's what it's for — the number leads
 * each row and the category labels it, the same way round as the banner that announces one
 * ([recordBanner](./CastAlerts.tsx)). Where a panel in this app normally justifies a figure by saying
 * how it was derived, this one justifies it by saying **when and against what**, since that's the
 * whole content of a record: a good number is a story about one evening.
 *
 * Only categories with a record standing get a row. A board full of blanks would read as broken, and
 * the *families* — a row per melee skill, a row per hit qualifier the log tags — mean the list of
 * possible rows isn't knowable in advance anyway (see `src/shared/high-scores.ts`). What is worth
 * saying out loud is which categories can only ever be filled **from here on**, because those are the
 * ones a seeded board legitimately has nothing in.
 */
export default function HighScoreBoard() {
  const settings = useSettings();
  const status = useWatcherStatus();
  // Re-read on each record so an open board updates itself as you play, rather than going stale
  // behind a banner that just told you it changed.
  const [beaten, setBeaten] = useState(0);
  const [latest, setLatest] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  // The watcher's file is in the deps because it names the character, and the board is per character:
  // switching logs switches boards, with no record event to say so.
  const board = useRead((a) => a.records.board(), NO_BOARD, [beaten, status.file]);

  async function reset(): Promise<void> {
    await api()?.records.clear();
    setAsking(false);
    setLatest(null);
    // Re-read rather than trusting the returned board, as `DamageHistory` does: main owns it, and one
    // path to it is enough.
    setBeaten((n) => n + 1);
  }

  useEffect(() => {
    const a = api();
    if (!a) return;
    const off = a.records.onRecord((record) => {
      setBeaten((n) => n + 1);
      setLatest(record.categoryId); // so the row that just changed can say so
    });
    // Eating a log files whole evenings at once, and it happens on another tab — those fights reach
    // the board too (see the import handler in `ipc.ts`), so this is a bulk change like any other.
    const offData = a.app.onDataChanged(() => setBeaten((n) => n + 1));
    return () => {
      off();
      offData();
    };
  }, []);

  const hs = settings?.highScores;
  const alertsOff = !settings?.castAlerts.enabled;
  const styles = settings?.castAlerts.styles ?? [];
  const patch = (over: Partial<NonNullable<typeof hs>>) => api()?.settings.update({ highScores: over });

  // Grouped up front, so the JSX below is a list of sections rather than a filter per section.
  const sections = SCORE_GROUPS.map((group) => ({
    ...group,
    scores: board.scores.filter((s) => categoryOf(s.categoryId).group === group.key),
  })).filter((s) => s.scores.length);

  const held = board.scores.length;
  // What a seeded board can't have filled in, so an absence reads as honest rather than as a fault.
  const pending = liveOnlyMissing(board);

  return (
    <div className="scores">
      <div className="row wrap" style={{ marginBottom: 10 }}>
        <span className="muted small">
          {board.character ? `${board.character}’s records` : "Records for this character"}
          {board.seeded ? " · seeded from your recorded fights" : ""}
        </span>
        <span className="spacer" />
        <button
          className="btn ghost sm"
          title="Show a sample celebration on the overlay, wearing the look records use"
          onClick={() => void api()?.records.test()}
        >
          🔔 Test
        </button>
        {/* Asked in the panel rather than with a `confirm()`, like every other destructive action here
            (`ForgetData` in SettingsPanel): this window is frameless and always-on-top, and a native
            modal over the game is worse than the thing it's guarding. */}
        {asking ? (
          <>
            <span className="sc-warn small">Forget all {held}?</span>
            <button className="btn sm" onClick={() => void reset()}>
              Yes, forget them
            </button>
            <button className="btn ghost sm" onClick={() => setAsking(false)}>
              Keep them
            </button>
          </>
        ) : (
          <button
            className="btn ghost sm"
            title="Forget this character's records. Other characters' boards are kept."
            disabled={!held}
            onClick={() => setAsking(true)}
          >
            Reset
          </button>
        )}
      </div>

      <div className="stat-row">
        <StatTile label="Records held" value={figure(held)} hint="Categories with a personal best standing" />
        <StatTile
          label="Kill streak"
          value={figure(board.streak)}
          hint="Kills since your last death — the live figure the streak record is taken from"
        />
        <StatTile
          label="Times beaten"
          value={figure(board.scores.reduce((n, s) => n + s.beaten, 0))}
          hint="How many times a record has changed hands on this board"
        />
      </div>

      {/* The celebration, configured where you look at the thing it celebrates. It wears a **saved
          style** or the alert defaults, and is edited in the Alerts tab — one style editor, in one
          place (ADR 0086 / 0090). */}
      <div className="row wrap sc-celebrate">
        <CheckField
          label="Celebrate a new high score with an alert"
          checked={!!hs?.celebrate}
          onChange={(celebrate) => patch({ celebrate })}
        />
        <PickField
          value={hs?.styleId ?? ""}
          blank="Alert defaults"
          options={styles.map((s) => ({ value: s.id, label: s.name }))}
          onChange={(styleId) => patch({ styleId: styleId || undefined })}
          title="Which look a celebration wears — a saved style from the Alerts tab, where every look is edited"
        />
      </div>
      {hs?.celebrate && alertsOff && (
        <p className="sc-warn small">
          Alerts are switched off, so nothing will show — the banner rides the same overlay a cast alert
          does. Turn them on in the <b>Alerts</b> tab.
        </p>
      )}

      {!held ? (
        <Empty
          title="No records yet."
          hint="Go and hit something. Your first score in a category sets the bar silently — there's nothing to beat yet — and everything after it is a record worth shouting about."
        />
      ) : (
        sections.map((section) => (
          <div key={section.key}>
            <p className="section-head" title={section.blurb}>
              {section.title}
            </p>
            <div className="sc-rows">
              {section.scores.map((score) => (
                <ScoreRow key={score.categoryId} score={score} fresh={score.categoryId === latest} />
              ))}
            </div>
          </div>
        ))
      )}

      {pending.length > 0 && (
        <p className="muted small sc-pending">
          Not set yet, and only a live line can set them — a recorded fight keeps a <i>count</i> of
          criticals and ticks, never the biggest one: {pending.join(" · ")}.
        </p>
      )}
    </div>
  );
}

/**
 * One record. The figure leads; everything else is the story behind it, and it's all in one row
 * because a cabinet you have to open a drawer in isn't one you glance at.
 */
function ScoreRow({ score, fresh }: { score: HighScore; fresh: boolean }) {
  const category = categoryOf(score.categoryId);
  const margin = marginOf(score);
  return (
    <div className={`sc-row ${fresh ? "fresh" : ""}`} title={category.blurb}>
      <span className="sc-value">{formatScore(category.unit, score.value)}</span>
      <span className="sc-label">{category.label}</span>
      <span className="sc-detail">{score.detail ?? ""}</span>
      {/* Taken off a fight whose combatants weren't all placed, so the figure could move either way
          once the log says who somebody was (ADR 0130). Said rather than presented as settled. */}
      {score.unsettled && (
        <span
          className="muted small"
          title="Provisional: the fight this came from had somebody the log never placed — your pet, a group-mate, or a stranger — so this figure may move. Digesting the log again applies whatever the log has since settled."
        >
          ?
        </span>
      )}
      <span className="spacer" />
      {/* A bar nobody has cleared is different from one beaten four times, and the difference is the
          only thing on this row that says whether the number is actually hard to beat. */}
      {margin !== undefined ? (
        <span className="sc-margin" title={`Previous best ${formatScore(category.unit, score.previous ?? 0)} · beaten ${score.beaten}×`}>
          +{formatScore(category.unit, margin)}
        </span>
      ) : (
        <span className="sc-margin first" title="The first score in this category — it set the bar rather than clearing one">
          set the bar
        </span>
      )}
      <span className="sc-when" title={score.zone ? `In ${score.zone}` : undefined}>
        {when(score.at)}
        {score.zone ? ` · ${score.zone}` : ""}
      </span>
    </div>
  );
}

/**
 * The live-only categories with nothing in them yet, named so an empty row is explicable.
 *
 * Only on a **seeded** board: before seeding, everything is empty for the ordinary reason and
 * singling three of them out would imply the rest are somehow further along.
 */
function liveOnlyMissing(board: ScoreBoard): string[] {
  if (!board.seeded) return [];
  const held = new Set(board.scores.map((s) => s.categoryId));
  // Read from the catalog rather than listed here: which categories a stored fight can't fill is a
  // property of the category, and the list has already changed once — `biggest-tick` became
  // seedable when its cell stopped being a DoT the parser couldn't read (ADR 0095).
  //
  // Only the fixed ones, since a family category that has never fired has no id to look for, and
  // "you have never landed a Crippling Blow" isn't a gap in the board.
  return SCORE_CATEGORIES.filter((c) => c.liveOnly && !held.has(c.id)).map((c) => c.label);
}
