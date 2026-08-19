"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import ZonePicker from "./ZonePicker";
import { CheckField } from "./ui";
import { count } from "@/shared/format";
import type { Zone } from "@/shared/map/types";
import type { TravelAnswer, TravelSettings } from "@/shared/types";
import {
  isRouteEnd,
  routeInstructions,
  type TravelInstruction,
  type TravelRoute,
  type TravelStep,
} from "@/shared/travel/route";
import { isCast, type TravelAt, type TravelAvoided, type TravelToggle } from "@/shared/travel/types";

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
 *
 * **A toggle is too blunt for a port**, though, which is what the ✕ on each step is for: a ring or a
 * spire is a *spell*, and the spell that reaches it has a level, so "I can get a druid port" is not
 * "I can get every druid port". Ruling out the one place gives back the next best route and keeps the
 * rest of the network; putting it back is the same button in the *Not using* strip above, which never
 * scrolls, so nothing you switched off can go quiet
 * (see specs/travel and ADR 0109).
 */

/** The conveyances, in the order they're offered, with what saying yes to one means. */
const CONVEYANCES: {
  /** A toggle, never `avoid` — "can I do this at all" is a checkbox, "not that one" is a chip. */
  key: TravelToggle;
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

/**
 * What a refusal means, in a sentence. Four situations, four different things to do about them —
 * plus the fifth thing that can be true of any of them: **you ruled somewhere out yourself.**
 *
 * That last one is the only cause of a refusal the user can fix in one click, so it's said last and
 * said plainly. It rides along rather than being its own refusal because it isn't one: the graph
 * answered exactly the question asked, and the question had a condition on it.
 */
function refusalText(answer: TravelAnswer, to: string, avoided: number): string {
  const seen = `Read ${count(answer.knows.borders, "border")} across ${count(answer.knows.zones, "zone")}.`;
  const ruledOut = avoided ? ` You've ruled out ${count(avoided, "place")} — “Allow all” puts them back.` : "";
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
      return `No way through with these options — ${to} may be one of the zones whose map labels no exits, or it needs a port you haven't turned on. ${seen}${ruledOut}`;
  }
}

/**
 * The step, as it reads once it's out of every route — because that's the only place it can be read.
 *
 * The graph lives in the main process and only a route's steps ever cross to here, so a place ruled
 * out has to carry its own words with it or become an id nobody can identify and nobody dares clear.
 * A **border** names both its zones already (`A ↔ B`); a **place** names none of them, so the route's
 * own zone list supplies the one it's in.
 */
function avoidedFrom(step: TravelStep, names: Map<string, string>): TravelAvoided {
  const { id, kind, label, zones } = step.node;
  const zone = kind === "boundary" ? undefined : zones.map((z) => names.get(z) ?? z)[0];
  return { id, label, ...(zone ? { zone } : {}) };
}

/** Why you'd rule this step out. A port is the case that asked for the button, so it says so. */
function avoidTitle(step: TravelStep): string {
  const port = !!step.from && isCast(step.from.mode);
  const why = port ? "Haven’t got this port? " : "";
  return `${why}Leave ${step.node.label} out and take the next best route`;
}

/**
 * One line of the route: **✕ · distance · what you do · where it puts you**.
 *
 * Fixed columns rather than a sentence, because a route is scanned down, not read across — the question
 * at any moment is "what do I do next", and the answer should be in the same place on every row.
 * Crossing a zone line is still no row of its own: a border is somewhere you arrive.
 *
 * The ✕ leads. It sat at the far right at first, which put the one control on the row as far from the
 * thing it acts on as the layout allowed, and left it hanging off the ragged end of labels of every
 * length. Its **slot is always drawn**, empty on the rows that have nothing to rule out, so the
 * distances underneath each other stay a column.
 */
