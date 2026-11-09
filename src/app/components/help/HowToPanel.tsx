"use client";
import { useEffect, useState } from "react";
import { Caret } from "@/app/components/ui";
import { useCapabilities } from "@/lib/hooks";
import { MAP_WINDOW, guideParts, plainSectionLabel, type Guide } from "@/shared/help/guide";
import { GUIDES } from "@/shared/help/guides";

/**
 * Short walkthroughs of the parts of the app people tend to miss. Each is a card that opens to numbered
 * steps, a few tips, and a button that goes to the tab it is about.
 *
 * `focus` is where a release note's "How-to →" lands: that card opens and scrolls into view. An object, not
 * the bare id, so following the same link a second time lands again (the pattern the other tabs use).
 * `sectionLabel` is the nav's own name for a section, so the button says what the tab is *called today*; the map
 * window is the one guide target with no section, and says so itself.
 */
export default function HowToPanel({
  focus,
  sectionLabel,
  onOpen,
}: {
  focus: { id: string } | null;
  sectionLabel: (section: string) => string | undefined;
  onOpen: (section: string) => void;
}) {
  const capabilities = useCapabilities();
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(focus ? [focus.id] : []));

  useEffect(() => {
    if (!focus) return;
    setOpen((was) => new Set(was).add(focus.id));
    document.getElementById(`guide-${focus.id}`)?.scrollIntoView({ block: "start" });
  }, [focus]);

  const toggle = (id: string) =>
    setOpen((was) => {
      const next = new Set(was);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <div className="guides">
      <p className="hint">Short walkthroughs of the parts of EQ List people tend to miss. Open one, follow the steps, or jump straight to the tab.</p>
      {GUIDES.map((g) => (
        <GuideCard
          key={g.id}
          guide={g}
          open={open.has(g.id)}
          unavailable={g.needs !== undefined && !capabilities[g.needs]}
          sectionLabel={g.section === MAP_WINDOW ? "the map" : plainSectionLabel(sectionLabel(g.section) ?? "")}
          onToggle={() => toggle(g.id)}
          onOpen={() => onOpen(g.section)}
        />
      ))}
    </div>
  );
}

function GuideCard({
  guide,
  open,
  unavailable,
  sectionLabel,
  onToggle,
  onOpen,
}: {
  guide: Guide;
  open: boolean;
  unavailable: boolean;
  sectionLabel: string | undefined;
  onToggle: () => void;
  onOpen: () => void;
}) {
  return (
    <section id={`guide-${guide.id}`} className="guide">
      <button className="guide-head" aria-expanded={open} onClick={onToggle}>
        <Caret open={open} />
        <span className="guide-title">{guide.title}</span>
        <span className="muted guide-gist">{guide.gist}</span>
      </button>
      {open && (
        <div className="guide-body">
          {unavailable && <p className="hint bad">This needs the desktop app — it isn&apos;t available in the web view.</p>}
          <ol className="guide-steps">
            {guide.steps.map((step, i) => (
              <li key={i}>
                <Rich text={step} />
              </li>
            ))}
          </ol>
          {guide.tips && (
            <ul className="guide-tips">
              {guide.tips.map((tip, i) => (
                <li key={i}>
                  <Rich text={tip} />
                </li>
              ))}
            </ul>
          )}
          <button className="btn sm" onClick={onOpen}>
            Open {sectionLabel || "it"}
          </button>
        </div>
      )}
    </section>
  );
}

/** A guide line with its bold labels and hotkeys drawn (`guideParts` is what reads them). */
function Rich({ text }: { text: string }) {
  return (
    <>
      {guideParts(text).map((p, i) => (p.kind === "bold" ? <b key={i}>{p.text}</b> : p.kind === "key" ? <kbd key={i}>{p.text}</kbd> : p.text))}
    </>
  );
}
