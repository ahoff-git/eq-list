/**
 * damage-overlay.ts — shaping live combat stats for the floating damage meter
 * (`DamageMeterOverlay.tsx`). Pure and stateless: given a fight window, say which of your side
 * dealt damage and how each of them breaks down, ready to draw as two stacked bars.
 *
 * `byCombatant` holds everyone who appears in the fight — your side and the enemy both, since the
 * enemy hitting you is "dealing damage" too (`combat-stats.ts`'s `record`). A HUD glanced at
 * mid-pull is answering "how is my side doing," not "how hard is it hitting back," so the enemy is
 * excluded here with the same inference `damage-tree.ts` already trusts for its own shares
 * (`enemiesIn`) rather than a second guess at what a name looks like.
 */
import { drillDown, enemiesIn } from "./damage-tree";
import type { DamageCell, DamageNode, FightStats } from "./types";

/** Where the meter sits before it's ever been dragged — clear of the status bar and the map corner. */
export const DEFAULT_OVERLAY_PIN_AT = { fx: 0.82, fy: 0.24 };

/** Rows past this rank are cut — a HUD is glanced at, not scrolled. */
const MAX_OVERLAY_ROWS = 6;

/** One slice of a bar: its name, its damage, and its share of the bar it's in. */
export interface OverlaySegment {
  label: string;
  damage: number;
  share: number;
}

/** One dealer's row: its rank-worthy total, and the two breakdowns drawn beneath it. */
export interface OverlayDealer {
  name: string;
  mine: boolean;
  dealt: number;
  dps: number;
  /** This dealer's damage split Melee / Spell / Other, biggest first. */
  categories: OverlaySegment[];
  /** The same damage split by the individual skill or spell behind it, biggest first. */
  sources: OverlaySegment[];
}

const toSegments = (nodes: DamageNode[]): OverlaySegment[] =>
  nodes.map((n) => ({ label: n.label, damage: n.damage, share: n.share }));

/**
 * Your side's dealers, ranked by damage, each ready to draw as two stacked bars. `byCombatant` is
 * already sorted biggest-first (`combat-stats.ts`'s `summarize`), so filtering keeps the order.
 */
export function overlayDealers(
  window: Pick<FightStats, "byCombatant" | "damageCells">,
  max = MAX_OVERLAY_ROWS,
): OverlayDealer[] {
  const cells: DamageCell[] = window.damageCells ?? [];
  const mine = (name: string): boolean => window.byCombatant.find((c) => c.name === name)?.mine ?? false;
  const enemies = enemiesIn(cells, mine);
  return window.byCombatant
    .filter((c) => c.dealt > 0 && !enemies.has(c.name))
    .slice(0, max)
    .map((c) => ({
      name: c.name,
      mine: c.mine,
      dealt: c.dealt,
      dps: c.dps,
      categories: toSegments(drillDown(cells, "attacker", c.name, ["kind"], mine)),
      sources: toSegments(drillDown(cells, "attacker", c.name, ["source"], mine)),
    }));
}

/** Fixed colours for the category bar — the same three buckets `damage-tree.ts` always groups into. */
export const CATEGORY_COLOR: Record<string, string> = {
  Melee: "#e0923a",
  Spell: "#4f8fe0",
  Other: "#9a7fd1",
};

/**
 * A colour for the Nth source segment. Spell/skill names are open-ended, so — unlike the fixed
 * category colours above — this cycles a fixed palette by rank rather than by name: the biggest
 * slice always reads as the same hue in the same position, which is what makes the bar scannable
 * at a glance instead of a legend you'd have to read.
 */
const SOURCE_PALETTE = ["#4f8fe0", "#e0923a", "#54b56a", "#d1547a", "#9a7fd1", "#c9a227", "#4fb0b5", "#c9c9c9"];
export const sourceColor = (index: number): string => SOURCE_PALETTE[index % SOURCE_PALETTE.length];
