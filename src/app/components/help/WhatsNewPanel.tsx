"use client";
import { useEffect, useState } from "react";
import { Caret } from "@/app/components/ui";
import type { Releases } from "@/lib/releases/useReleases";
import { CHANGELOG } from "@/shared/releases/changelog";
import { HISTORY } from "@/shared/releases/history";
import { periodText, type Change, type ChangeKind } from "@/shared/releases/release-notes";

const KIND_LABEL: Record<ChangeKind, string> = { new: "New", better: "Better", fixed: "Fixed" };

/**
 * The release notes: what is new since you last looked, on top and open, then every release before it, then
 * the app's history from before release notes began. The history is always here — the banner is only the
 * announcement.
 *
 * Opening the panel is being shown the notes (`answer`), whichever way you got here: the banner's button,
 * the tab, a link from Settings. What counts as new is held at launch (`seenAtLaunch`), so the "new" marks
 * are still there after the banner has gone.
 */
export default function WhatsNewPanel({ releases, onGuide }: { releases: Releases; onGuide: (guideId: string) => void }) {
  const { fresh, seenAtLaunch, current, answer } = releases;
  useEffect(() => answer(), [answer]);

  const freshLines = new Set(fresh.map((n) => n.line));
  const earlier = CHANGELOG.filter((n) => !freshLines.has(n.line));
  // Nothing new to lead with (an up-to-date install, or the web build): the newest release opens, the rest wait.
  const opening = fresh.length ? freshLines : new Set(earlier.slice(0, 1).map((n) => n.line));
  const [open, setOpen] = useState<ReadonlySet<string>>(opening);
  // The notes arrive a beat after the window does; open what turned out to be new once they have.
  useEffect(() => setOpen((was) => new Set([...was, ...fresh.map((n) => n.line)])), [fresh]);
  const toggle = (key: string) =>
    setOpen((was) => {
      const next = new Set(was);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  return (
    <div className="releases">
      <p className="hint">
        {current ? <>You are running <b>{current}</b>. </> : null}
        Each release below is one update; going several at once shows all of them.
      </p>

      {fresh.length > 0 && (
        <>
          <h3 className="release-group">
            New since you last looked{seenAtLaunch ? ` (${seenAtLaunch})` : ""}
          </h3>
          {fresh.map((note) => (
            <Release key={note.line} id={note.line} label={note.line} title={note.title} date={note.date} changes={note.changes} fresh open={open.has(note.line)} onToggle={toggle} onGuide={onGuide} />
          ))}
        </>
      )}

      {earlier.length > 0 && (
        <>
          <h3 className="release-group">{fresh.length ? "Earlier" : "Releases"}</h3>
          {earlier.map((note) => (
            <Release key={note.line} id={note.line} label={note.line} title={note.title} date={note.date} changes={note.changes} open={open.has(note.line)} onToggle={toggle} onGuide={onGuide} />
          ))}
        </>
      )}

      <h3 className="release-group">Before release notes</h3>
      <p className="hint">
        What the app did before updates were announced, rebuilt from the project&apos;s history — the further back, the less detail.
      </p>
      {HISTORY.map((h) => (
        <Release key={h.from} id={h.from} label={periodText(h.from, h.to)} title={h.title} changes={h.changes} open={open.has(h.from)} onToggle={toggle} onGuide={onGuide} history />
      ))}
    </div>
  );
}

/** One card: a release, or a stretch of history. The heading is whatever names it — a line, or a period. */
function Release({
  id,
  label,
  title,
  date,
  changes,
  fresh,
  history,
  open,
  onToggle,
  onGuide,
}: {
  id: string;
  label: string;
  title: string;
  date?: string;
  changes: readonly Change[];
  fresh?: boolean;
  history?: boolean;
  open: boolean;
  onToggle: (id: string) => void;
  onGuide: (guideId: string) => void;
}) {
  return (
    <section className={`release${fresh ? " fresh" : ""}${history ? " past" : ""}`}>
      <button className="release-head" aria-expanded={open} onClick={() => onToggle(id)}>
        <Caret open={open} />
        <span className="release-line">{label}</span>
        <span className="release-title">{title}</span>
        {fresh && <span className="badge era-ok">new</span>}
        {date && <span className="muted release-date">{date}</span>}
      </button>
      {open && (
        <ul className="release-changes">
          {changes.map((c, i) => (
            <li key={i}>
              <span className={`badge chg-${c.kind}`}>{KIND_LABEL[c.kind]}</span> {c.text}
              {c.guide && (
                <>
                  {" "}
                  <button className="btn ghost sm" onClick={() => onGuide(c.guide!)}>
                    How-to →
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
