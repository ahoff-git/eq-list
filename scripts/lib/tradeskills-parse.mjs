/**
 * tradeskills-parse.mjs — a tradeskill page's leveling guide, read off the wiki's **rendered** HTML.
 *
 * Every other hand-authored-guide parser in here reads wikitext. This one can't: the nine skill pages
 * write their guides nine ways (a `{| wikitable`, a raw `<table>`, bullets, `'''1 to 21:'''` prose,
 * `Trivial 17 - [[Silver Bar]] + [[Malachite]]`), and two of the things that matter most only exist
 * after MediaWiki has run — `{{:Banded Belt}}` is an item tooltip transclusion and
 * `{{Velious Era Inline}}` is an era badge. Rendered, both are uniform: `.hbdiv > a` and `span.era`.
 *
 * So the guide is kept **as the wiki wrote it**, not interpreted into steps: headings, paragraphs,
 * (nested) lists and tables, each line a run of text, links and era markers. That is the honest
 * shape — "1 to 151: Skull Ale, needs a Cyclops Skull from South Karana" is a step with a reason, and
 * there is no field to put the reason in. What *is* interpreted is the one thing the app needs from
 * it: which lines the server can't do yet (see `tradeskill-era.ts`).
 *
 * **Fails loudly** on an element it has never seen inside a guide, by name, so a reformat surfaces as
 * a refused regen rather than a guide with a hole in it.
 */
import { parse } from "node-html-parser";

/** A heading that starts a leveling guide. Checked against every skill page's real outline. */
const GUIDE_HEADING = /level|progression|raising|skill(?:ing)? ?up/i;

/** Prose under a heading saying the server doesn't have it — "Velium is not currently available in
 *  Everquest Legends". Marks the whole subsection, which has nothing else to judge it by. */
const UNAVAILABLE = /not (?:currently |yet )?(?:available|in era)|out of era/i;

/** Elements that carry nothing a reader of the guide wants. `s`: struck-out advice is retracted. */
const SKIP = new Set(["style", "script", "figure", "img", "s", "del", "strike", "sup", "link", "meta"]);
const SKIP_CLASS = /\b(?:mw-editsection|hb|toc|thumb|reference|mw-empty-elt|right-float-era)\b/;

