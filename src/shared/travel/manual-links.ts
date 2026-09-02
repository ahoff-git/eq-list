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

/**
 * **A map file that draws a zone the pack already draws better** — file → the file that supersedes it.
 *
 * `duplicateZoneFiles` folds the pairs a *rule* can see: one file named after the zone, another named
 * after the zone with the spaces closed up. These are the ones no rule can — a pack keeping an old
 * drawing beside a current one under a name that looks like a different place.
 *
 * The evidence that the survivor is the right one is the same in every case and worth stating, because
 * it is what makes discarding the other safe: **the surviving file agrees with the game's own map and
 * the discarded one does not.** Brewall's `misty` puts `to Rivervale` at `2551, -408` where the game's
 * own file has `2562, -411`; `mistythicket` puts it at `1490, -181`. The discarded drawings are
 * rescaled redraws in their own coordinate space, so their labels' positions cannot be borrowed even
 * where the labels themselves are richer — the reason the wiki, not a merge, is how those connections
 * come back ([ADR 0117](../../../specs/decisions/0117-the-wiki-says-which-zones-touch.md)).
 */
/**
 * **Map files that draw somewhere you cannot go**, by name or by map file.
 *
 * The expansion table rules out everything past this server and the wiki's era flags close the
 * expansions it hasn't opened ([ADR 0065](../../../specs/decisions/0065-a-zone-belongs-to-an-expansion.md)),
 * and both work on a zone's **name**. These are the ones neither can reach: a pack ships
 * `mmca.txt`…`mmcj.txt`, nothing in any catalogue answers to "Mmca", and the table quite correctly
 * fails open on a name it has never heard of — so ten instances of Mistmoore's Catacombs each drew a
 * border into Lesser Faydark and a player looking at that zone was offered *→ Mmca, → Mmcb, → Mmcc*.
 *
 * **Found, not guessed.** Every entry here came off one query: a zone whose entire travel content is a
 * single border, where the neighbour's own mapmaker never drew a way in — so it exists only because
 * this file claims it. That query returns 44 zones and is *not* the rule, because four of the 44 are
 * real places (the Plane of Hate, Veeshan's Peak, Howling Stones, the Endless Caverns) and losing a
 * real zone is far worse than offering an unreachable one. So the query is the worklist and this list
 * is the judgement, which is the same division of labour as everywhere else here.
 */
export const NOT_IN_GAME: readonly string[] = [
  // Lettered instance sets. Ten interiors apiece, each labelling its way back to the parent zone, and
  // no catalogue names any of them.
  ...["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"].map((n) => `mmc${n}`), // Mistmoore's Catacombs
  ...["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"].map((n) => `mir${n}`), // Miragul's Menagerie
  "dranikhollowsa",
  "dranikhollowsb",
  "dranikhollowsc",
  "oldbloodfield",

  // The modern Freeport interiors, which arrived with a revamp this server doesn't have. Their being
  // rooms rather than zones is why nothing names them.
  "freeportacademy",
  "freeportcityhall",
  "freeporthall",
  "freeportmilitia",
  "freeporttheater",

  // Revamped or instanced second copies of a zone the graph already has under its real name. Each is a
  // lone border into its original, which is the shape of a copy rather than a place.
  "akhevatwo",
  "crystaltwoa",
  "crystaltwob",
  "greatdividetwo",
  "necropolistwo",
  "skyshrinetwo",
  "sleepertwo",
  "templeveeshantwo",
  "umbraltwo",
  "drogab",
  "oldblackburrow",
];

export const STALE_DRAWINGS: Readonly<Record<string, string>> = {
  // **Toxxulia was split.** `toxxulia.txt` is the old single map of a zone that is now Tox *and* Kerra
  // Ridge, so its exits are a mixture of two zones' and belong to neither. Reported in game.
  toxxulia: "tox",
  // **`freeporteast` is the modern East Freeport**, and it says so: it labels `to The Devastation`, a
  // zone six expansions past this server. `freporte` is the classic drawing and the one that matches
  // the game's own file. Its being a second East Freeport rather than a spelling of one is why the
  // rule can't see it.
  freeporteast: "freporte",
  // **`northro` is the revamped North Ro**, and it says so too: LDoN camps, a Wayfarer port,
  // `to The Commonlands` and `to Freeport Sewers`, where this server has East and West Commonlands and
  // no sewer zone line. `nro` is the classic drawing — its exits are the wiki's own neighbour list for
  // the zone — and it is the one that marks the **wizard spire**, which the revamp drew nowhere. Left
  // unfolded, the graph carried North Ro twice, and the half a player could name by its long name was
  // the half with no port on it: the Navigation tab knew of no way to teleport there. `nro` is what the
  // gazetteer names now, and "northro" is not a spelling of that name, so no rule pairs them.
  northro: "nro",
};
