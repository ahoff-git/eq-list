/**
 * parse.ts — turn an eqlwiki page's rendered HTML into a normalized WikiPage.
 * Node/main-only (uses node-html-parser). Kept free of I/O so it's a black box:
 * HTML string in, structured data out.
 *
 * Structure notes (from mapping real pages — see specs/awari-core):
 *  - Sections are flat <h2 id="..."> headings; content follows as sibling
 *    <p>/<ul>/<dl>/<table> until the next heading. An empty section wraps its
 *    title in <span class="esec"> — we skip those.
 *  - Item "Drops From": <p> zone link, then <ul> of mob links (no drop table).
 *  - Item "Sold by": table.eoTable3 (Zone | Merchant | Area | Loc).
 *  - Item "Player crafted": <dl><dd> "N x <item link> - <how>" recipe rows.
 *  - Quests: a vertical table.questTopTable (th label → td value), a Reward <ul>,
 *    and a Walkthrough with turn-in items as prose wikilinks; we treat a link as
 *    a turn-in only when preceded by a quantity ("hand in 4 Aviak Talons").
 *  - Tables use eoTable2/eoTable3, never `.wikitable`.
 */
import { parse, HTMLElement, type Node } from "node-html-parser";
import { WIKI_BASE } from "./api";
import type { WikiPage, ItemSource, WikiComponent, SourceKind, ItemCard } from "../../src/shared/types";

const ELEMENT_NODE = 1;