/** `Category:Velious Era` / `velious-era` → `velious`. The wiki's own era keys (`Template:PageEra`). */
export function eraKey(name) {
  return name.replace(/^Category:/i, "").replace(/[\s_-]*era$/i, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** The page's own era categories, as keys. */
export function pageEras(categories) {
  return [...new Set(categories.filter((c) => /\bera$/i.test(c.replace(/_/g, " "))).map(eraKey))];
}

/**
 * `Template:PageEra`'s switch → the era keys it currently has `in`. The `in` list, not the `out` one,
 * because the switch's `#default` is `out`: an era the template doesn't name is shut.
 */
export function inEras(templateText) {
  const keys = [];
  for (const m of templateText.matchAll(/^\|\s*([\w#]+)\s*=\s*(in|out)\s*$/gm)) {
    if (m[2] === "in" && m[1] !== "#default") keys.push(m[1]);
  }
  if (!keys.length) throw new Error("Template:PageEra lists no in-era keys — has its switch changed shape?");
  return [...new Set(keys)];
}

// ─── Inline runs ────────────────────────────────────────────────────────────────────────────────

function skipped(el) {
  return SKIP.has(el.rawTagName?.toLowerCase()) || SKIP_CLASS.test(el.getAttribute?.("class") ?? "");
}

/** An internal link's page title, or `null` for anything a reader can't open as a page here. */
function linkTitle(a) {
  const href = a.getAttribute("href") ?? "";
  const title = a.getAttribute("title") ?? "";
  if (!href.startsWith("/") || href.startsWith("/index.php") || /\bnew\b/.test(a.getAttribute("class") ?? "")) return null;
  if (/^(?:File|Category|Template|Special|User|Image):/i.test(title)) return null;
  return title || null;
}

/** The runs of one element, in order. Lists inside a cell read as a comma list. */
function runsOf(node, out = []) {
  if (node.nodeType === 3) {
    out.push(node.text);
    return out;
  }
  if (node.nodeType !== 1 || skipped(node)) return out;
  const tag = node.rawTagName.toLowerCase();
  const cls = node.getAttribute("class") ?? "";
  if (tag === "br") out.push(" ");
  else if (tag === "span" && /\bera\b/.test(cls)) {
    const key = /\b([\w]+)-era\b/.exec(cls)?.[1];
    if (key) out.push({ era: eraKey(key) });
  } else if (/\bhbdiv\b/.test(cls)) {
    const a = node.childNodes.find((c) => c.nodeType === 1 && c.rawTagName.toLowerCase() === "a");
    if (a) runsOf(a, out);
  } else if (tag === "a") {
    const title = linkTitle(node);
    const text = node.text.trim();
    if (title && text) out.push({ link: title, text });
    else if (text) out.push(text);
  } else if (tag === "li") {
    out.push(" ");
    for (const c of node.childNodes) runsOf(c, out);
    out.push(";");
  } else for (const c of node.childNodes) runsOf(c, out);
  return out;
}

/** Merge neighbouring text, fold whitespace, drop the separators a cell list leaves at its ends. */
function tidy(runs) {
  const out = [];
  for (const r of runs) {
    if (typeof r === "string" && typeof out.at(-1) === "string") out[out.length - 1] += r;
    else out.push(r);
  }
  const folded = out.map((r) => (typeof r === "string" ? r.replace(/\s+/g, " ") : r));
  if (typeof folded[0] === "string") folded[0] = folded[0].trimStart();
  const last = folded.length - 1;
  if (typeof folded[last] === "string") folded[last] = folded[last].replace(/[\s;]+$/, "");
  return folded.map((r) => (typeof r === "string" ? r.replace(/\s*;\s*;/g, ";").replace(/^;\s*/, "") : r)).filter((r) => r !== "");
}

const plain = (runs) => runs.map((r) => (typeof r === "string" ? r : r.text ?? "")).join("").trim();
const hasContent = (runs) => runs.some((r) => typeof r !== "string" || r.trim());

// ─── Blocks ─────────────────────────────────────────────────────────────────────────────────────

function listItems(list) {
  const items = [];
  for (const li of list.childNodes) {
    if (li.nodeType !== 1) continue;
    if (li.rawTagName.toLowerCase() !== "li") throw new Error(`a list holds a <${li.rawTagName}>, not an <li>`);
    const own = [];
    const children = [];
    for (const c of li.childNodes) {
      const tag = c.nodeType === 1 ? c.rawTagName.toLowerCase() : "";
      if (tag === "ul" || tag === "ol") children.push(...listItems(c));
      else runsOf(c, own);
    }
    const runs = tidy(own);
    if (!hasContent(runs) && !children.length) continue;
    items.push(children.length ? { runs, children } : { runs });
  }
  return items;
}

function tableBlock(table) {
  const rows = table.querySelectorAll("tr").filter((tr) => tr.closest("table") === table);
  let header = [];
  const body = [];
  for (const tr of rows) {
    const cells = tr.childNodes.filter((c) => c.nodeType === 1 && /^t[hd]$/i.test(c.rawTagName));
    if (!cells.length) continue;
    // The widest all-`th` row is the header: Fletching's tables put a one-cell caption row above it.
    if (cells.every((c) => c.rawTagName.toLowerCase() === "th")) {
      if (cells.length > header.length) header = cells.map((c) => plain(tidy(runsOf(c))));
      continue;
    }
    const row = cells.map((c) => tidy(runsOf(c)));
    if (row.some(hasContent)) body.push(row);
  }
  return body.length ? { kind: "table", header, rows: body } : null;
}

/**
 * A paragraph that is bold from end to end ("1 - 202 Skill", "Note for Tailors:") is the guide
 * labelling what follows, so it keeps its weight. Not made a heading: some of these are warnings
 * ("Velium is not currently available…") that belong to the heading above them.
 */
function allBold(el) {
  if (el.rawTagName.toLowerCase() === "b") return true;
  const kids = el.childNodes.filter((c) => !(c.nodeType === 3 && !c.text.trim()) && c.rawTagName?.toLowerCase() !== "br");
  return kids.length === 1 && kids[0].nodeType === 1 && /^(?:b|strong)$/i.test(kids[0].rawTagName);
}

/** One block-level element → zero or more blocks. `div`s are containers, never content. */
function blocksOf(el, out) {
  if (el.nodeType === 3) {
    const text = el.text.trim();
    if (text) out.push({ kind: "text", runs: [text] });
    return;
  }
  if (el.nodeType !== 1 || skipped(el) || el.getAttribute("id") === "toc") return;
  const tag = el.rawTagName.toLowerCase();
  if (tag === "p" || tag === "pre" || tag === "dt" || tag === "dd" || tag === "b" || tag === "i" || tag === "span" || tag === "a") {
    const runs = tidy(runsOf(el));
    if (hasContent(runs)) out.push(allBold(el) ? { kind: "text", runs, strong: true } : { kind: "text", runs });
  } else if (tag === "ul" || tag === "ol") {
    const items = listItems(el);
    if (items.length) out.push({ kind: "list", items });
  } else if (tag === "table") {
    const t = tableBlock(el);
    if (t) out.push(t);
  } else if (tag === "dl" || tag === "div" || tag === "center" || tag === "blockquote") {
    for (const c of el.childNodes) blocksOf(c, out);
  } else throw new Error(`a guide holds a <${tag}> this parser has never seen`);
}

/** The heading inside a `div.mw-heading` (or a bare `<hN>`), as `{ level, text, anchor }`. */
function headingOf(el) {
  if (el.nodeType !== 1) return null;
  const h = /^h([2-6])$/i.test(el.rawTagName) ? el : /\bmw-heading\b/.test(el.getAttribute("class") ?? "") ? el.querySelector("h2,h3,h4,h5,h6") : null;
  if (!h) return null;
  return { level: Number(h.rawTagName[1]), text: h.text.trim(), anchor: h.getAttribute("id") ?? "" };
}

/** Flag a subsection whose own prose says the server can't do it (see `UNAVAILABLE`). */
function markUnavailable(blocks) {
  let heading = null;
  for (const b of blocks) {
    if (b.kind === "heading") heading = b;
    else if (heading && !heading.unavailable && b.kind === "text") {
      const text = plain(b.runs);
      if (UNAVAILABLE.test(text)) heading.unavailable = text;
    }
  }
  return blocks;
}

/**
 * Every leveling-guide section on a page: a heading matching `GUIDE_HEADING` and everything under it
 * up to the next heading as high. A matching heading inside a guide already taken is part of it.
 */
export function parseGuides(html) {
  const root = parse(html);
  const top = (root.querySelector(".mw-parser-output") ?? root).childNodes;
  const guides = [];
  let current = null;
  for (const el of top) {
    const h = headingOf(el);
    if (h) {
      if (current && h.level <= current.level) current = null;
      if (!current && GUIDE_HEADING.test(h.text)) {
        current = { name: h.text, anchor: h.anchor, level: h.level, blocks: [] };
        guides.push(current);
      } else if (current) current.blocks.push({ kind: "heading", level: h.level - current.level, text: h.text, anchor: h.anchor });
      continue;
    }
    if (current) blocksOf(el, current.blocks);
  }
  return guides.map((g) => ({ name: g.name, anchor: g.anchor, blocks: markUnavailable(g.blocks) }));
}

/** Every page title a guide links — and every item a step was found to make — for the era lookup. */
export function linkedTitles(guides) {
  const titles = new Set();
  const visit = (runs) => runs.forEach((r) => typeof r === "object" && r.link && titles.add(r.link));
  const made = (list) => list?.forEach((t) => titles.add(t));
  const visitItems = (items) => items.forEach((i) => (visit(i.runs), made(i.makes), visitItems(i.children ?? [])));
  for (const g of guides) {
    for (const b of g.blocks) {
      if (b.kind === "text") visit(b.runs);
      else if (b.kind === "list") visitItems(b.items);
      else if (b.kind === "table") {
        b.rows.forEach((row) => row.forEach(visit));
        b.makes?.forEach(made);
      }
    }
  }
  return [...titles];
}

// ─── Prices ─────────────────────────────────────────────────────────────────────────────────────

/** A cost column — not a mana cost, a sell price or a profit, which are other questions. */
const COST_HEADER = /\b(?:cost|price)\b/i;
const NOT_A_PRICE = /mana|sell|profit/i;

/**
 * Every priced row on a skill page, anywhere on it, as `{ title, copper }` — the title being the
 * row's first link. Two table shapes carry prices: one number per coin column (Alchemy's "Reagent
 * Pricing": Plat | Gold | Silver | Copper), or one cost column ("Material Cost (pp)", "Cost (CP)",
 * "Cost to Make" with "0.08pp" in the cell). The unit rules are `wiki-price.ts`'s, passed in as
 * `price`, with one addition only a whole page can make: **a page that states one unit for its costs
 * uses it throughout.** Jewelcrafting writes "Material Cost (pp)" over its metals and a bare "Cost*"
 * over its crafted items; Fletching writes "(CP)" over three tables and a bare "Cost" over the fourth.
 * A page that states two different units, or none, leaves its bare numbers unread.
 */
export function priceRows(html, price) {
  const root = parse(html);
  const out = [];
  const declared = new Set(
    root
      .querySelectorAll("th")
      .map((th) => th.text.trim())
      .filter((h) => COST_HEADER.test(h) && !NOT_A_PRICE.test(h))
      .map((h) => price.headerUnit(h))
      .filter((u) => u !== undefined),
  );
  const pageUnit = declared.size === 1 ? [...declared][0] : undefined;
  for (const table of root.querySelectorAll("table")) {
    const rows = table.querySelectorAll("tr").filter((tr) => tr.closest("table") === table);
    let header = [];
    for (const tr of rows) {
      const ths = tr.childNodes.filter((c) => c.nodeType === 1 && /^th$/i.test(c.rawTagName));
      const tds = tr.childNodes.filter((c) => c.nodeType === 1 && /^td$/i.test(c.rawTagName));
      if (ths.length && !tds.length && ths.length > header.length) header = ths.map((h) => h.text.trim());
    }
    const coins = header.map((h, i) => [i, price.unitCopper(h)]).filter(([, u]) => u !== undefined);
    const cost = header.findIndex((h) => COST_HEADER.test(h) && !NOT_A_PRICE.test(h));
    if (!coins.length && cost < 0) continue;
    for (const tr of rows) {
      const tds = tr.childNodes.filter((c) => c.nodeType === 1 && /^td$/i.test(c.rawTagName));
      if (tds.length < 2) continue;
      const a = tr.querySelectorAll("a").find((x) => linkTitle(x) && x.closest("tr") === tr);
      const title = a && linkTitle(a);
      if (!title) continue;
      // A cell's own words, without the item tooltip a transcluded name drags in with it.
      const text = (i) => {
        const td = tds[i];
        if (!td) return "";
        td.querySelectorAll(".hb").forEach((h) => h.remove());
        return td.text.trim();
      };
      let copper = null;
      if (coins.length) {
        copper = 0;
        for (const [i, unit] of coins) {
          const n = Number(text(i));
          if (Number.isFinite(n)) copper += n * unit;
        }
        copper = Math.round(copper);
      } else copper = price.parsePriceCell(text(cost), price.headerUnit(header[cost]) ?? pageUnit);
      if (copper) out.push({ title, copper });
    }
  }
  return out;
}

/** An item page's `|notes = …` field, from its wikitext — where its price is written, when it is. */
export function notesField(wikitext) {
  const m = /^\|\s*notes\s*=([\s\S]*?)(?=^\|\s*\w+\s*=|^\}\})/m.exec(wikitext ?? "");
  return m ? m[1].trim() : undefined;
}