function Leg({
  row,
  onAvoid,
  onHover,
  onViewZone,
}: {
  row: TravelInstruction;
  onAvoid?: () => void;
  onHover?: (on: boolean) => void;
  /** Open the map of the zone this row leaves you in — the same thing the breadcrumbs do. */
  onViewZone?: (zone: string) => void;
}) {
  const { step, how, via, where, zone, cost, assumed } = row;
  const leg = step.from;
  return (
    <li className="travel-leg" onMouseEnter={() => onHover?.(true)} onMouseLeave={() => onHover?.(false)}>
      {onAvoid ? (
        <button
          className="btn ghost sm travel-drop"
          title={avoidTitle(step)}
          aria-label={`Route around ${step.node.label}`}
          onClick={onAvoid}
        >
          ✕
        </button>
      ) : (
        <span className="travel-drop empty" aria-hidden />
      )}
      {leg ? (
        // The row's own figure, not the step's: a border the route only walked past is no instruction,
        // and its distance was carried onto this one.
        <span className={`travel-cost ${assumed ? "guess" : ""}`} title={legTitle(leg)}>
          {units(cost)}
          {assumed ? "?" : ""}
        </span>
      ) : (
        <span className="travel-cost start">start</span>
      )}
      <span className={`travel-how ${via ?? "walk"}`}>{how}</span>
      <span className="travel-where">
        {how && <span className="muted">to </span>}
        {/* The whole cell opens that zone's map, like a breadcrumb — a route reads as a tour, and the
            place you're being sent to is the thing you want to look at. */}
        {zone && onViewZone ? (
          <button className="btn ghost sm travel-to" title={`Show the ${zone.name} map`} onClick={() => onViewZone(zone.name)}>
            {where}
          </button>
        ) : (
          where
        )}
      </span>
    </li>
  );
}

/**
 * What you've ruled out, and the way back in.
 *
 * It lives in the **asking** half, which never scrolls, because a route computed around a place you
 * forgot you'd excluded is a wrong answer that reads like a right one — the same objection the whole
 * of this panel is built on. Each chip is its own undo, so "include" and "exclude" are one button in
 * two places rather than two mechanisms.
 */
