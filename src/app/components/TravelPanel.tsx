"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import ZonePicker from "./ZonePicker";
import type { Zone } from "@/shared/map/types";
import type { TravelAnswer, TravelSettings } from "@/shared/types";
import { stepCrossing, type TravelRoute, type TravelStep } from "@/shared/travel/route";
import { CROSSING_WORDS, type TravelAt } from "@/shared/travel/types";

/**
 * "How do I get there?" — the cross-zone route panel (the 🧭 button).
 *
 * The graph is the mapmakers' own exit labels read into boundaries between zones; the answer is a
 * **list of places**, never a line drawn on a map, because a map file's geometry can't say what's
 * walkable (see specs/travel and ADR 0062). Every distance is straight-line and every one of them is
 * wrong; what they're good for is *ordering* routes, and a route says which of its numbers are
 * outright guesses rather than merely approximate.
 *
 * The toggles are settings rather than panel state, because "can I get a druid port" is a fact about
 * you and not about what you're looking at.
 */

/** The conveyances, in the order they're offered, with what saying yes to one means. */
const CONVEYANCES: {
  key: keyof TravelSettings;
  label: string;
  hint: string;
}[] = [
  {
    key: "druid",
    label: "Druid ports",
    hint: "A druid will port you — you're one, or someone will oblige. It's cast where you stand, so a ring is only ever where you arrive. Off by default: a route that assumed a port you can't get is advice you can't take.",
  },
  {
    key: "wizard",
    label: "Wizard spires",
    hint: "The same, for a wizard's spire teleport.",
  },
  {
    key: "gnome",
    label: "Translocator gnomes",
    hint: "Legends' translocator gnomes. On by default — anyone can walk up to one. Turn it off if the route is assuming one you can't use.",
  },
  {
    key: "succor",
    label: "Succor / pick",
    hint: "You can get to a zone's safe point without walking there — an evacuation spell, or a /pick into another instance, which drop you at the same spot. It changes no zone; what it saves is the walk, when that spot is nearer the way out than you are. Off by default: it needs a spell, a friend with one, or a second pick to jump to, and a map can't say whether you have any of them.",
  },
];

/** Past this a distance is shown in thousands: five digits of world units read as noise. */
const UNITS_IN_K = 1000;

/** A distance in EQ world units, as a figure a person can compare. */
function units(n: number): string {
  return n >= UNITS_IN_K ? `${(n / UNITS_IN_K).toFixed(1)}k` : `${Math.round(n)}`;
}

/** What a refusal means, in a sentence. Four situations, four different things to do about them. */
function refusalText(answer: TravelAnswer, to: string): string {
  const seen = `Read ${answer.knows.borders} border${answer.knows.borders === 1 ? "" : "s"} across ${answer.knows.zones} zone${answer.knows.zones === 1 ? "" : "s"}.`;
  switch (answer.refused) {
    case "no-graph":
      return "No travel graph — no maps were found, or none of them label their exits. Pick a map source with labelled zone lines (a pack like Brewall's labels far more than the game's own maps do).";
    case "unknown-from":
      return `Nothing here answers to that starting zone. ${seen}`;
    case "unknown-to":
      return `No map file answers to “${to}”. ${seen}`;
    case "absent":
      // The one refusal that isn't about our data being thin: the maps draw this zone, the server
      // hasn't opened it. Nothing to fix, and nothing to keep looking for.
      return `${answer.absent} isn't in the game at this time — the map packs draw it, but there's no way there.`;
    default:
      return `No way through with these options — ${to} may be one of the zones whose map labels no exits, or it needs a port you haven't turned on. ${seen}`;
  }
}

/**
 * Which zone a leg happened in, and what it did there — you walk *across* a zone, but a succor moves
 * you *within* one, which is the whole of what makes it worth a toggle.
 */
function legWhere(leg: NonNullable<TravelStep["from"]>): string | undefined {
  if (!leg.across) return undefined;
  return `${leg.mode === "succor" ? "within" : "across"} ${leg.across.name} → `;
}

