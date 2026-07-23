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
import type { WikiPage, ItemSource, WikiComponent, SourceKind, ItemCard, WikiReward } from "../../src/shared/types";

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

// questTopTable rows (besides giver/start-zone, which become sources) worth showing on
// the quest as a card — "Minimum Level"/"Classes" answer "can my character do this?",
// and Related NPCs/Zones give context. Matched as lowercased substrings of the label.
const QUEST_CARD_LABELS = ["level", "class", "race", "faction", "related npc", "related zone"];

/**
 * Parse the vertical questTopTable once (th→td key/value rows) into both the giver/zone
 * **sources** and an info **card** (level / classes / related NPCs & zones). One walk so
 * the label handling lives in a single place.
 */
function parseQuestInfo(content: HTMLElement, title: string): { sources: ItemSource[]; card?: ItemCard } {
  const table = content.querySelector("table.questTopTable");
  if (!table) return { sources: [] };
  const sources: ItemSource[] = [];
  const lines: string[] = [];
  for (const row of table.querySelectorAll("tr")) {
    const th = row.querySelector("th");
    const td = row.querySelector("td");
    if (!th || !td) continue;
    const rawLabel = th.text.replace(/\s+/g, " ").replace(/:\s*$/, "").trim();
    const label = rawLabel.toLowerCase();
    const value = td.text.replace(/\s+/g, " ").trim();
    if (!value) continue;
    if (label.includes("quest giver")) sources.push({ kind: "quest", where: value, detail: "Quest giver" });
    else if (label.includes("start zone")) sources.push({ kind: "quest", where: value, detail: "Start zone" });
    else if (QUEST_CARD_LABELS.some((l) => label.includes(l))) lines.push(`${rawLabel}: ${value}`);
  }
  return { sources, card: lines.length ? { title, lines } : undefined };
}

/**
 * Reward <ul> → reward lines. When a line IS a single linked item (its whole text is
 * one content link, e.g. a reward weapon), we tag it with the item name/path so the
 * UI can make it hover/open like a list item. Faction/coin/XP lines stay plain text.
 */
