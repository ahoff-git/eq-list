"use client";
import { useState } from "react";
import { decodeWatches, encodeWatches } from "@/shared/watch-share";
import type { CastWatch } from "@/shared/types";

/**
 * Handing rules over: copy the lot as one line, or paste somebody else's.
 *
 * Deliberately plain. The interesting part is `watch-share.ts` — what travels, what's refused, and
 * that an import can never overwrite a rule you already have — so this is a text box, two buttons,
 * and an honest report of what came in. **Imported rules are added, never merged**: there is no
 * sensible way to reconcile a stranger's rule with one of yours, and an import that silently changed
 * a rule you were relying on would be the worst thing this feature could do.
 */
export default function WatchShare({
  watches,
  onImport,
}: {
  watches: CastWatch[];
  onImport: (added: CastWatch[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [said, setSaid] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const copyAll = () => {
    void navigator.clipboard?.writeText(encodeWatches(watches));
    setSaid(`Copied ${watches.length} rule${watches.length === 1 ? "" : "s"} to the clipboard.`);
    setErrors([]);
  };

  const paste = () => {
    const result = decodeWatches(text, () => crypto.randomUUID());
    setErrors(result.errors);
    if (!result.watches.length) {
      setSaid(null);
      return;
    }
    onImport(result.watches);
    setText("");
    setSaid(`Added ${result.watches.length} rule${result.watches.length === 1 ? "" : "s"}. They're at the bottom of the list.`);
  };

  return (
    <div className="watch-share">
      <button className="btn sm" onClick={() => setOpen(!open)} title="Share rules with somebody else, or take theirs">
        {open ? "▾" : "▸"} Import / export
      </button>
      {open && (
        <div className="ws-body">
          <span className="hint" style={{ display: "block", margin: "6px 0" }}>
            A rule is a line of text you can paste into chat. What travels is the rule itself — what it
            matches and when it speaks — never your colours, your screen position, or your saved styles.
            Imported rules are always <b>added</b>, with new ids, so nothing you already have can be
            overwritten.
          </span>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn sm" onClick={copyAll} disabled={!watches.length}>
              Copy all {watches.length} rules
            </button>
          </div>
          <textarea
            className="field"
            rows={3}
            style={{ marginTop: 6, fontFamily: "monospace", fontSize: 11 }}
            placeholder="Paste a rule here — EQLW1:… — then Import"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="row" style={{ gap: 8, marginTop: 4 }}>
            <button className="btn sm" onClick={paste} disabled={!text.trim()}>
              Import
            </button>
            {said && <span className="muted small">{said}</span>}
          </div>
          {errors.map((e) => (
            <div className="wc-issue warning" key={e}>
              ⚠ {e}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
