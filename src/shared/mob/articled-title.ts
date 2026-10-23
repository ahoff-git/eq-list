/**
 * articled-title.ts — the wiki's title for a name the log wrote without its article.
 *
 * The kill log strips a mob's article ("a ghoul sage" → "ghoul sage", via `parseKill`), and every
 * link built from a kill carries that bare name. eqlwiki titles the page "A ghoul sage", and a bare
 * title it doesn't have is a miss, so a mob you've killed opened as if the wiki had never heard of
 * it (ADR 0334). The title index already knows the right spelling; this finds it.
 *
 * Pure; shared by the desktop's page cache (`electron/wiki/index.ts`) and the web
 * build's snapshot (`src/lib/web/snapshot.ts`), and tested in `electron/tests/article-title.test.ts`.
 */
import { mobKey } from "./mob-stats";

/**
 * The title in `titles` that names the same thing as `asked` once articles and case are folded away
 * (`mobKey`), but isn't `asked` itself. Undefined when there's none, or when `asked` folds to nothing.
 */
export function articledTitle(asked: string, titles: readonly string[]): string | undefined {
  const key = mobKey(asked);
  if (!key) return undefined;
  const same = asked.trim().toLowerCase();
  return titles.find((t) => t.toLowerCase() !== same && mobKey(t) === key);
}
