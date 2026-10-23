"use client";
import type { WikiComponent } from "@/shared/types";
import MobKills from "@/app/components/mob/MobKills";
import MobRespawns from "@/app/components/mob/MobRespawns";
import NpcSightings from "@/app/components/mob/NpcSightings";
import MobFactionHits from "@/app/components/mob/MobFactionHits";

/**
 * Everything your own log knows about one mob or NPC, in one place: your kills and their drops, how
 * long it takes to come back, where you've stood next to it, and what killing it does to your faction
 * (ADR 0334).
 *
 * The same block under a wiki mob page and on a page built from your log alone, so a mob the wiki
 * hasn't written up yet reads like one it has — minus the wiki's half. Each part renders nothing when
 * there's nothing to say.
 */
export default function MobEvidence({
  mob,
  components = NO_COMPONENTS,
  onWiki = true,
}: {
  mob: string;
  /** The wiki page's loot list, so "Copy for wiki" can say what it doesn't list yet. */
  components?: WikiComponent[];
  onWiki?: boolean;
}) {
  return (
    <>
      <MobKills mob={mob} components={components} onWiki={onWiki} />
      <MobRespawns mob={mob} />
      <NpcSightings name={mob} />
      <MobFactionHits mob={mob} />
    </>
  );
}

/** A stable empty list — no wiki page, so no wiki loot. */
const NO_COMPONENTS: WikiComponent[] = [];
