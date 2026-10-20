"use client";
import { useMemo, useState } from "react";
import SearchField from "@/app/components/SearchField";
import { segCls } from "@/app/components/ui";
import { parseAchievementsDump, type DumpAchievement } from "@/shared/game-export-dumps";
import { DumpBar, DumpSection, textMatches } from "./DumpParts";

type Show = "open" | "done" | "all";

const SHOWN: Record<Show, (a: DumpAchievement) => boolean> = {
  open: (a) => !a.complete,
  done: (a) => a.complete,
  all: () => true,
};

/**
 * An achievements dump: the game's own tree, by category, with each achievement's objectives and
 * the counts on the ones that count. Open-only by default — the done ones are a trophy shelf, the
 * open ones are a to-do list.
 */
export default function AchievementsDumpView({ text }: { text: string }) {
  const categories = useMemo(() => parseAchievementsDump(text), [text]);
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<Show>("open");
  const searching = query.trim().length > 0;

  const sections = categories
    .map((c) => ({
      ...c,
      done: c.achievements.filter((a) => a.complete).length,
      shown: c.achievements.filter(
        (a) => SHOWN[show](a) && textMatches(query, a.name, ...a.objectives.map((o) => o.text)),
      ),
    }))
    .filter((c) => c.shown.length > 0);

  return (
    <div className="dump-view">
      <div className="row wrap dump-toolbar">
        <SearchField value={query} onChange={setQuery} placeholder="Find an achievement…" />
        <div className="segmented">
          <button className={segCls(show === "open")} onClick={() => setShow("open")}>Open</button>
          <button className={segCls(show === "done")} onClick={() => setShow("done")}>Done</button>
          <button className={segCls(show === "all")} onClick={() => setShow("all")}>All</button>
        </div>
      </div>
      {!sections.length && <p className="muted">Nothing here matches.</p>}
      {sections.map((c) => (
        <DumpSection
          key={c.name}
          title={c.name}
          aside={
            <>
              <DumpBar fraction={c.achievements.length ? c.done / c.achievements.length : 0} />
              {c.done}/{c.achievements.length}
            </>
          }
          defaultOpen={false}
          forceOpen={searching}
        >
          {c.shown.map((a) => (
            <div key={a.name} className={`ach-dump ${a.complete ? "done" : ""}`}>
              <div className="ach-dump-name">
                {a.complete ? "✓" : "○"} {a.name}
              </div>
              <ul className="ach-dump-objectives">
                {a.objectives.map((o, n) => (
                  <li key={n} className={o.complete ? "done" : ""}>
                    <span>{o.complete ? "✓" : "○"} {o.text}</span>
                    {o.progress && (
                      <span className="ach-dump-progress">
                        <DumpBar fraction={o.progress.have / o.progress.need} />
                        {o.progress.have.toLocaleString()}/{o.progress.need.toLocaleString()}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </DumpSection>
      ))}
    </div>
  );
}
