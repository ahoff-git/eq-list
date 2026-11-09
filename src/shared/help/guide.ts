/**
 * guide.ts — what a how-to guide is, how its text is read, and what makes one trustworthy.
 *
 * A guide is a few steps in the player's words, and the way it goes stale is always the same: a tab is renamed,
 * a hotkey moves, and the sentence that named it is still sitting in a help page. So the two facts most likely
 * to rot are **not written into the text**: a hotkey is a `{hotkey:stats}` token resolved from the same constant
 * main registers it from, and the tab a guide is about is a key checked against the nav (`guideProblems`) — a
 * rename that forgets the guide fails a test instead of misleading a player. Everything else in the text is
 * prose a person has to keep true, which is what the project rule about guides and the changelog is for.
 *
 * Pure: the data is `guides.ts`, the screen is `src/app/components/help/HowToPanel.tsx`.
 */
import { LOOKUP_HOTKEY, OVERLAY_HOTKEY, STATS_HOTKEY } from "../constants";
import type { EqlCapabilities } from "../types";

export interface Guide {
  /** kebab-case, stable: a release note links to it, so renaming one breaks that link. */
  id: string;
  title: string;
  /** One line: what you get out of it. Shown on the collapsed card. */
  gist: string;
  /** The section (a key in `areas.ts`) this is about — the card's button opens it — or `MAP_WINDOW`, for the one
   *  thing that is a window of its own rather than a tab. */
  section: string;
  /** What the host must be able to do. Absent: works anywhere, the web build included. */
  needs?: keyof EqlCapabilities;
  /** Numbered, in the order a first-timer does them. Text tokens: `**a label**`, `{hotkey:stats}`. */
  steps: readonly string[];
  /** Things worth knowing once it works — what it can't do, what trips people up. */
  tips?: readonly string[];
}

/** What `Guide.section` says when the guide is about the map window, which no section of the nav opens. */
export const MAP_WINDOW = "map";

/** The hotkeys a guide may name, by the name its token uses — the constants main registers them from. */
export const GUIDE_HOTKEYS: Readonly<Record<string, string>> = {
  overlay: OVERLAY_HOTKEY.label,
  lookup: LOOKUP_HOTKEY.label,
  stats: STATS_HOTKEY.label,
};

/**
 * A tab's name without the live count it wears (`Alerts (6)`, `Peers (off)`): a button that says where it goes
 * wants the name, not the state of the thing at that moment.
 */
export function plainSectionLabel(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/, "");
}

export type GuidePart = { kind: "text" | "bold" | "key"; text: string };

const TOKEN = /\*\*(.+?)\*\*|\{hotkey:([a-z-]+)\}/g;

/**
 * A line of guide text as parts to draw: plain text, a **bold** UI label, a hotkey. An unknown hotkey stays as
 * the written token — visibly wrong rather than silently blank — and `guideProblems` is what catches it before
 * a player does.
 */
export function guideParts(text: string): GuidePart[] {
  const parts: GuidePart[] = [];
  let at = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index > at) parts.push({ kind: "text", text: text.slice(at, m.index) });
    if (m[1] !== undefined) parts.push({ kind: "bold", text: m[1] });
    else if (m[2] in GUIDE_HOTKEYS) parts.push({ kind: "key", text: GUIDE_HOTKEYS[m[2]] });
    else parts.push({ kind: "text", text: m[0] });
    at = m.index + m[0].length;
  }
  if (at < text.length) parts.push({ kind: "text", text: text.slice(at) });
  return parts;
}

/** What `guideParts` would show for it, as one string — for tests and anything that wants no markup. */
export function guidePlainText(text: string): string {
  return guideParts(text)
    .map((p) => p.text)
    .join("");
}

/**
 * What is wrong with a set of guides, in words; an empty list is a good one. `sections` is every section key
 * the nav has (`areas.ts`) and `guides` is checked against it, so a guide can't outlive the tab it is about.
 */
export function guideProblems(guides: readonly Guide[], sections: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const g of guides) {
    const at = `guide "${g.id}"`;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(g.id)) problems.push(`${at}: an id is kebab-case`);
    if (seen.has(g.id)) problems.push(`${at}: used twice`);
    seen.add(g.id);
    if (!g.title.trim()) problems.push(`${at}: no title`);
    if (!g.gist.trim()) problems.push(`${at}: no gist`);
    if (g.section !== MAP_WINDOW && !sections.has(g.section)) problems.push(`${at}: section "${g.section}" is not in the nav`);
    if (!g.steps.length) problems.push(`${at}: no steps`);
    for (const line of [...g.steps, ...(g.tips ?? [])]) {
      if (!line.trim()) problems.push(`${at}: an empty line`);
      for (const m of line.matchAll(/\{hotkey:([a-z-]+)\}/g)) if (!(m[1] in GUIDE_HOTKEYS)) problems.push(`${at}: no hotkey called "${m[1]}"`);
      // A registered chord typed out by hand is one that will be wrong the day its constant changes. (Keys
      // that have no constant — Alt+← for back — are fine to write.)
      if (/\b(Ctrl|Cmd)\s*\+/i.test(line)) problems.push(`${at}: names a registered hotkey by hand — use a {hotkey:…} token`);
      if (/\{|\}/.test(guidePlainText(line).replace(/\{hotkey:[a-z-]+\}/g, ""))) problems.push(`${at}: a stray brace in "${line.slice(0, 40)}"`);
      if ((line.match(/\*\*/g)?.length ?? 0) % 2) problems.push(`${at}: an unclosed ** in "${line.slice(0, 40)}"`);
    }
  }
  return problems;
}
