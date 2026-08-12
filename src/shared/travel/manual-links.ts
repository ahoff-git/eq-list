/**
 * Travel the maps can't tell us, written down by hand.
 *
 * The same shape as `map/zones.ts`'s `CURATED_ZONES` and for the same reason: a small, commented,
 * typechecked table of things a person had to find out, sitting beside a much larger body of things
 * that are *read* off the corpus. Keep it small. Every entry here is a claim nothing checks, so it
 * should say **why** and it should be something the maps genuinely cannot say:
 *
 *  - **A translocator or a dock is on the map; where it takes you often isn't.** That's most of this
 *    file. Such a crossing is a `boundary`, not a ride — it costs no walking and asks nothing of you
 *    but turning up, which is exactly what a zone line is — so an entry states "these two zones
 *    connect, here and here", and the border is positioned at each end.
 *
 *    **Check before adding one.** A label that names its destination *anywhere* — `Boat to Erudin`,
 *    `Translocator to Toxxulia Forest`, `to Timorous Deep (Boat)` — is paired up by the builder on its
 *    own, so an entry for it is dead weight. What needs writing down is the crossing whose label
 *    *can't* be read: `East Freeport & The Butcherblock Mountains (Translocator Narrik)` names two
 *    destinations, and a label that can't pick one can't be believed about either.
 *    `npm run travel:build` lists what it found and couldn't pair.
 *  - **A druid ring and a spire are on the map, and their networks are derivable** — every ring
 *    reaches every other, so the build wires the whole set into one hub without being told. Nothing
 *    needs adding here unless a zone's ring exists and this pack never labelled it.
 *  - **A succor point can't be written here at all**, deliberately. It joins no two places — it's one
 *    zone's own safe point (ADR 0069) — so there's no `pair` or `network` shape it fits, and the type
 *    says so. What's more, a place here is named by *label*, with no coordinates: an entry could state
 *    that a zone has a safe point and not where it is, and an unplaced one costs `UNKNOWN_CROSSING`,
 *    which is a guess that can beat a measured walk. So it's read off the map's marker or it isn't there.
 *  - **Which zones the server actually runs** — not here at all. `zones/expansions.ts` answers it for
 *    the whole app: the expansion table rules out everything past this server, and eqlwiki's live era
 *    flags close what it has but hasn't opened. Applied when the graph is *built*, so re-running the
 *    build can't reintroduce one (ADR 0065).
 *
 * A zone may be named **either way round** — "South Qeynos" or its map file `qeynos`. A file name
 * differs between packs while a zone's name doesn't, so nothing here has to guess which this pack
 * chose.
 */

import type { TravelManual } from "./manual";

// Zones this server hasn't got are no longer listed here at all: `src/shared/zones/expansions.ts`
// knows which expansion every zone came with, so Argath, the Plane of Knowledge and ~350 others exclude
// themselves, and eqlwiki's live era flags close Kunark and Velious until they open. Nothing to type,
// and nothing to keep in step. See ADR 0065.

export const MANUAL_TRAVEL: TravelManual = {
  links: [
    // ── Translocators ─────────────────────────────────────────────────────────────────────────
    // **Verified in game**, unlike everything that was guessed here before. Six gnomes forming a
    // chain, not a network — Erudin ↔ Erud's Crossing ↔ South Qeynos ↔ East Freeport ↔ Ocean of Tears
    // ↔ Butcherblock Mountains — which is what joins Odus, Antonica and Faydwer to each other.
    //
    // One entry per **link**, because a link is a border and a chain of them is a chain of borders.
    // Each gnome appears in two entries where it serves two destinations (Jempar, Sedina, Setikan,
    // Narrik), which is right: one place, two borders, and its coordinates go to both.
    //
    // Matched on the gnome's **name**, not the word "translocator": the packs label these
    // `East Freeport & The Butcherblock Mountains (Translocator Narrik)`, so the name is the part
    // that's reliably present and unambiguous — and naming two destinations at once is exactly why the
    // builder can't read these for itself. A label that can't pick one destination can't be believed
    // about either, which is `zoneLinkName`'s rule and the reason these are here at all.
    {
      shape: "boundary",
      via: "translocator",
      places: [{ zone: "Erudin", label: "Eniela" }, { zone: "Erud's Crossing", label: "Jempar" }],
      why: "Translocator Eniela (Erudin) ↔ Jempar (Erud's Crossing).",
    },
    {
      shape: "boundary",
      via: "translocator",
      places: [{ zone: "Erud's Crossing", label: "Jempar" }, { zone: "South Qeynos", label: "Sedina" }],
      why: "Translocator Jempar (Erud's Crossing) ↔ Sedina (South Qeynos) — with the leg above, the only way off Odus.",
    },
    {
      shape: "boundary",
      via: "translocator",
      places: [{ zone: "South Qeynos", label: "Sedina" }, { zone: "East Freeport", label: "Setikan" }],
      why: "Translocator Sedina (South Qeynos) ↔ Setikan (East Freeport) — across Antonica by sea.",
    },
    {
      shape: "boundary",
      via: "translocator",
      places: [{ zone: "East Freeport", label: "Setikan" }, { zone: "Ocean of Tears", label: "Narrik" }],
      why: "Translocator Setikan (East Freeport) ↔ Narrik (Ocean of Tears).",
    },
    {
      shape: "boundary",
      via: "translocator",
      places: [{ zone: "Ocean of Tears", label: "Narrik" }, { zone: "Butcherblock Mountains", label: "Fithop" }],
      why: "Translocator Narrik (Ocean of Tears) ↔ Fithop (Butcherblock Mountains) — Antonica to Faydwer.",
    },

    // ── Boats ─────────────────────────────────────────────────────────────────────────────────
    // The classic Faydwer↔Kunark run — a corridor the translocators above don't cover.
    //
    // **These two wait for Kunark.** Both ends are out of era, so the graph excludes those zones and
    // the manual pass declines the entries, reporting them as "out of era, so those entries wait"
    // rather than as a fault. They start working the day the era opens, which is the point of leaving
    // correct knowledge in place instead of deleting it. (Unverified on Legends even so — a boat is one
    // thing the Travel Guide describes and the map labels can't confirm.)
    //
    // The translocator legs deliberately have no boat entry beside them. Where a real boat runs the
    // same corridor it's a second way across the *same* border, so an entry would only buy an extra
    // crossing point — and a guessed dock is worse than no dock.
    {
      shape: "boundary",
      via: "boat",
      places: [{ zone: "Butcherblock Mountains", label: "dock" }, { zone: "Timorous Deep", label: "dock" }],
      why: "Faydwer to Kunark — classic EverQuest, not checked here.",
    },
    {
      shape: "boundary",
      via: "boat",
      places: [{ zone: "Timorous Deep", label: "dock" }, { zone: "Firiona Vie", label: "dock" }],
      why: "The Kunark end of the same crossing — classic EverQuest, not checked here.",
    },
  ],

  // A ring or spire the maps label that doesn't actually work — the node stays on the map, it just
  // stops being a free ride. Nothing known to need this yet.
  drop: [],

  // Two places in one zone you can't walk between, which is the one thing the "every pair of a zone's
  // nodes is a walk" rule can't express. Nothing known to need this yet.
  blocks: [],
};
