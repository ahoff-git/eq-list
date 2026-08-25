"use client";
import { placeName } from "@/shared/zones/place";
import { zoneDifficultyLabel } from "@/shared/names";
import { ZoneLink } from "./MapLink";

/**
 * ZoneTag — **where a logged thing happened**, said one way everywhere.
 *
 * Every panel that records something (drops, kills, fights, records) stores the zone the way the log
 * wrote it, difficulty and ruleset included
 * ([ADR 0083](../../../specs/decisions/0083-a-zone-name-is-stored-raw-and-grouped-on-read.md)). Printing
 * that string is what the panels which had a zone at all used to do, and it reads badly in a column:
 * `The Steamfont Mountains 2 (Adaptive)` is two facts crammed into one, the wording drifts between
 * sources, and a reader comparing two rows has to spot which part of the name is the camp.
 *
 * So it is split, and split the same way the map splits it
 * ([ADR 0134](../../../specs/decisions/0134-a-map-reference-resolves-to-a-place.md)): the **place** —
 * one name per camp, from the app's own fold — and the **difficulty** beside it as its own token. The
 * place is a `ZoneLink`, so a row that says where also *takes* you there, which is the gesture every
 * other place-name in the app already has.
 *
 * The recorded wording lives in the hover. That is deliberate rather than tidy: the fold is a claim
 * about two names meaning one camp, and the row it was made about should be able to show its working
 * ([ADR 0136](../../../specs/decisions/0136-logged-data-says-where-it-happened.md)).
 */
export default function ZoneTag({
  zone,
  link = true,
  blank = "—",
  className,
}: {
  /** The zone **as recorded** — never pre-folded, since this is what does the folding. */
  zone: string | null | undefined;
  /** Off for a row that is already inside the zone it names, where a link would only go nowhere new. */
  link?: boolean;
  /** What to show when the log had never said where you were. */
  blank?: string;
  className?: string;
}) {
  const recorded = zone?.trim();
  if (!recorded) {
    return (
      <span className={cls("zone-tag muted", className)} title="The log hadn't said which zone this was in.">
        {blank}
      </span>
    );
  }

  const place = placeName(recorded);
  const difficulty = zoneDifficultyLabel(recorded);
  // Only worth a hover when the fold actually changed something — otherwise it repeats the row.
  const title = recorded === place ? undefined : `Recorded as “${recorded}”`;

  return (
    <span className={cls("zone-tag", className)} title={title}>
      {link ? <ZoneLink zone={place}>{place}</ZoneLink> : <span className="zt-place">{place}</span>}
      {difficulty && <ZoneDifficulty label={difficulty} />}
    </span>
  );
}

/**
 * The difficulty on its own — for a row whose zone is a given (the map's kill list is one camp) but
 * whose *copy* of it is not. Nothing is drawn for an ordinary zone: a blank column would suggest a
 * missing value where there is simply nothing to say.
 */
export function ZoneDifficultyTag({ zone, className }: { zone: string | null | undefined; className?: string }) {
  const label = zone ? zoneDifficultyLabel(zone) : undefined;
  return label ? <ZoneDifficulty label={label} className={className} /> : null;
}

/** The token itself, so its wording and its hover are written once. */
function ZoneDifficulty({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cls("zt-diff", className)}
      title="How hard this copy of the zone was. The map and the camp are the same at every difficulty; the mobs are not."
    >
      {label}
    </span>
  );
}

const cls = (base: string, extra?: string): string => (extra ? `${base} ${extra}` : base);
