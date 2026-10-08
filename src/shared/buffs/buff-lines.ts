/**
 * buff-lines.ts — asking the buff-line data which spells conflict, instead of asking it for one.
 *
 * `buff-lines.generated.ts` is a plain transcription of eqlwiki's "Buff Lines" guide; this is the
 * hand-written lookup over it, the same division of labor `race-unlocks.ts` keeps beside its own
 * generated file. A spell is looked up by the same rank-stripped, lowercased identity the Buffs tab
 * already uses (`buffKey`), so a wiki-cased "Nimble" and a live "Nimble Rk. II"-style cast resolve
 * to the same row without a second normalization rule.
 *
 * Only what a caller actually needs is exposed — see `BuffPanel.tsx` and `SpellCatalogTable.tsx`.
 */
import { BUFF_LINES, type BuffLine } from "./buff-lines.generated";
import { buffKey } from "./buff-tracking";

let bySpell: Map<string, BuffLine[]> | undefined;

function index(): Map<string, BuffLine[]> {
  if (!bySpell) {
    bySpell = new Map();
    for (const line of BUFF_LINES) {
      for (const member of line.members) {
        const key = buffKey(member.spell);
        const lines = bySpell.get(key);
        if (lines) lines.push(line);
        else bySpell.set(key, [line]);
      }
    }
  }
  return bySpell;
}

/**
 * Every buff line a spell belongs to, per the guide — empty for anything it doesn't cover.
 *
 * Usually one line. More than one means a combination buff: the guide lists it once under each
 * stat it contributes to, and it conflicts with everything under either heading — that's already
 * the whole meaning of appearing twice, nothing further is computed for it.
 */
export function buffLinesFor(spell: string): BuffLine[] {
  return index().get(buffKey(spell)) ?? [];
}

/**
 * Do these two *different* spells share a buff line — i.e. would having both up at once waste one
 * of them? The same spell always "shares a line with itself", which isn't a conflict worth naming,
 * so this reads as `false` whenever `a` and `b` are the same spell under `buffKey`'s identity.
 */
export function shareBuffLine(a: string, b: string): boolean {
  if (buffKey(a) === buffKey(b)) return false;
  const linesA = buffLinesFor(a);
  if (!linesA.length) return false;
  const idsA = new Set(linesA.map((l) => l.id));
  return buffLinesFor(b).some((l) => idsA.has(l.id));
}
