/**
 * item-presets.ts — named snapshots of the Items tab: its criteria, its value weights, and what
 * best in slot has been told (`bis-options.ts`).
 *
 * A player answers more than one question with this tab — "my caster set", "my tank set", "what
 * could my alt wear" — and each answer is a dozen pickers, a weight sheet and a handful of locks.
 * A preset puts all of that back in one click, so switching question doesn't mean rebuilding it.
 *
 * A preset is a whole snapshot rather than a diff, so applying one never leaves a stray floor or lock
 * behind from whatever was showing before. Pure; the panel stores the list.
 */
import { NO_CRITERIA, type ItemCriteria, type StatWeights } from "./item-search";
import { normalizeBisOptions, type BisOptions } from "./bis-options";

export interface ItemPreset {
  name: string;
  criteria: ItemCriteria;
  weights: StatWeights;
  bis: BisOptions;
}

/** The longest name kept — a preset name is a label on a dropdown, not a note. */
const MAX_NAME = 40;

export const presetName = (name: string): string => name.trim().replace(/\s+/g, " ").slice(0, MAX_NAME);

/** Save under a name, replacing a preset already called that (case aside). Sorted by name. */
export function savePreset(list: readonly ItemPreset[], preset: ItemPreset): ItemPreset[] {
  const name = presetName(preset.name);
  if (!name) return [...list];
  const rest = list.filter((p) => p.name.toLowerCase() !== name.toLowerCase());
  return [...rest, { ...preset, name }].sort((a, b) => a.name.localeCompare(b.name));
}

export function removePreset(list: readonly ItemPreset[], name: string): ItemPreset[] {
  return list.filter((p) => p.name !== name);
}

/**
 * A stored preset made whole — the same folding the panel does for its live criteria, so a preset
 * saved before a facet existed doesn't apply `undefined` into the middle of a filter.
 */
export function normalizePreset(stored: ItemPreset): ItemPreset {
  const criteria = { ...NO_CRITERIA, ...stored.criteria, facets: { ...NO_CRITERIA.facets, ...stored.criteria?.facets } };
  return { name: stored.name, criteria, weights: { ...stored.weights }, bis: normalizeBisOptions(stored.bis) };
}

/**
 * Which preset is showing right now, if any — the current state is exactly one of them. Compared as
 * JSON of the normalized shapes, which is exact for plain data like this.
 */
export function activePreset(list: readonly ItemPreset[], now: Omit<ItemPreset, "name">): string | undefined {
  const key = (p: Omit<ItemPreset, "name">) => JSON.stringify([canonical(p.criteria), canonical(p.weights), canonical(p.bis)]);
  const want = key(normalizePreset({ name: "", ...now }));
  return list.find((p) => key(normalizePreset(p)) === want)?.name;
}

/** Object keys sorted, so two equal shapes stringify the same whatever order they were built in. */
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .filter(([, x]) => x !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, x]) => [k, canonical(x)]),
    );
  }
  return v;
}
