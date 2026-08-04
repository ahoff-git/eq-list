/**
 * Where maps come from, and what a zone in one is called.
 *
 * A **source** is either the bundled images or a folder of EverQuest map files — the
 * game's own `<EverQuest>/maps/`, or a pack unzipped into a subfolder of it (Brewall's,
 * Goodurden's, …). Folders are discovered, never hardcoded, so a pack the user installs
 * later just shows up.
 *
 * The hard part is naming. Map files are named for a zone's **short** name (`gfaydark`,
 * `qey2hh1`) and the log only ever says the long one ("Greater Faydark"). There's no
 * mapping in the files, so this module supplies one — deliberately narrow: an alias table
 * for names we can actually stand behind, two conservative rules, and the short name
 * itself for everything else. Guessing is worse than not knowing: loose rules cheerfully
 * map "East Commonlands" onto `commonlands` (a different zone) and "Qeynos Hills" onto
 * `qeynos` (South Qeynos), and a confidently mislabelled map is how you end up plotting
 * kills in the wrong place.
 */

import type { Zone } from "./types";

/** The bundled-images source — always available, needs no game install. */
export const IMAGE_SOURCE = "img";

/** A place maps can be loaded from. */
export interface MapSource {
  /** Stable id, persisted as the user's choice: `img`, `stock`, or a folder name. */
  id: string;
  label: string;
  /** Absolute folder, or undefined for the bundled images. */
  dir?: string;
  /** Zone short names available here (base files, layer suffixes stripped). */
  files: string[];
}

/** What the main process reports about the maps it can see. */
export interface MapSourceReport {
  /** `<EverQuest>/maps`, when we could find it — shown in the UI so a miss is diagnosable. */
  mapsDir?: string;
  sources: MapSource[];
}

/** Normalize a zone name for matching: lowercase, letters and digits only. */
function norm(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Long name → candidate short names, best first. Every entry is a standard EverQuest zone
 * short name, and a candidate is only ever used if that file actually exists — so a wrong
 * guess here fails closed (no map) rather than showing you someone else's zone. Several
 * zones have two spellings because EQ Legends ships friendlier names for its own copies
 * (`toxxulia` beside Brewall's `tox`).
 */
const ZONE_FILE_ALIASES: Record<string, string[]> = {
  // Every zone we ship an image for, so both sources agree on what a zone is called.
  greaterfaydark: ["gfaydark"],
  lesserfaydark: ["lfaydark"],
  toxxuliaforest: ["toxxulia", "tox"],
  qeynoshills: ["qey2hh1"],
  crushbone: ["crushbone"],
  northernfelwithe: ["felwithea"],
  southernfelwithe: ["felwitheb"],
  neriakforeignquarter: ["neriaka"],
  neriakcommons: ["neriakb"],
  neriakthirdgate: ["neriakc"],
  nektulosforest: ["nektulos"],
  oggok: ["oggok"],
  feerrott: ["feerrott"],
  steamfontmountains: ["steamfontmts", "steamfont"],
  akanon: ["akanon"],
  runnyeyecitadel: ["runnyeye"],
  northerndesertofro: ["northro", "nro"],
  // The zones a real log showed us visiting that we had no image for.
  eastcommonlands: ["ecommons"],
  estateofunrest: ["unrest"],
  newsebilisexpedition: ["newsebexp"],
  eqltutorial: ["tutoriala", "tutorialb", "tutorial"],
};

/**
 * Candidate short names for a long zone name, best first. Beyond the alias table only two
 * rules are trusted: the name itself with punctuation dropped, and "X of Y" → "y" (which
 * is how "The Estate of Unrest" finds `unrest`). Anything cleverer starts colliding with
 * real, different zones.
 */
export function zoneFileCandidates(longName: string): string[] {
  const n = norm(longName);
  const bare = norm(longName.replace(/^the\s+/i, ""));
  const out = [...(ZONE_FILE_ALIASES[n] ?? ZONE_FILE_ALIASES[bare] ?? []), n, bare];
  const words = longName.toLowerCase().split(/\s+/);
  const of = words.indexOf("of");
  if (of > 0 && of < words.length - 1) out.push(norm(words.slice(of + 1).join("")));
  return [...new Set(out.filter(Boolean))];
}

/** A short name as a display name, for zones we can't name properly (`gukbottom`). */
export function prettyZoneName(short: string): string {
  return short.charAt(0).toUpperCase() + short.slice(1);
}

/**
 * The zones a folder source offers: one per map file, named as well as we can manage. Real
 * names come from `known` (the bundled catalogue, so both sources call a zone the same
 * thing and pins keep matching); the rest are shown by their file name, which is honest and
 * still selectable.
 *
 * Names are kept unique — two files that both answer to one zone name would otherwise look
 * like two *layers* of it (see `zoneLayers`), and only one of them would ever be reachable.
 */
export function zonesFromFiles(sourceId: string, files: string[], known: Zone[]): Zone[] {
  const available = new Set(files);
  const nameFor = new Map<string, string>();
  const taken = new Set<string>();

  // Pass one: zones we can name, in catalogue order, each taking its best available file.
  for (const name of new Set(known.map((z) => z.name))) {
    for (const candidate of zoneFileCandidates(name)) {
      if (!available.has(candidate) || nameFor.has(candidate)) continue;
      nameFor.set(candidate, name);
      taken.add(name);
      break;
    }
  }

  return files.map((short) => {
    const named = nameFor.get(short);
    const pretty = prettyZoneName(short);
    const name = named ?? (taken.has(pretty) ? short : pretty);
    return { name, key: `${sourceId}:${short}`, file: short };
  });
}
