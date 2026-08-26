"use client";
import { api } from "@/lib/api";
import { SOLID } from "@/lib/clickThrough";
import { useBuffs, useSettings } from "@/lib/hooks";
import { alertPlacement, alertStyle, BUFF_STYLE_ID } from "@/shared/alert-styles";
import { ON_PET, ON_YOU } from "@/shared/buff-tracking";
import type { AlertPositionValue, BuffInstance } from "@/shared/types";

/**
 * The buffs you are missing, drawn over the game and **left there**.
 *
 * This is the other half of the alert, and the half that does the work. A banner answers "what just
 * happened" and then goes away — which is exactly wrong for a buff, because the useful fact isn't the
 * moment it dropped, it's that *right now* you are standing there without it. So a lapse stays on
 * screen until something ends it: you recast the spell, or you say you're not going to.
 *
 * It also covers the case a banner structurally cannot. Dying strips every buff at once, and a dozen
 * banners is not a dozen pieces of news — so the tracker records those lapses without announcing them
 * ([buff-tracking.ts](../../shared/buff-tracking.ts)). This list is where they land, which makes it
 * the answer to the question a corpse actually has: *what do I need back?*
 *
 * **Opt-in per spell** (`onScreen`), like a pinned countdown, and defaulting on — the difference from
 * a spawn timer being that everything you kill becomes a timer while only what you buff lands here, so
 * the list is short by construction rather than by filtering.
 *
 * Each row sits where its own alert would and wears its colour, for the same reason
 * [SpawnOverlay](./SpawnOverlay.tsx) does: someone who put their alerts bottom-right should find their
 * standing reminders in the corner they already look at. The style is resolved **here** rather than
 * sent resolved, because this is a live readout — restyling it should move it there and then, unlike a
 * banner, which is frozen at the moment it fired.
 */
export default function BuffOverlay() {
  const view = useBuffs();
  const ca = useSettings()?.castAlerts;
  // `onScreen` is a *spell's* choice, so the list is filtered by the catalogue rather than by the
  // instance — and a spell whose row has been unchecked is already off the board entirely.
  const wanted = new Map(view.known.map((k) => [k.key, k]));
  const showing = view.lapsed.filter((b) => wanted.get(b.key)?.onScreen !== false);
  if (!showing.length || !ca) return null;

  const looks = showing.map((buff) => ({
    buff,
    style: alertStyle(ca, { styleId: wanted.get(buff.key)?.styleId ?? BUFF_STYLE_ID }),
  }));
  // One stack per position, so buffs wearing different looks land in different corners.
  const stacks = new Map<AlertPositionValue, typeof looks>();
  for (const look of looks) stacks.set(look.style.position, [...(stacks.get(look.style.position) ?? []), look]);
  const locations = ca.locations ?? [];

  return (
    <>
      {[...stacks].map(([position, stack]) => {
        const place = alertPlacement(position, locations);
        return (
          <div className={`overlay-at buff-hud no-drag ${place.className}`} style={place.style} key={position}>
            {stack.map(({ buff, style }) => (
              <HudRow key={`${buff.key} ${buff.target}`} buff={buff} color={style.color} />
            ))}
          </div>
        );
      })}
    </>
  );
}

/**
 * One line: what is missing, and off whom.
 *
 * The target is only spelled out when it *isn't* you. A buffing class's own set is most of this list,
 * and repeating "on you" down eight rows is noise that pushes the one row about somebody else out of
 * a glance — which is the row you were least likely to notice on your own.
 *
 * The dismiss control is deliberately here as well as in the panel: standing a stale reminder down
 * shouldn't cost a trip to another window. It is the one part of a reminder that takes a click —
 * `SOLID` makes the overlay hand itself back for as long as the cursor is on the ✕ and glass again
 * the moment it leaves, so the row you are reading never comes between you and the mob behind it.
 */
function HudRow({ buff, color }: { buff: BuffInstance; color: string }) {
  const who = buff.target === ON_YOU ? "" : buff.target === ON_PET ? "pet" : buff.target;
  return (
    <div className="buff-hud-row" style={{ borderLeftColor: color }}>
      <span className="bhr-mark" aria-hidden>
        ⚠
      </span>
      <span className="bhr-name">{buff.spell}</span>
      {who && <span className="bhr-who">{who}</span>}
      <button
        {...SOLID}
        className="bhr-x"
        title="Stand this one down"
        onClick={() => void api()?.buffs.dismiss(buff.key, buff.target)}
      >
        ✕
      </button>
    </div>
  );
}
