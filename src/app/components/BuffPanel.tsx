"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useBuffs, useSettings } from "@/lib/hooks";
import { heldMs, targetLabel, ON_PET, ON_UNKNOWN, ON_YOU } from "@/shared/buff-tracking";
import { formatDuration } from "@/shared/duration";
import { when } from "@/shared/format";
import { Empty } from "./ui";
import AlertStyleField, { AlertStyleDrawer } from "./AlertStyleField";
import { BUFF_STYLE_ID } from "@/shared/alert-styles";
import type { BuffInstance, KnownBuff } from "@/shared/types";

/**
 * Buffs — what you're keeping up, what has dropped off, and which ones you want to hear about.
 *
 * **Three lists, because they answer three different questions**, the same way the Timers tab's do.
 * *Not active* is read the moment something goes wrong and is the reason the tab exists. *Up now* is
 * read to check, and is the reassuring half. *Spells* is read once, while deciding what the app should
 * bother you about — so it holds the checkboxes and nothing urgent.
 *
 * **Nothing here is configured before it works.** A spell enrols itself the first time the log shows
 * you casting it, being given it, or losing it, and arrives switched on — which is the opposite of a
 * spawn timer's `notify` and deliberately so
 * ([buff-tracking.ts](../../shared/buff-tracking.ts) says why: everything you *kill* becomes a timer,
 * while only things you actually buff become rows here).
 *
 * **The two controls are different promises**, and the tab has to make that legible or one of them
 * looks redundant. Unchecking **Track** is the durable "never mention this again" and *keeps the
 * row*, because the control that reverses a decision has to stay findable — the mistake
 * [ADR 0092](../../../specs/decisions/0092-a-named-s-respawn-is-learned-from-your-own-kills.md) had
 * to correct for dismissed mobs. **✕** forgets the row outright, and it comes back if you cast the
 * spell again. So: uncheck to silence, clear to tidy.
 *
 * **A row admits what it doesn't know.** Two things are genuinely uncertain and both are said out
 * loud rather than smoothed over. A fade sentence shared by several spells shows every candidate,
 * because a reminder to recast the wrong rank is worse than one that tells you what to check. And a
 * buff whose target we never learned reads *someone* rather than guessing at you — a cast line names
 * no target, and inventing one would put the wrong name on the next alert.
 *
 * **Two kinds of row, behaving oppositely.** A debuff on something you were fighting is urgent and
 * short-lived: it is announced the instant it drops, and it clears itself when the fight ends because
 * a reminder to re-root a corpse is what filled this list forever. Your own buffs are the reverse —
 * their banner waits for the fight to end, since nobody stops swinging to rebuff, and their row stays
 * until the buff is back. Both are labelled, because a row that vanishes on its own and a row that
 * waits are two different promises and the tab has to make which is which legible.
 *
 * What the tab deliberately does **not** show is a countdown. The game's own file states a duration
 * *formula*, not a duration, and applying one needs a caster level EQL's log will not give us (its
 * levels are per class and the level line names none). A clock we can't stand behind would make every
 * other figure here look like a guess too, so the board reports what the log said and nothing more.
 */
