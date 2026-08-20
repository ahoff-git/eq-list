/**
 * html-text.ts — turning a scraped HTML fragment into the lines a person would read.
 *
 * Two data sources now parse someone else's markup — [eqlwiki](./wiki/parse.ts) and
 * [Lucy](./lucy/parse.ts) — and both want the same two things from it: entities decoded, and a
 * `<br>`-separated block read as a list of lines. Both had the first written out; the second was
 * about to be copied. A stat card that read `WT: 0.3` in one panel and `WT: 0.3&#160;` in the other
 * would be one item described two ways, so the rule lives here once.
 *
 * Node/main-only in practice (its callers use node-html-parser), but it depends on nothing: strings
 * in, strings out.
 */

/**
 * The handful of entities scraped pages actually contain, plus the numeric escape.
 *
 * Deliberately not a full entity table: these are the ones measured on real eqlwiki and Lucy pages,
 * and an unknown `&…;` is better left visible than silently mangled by a guess.
 */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#160;|&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

/**
 * An HTML fragment's visible lines: tags stripped, `<br>` and `<p>` treated as the line breaks they
 * look like, whitespace collapsed, blanks dropped.
 *
 * `<br>` is the load-bearing part. An EQ item block is one long run of text whose *only* structure
 * is where the breaks fall — `Slot: WRIST`, `AC: 3`, `Class: NEC WIZ MAG ENC` — so throwing the
 * breaks away with the rest of the tags would turn a stat card into one unreadable sentence.
 */
export function htmlToLines(html: string): string[] {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/?p[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}
