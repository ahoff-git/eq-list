"use client";
import { useFactionCauseKnowledge } from "@/lib/hooks";
import { mobKey } from "@/shared/mob/mob-stats";
import { count } from "@/shared/format";
import ItemLink from "@/app/components/items/ItemLink";
import { notAnItem } from "@/shared/shown-name";

/**
 * What killing this mob does to your standing — every faction a kill of it has moved, per kill, from
 * your hits pooled with peers' (ADR 0334). The Faction tab asks this by faction; a mob page asks it by
 * mob. Renders nothing until a kill of it has been tied to a faction hit.
 */
export default function MobFactionHits({ mob }: { mob: string }) {
  const key = mobKey(mob);
  // No refresh key: a page is opened to be read, and the read is fresh each time it opens.
  const causes = useFactionCauseKnowledge(undefined).filter((c) => c.kind === "kill" && mobKey(c.source) === key);
  if (!causes.length) return null;
  return (
    <>
      <h4 className="muted small" style={{ marginTop: 12 }}>
        Faction per kill
      </h4>
      <ul>
        {causes.map((c) => {
          const each = Math.round(c.net / c.hits);
          return (
            <li key={c.faction}>
              <ItemLink title={notAnItem(c.faction)} /> <span>{each > 0 ? `+${each}` : each}</span>{" "}
              <span className="muted small" title={c.myHits < c.hits ? `${c.myHits} of these were yours` : "All your own"}>
                from {count(c.hits, "hit")}
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
