import { useMemo } from "react";
import { useRead } from "@/lib/hooks";
import type { TravelSettings, TravelSurvey } from "@/shared/types";

/**
 * What the travel graph knows about the zone on screen — **only while you're navigating**.
 *
 * Asked for on the 🧭 panel being open rather than always, and that is the point rather than a saving:
 * the graph drawn over a map answers "should I believe this?", which is a question you are asking
 * while planning a trip and never while watching a camp. On at all times it would be one more layer
 * of clutter over the kills and the pins; on with the panel, it is the panel's own working.
 *
 * `null` while there's nothing to show — no source, no zone, panel shut, or a zone the graph has
 * nothing for.
 */
export function useTravelSurvey(
  open: boolean,
  sourceId: string,
  /** The zone the map is showing, as a name or a map file — resolved main-side like a route's ends. */
  zone: string,
  travel: TravelSettings | undefined,
): TravelSurvey | null {
  /**
   * Which networks count as usable, on their own. `settings` is replaced wholesale whenever anything
   * in it changes, so depending on the object would re-ask for the survey every time an unrelated
   * setting moved — the same trap the route panel documents.
   */
  const allowed = useMemo(
    () => ({ druid: travel?.druid, wizard: travel?.wizard, gnome: travel?.gnome, succor: travel?.succor }),
    [travel?.druid, travel?.wizard, travel?.gnome, travel?.succor],
  );

  return useRead(
    async (a) => {
      if (!open || !sourceId || !zone) return null;
      const result = await a.travel.survey(sourceId, zone, allowed);
      return result ?? null;
    },
    null,
    [open, sourceId, zone, allowed],
  );
}