function Avoided({
  avoided,
  onAllow,
  onAllowAll,
}: {
  avoided: TravelAvoided[];
  onAllow: (id: string) => void;
  onAllowAll: () => void;
}) {
  if (!avoided.length) return null;
  return (
    <div className="travel-avoided">
      <span
        className="muted small"
        title="Places this route may not use — a port you haven't got the spell for, a crossing you'd rather not make. Click one to put it back."
      >
        Not using
      </span>
      {avoided.map((place) => (
        <button
          key={place.id}
          className="btn ghost sm travel-back"
          title={`Put ${place.label} back — routes may use it again`}
          onClick={() => onAllow(place.id)}
        >
          <span aria-hidden>↺</span> {place.label}
          {place.zone && <span className="muted"> · {place.zone}</span>}
        </button>
      ))}
      <button className="btn ghost sm" title="Put every one of them back" onClick={onAllowAll}>
        Allow all
      </button>
    </div>
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
  onHoverLeg,
  onRouteLegs,
  audit,
  onAudit,
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
  /**
   * The leg under the pointer, for the map to pick out. `null` when the pointer has left the list.
   */
  onHoverLeg?: (leg: { from: string; to: string } | null) => void;
  /**
   * Every leg of the current route, so the map can draw the whole trip quietly rather than only the
   * step you happen to be pointing at — the route should be visible without hunting for it.
   */
  onRouteLegs?: (legs: { from: string; to: string }[]) => void;
  /**
   * Whether the survey strip is up — what the graph holds about the zone on screen, and where it is
   * thin. Off by default: the markers on the map are the useful half and cost nothing to read, while
   * the strip answers *should I believe this?*, which is asked now and then rather than every trip.
   */
  audit?: boolean;
  onAudit?: (open: boolean) => void;
}) {
  const [fromPick, setFromPick] = useState<string | null>(null);
  const [toPick, setToPick] = useState<string | null>(null);
  const [answer, setAnswer] = useState<TravelAnswer | null>(null);
  const [working, setWorking] = useState(false);

  const from = fromPick ?? currentZone ?? "";
  const to = toPick ?? viewedZone;

  const avoided = useMemo(() => travel.avoid ?? [], [travel.avoid]);
  /**
   * The exclusions as one string, which is what the route actually depends on.
   *
   * `settings` is replaced wholesale whenever *anything* in it changes, so the array is a fresh
   * reference every time — depending on it would re-ask for the route each time an unrelated setting
   * moved. Sorted, so putting a place back and taking it out again isn't a change either.
   */
  const avoidKey = useMemo(() => JSON.stringify(avoided.map((a) => a.id).sort()), [avoided]);

  /**
   * What the route is asked to assume, on its own — the four toggles, and the places ruled out. Same
   * reason as `avoidKey`: this is the whole of what a route depends on, and nothing else in settings.
   */
  const options = useMemo(
    () => ({
      druid: travel.druid,
      wizard: travel.wizard,
      gnome: travel.gnome,
      succor: travel.succor,
      avoid: JSON.parse(avoidKey) as string[],
    }),
    [travel.druid, travel.wizard, travel.gnome, travel.succor, avoidKey],
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
  /** `file → the name a person reads`, off the route's own zone list, so a ruled-out place can say
   *  where it is. The route is the only thing here that has ever seen the graph. */
  const zoneNames = useMemo(() => new Map(hops.map((z) => [z.zone, z.name])), [hops]);

  // Exclude and include are the same list edited two ways, which is why they're three lines rather
  // than a mechanism: the route's ✕ adds, a chip removes, "Allow all" empties.
  const avoid = (step: TravelStep) => onTravel({ avoid: [...avoided, avoidedFrom(step, zoneNames)] });
  const allow = (id: string) => onTravel({ avoid: avoided.filter((a) => a.id !== id) });
  /** The route as instructions — computed before the return, so the JSX below only lays them out. */
  const rows = useMemo(() => (route ? routeInstructions(route) : []), [route]);
  /**
   * The route as the pairs its distances were measured between, for the map to draw.
   *
   * A leg whose start isn't a node — the first row, which started nowhere — has nothing to draw
   * between, so it isn't one.
   */
  const legs = useMemo(
    () => rows.flatMap((r) => (r.from ? [{ from: r.from, to: r.step.node.id }] : [])),
    [rows],
  );
  useEffect(() => {
    onRouteLegs?.(legs);
  }, [legs, onRouteLegs]);

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
            <CheckField
              key={key}
              className="travel-opt"
              label={label}
              checked={travel[key]}
              onChange={(on) => onTravel({ [key]: on })}
              title={hint}
            />
          ))}
          {/* Said once, here, because it's the question the missing "Boats" checkbox raises. */}
          <span
            className="muted small"
            title="A boat costs no walking and asks nothing of you but turning up at the dock, so it's a border like any other — there's nothing to switch off."
          >
            Boats always count
          </span>
          {onAudit && (
            <button
              className={`btn ghost sm travel-audit ${audit ? "on" : ""}`}
              aria-pressed={!!audit}
              title="What the graph holds about the zone on screen — the teleport networks it can reach, and the borders it knows are here and hasn't got a position for. The half that can't be drawn on a map."
              onClick={() => onAudit(!audit)}
            >
              {audit ? "Hide" : "Show"} what the graph knows
            </button>
          )}
        </div>

        <Avoided avoided={avoided} onAllow={allow} onAllowAll={() => onTravel({ avoid: [] })} />
      </div>

      <div className="travel-answer">
        {working && <p className="muted small">Working out the route…</p>}

        {!working && !from && (
          <p className="muted small">
            Nowhere to start from — the log hasn’t said which zone you’re in yet, so pick one.
          </p>
        )}

        {!working && answer?.refused && <p className="muted small">{refusalText(answer, to, avoided.length)}</p>}

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
              {rows.map((row, i) => (
                <Leg
                  key={`${row.step.node.id}-${i}`}
                  row={row}
                  onHover={(on) =>
                    onHoverLeg?.(on && row.from ? { from: row.from, to: row.step.node.id } : null)
                  }
                  onViewZone={onViewZone}
                  // The virtual ends can't be routed around: ruling out where you're standing is a
                  // contradiction, not a route. A hub is already not a row. And a walk-up shares its
                  // step with the crossing below it, which is the row that carries the ✕.
                  onAvoid={isRouteEnd(row.step) || row.walkUp ? undefined : () => avoid(row.step)}
                />
              ))}
            </ol>

            {/* Said once, and only until it's been used: the ✕ is deliberately quiet, and a quiet
                control with no caption is a secret. The *Not using* strip explains itself from then on. */}
            {!avoided.length && (
              <p className="muted small">
                <span className="travel-drop" aria-hidden>
                  ✕
                </span>{" "}
                drops a step — a port you haven’t got the spell for, a crossing you’d rather not make — and the route
                goes the next best way.
              </p>
            )}

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