function parseRewards(section: Section | undefined): WikiReward[] {
  if (!section) return [];
  const rewards: WikiReward[] = [];
  for (const el of section.els) {
    if (el.tagName !== "UL") continue;
    for (const li of el.querySelectorAll("li")) {
      // Item rewards render as `.hbdiv > a` with an embedded `.hb` stat tooltip, so
      // `li.text` is the name PLUS the whole stat dump. Take the anchor for both the
      // display text and the identity, ignoring the tooltip. (Same shape as mob loot.)
      const hb = li.querySelector(".hbdiv a");
      if (hb && isContentLink(hb)) {
        const name = hb.text.replace(/\s+/g, " ").trim();
        if (name) rewards.push({ text: name, item: linkName(hb), wikiPath: linkPath(hb) });
        continue;
      }
      const text = li.text.replace(/\s+/g, " ").trim();
      if (!text) continue;
      // Plain line: tag it as an item only when the whole line is one content link.
      const a = li.querySelector("a");
      const wholeLineIsLink = !!a && isContentLink(a) && a.text.replace(/\s+/g, " ").trim() === text;
      rewards.push(wholeLineIsLink ? { text, item: linkName(a!), wikiPath: linkPath(a!) } : { text });
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

/** The `.mw-heading` wrapper of a heading, when present, else the heading itself. */
function headingBlock(h: HTMLElement): HTMLElement {
  const parent = h.parentNode as HTMLElement | null;
  if (parent && parent.tagName === "DIV" && /\bmw-heading\b/.test(parent.getAttribute("class") ?? "")) return parent;
  return h;
}

/** The smallest percentage in a string ("1x 100% (33%)" → "33%"), or undefined. */
function lowestPercent(s: string): string | undefined {
  const nums = [...s.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) => parseFloat(m[1]));
  return nums.length ? `${Math.min(...nums)}%` : undefined;
}

/** One loot `<li>` → a component (dropped item + its drop rate), added to `seen`. */
function addLootItem(li: HTMLElement, seen: Map<string, WikiComponent>): void {
  const a = li.querySelector(".hbdiv a") ?? li.querySelector("a");
  if (!a || !isContentLink(a)) return;
  const name = linkName(a);
  if (!name || seen.has(name)) return;
  // Drop rate is a **percentage**, and templates vary on where they put it:
  //   `.drare` ("(17.3%)")  ·  `.ddb` drop-data box ("[1] 1x 25% (50%)"). A `.ddb`
  //   line has two figures (per-slot vs overall); the **lower** is the real drop
  //   chance ("1x 100% (33%)" → 33%), so take the minimum percentage. Fall back to a
  //   trailing "(X%) (low% - high%)". Rarity WORDS ("Rare"/"Always") are ignored.
  const drare = li.querySelector(".drare")?.text ?? "";
  const ddb = li.querySelector(".ddb")?.text ?? "";
  const src = /%/.test(drare) ? drare : ddb;
  let dropRate = lowestPercent(src);
  if (!dropRate) {
    const m = li.text.match(/\((\d+(?:\.\d+)?)%\)\s*\(\s*\d+(?:\.\d+)?%\s*-\s*\d+(?:\.\d+)?%\s*\)/);
    if (m) dropRate = `${m[1]}%`;
  }
  seen.set(name, { name, qty: 1, wikiPath: linkPath(a), dropRate });
}

/**
 * Loot on a mob/NPC page. Mobs use several loot sections — "Known Loot" plus
 * "Common Loot" / "Unique Loot" (which carry drop percentages) — under `<h2>`s whose
 * id/text contains "Loot". For each, we walk from the heading (through its
 * `.mw-heading` wrapper, and whatever wrapper div the list is nested in) collecting
 * `<ul>`s until the next section, and read each `<li>`'s `.hbdiv > a` item + drop rate.
 */
function parseMobLoot(content: HTMLElement): WikiComponent[] {
  const seen = new Map<string, WikiComponent>();
  const headings = content
    .querySelectorAll("h2, h3")
    .filter((h) => /loot/i.test(h.getAttribute("id") ?? "") || /loot/i.test(h.text));
  for (const h of headings) {
    for (let el = headingBlock(h).nextElementSibling; el; el = el.nextElementSibling) {
      if (headingOf(el)) break; // reached the next section
      const uls = el.tagName === "UL" ? [el] : el.querySelectorAll("ul");
      for (const ul of uls) for (const li of ul.querySelectorAll("li")) addLootItem(li, seen);
    }
  }
  return [...seen.values()];
}

/**
 * Faction impact from a mob page's "Factions" / "Opposing Factions" sections → card
 * lines, so the card shows what killing this mob helps/hurts. Each is a `<ul>` of
 * `<li>faction (±N)</li>` following the heading; a lone "None" carries no info, so it's
 * skipped (and the line dropped entirely when nothing's left).
 */
function parseMobFactions(content: HTMLElement): string[] {
  const listAfter = (id: string): string => {
    const h = content.querySelectorAll("h2, h3").find((x) => x.getAttribute("id") === id);
    if (!h) return "";
    for (let el = headingBlock(h).nextElementSibling; el && !headingOf(el); el = el.nextElementSibling) {
      const ul = el.tagName === "UL" ? el : el.querySelector("ul");
      if (!ul) continue;
      return ul
        .querySelectorAll("li")
        .map((li) => li.text.replace(/\s+/g, " ").trim())
        .filter((t) => t && !/^none$/i.test(t))
        .join(", ");
    }
    return "";
  };
  const lines: string[] = [];
  const factions = listAfter("Factions");
  if (factions) lines.push(`Factions: ${factions}`);
  const opposing = listAfter("Opposing_Factions");
  if (opposing) lines.push(`Opposing factions: ${opposing}`);
  return lines;
}

/**
 * A mob/NPC's stat card from its `.mobStatsBox`/`.eql-mobpage-stats` table — the
 * location (Spawn Zone / Location) plus Level/Race/Class/HP/Special — followed by its
 * faction impact. Reuses the ItemCard shape so it renders inline and on hover like
 * items/spells. Stat rows are already "Label: value" text; we keep those and drop the
 * bare section headers.
 */
function parseMobCard(content: HTMLElement, title: string): ItemCard | undefined {
  const box = content.querySelector(".mobStatsBox, .eql-mobpage-stats");
  if (!box) return undefined;

  const iconSrc = content.querySelector(".eql-mobpage-image img, .eql-mobpage-media img")?.getAttribute("src");
  const icon = iconSrc ? (iconSrc.startsWith("http") ? iconSrc : `${WIKI_BASE}${iconSrc}`) : undefined;

  const lines: string[] = [];
  for (const tr of box.querySelectorAll("tr")) {
    const text = tr
      .querySelectorAll("th, td")
      .map((c) => c.text.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join(" ");
    if (text.includes(":")) lines.push(text); // keep "Label: value" rows, drop section headers
  }
  lines.push(...parseMobFactions(content));

  if (!lines.length && !icon) return undefined;
  return { title, icon, lines };
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

// ─── Spell card ─────────────────────────────────────────────────────────────

/** Flatten a spell detail/slot table into readable lines ("Mana: 7", effect text). */
function spellTableLines(table: HTMLElement): string[] {
  const out: string[] = [];
  for (const tr of table.querySelectorAll("tr")) {
    const cells = tr.querySelectorAll("th, td").map((c) => c.text.replace(/\s+/g, " ").trim());
    for (let i = 0; i < cells.length; i += 2) {
      const label = cells[i];
      const value = cells[i + 1];
      if (value === undefined) {
        if (label) out.push(label);
      } else if (/^\d+\W*$/.test(label)) {
        if (value) out.push(value); // a slot number ("1", "1 :") → keep just the effect text
      } else if (label && value) {
        out.push(`${label}: ${value}`);
      } else if (label || value) {
        out.push(label || value);
      }
    }
  }
  return out;
}

/**
 * A spell's summary card (description + classes/levels + effects + casting details),
 * reusing the ItemCard shape so spells hover and render like items. Keyed off the
 * `.eql-spellpage` layout (not the standard item sections).
 */
function parseSpellCard(content: HTMLElement, title: string): ItemCard | undefined {
  const root = content.querySelector(".eql-spellpage");
  if (!root) return undefined;

  const iconSrc = content.querySelector(".eql-spellpage-icon img")?.getAttribute("src");
  const icon = iconSrc ? (iconSrc.startsWith("http") ? iconSrc : `${WIKI_BASE}${iconSrc}`) : undefined;

  const lines: string[] = [];
  const summary = content.querySelector(".eql-spellpage-summary-text");
  if (summary) {
    const desc = summary.text.replace(/\s+/g, " ").replace(/^\s*Overview\s*/i, "").trim();
    if (desc) lines.push(desc);
  }
  const classes = content.querySelector(".eql-spellpage-classes");
  if (classes) {
    const items = classes.querySelectorAll("li").map((li) => li.text.replace(/\s+/g, " ").trim()).filter(Boolean);
    const text = items.length ? items.join(", ") : classes.text.replace(/\s+/g, " ").replace(/^\s*Classes\s*/i, "").trim();
    if (text) lines.push(`Classes: ${text}`);
  }
  for (const table of content.querySelectorAll(".eql-spellpage-slot-table, .eql-spellpage-detail-table")) {
    lines.push(...spellTableLines(table));
  }

  if (!lines.length && !icon) return undefined;
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
      card: parseMobCard(content, title),
      fetchedAt,
    };
  }

  if (content.querySelector("table.questTopTable")) {
    const walkthrough = sections.find((s) => /walkthrough/i.test(s.id) || /walkthrough/i.test(s.heading));
    const reward = sections.find((s) => /reward/i.test(s.id) || /reward/i.test(s.heading));
    const { sources, card } = parseQuestInfo(content, title);
    return {
      kind: "quest",
      title,
      wikiPath,
      sources,
      components: parseWalkthroughTurnIns(walkthrough),
      rewards: parseRewards(reward),
      card,
      fetchedAt,
    };
  }

  if (content.querySelector("table.zoneTopTable")) {
    return { kind: "zone", title, wikiPath, sources: [], components: [], rewards: [], fetchedAt };
  }

  // Spell pages use their own container; without this they'd fall through to "item".
  if (content.querySelector(".eql-spellpage, .spellStatsBox")) {
    return {
      kind: "spell",
      title,
      wikiPath,
      sources: [],
      components: [],
      rewards: [],
      card: parseSpellCard(content, title),
      fetchedAt,
    };
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
