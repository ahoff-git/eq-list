/**
 * unmatched-lines.ts — the lines no parser claimed, counted so they can be read.
 *
 * Every matcher in `parse-line.ts` returns null for lines it doesn't own, and a line nothing
 * owns is currently dropped in silence. That silence is the problem: our tests pin the grammar
 * we already thought of, so a wording the game uses and we've never seen simply doesn't happen
 * as far as the app is concerned. `log-parser.test.ts` carries the evidence — lines that "were
 * silently unparsed (or under-counted) before", found by somebody happening to look. This is how
 * they turn up instead: from real play, without asking anyone to send us a log.
 *
 * **Two buckets, and the second is what makes the first readable.** A line we've decided not to
 * model is not a line we failed to read. Chat, tells, emotes and other players' business are
 * *matched and ignored* — counted, so the totals are honest, and then discarded. Without that
 * split, an evening of guild chat buries the one line that actually reveals a gap. (A neighbour
 * ran into exactly this and marks such lines deliberately; see
 * [neighbours.md](../../specs/neighbours.md) → eql-log-reader.)
 *
 * **On privacy.** Ignored lines never have their text kept at all, which is what removes the
 * overwhelming bulk of other people's words — everything they *authored*. What remains in the
 * unmatched bucket is sentences the **game** wrote, and those can still contain a player's name
 * ("Bunnyslayer looks unwell."). Numbers are folded out so a thousand damage amounts collapse to
 * one row, but names are not, because folding them reliably would need a roster we don't have and
 * folding them unreliably would merge lines that differ. So: the list is a debugging aid behind
 * the debug toggle, not something to auto-attach to a report, and a shape should be **read before
 * it's pasted**. Its size is capped so it can't grow into a log of its own.
 *
 * Stateful, because counting is memory; pure otherwise (no I/O, no clock), so it's a black box
 * the watcher feeds and the settings panel reads.
 */

/** How many distinct shapes to hold before new ones are dropped. */
const MAX_SHAPES = 200;

/**
 * Lines that are somebody talking, or the game narrating somebody else. Counted and dropped
 * rather than kept: none of them is a parser gap, and all of them are other people's words.
 *
 * Ordered loosest-last, though only cost depends on it — a line matching any of these is
 * ignored the same way.
 */
const IGNORED: RegExp[] = [
  // Directed and channel chat, in the forms EQ writes them.
  /^(?:\w+) tells you, /,
  /^You tell (?:.+?), /,
  /^(?:\w+) tells the (?:group|guild|raid|fellowship), /,
  /^You tell (?:the )?(?:group|guild|raid|fellowship), /,
  /^(?:\w+) (?:says|shouts|auctions|says out of character), /,
  /^You (?:say|shout|auction|say out of character), /,
  // A numbered custom channel: "You tell mychannel:1, '...'" and its inbound form.
  /^(?:\w+) tells \w+:\d+, /,
  /^You tell \w+:\d+, /,
  // Someone else's emote or social. Ours are worth seeing; theirs are noise by the thousand.
  /^(?:\w+) (?:waves|bows|cheers|thanks|salutes|points|nods|giggles|frowns|smiles|laughs)\b/,
];

/**
 * A line's *shape*: the same sentence with its numbers folded, so a thousand different damage
 * amounts are one row rather than a thousand. Deliberately conservative — only digits go, since
 * anything cleverer risks merging two genuinely different wordings into one and hiding the gap
 * this exists to find.
 */
export function lineShape(message: string): string {
  return message.replace(/\d+/g, "#").trim();
}

/** Is this a line we've decided not to model, rather than one we failed to read? */
export function isIgnored(message: string): boolean {
  return IGNORED.some((re) => re.test(message));
}

export interface UnmatchedShape {
  shape: string;
  count: number;
}

export interface UnmatchedLines {
  /** Fold in a line no parser claimed. */
  note(message: string): void;
  /** The most frequent shapes, commonest first. */
  top(limit?: number): UnmatchedShape[];
  /** Totals: lines seen, of which ignored, and how many distinct shapes are held. */
  stats(): { seen: number; ignored: number; shapes: number; dropped: number };
  clear(): void;
}

export function createUnmatchedLines(maxShapes = MAX_SHAPES): UnmatchedLines {
  const counts = new Map<string, number>();
  let seen = 0;
  let ignored = 0;
  /** Shapes turned away once the cap was reached — so a truncated list can say it's truncated. */
  let dropped = 0;

  return {
    note(message) {
      const line = message?.trim();
      if (!line) return;
      seen++;
      if (isIgnored(line)) {
        ignored++;
        return; // counted, never kept
      }
      const shape = lineShape(line);
      const already = counts.get(shape);
      if (already !== undefined) {
        counts.set(shape, already + 1);
        return;
      }
      // A full table stops taking new shapes rather than evicting: what's already here is what
      // has proven frequent, and churning it would mean the list never settles on anything.
      if (counts.size >= maxShapes) {
        dropped++;
        return;
      }
      counts.set(shape, 1);
    },
    top(limit = 20) {
      return [...counts.entries()]
        .map(([shape, count]) => ({ shape, count }))
        .sort((a, b) => b.count - a.count || a.shape.localeCompare(b.shape))
        .slice(0, limit);
    },
    stats: () => ({ seen, ignored, shapes: counts.size, dropped }),
    clear() {
      counts.clear();
      seen = 0;
      ignored = 0;
      dropped = 0;
    },
  };
}
