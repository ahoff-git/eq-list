/**
 * npc-sightings.ts — where you've stood next to someone, read off lines the log already writes.
 *
 * Some NPCs are never killed, so the kill log never places them: a quest giver, a merchant, an
 * enchanter you hand a coin to. But the log still says when one is **in front of you**:
 *
 *   - **hail** — `You say, 'Hail, Sulgar'`. Deliberate, and short range.
 *   - **speech** — `Sulgar says, 'Hail, traveler! …'`. `says` carries only as far as /say does.
 *   - **consider** — `Sulgar regards you indifferently -- …`. A glance; consider reaches much further.
 *
 * None of them carries a position. Your `/loc` does, so a sighting is paired with your nearest fix in
 * the same zone, before or after it, within `FIX_WINDOW_SEC`. That makes a spot *near* the NPC, not
 * the NPC's own: rough, and said to be rough
 * ([ADR 0298](../../../specs/decisions/0298-npc-sightings-place-what-you-never-kill.md)).
 *
 * A sighting with no fix close enough is still kept, with no position: "seen in Everfrost Peaks" is
 * worth knowing on its own.
 *
 * Pure and DOM-free — the placer is a small state machine fed lines in log order, the same way live
 * tailing and a log re-read both feed it. Tested in `electron/tests/npc-sightings.test.ts`.
 */
import { mobKey } from "../mob/mob-stats";

/** Which line said they were there — best evidence first. */
export type SightingHow = "hail" | "speech" | "consider";

/** One time you were next to them. */
export interface SightingSample {
  at: string;
  how: SightingHow;
  /** Your `/loc` nearest in time — absent when none fell in the window. */
  y?: number;
  x?: number;
  /** How far apart, in seconds, the line and that `/loc` were. */
  fixAgeSec?: number;
}

/** Everything seen of one name in one zone. The zone is stored as the log wrote it (ADR 0083). */
export interface NpcSighting {
  name: string;
  zone: string;
  /** The first time — kept whatever the cap drops, so "first seen" stays true. */
  first: SightingSample;
  /** The most recent samples, oldest first, `first` included while it fits. */
  samples: SightingSample[];
}

/** A sighting fresh off the placer, ready to file. */
export interface PlacedSighting {
  name: string;
  zone: string;
  sample: SightingSample;
}

/** Where they were seen standing, from the best kind of evidence that placed them. */
export interface SightingPlace {
  y: number;
  x: number;
  /** Mean distance of those samples from the centre — how rough it is, in EQ units. */
  spread: number;
  samples: number;
  how: SightingHow;
}

/**
 * How far apart a line and a `/loc` may be and still be paired. Long enough for "hail, then /loc"
 * (or the other way round) by hand; short enough that you can't have walked far between them.
 */
export const FIX_WINDOW_SEC = 30;

/** Samples kept per name and zone. Enough for a centre and a spread; a con-happy camp doesn't grow it. */
export const MAX_SAMPLES = 20;

/** The same kind of line about the same name this close together is one sighting, not several. */
const REPEAT_SEC = 60;

const RANK: Record<SightingHow, number> = { hail: 0, speech: 1, consider: 2 };

/**
 * `Sulgar says, 'Hail, traveler!'` → `Sulgar`. Only `says`: a `tells you` is a /tell, which reaches
 * you from anywhere, and `says out of character` is a channel.
 *
 * Not `faction-cause.ts`'s `DIALOGUE_RE`, which takes tells too because a turn-in's reply can come
 * either way — that question is "who answered", this one is "who was standing here".
 */
const SPEECH_RE = /^(?<npc>.+?) says,?\s+'(?<text>.*)'\.?$/;

/**
 * What a speaker says that gives them away as not an NPC, measured on a real log: a pet answering its
 * owner ("Sorry, Master... calming down.", "As you wish, oh great one.", "…oh splendid one."), and a
 * **player** hailing something — the bare `Hail` or `Hail, <name>` the client sends. An NPC greets in
 * a sentence ("Hail, traveler!  Would you happen to know…"), which this leaves alone.
 */
const NOT_NPC_SPEECH_RE = /\bmaster\b|\boh \w+ one\b|^hail(?:,[^.!?]*)?$/i;

