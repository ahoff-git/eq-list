"use client";
import { api } from "@/lib/api";
import { addPage } from "@/lib/items/addToList";
import { showToast } from "@/lib/toast";
import { originKey } from "@/shared/items/grouping";
import { guidePath } from "@/shared/tradeskills/tradeskill-era";
import { stepMaterials, stepTitles, type StepLinks, type StepMaterial } from "@/shared/tradeskills/step-materials";
import type { StepEstimate } from "@/shared/tradeskills/step-cost";
import type { StepNeed, Tradeskill } from "@/shared/tradeskills/tradeskill-types";
import type { WikiPage } from "@/shared/types";

/**
 * A guide step's "+ List": file what it needs on the shopping list as a **recipe** named for the
 * step — so it groups under one heading, each row shows where to buy it the way every list row does,
 * and the group's runs control scales it by how many combines you mean to do.
 *
 * When the generator planned the step (`needs`), that plan is used, so the list holds exactly what
 * the estimate under the step shows, and the runs start at the estimate's floor: the fewest combines
 * the step can take. A step whose counts are a whole-step purchase ("Buy 3 File Mold") stays at one
 * run, since runs multiply every row in the group. A step the generator didn't plan reads its linked
 * pages now (cached in main, so usually free) and works its materials out the same way.
 */
export async function addStep(
  skill: Tradeskill,
  anchor: string,
  step: StepLinks,
  planned?: { needs?: StepNeed[]; estimate?: StepEstimate },
): Promise<void> {
  const a = api();
  if (!a) return;
  const materials: StepMaterial[] = planned?.needs?.length ? planned.needs : await readMaterials(step);
  const title = `${skill.name}: ${step.label}`;
  if (!materials.length) {
    showToast({ title: "Nothing to buy for this step", detail: "It names no ingredient the wiki has as an item.", key: `step:${title}`, tone: "info" });
    return;
  }
  const page: WikiPage = {
    kind: "recipe",
    title,
    wikiPath: guidePath(skill.title, anchor),
    sources: [],
    components: materials.map((m) => ({ name: m.name, qty: m.qty, wikiPath: guidePath(m.name) })),
    rewards: [],
    fetchedAt: new Date().toISOString(),
  };
  await addPage(page);
  const runs = planned?.estimate?.combines.low ?? 0;
  if (runs > 1 && !materials.some((m) => m.total)) await a.list.setRuns(originKey({ kind: "recipe", name: title }), runs);
}

async function readMaterials(step: StepLinks): Promise<StepMaterial[]> {
  const a = api();
  if (!a) return [];
  const pages = new Map<string, WikiPage | null>(
    await Promise.all(stepTitles(step).map(async (t) => [t, await a.wiki.getPage(t)] as const)),
  );
  return stepMaterials(step, pages);
}