export default function BuffPanel() {
  const view = useBuffs();
  const alerts = useSettings()?.castAlerts;
  const now = Date.parse(view.now) || Date.now();

  const bare = !view.known.length && !view.active.length && !view.lapsed.length;
  // Both the banner and the on-screen list ride the alert overlay window, which only exists while
  // alerts are on — so tracking can be working perfectly and produce nothing over the game. Saying
  // so is the same courtesy the scoreboard's celebration pays (ADR 0120's note on `HighScoreSettings`):
  // a feature that is silent for a reason it won't state is indistinguishable from a broken one.
  const silenced = alerts?.enabled === false;

  return (
    <div className="buffs">
      {/* Said once, at the top: "why is this empty" and "what do I have to set up" are the two
          questions a fresh install asks, and the answer to the second is *nothing*. */}
      <p className="buff-how small">
        Buffs are tracked <b>automatically</b>: cast one, or have one cast on you, and it appears here
        until it wears off or you die. Uncheck one to stop being told about it — the row stays, so you
        can turn it back on. Your own buffs are announced <b>between fights</b>, since nobody stops
        swinging to rebuff; a <b>debuff</b> on something you&rsquo;re fighting is announced at once and
        clears when the fight ends.
      </p>

      {silenced && (
        <p className="buff-how small muted">
          Alerts are switched <b>off</b>, so nothing here reaches the screen over the game — no banner
          when a buff drops, and no standing list. This tab still tracks everything. Turn alerts on in
          the <b>Alerts</b> tab to get both.
        </p>
      )}

      {!view.lexicon && (
        // Not an error, and worded so it doesn't read as one. Without the string file a fade *on you*
        // names no spell at all, so a large part of the feature is quietly missing — and a panel that
        // is quiet for a reason it won't state looks broken (ADR 0052 keeps the fault in the log; this
        // is the *consequence*, which the player does need).
        <p className="buff-how small muted">
          Your EverQuest install wasn&rsquo;t found, so buffs wearing off <b>you</b> can&rsquo;t be
          named — the game words those per spell (&ldquo;the thorns fall away&rdquo;) and the spell
          list that decodes them ships with the game. Buffs on other people and on your pet still
          work: the log names those outright. Point Settings at your Logs folder to get the rest.
        </p>
      )}

      {bare && (
        <Empty
          title="No buffs seen yet"
          hint="Cast a buff, or have one cast on you. Nothing to set up — the log does the rest."
        />
      )}

      {view.lapsed.length > 0 && (
        <section className="buff-lapsed">
          <h2>
            Not active
            {/* One button for the common gesture: you re-buffed the group and want the board clear,
                rather than dismissing six rows one at a time. */}
            <button
              className="btn ghost sm"
              title="Clear every one of these — you've re-buffed, or you don't intend to"
              onClick={() => void api()?.buffs.dismissAll()}
            >
              Clear all
            </button>
          </h2>
          {view.lapsed.map((buff) => (
            <LapsedRow key={`${buff.key} ${buff.target}`} buff={buff} now={now} />
          ))}
        </section>
      )}

      {view.active.length > 0 && (
        <section className="buff-active">
          <h2>Up now</h2>
          {view.active.map((buff) => (
            <ActiveRow key={`${buff.key} ${buff.target}`} buff={buff} now={now} />
          ))}
        </section>
      )}

      {view.known.length > 0 && (
        <section className="buff-known">
          <h2>Spells</h2>
          {view.known.map((known) => (
            <KnownRow key={known.key} known={known} />
          ))}
        </section>
      )}
    </div>
  );
}

/**
 * One buff that is missing.
 *
 * The row *is* the persistent message — the same sentence the banner said, still on screen, because a
 * banner answers "what just happened" and this answers "what is wrong right now". Dismissing is
 * offered beside recasting because the honest third option is "I know, and I'm not going to": a
 * standing warning you can't stand down is one you start ignoring, which costs you the next real one.
 */
function LapsedRow({ buff, now }: { buff: BuffInstance; now: number }) {
  return (
    <div className={`buff-row lapsed ${buff.reason === "died" ? "died" : ""}`}>
      <span className="buff-mark" aria-hidden>
        ⚠
      </span>
      <span className="buff-name">
        {buff.spell}
        {buff.permanent && (
          // Worth saying here rather than only on the settings row: a permanent buff that has gone is
          // never a timer running out, so "it was dispelled, or you died" is the whole meaning of the
          // row and changes what you do about it.
          <em className="buff-tag" title="This one never expires on a timer — so it was dispelled, lost on death, or you zoned">
            permanent
          </em>
        )}
      </span>
      <span className="buff-target">{targetSentence(buff)}</span>
      <span className="buff-note muted small">
        {buff.reason === "died" ? "you died" : `held ${formatDuration(Math.round(heldMs(buff, now) / 1000))}`}
        {" · "}
        {when(buff.at)}
        {/* Said on the row because it changes how long the row will be there: an enemy row goes by
            itself when the fight ends, so it is not something to go and dismiss. */}
        {buff.onEnemy && <em title="On something you were fighting — this clears itself when the fight ends"> · until the fight ends</em>}
      </span>
      {buff.alsoCouldBe?.length ? (
        // The shared-sentence case, named rather than hidden. 358 obtainable fade sentences belong to
        // more than one spell, so this is a routine state and not an edge — and the player can tell
        // which of two ranks they had up far more easily than we can.
        <span className="buff-maybe small" title="The game words these spells' fades identically, so we can't tell which one ended">
          or {buff.alsoCouldBe.join(" / ")}
        </span>
      ) : null}
      <button
        className="btn ghost sm"
        title="Stand this one down — it stays tracked, so you'll be told next time"
        onClick={() => void api()?.buffs.dismiss(buff.key, buff.target)}
      >
        Dismiss
      </button>
    </div>
  );
}