/** A corpse "says" its flavor text (`A minotaur slaver's corpse says, …`); a pet's name has its owner's. */
const NOT_NPC_NAME_RE = /^you$|`s |'s corpse$/i;

/** The speaker of a /say-range line, or undefined for anything else. */
export function speakerOf(message: string): string | undefined {
  const m = SPEECH_RE.exec(message);
  const npc = m?.groups?.npc.trim();
  if (!npc || NOT_NPC_NAME_RE.test(npc) || NOT_NPC_SPEECH_RE.test(m!.groups!.text)) return undefined;
  return npc;
}

/** The key one name in one zone is filed under — folded the way every mob lookup is. */
export function sightingKey(name: string, zone: string): string {
  return `${mobKey(name)}|${zone.trim().toLowerCase()}`;
}

interface Fix {
  y: number;
  x: number;
  atMs: number;
  zone: string;
}

interface Pending {
  name: string;
  how: SightingHow;
  at: string;
  atMs: number;
  zone: string;
}

export interface SightingPlacer {
  /** Whose log this is — their own name is never a sighting. */
  setPlayer(name: string): void;
  /** A group member is a player, not someone to place. */
  noteParty(change: "joined" | "left" | "cleared", who?: string): void;
  noteLoc(loc: { y: number; x: number; at: string }, zone: string | null): void;
  /** You changed zone: anything still waiting for a fix will never get one. */
  noteZone(): void;
  note(name: string, how: SightingHow, at: string, zone: string | null): void;
  /** Let go of anything still waiting, unplaced — the end of a log, or quitting. */
  flush(): void;
}

/**
 * Pairs sightings with fixes, in log order. `emit` receives each one once it's settled: at once when a
 * fix in the last `FIX_WINDOW_SEC` is already in hand, otherwise when the next fix arrives, or with no
 * position when the window closes first.
 */
export function createSightingPlacer(emit: (s: PlacedSighting) => void): SightingPlacer {
  const windowMs = FIX_WINDOW_SEC * 1000;
  let player = "";
  const party = new Set<string>();
  let lastFix: Fix | null = null;
  let pending: Pending[] = [];

  const isPlayer = (name: string) => {
    const key = name.trim().toLowerCase();
    return key === player || party.has(key);
  };

  function file(p: Pending, fix?: Fix): void {
    const sample: SightingSample = { at: p.at, how: p.how };
    if (fix) {
      sample.y = Math.round(fix.y);
      sample.x = Math.round(fix.x);
      sample.fixAgeSec = Math.round(Math.abs(p.atMs - fix.atMs) / 1000);
    }
    emit({ name: p.name, zone: p.zone, sample });
  }

  /** Anything whose window closed before `atMs` goes out unplaced. */
  function expire(atMs: number): void {
    const [late, waiting] = partition(pending, (p) => atMs - p.atMs > windowMs);
    for (const p of late) file(p);
    pending = waiting;
  }

  return {
    setPlayer(name) {
      player = name.trim().toLowerCase();
    },

    noteParty(change, who) {
      if (change === "cleared") party.clear();
      else if (who && change === "joined") party.add(who.trim().toLowerCase());
      else if (who) party.delete(who.trim().toLowerCase());
    },

    noteLoc(loc, zone) {
      const atMs = Date.parse(loc.at);
      if (Number.isNaN(atMs) || !zone) return;
      expire(atMs);
      const fix: Fix = { y: loc.y, x: loc.x, atMs, zone };
      for (const p of pending) file(p, p.zone === zone ? fix : undefined);
      pending = [];
      lastFix = fix;
    },

    noteZone() {
      for (const p of pending) file(p);
      pending = [];
      lastFix = null;
    },

    note(name, how, at, zone) {
      const atMs = Date.parse(at);
      if (Number.isNaN(atMs) || !zone || !name.trim() || isPlayer(name)) return;
      expire(atMs);
      const p: Pending = { name: name.trim(), how, at, atMs, zone };
      if (lastFix && lastFix.zone === zone && atMs - lastFix.atMs <= windowMs) file(p, lastFix);
      else pending.push(p);
    },

    flush() {
      for (const p of pending) file(p);
      pending = [];
    },
  };
}

/**
 * `entry` with `sample` filed into it — or `entry` itself, unchanged, when the sample is one it
 * already holds (a log read twice) or a repeat of the last one (conning a mob five times in a row).
 * Keeps the first sample and the newest `MAX_SAMPLES - 1` after it.
 */
export function addSample(entry: NpcSighting | undefined, s: PlacedSighting): NpcSighting {
  if (!entry) return { name: s.name, zone: s.zone, first: s.sample, samples: [s.sample] };
  const atMs = Date.parse(s.sample.at);
  const held = entry.samples.some(
    (o) => o.how === s.sample.how && Math.abs(Date.parse(o.at) - atMs) < REPEAT_SEC * 1000,
  );
  if (held) return entry;
  const samples = [...entry.samples, s.sample].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const first = Date.parse(s.sample.at) < Date.parse(entry.first.at) ? s.sample : entry.first;
  const rest = samples.filter((o) => o !== first).slice(-(MAX_SAMPLES - 1));
  return { ...entry, first, samples: [first, ...rest] };
}

/**
 * Where they stand, from the best kind of line that placed them: hails if any carry a position, else
 * speech, else considers. Never mixed — a consider from across a field would drag a hail's tight
 * cluster off the NPC. `undefined` when no sample carries a position.
 */
export function sightingPlace(entry: NpcSighting): SightingPlace | undefined {
  const placed = entry.samples.filter((s): s is SightingSample & { y: number; x: number } => s.y !== undefined && s.x !== undefined);
  if (!placed.length) return undefined;
  const how = placed.map((s) => s.how).sort((a, b) => RANK[a] - RANK[b])[0];
  const best = placed.filter((s) => s.how === how);
  const y = best.reduce((n, s) => n + s.y, 0) / best.length;
  const x = best.reduce((n, s) => n + s.x, 0) / best.length;
  const spread = best.reduce((n, s) => n + Math.hypot(s.y - y, s.x - x), 0) / best.length;
  return { y: Math.round(y), x: Math.round(x), spread: Math.round(spread), samples: best.length, how };
}

function partition<T>(list: T[], test: (t: T) => boolean): [T[], T[]] {
  const yes: T[] = [];
  const no: T[] = [];
  for (const t of list) (test(t) ? yes : no).push(t);
  return [yes, no];
}