export function pathToTitle(path: string): string {
  const slug = path.replace(/^\//, "");
  try {
    return decodeURIComponent(slug).replace(/_/g, " ");
  } catch {
    return slug.replace(/_/g, " ");
  }
}

function isElement(n: Node): n is HTMLElement {
  return (n as { nodeType?: number }).nodeType === ELEMENT_NODE;
}

function childElements(node: HTMLElement): HTMLElement[] {
  return node.childNodes.filter(isElement);
}

/** The <h2>/<h3> for a child, whether bare or wrapped in a div.mw-heading. */
function headingOf(el: HTMLElement): HTMLElement | null {
  const tag = el.tagName;
  if (tag === "H2" || tag === "H3") return el;
  if (tag === "DIV" && /\bmw-heading\b/.test(el.getAttribute("class") ?? "")) {
    return el.querySelector("h2, h3");
  }
  return null;
}

interface Section {
  id: string;
  heading: string;
  empty: boolean;
  els: HTMLElement[];
}

/** Split content into sections keyed by heading id (MediaWiki headings are flat). */
function collectSections(content: HTMLElement): Section[] {
  const sections: Section[] = [];
  let cur: Section | null = null;
  for (const el of childElements(content)) {
    const h = headingOf(el);
    if (h) {
      cur = {
        id: h.getAttribute("id") ?? h.text.replace(/\W+/g, "_"),
        heading: h.text.replace(/\[edit.*?\]/gi, "").trim(),
        empty: !!h.querySelector("span.esec"),
        els: [],
      };
      sections.push(cur);
    } else if (cur) {
      cur.els.push(el);
    }
  }
  return sections;
}

function findSection(sections: Section[], id: string): Section | undefined {
  const s = sections.find((x) => x.id === id);
  return s && !s.empty ? s : undefined;
}

function linkPath(a: HTMLElement): string | undefined {
  const href = a.getAttribute("href") ?? "";
  return href.startsWith("/") && !href.startsWith("/index.php") ? href : undefined;
}

const NON_ITEM_PREFIX = /^\/(Category|File|Special|Template|Help|Talk):/i;
function isContentLink(a: HTMLElement): boolean {
  const p = linkPath(a);
  return !!p && !NON_ITEM_PREFIX.test(p);
}

/**
 * The canonical item name for a link: the page title from its href, not the
 * visible text. So a plural mention like "giant rat ears" that links to
 * /Giant_Rat_Ear yields "Giant Rat Ear" — which is what loot lines say, so the
 * shopping-list entry actually matches. Falls back to the text if there's no href.
 */
function linkName(a: HTMLElement): string {
  const p = linkPath(a);
  return p ? pathToTitle(p) : a.text.trim();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Item sections ──────────────────────────────────────────────────────────

/** "Drops From": alternating zone <p> and <ul> of mobs → one source per mob. */
function parseDropsFrom(section: Section): ItemSource[] {
  const sources: ItemSource[] = [];
  let zone = "";
  for (const el of section.els) {
    if (el.tagName === "P") {
      const a = el.querySelector("a");
      zone = (a?.text ?? el.text).trim();
    } else if (el.tagName === "UL") {
      for (const li of el.querySelectorAll("li")) {
        const a = li.querySelector("a");
        const mob = (a?.text ?? li.text).trim();
        if (mob) sources.push({ kind: "drop", where: mob, detail: zone || undefined });
      }
    }
  }
  return sources;
}

/** "Sold by": table.eoTable3 with Zone | Merchant | Area | Loc columns. */
function parseSoldBy(section: Section): ItemSource[] {
  const table = section.els.find((e) => e.tagName === "TABLE") ?? section.els[0]?.querySelector("table");
  if (!table) return [];
  const rows = table.querySelectorAll("tr");
  const sources: ItemSource[] = [];
  for (const row of rows) {
    const cells = row.querySelectorAll("td");
    if (cells.length < 2) continue; // header row has th, not td
    const zone = cells[0].text.trim();
    const merchant = cells[1].text.trim();
    if (merchant) sources.push({ kind: "vendor", where: merchant, detail: zone || undefined });
  }
  return sources;
}

/** A <ul> of links → sources of a given kind (Related quests, Tradeskill recipes). */
function parseLinkList(section: Section, kind: SourceKind): ItemSource[] {
  const sources: ItemSource[] = [];
  for (const el of section.els) {
    if (el.tagName !== "UL") continue;
    for (const li of el.querySelectorAll("li")) {
      const a = li.querySelector("a");
      const name = (a?.text ?? li.text).trim();
      if (name) sources.push({ kind, where: name });
    }
  }
  return sources;
}

/** "Player crafted": <dl><dd> rows "N x <item> - <how>" → recipe components. */
function parseComponents(section: Section): WikiComponent[] {
  const comps: WikiComponent[] = [];
  for (const el of section.els) {
    for (const dd of el.querySelectorAll("dd")) {
      const a = dd.querySelector("a");
      if (!a || !isContentLink(a)) continue;
      const qtyM = dd.text.match(/(\d+)\s*x\b/i);
      comps.push({
        name: linkName(a),
        qty: qtyM ? parseInt(qtyM[1], 10) : 1,
        wikiPath: linkPath(a),
      });
    }
  }
  return comps;
}

// ─── Quest sections ─────────────────────────────────────────────────────────

/** questTopTable: vertical th→td key/value rows → sources (giver, zone). */
function parseQuestInfo(content: HTMLElement): ItemSource[] {
  const table = content.querySelector("table.questTopTable");
  if (!table) return [];
  const out: ItemSource[] = [];
  for (const row of table.querySelectorAll("tr")) {
    const th = row.querySelector("th");
    const td = row.querySelector("td");
    if (!th || !td) continue;
    const label = th.text.replace(/\s+/g, " ").replace(/:\s*$/, "").trim().toLowerCase();
    const value = td.text.replace(/\s+/g, " ").trim();
    if (!value) continue;
    if (label.includes("quest giver")) out.push({ kind: "quest", where: value, detail: "Quest giver" });
    else if (label.includes("start zone")) out.push({ kind: "quest", where: value, detail: "Start zone" });
  }
  return out;
}

/** Reward <ul> → plain reward strings. */
function parseRewards(section: Section | undefined): string[] {
  if (!section) return [];
  const rewards: string[] = [];
  for (const el of section.els) {
    if (el.tagName !== "UL") continue;
    for (const li of el.querySelectorAll("li")) {
      const t = li.text.replace(/\s+/g, " ").trim();
      if (t) rewards.push(t);
    }
  }
  return rewards;
}

/**
 * Turn-in items from the Walkthrough prose. Heuristic: a link counts only when a
 * quantity precedes it in the text ("hand in 4 Aviak Talons"), which filters out
 * NPC/zone/faction links. Quantity-less mentions are intentionally dropped — the
 * user can still add items by hand.
 */
function parseWalkthroughTurnIns(section: Section | undefined): WikiComponent[] {
  if (!section) return [];
  const text = section.els.map((e) => e.text).join(" ").replace(/\s+/g, " ");
  const seen = new Map<string, WikiComponent>();
  for (const el of section.els) {
    for (const a of el.querySelectorAll("a")) {
      if (!isContentLink(a)) continue;
      const display = a.text.trim().replace(/\s+/g, " "); // as written in the prose (may be plural)
      const name = linkName(a); // canonical page title (what loot lines say)
      if (!display || !name || seen.has(name)) continue;
      // Detect the quantity next to the mention as it appears in the prose.
      const m = text.match(new RegExp(`(\\d+)\\s+${escapeRe(display)}`, "i"));
      if (m) seen.set(name, { name, qty: parseInt(m[1], 10), wikiPath: linkPath(a) });
    }
  }
  return [...seen.values()];
}

// ─── Mob / NPC sections ───────────────────────────────────────────────────────

/**
 * "Known Loot" on a mob/NPC page: the h2#Known_Loot is followed by a <ul> whose
 * <li>s each start with the dropped item as `div.hbdiv > a`. The list is nested in
 * a wrapper div (not a flat section child), so find the heading and take the next
 * <ul> directly. The embedded tooltip after each link also has anchors, so take
 * the first anchor in `.hbdiv` specifically.
 */
function parseMobLoot(content: HTMLElement): WikiComponent[] {
  const heading = content.querySelector("#Known_Loot");
  if (!heading) return [];
  let list: HTMLElement | null = null;
  for (let el = heading.nextElementSibling; el; el = el.nextElementSibling) {
    if (el.tagName === "UL") {
      list = el;
      break;
    }
  }
  if (!list) list = (heading.parentNode as HTMLElement | undefined)?.querySelector("ul") ?? null;
  if (!list) return [];

  const seen = new Map<string, WikiComponent>();
  for (const li of list.querySelectorAll("li")) {
    const a = li.querySelector(".hbdiv a") ?? li.querySelector("a");
    if (!a || !isContentLink(a)) continue;
    const name = linkName(a);
    if (name && !seen.has(name)) seen.set(name, { name, qty: 1, wikiPath: linkPath(a) });
  }
  return [...seen.values()];
}

// ─── Item stat card (the wiki's hover tooltip) ──────────────────────────────────

/** True if `el` sits inside a `.hb` tooltip span (i.e. an embedded item card, not the page's own). */
function isInsideHb(el: HTMLElement): boolean {
  for (let p = el.parentNode as HTMLElement | null; p; p = p.parentNode as HTMLElement | null) {
    if (/(^|\s)hb(\s|$)/.test(p.getAttribute?.("class") ?? "")) return true;
  }
  return false;
}

function decodeEntities(s: string): string {
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
 * The item's own stat card — the `.itemtopbg`(title) + `.itemdata`(stats) block the
 * wiki shows on hover. Only the page's OWN card counts, so we skip any block nested
 * in a `.hb` tooltip (mob loot / quest prose embed other items' cards that way).
 * Text lines come from the `.itemdata` (its icon figure carries no text, so a plain
 * tag-strip is enough); the icon `src` is absolutized against the wiki.
 */
function parseItemCard(content: HTMLElement): ItemCard | undefined {
  const titleEl = content.querySelectorAll(".itemtitle").find((e) => !isInsideHb(e));
  const dataEl = content.querySelectorAll(".itemdata").find((e) => !isInsideHb(e));
  if (!titleEl || !dataEl) return undefined;
  const title = titleEl.text.trim();
  if (!title) return undefined;

  const iconSrc = dataEl.querySelector(".itemicon img")?.getAttribute("src");
  const icon = iconSrc ? (iconSrc.startsWith("http") ? iconSrc : `${WIKI_BASE}${iconSrc}`) : undefined;

  const text = decodeEntities(
    dataEl.innerHTML
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/?p[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  );
  const lines = text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (!lines.length) return undefined;

  return { title, icon, lines };
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export function parseWikiPage(title: string, wikiPath: string, html: string): WikiPage {
  const root = parse(html);
  const content = root.querySelector(".mw-parser-output") ?? root;
  const sections = collectSections(content);
  const fetchedAt = new Date().toISOString();

  // Classify by the container class unique to each page type. NB: itemtopbg /
  // itemdata appear on EVERY type (embedded item tooltips), so item is the
  // fallback only — never key page type off those.
  if (content.querySelector(".mobStatsBox, .eql-mobpage-stats")) {
    return {
      kind: "mob",
      title,
      wikiPath,
      sources: [],
      components: parseMobLoot(content),
      rewards: [],
      fetchedAt,
    };
  }

  if (content.querySelector("table.questTopTable")) {
    const walkthrough = sections.find((s) => /walkthrough/i.test(s.id) || /walkthrough/i.test(s.heading));
    const reward = sections.find((s) => /reward/i.test(s.id) || /reward/i.test(s.heading));
    return {
      kind: "quest",
      title,
      wikiPath,
      sources: parseQuestInfo(content),
      components: parseWalkthroughTurnIns(walkthrough),
      rewards: parseRewards(reward),
      fetchedAt,
    };
  }

  if (content.querySelector("table.zoneTopTable")) {
    return { kind: "zone", title, wikiPath, sources: [], components: [], rewards: [], fetchedAt };
  }

  // Item page (fallback — also covers player-craftable items, which carry a recipe).
  const sources: ItemSource[] = [];
  const drops = findSection(sections, "Drops_From");
  if (drops) sources.push(...parseDropsFrom(drops));
  const sold = findSection(sections, "Sold_by");
  if (sold) sources.push(...parseSoldBy(sold));
  const relatedQuests = findSection(sections, "Related_quests");
  if (relatedQuests) sources.push(...parseLinkList(relatedQuests, "quest"));
  const tradeskill = findSection(sections, "Tradeskill_recipes");
  if (tradeskill) sources.push(...parseLinkList(tradeskill, "recipe"));

  const crafted = findSection(sections, "Player_crafted");
  const components = crafted ? parseComponents(crafted) : [];
  if (components.length) sources.push({ kind: "recipe", where: "Player crafted" });

  const kind = components.length && !sources.some((s) => s.kind === "drop" || s.kind === "vendor")
    ? "recipe"
    : "item";

  return { kind, title, wikiPath, sources, components, rewards: [], card: parseItemCard(content), fetchedAt };
}