/** One buff that is up. Quiet by design: it is here to be scanned, not read. */
function ActiveRow({ buff, now }: { buff: BuffInstance; now: number }) {
  return (
    <div className="buff-row active">
      <span className="buff-mark" aria-hidden>
        ●
      </span>
      <span className="buff-name">{buff.spell}</span>
      <span className="buff-target">{targetSentence(buff)}</span>
      <span className="buff-note muted small">
        {/* How long, not how long *left*: the log knows when it went up and nothing honest knows when
            it will end. Stating the first is useful and stating the second would be a guess. */}
        up {formatDuration(Math.round(heldMs(buff, now) / 1000))}
        {buff.source === "cast" && (
          <em title="Seen as you cast it. The game printed no landing line for this spell, so we don't know who got it">
            {" "}
            · from your cast
          </em>
        )}
      </span>
    </div>
  );
}

/** One spell's standing choices — the settings half, read once rather than watched. */
function KnownRow({ known }: { known: KnownBuff }) {
  // Which look its banner wears is a *standing* choice like the two checkboxes beside it, so the
  // editor opens under the row rather than sending the player to another tab to make it.
  const [styling, setStyling] = useState(false);
  return (
    <div className={`buff-known-row ${known.tracked ? "" : "untracked"}`}>
      <label className="buff-check" title="Watch this spell at all. Off means it is never mentioned again — and the row stays, so you can change your mind">
        <input
          type="checkbox"
          checked={known.tracked}
          onChange={(e) => void api()?.buffs.track(known.key, e.target.checked)}
        />
        <b className="buff-name">{known.spell}</b>
      </label>
      <span className="buff-known-facts muted small">
        {known.detrimental && (
          // A Root row in a tab called Buffs needs explaining, and the label is also the explanation
          // for why it behaves differently from everything around it.
          <em className="buff-tag" title="Something you cast at things. Its reminder is immediate, and it clears when the fight ends">
            debuff
          </em>
        )}
        {known.permanent && (
          <em className="buff-tag" title="The game's own spell file says this one has no duration — it only ends if it's dispelled or you die">
            permanent
          </em>
        )}
        {known.mine ? "yours" : "cast on you"}
        {known.rises ? ` · seen up ${known.rises}×` : ""}
        {known.lastLapse ? ` · last dropped ${when(known.lastLapse)}` : ""}
      </span>
      {/* Both only matter while the spell is tracked, so they go with it rather than sitting greyed
          out beside an unchecked row — the same rule the spawn board's style picker follows. */}
      {known.tracked && (
        <span className="buff-actions">
          <label
            className="buff-check"
            title={
              known.detrimental
                ? "Raise a banner the moment it drops — immediately, since a debuff has to go back on now"
                : "Raise a banner when it drops. Held until the fight ends, because nobody stops fighting to rebuff"
            }
          >
            <input
              type="checkbox"
              checked={known.notify}
              onChange={(e) => void api()?.buffs.notify(known.key, e.target.checked)}
            />
            Notify
          </label>
          <label className="buff-check" title="Keep it in the on-screen list over the game until it's back up">
            <input
              type="checkbox"
              checked={known.onScreen}
              onChange={(e) => void api()?.buffs.showOnScreen(known.key, e.target.checked)}
            />
            On screen
          </label>
          {known.notify && (
            <AlertStyleField
              styleId={known.styleId}
              fallback={BUFF_STYLE_ID}
              blank="Buff lapsed (default)"
              onPick={(styleId) => void api()?.buffs.style(known.key, styleId)}
              title="Which look its banner wears — 🎨 edits that look here"
              open={styling}
              onOpen={() => setStyling((v) => !v)}
            />
          )}
        </span>
      )}
      <button
        className="btn ghost sm buff-forget"
        title="Forget this spell. It comes back if you cast it again — to silence it for good, untick it instead"
        onClick={() => void api()?.buffs.forget(known.key)}
      >
        ✕
      </button>
      {styling && <AlertStyleDrawer styleId={known.styleId} fallback={BUFF_STYLE_ID} forkable />}
    </div>
  );
}

/**
 * Who a buff is on, as a row says it.
 *
 * `ON_UNKNOWN` reads *someone* rather than being left blank, because a blank column looks like a bug
 * and this is a known limit with a known cause — the spell printed no landing line, so nothing named
 * a target.
 */
function targetSentence(buff: BuffInstance): string {
  if (buff.target === ON_YOU) return "on you";
  if (buff.target === ON_PET) return "on your pet";
  if (buff.target === ON_UNKNOWN) return "on someone";
  return `on ${targetLabel(buff.target)}`;
}
