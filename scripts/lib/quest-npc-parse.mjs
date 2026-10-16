/**
 * quest-npc-parse.mjs — read a quest's NPCs, where each one stands, and what the quest has you do there.
 *
 * Three reads, all off pages eqlwiki writes the same way every time:
 *
 *   - **who** — the quest page's top table names them in its `Related NPCs:` row.
 *   - **where** — each NPC's own page states `| zone = …` and `| location = (y, x)` in its infobox
 *     template (MerchantPage, Namedmobpage, …), plus a `| description =` that often says how to reach them.
 *   - **why** — the quest's checklist bullets that link the NPC ("Give [[Coin of Tash]] to
 *     [[Tarn Visilin]] … to receive the [[Glowing Coin of Tash]]").
 *
 * Pure: wikitext in, values out.
 */
import { parseLoc, plainText } from "./pickup-table-parse.mjs";

/** `[[Target|Text]]` → every target, in order. */
function linkTargets(text) {
  return [...text.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)].map((m) => m[1].trim());
}

/** The NPCs a quest page's top table names in its `Related NPCs:` row. */
export function relatedNpcs(questWikitext) {
  const m = /Related NPCs:[^\n]*\n\s*\|\s*([^\n]*)/i.exec(questWikitext);
  return m ? linkTargets(m[1]) : [];
}

/** One `| key = value` infobox parameter, which may run over several lines until the next one. */
function infoboxParam(wikitext, key) {
  const m = new RegExp(`^\\|\\s*${key}\\s*=([\\s\\S]*?)(?=^\\||^\\}\\})`, "mi").exec(wikitext);
  return m ? m[1].trim() : "";
}

/** A stated location's first `( … )` group, so trailing words ("2nd floor") never read as a z. */
const LOC_GROUP = /\(([^()]*\d[^()]*)\)/;

/** The zone an NPC's page names, even when it gives no spot — for a reader that can place them otherwise. */
export function npcZone(npcWikitext) {
  return plainText(infoboxParam(npcWikitext, "zone")) || undefined;
}

/**
 * Where an NPC's page says it stands: `{ zone, loc, note }`, or `undefined` if it states no zone or
 * no two-number location. `note` is the page's description plus anything the location adds in words.
 */
export function npcPlace(npcWikitext) {
  const zone = plainText(infoboxParam(npcWikitext, "zone"));
  const locText = infoboxParam(npcWikitext, "location");
  const group = LOC_GROUP.exec(locText);
  const loc = parseLoc(group ? group[1] : locText);
  if (!zone || !loc) return undefined;
  const aside = plainText(group ? locText.replace(group[0], "") : "").replace(/^[,;\s]+/, "");
  const description = plainText(infoboxParam(npcWikitext, "description"));
  const note = [aside && `${aside[0].toUpperCase()}${aside.slice(1)}.`, /^description needed\.?$/i.test(description) ? "" : description]
    .filter(Boolean)
    .join(" ");
  return { zone, loc, note };
}

/** The quest's top-level checklist bullets (`* …`, not `** …`) that link `npc`, as plain text. */
export function checklistStepsFor(questWikitext, npc) {
  const key = npc.toLowerCase();
  return questWikitext
    .split("\n")
    .filter((line) => /^\*(?!\*)/.test(line.trim()))
    .filter((line) => linkTargets(line).some((t) => t.toLowerCase() === key))
    .map((line) => plainText(line.trim().slice(1)));
}