/** One line of the route. A border is where you zone; a walk is the only thing that costs anything. */
function Leg({ step }: { step: TravelStep }) {
  const leg = step.from;
  // Nothing shown for an ordinary zone line, which is most of them — a badge on every step would say
  // nothing and hide the ones that matter.
  const via = stepCrossing(step);
  const where = leg && legWhere(leg);
  return (
    <li className="travel-leg">
      {leg ? (
        <span className={`travel-cost ${leg.assumed ? "guess" : ""}`} title={legTitle(leg)}>
          {units(leg.cost)}
          {leg.assumed ? "?" : ""}
        </span>
      ) : (
        <span className="travel-cost start">start</span>
      )}
      <span className="travel-where">
        {where && <span className="muted small">{where}</span>}
        {step.node.label}
        {via && (
          <span className={`travel-via ${via}`} title={`Take the ${CROSSING_WORDS[via]} — no walking`}>
            {CROSSING_WORDS[via]}
          </span>
        )}
      </span>
    </li>
  );
}

function legTitle(leg: NonNullable<TravelStep["from"]>): string {
  const where = leg.across ? ` across ${leg.across.name}` : "";
  // A succor is the one leg that leaves you in the zone you were already in, so "the ride" would be
  // the wrong word for it — what it saved you is the walk you'd otherwise have made across it.
  if (leg.mode === "succor") return "No walking — you evacuate to this spot from wherever you're standing";
  if (leg.mode !== "walk") return "No walking — this is the ride itself";
  return leg.assumed
    ? `A stand-in, not a measurement${where}: nobody drew this end of the border, so how far it is isn't known`
    : `Straight-line distance${where} — the real walk is longer, since nothing in EQ walks straight`;
}

