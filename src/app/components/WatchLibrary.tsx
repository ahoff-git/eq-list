"use client";
import { useState } from "react";
import { summarizeWatch } from "@/shared/watch-summary";
import { isAdded, WATCH_LIBRARY, type LibraryRule } from "@/shared/watch-library";
import type { CastWatch } from "@/shared/types";

/**
 * The library: whole rules to add and then take apart.
 *
 * Each card shows the rule's own **summary chips** — the same ones its row will show once it's
 * added — so what you're getting is legible before you take it. That's the reuse doing real work:
 * "8m ×1, 1 condition" means the same thing here as it does on the list, so the library teaches the
 * vocabulary of the rows at the same time as it hands over a rule.
 *
 * A rule that needs one of the player's own words says so on the card and, once added, is opened
 * straight away — a preset that looks finished and matches nothing is the failure to avoid.
 */
export default function WatchLibrary({
  watches,
  onAdd,
}: {
  watches: CastWatch[];
  /** Add it, and say whether the adder should open it for editing (a rule with a blank to fill). */
  onAdd: (rule: LibraryRule) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="watch-library">
      <button className="btn sm" onClick={() => setOpen(!open)} title="Ready-made rules, with the reasoning attached">
        {open ? "▾" : "▸"} Library
      </button>
      {open && (
        <div className="wl-body">
          <span className="hint" style={{ display: "block", margin: "6px 0" }}>
            Whole rules, ready to add — and worth opening afterwards to see how they&apos;re built. Several
            exist mainly to show a mechanism: the mez reminder is a delay with something to cancel it, the
            invite rule is one rule matching two sentences that share no words.
          </span>
          {WATCH_LIBRARY.map((group) => (
            <div className="wl-group" key={group.category}>
              <div className="wl-cat">{group.category}</div>
              {group.note && <span className="hint">{group.note}</span>}
              {group.rules.map((rule) => {
                const added = isAdded(watches, rule);
                const summary = summarizeWatch({ id: rule.id, enabled: true, ...rule.watch });
                return (
                  <div className="wl-rule" key={rule.id}>
                    <div className="row" style={{ gap: 6, alignItems: "baseline" }}>
                      <button className="btn sm ghost" disabled={added} onClick={() => onAdd(rule)}>
                        {added ? "✓ added" : "+ add"}
                      </button>
                      <b className="small">{rule.name}</b>
                      <span className="chip">{summary.prompts}</span>
                      {summary.conditions && <span className="chip">{summary.conditions}</span>}
                      {summary.timing && <span className="chip when">{summary.timing}</span>}
                    </div>
                    <div className="hint wl-what">{rule.what}</div>
                    {rule.fill && <div className="hint wl-fill">✎ {rule.fill}</div>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
