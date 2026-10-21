import type { OwnedPlace } from "../game-export-dumps";

/** How many places one line names before it says how many more — a hover card, not the Exports view. */
const PLACES = 3;

/**
 * The hover card's "who has this" lines: where you hold it (and your best grade), and which peers who
 * share their inventory hold it — so checking whether you already own something doesn't take a trip to
 * Character → Exports or Settings → Peers
 * ([ADR 0320](../../../specs/decisions/0320-tabs-are-grouped-into-areas-by-what-you-are-doing.md)).
 * No lines when nobody holds it.
 */
export function ownershipNotes(
  places: readonly OwnedPlace[] | undefined,
  bestGrade: number | undefined,
  peers: readonly { by: string; count: number }[] | undefined,
): string[] {
  const notes: string[] = [];
  if (places?.length) {
    const total = places.reduce((n, p) => n + p.count, 0);
    const where = places.slice(0, PLACES).map(placeText);
    if (places.length > PLACES) where.push(`${places.length - PLACES} more`);
    notes.push(`You have ${total}${bestGrade ? ` (best +${bestGrade})` : ""}: ${where.join(", ")}`);
  }
  if (peers?.length) notes.push(`Peers: ${peers.map((p) => `${p.by} ${p.count}`).join(", ")}`);
  return notes;
}

function placeText(p: OwnedPlace): string {
  const what = p.exaltation ? `${p.text} (exaltation)` : p.text;
  return p.count > 1 ? `${what} ×${p.count}` : what;
}