export default function TravelPanel({
  zones,
  sourceId,
  currentZone,
  viewedZone,
  loc,
  travel,
  onTravel,
  onViewZone,
}: {
  /** The zones this map source offers — the same list the titlebar's picker uses. */
  zones: Zone[];
  sourceId: string;
  /** Where the log says you are, which is where a route starts unless you say otherwise. */
  currentZone: string | null;
  /** The zone the map is showing — the default destination, so looking somewhere asks how to get there. */
  viewedZone: string;
  /** Your last `/loc`, so the walk to the first border is measured rather than assumed free. */
  loc: TravelAt | null;
  travel: TravelSettings;
  onTravel: (patch: Partial<TravelSettings>) => void;
  /** Point the map at a zone the route passes through. */
  onViewZone: (zone: string) => void;
}) {
  const [fromPick, setFromPick] = useState<string | null>(null);
  const [toPick, setToPick] = useState<string | null>(null);
  const [answer, setAnswer] = useState<TravelAnswer | null>(null);
  const [working, setWorking] = useState(false);

  const from = fromPick ?? currentZone ?? "";
  const to = toPick ?? viewedZone;

  /**
   * The four answers, on their own. `settings` is replaced wholesale whenever *anything* in it
   * changes, so depending on `travel` directly would re-ask for the route when an unrelated setting
   * moved.
   */
  const options = useMemo(
    () => ({ druid: travel.druid, wizard: travel.wizard, gnome: travel.gnome, succor: travel.succor }),
    [travel.druid, travel.wizard, travel.gnome, travel.succor],
  );

  useEffect(() => {
    setAnswer(null);
    if (!sourceId || !from || !to) return;
    // A hand-picked origin has no position, so your `/loc` only counts when starting where you are.
    const at = fromPick ? undefined : (loc ?? undefined);
    let cancelled = false;
    setWorking(true);
    void api()
      ?.travel.route(sourceId, { zone: from, at }, to, options)
      .then((result) => {
        if (cancelled) return;
        setAnswer(result);
        setWorking(false);
      });
    return () => {
      cancelled = true;
      setWorking(false);
    };
  }, [sourceId, from, to, fromPick, loc, options]);

  const route: TravelRoute | undefined = answer?.route;
  /** The zones passed through, minus the one you start in — the trip, as a line of chips. */
  const hops = useMemo(() => route?.zones ?? [], [route]);

  return (
    <div className="travel-panel no-drag">
      {/* The asking half, outside anything that scrolls: a zone picker's dropdown is absolutely
          positioned, and an `overflow` ancestor clips one — so a scrolling wrapper would cut the list
          off at the panel's edge. It also means the controls can't scroll away from what they control. */}
      <div className="travel-ask">
        <div className="travel-ends">
          <label className="travel-end">
            <span className="muted small">From</span>
            {/* Left-anchored: this box sits at the left of the panel, so a menu wider than it has to
                grow rightwards or it runs off the window. */}
            <ZonePicker
              zones={zones}
              value={fromPick ?? ""}
              onPick={setFromPick}
              currentZone={currentZone}
              align="left"
              blankLabel={currentZone ? `Where you are · ${currentZone}` : "Where you are"}
              placeholder={currentZone ? `Where you are · ${currentZone}` : "Where you are"}
            />
          </label>
          <label className="travel-end">
            <span className="muted small">To</span>
            <ZonePicker
              zones={zones}
              value={toPick ?? ""}
              onPick={setToPick}
              align="left"
              blankLabel={viewedZone ? `The map you're viewing · ${viewedZone}` : "Pick a destination"}
              placeholder={viewedZone ? `The map you're viewing · ${viewedZone}` : "Pick a destination"}
            />
          </label>
        </div>

        <div className="travel-options">
          {CONVEYANCES.map(({ key, label, hint }) => (
            <label key={key} className="travel-opt" title={hint}>
              <input type="checkbox" checked={travel[key]} onChange={(e) => onTravel({ [key]: e.target.checked })} />
              {label}
            </label>
          ))}
          {/* Said once, here, because it's the question the missing "Boats" checkbox raises. */}
          <span
            className="muted small"
            title="A boat costs no walking and asks nothing of you but turning up at the dock, so it's a border like any other — there's nothing to switch off."
          >
            Boats always count
          </span>
        </div>
      </div>

      <div className="travel-answer">
        {working && <p className="muted small">Working out the route…</p>}

        {!working && !from && (
          <p className="muted small">
            Nowhere to start from — the log hasn’t said which zone you’re in yet, so pick one.
          </p>
        )}

        {!working && answer?.refused && <p className="muted small">{refusalText(answer, to)}</p>}

        {route && (
          <>
            <div className="travel-summary">
              <strong>{units(route.cost)}</strong>
              <span
                className="muted small"
                title="Straight-line EQ world units of walking. Zone lines and boats are free; a port replaces the walking with none."
              >
                units of walking{route.assumed ? ", partly guessed" : ""}
              </span>
              {route.modes.length > 0 && (
                <span className="travel-modes" title="Conveyances this route uses">
                  {route.modes.join(" · ")}
                </span>
              )}
            </div>

            {/* The route as you'd say it out loud. Each zone opens its map, so a route is also a tour. */}
            <div className="travel-hops">
              {hops.map((z, i) => (
                <span key={`${z.zone}-${i}`}>
                  {i > 0 && <span className="muted"> → </span>}
                  <button className="btn ghost sm" title={`Show the ${z.name} map`} onClick={() => onViewZone(z.name)}>
                    {z.name}
                  </button>
                </span>
              ))}
            </div>

            <ol className="travel-legs">
              {route.steps.map((step, i) => (
                <Leg key={`${step.node.id}-${i}`} step={step} />
              ))}
            </ol>

            {route.assumed && (
              <p className="muted small">
                A <span className="travel-cost guess">?</span> is a stand-in rather than a measurement — a border only
                one mapmaker drew, or an end whose position nobody gave. Every other figure is a straight line, so the
                real walk is longer.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
