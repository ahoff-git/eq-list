"use client";
import { useState } from "react";
import { useStepLinks, useWikiPage } from "@/lib/hooks";
import ItemLink from "@/app/components/items/ItemLink";
import MapLink, { ZoneLink } from "@/app/components/map/MapLink";
import { stepLinkTitles, type StepLinkInfo } from "@/shared/quests/quest-steps";
import type { QuestStep, QuestStepPart } from "@/shared/types";
import { wikiName } from "@/shared/shown-name";

/** How deep "show its steps" may open quests inside quests, which also stops a quest opening itself. */
const MAX_TRAIL = 3;

type Links = Record<string, StepLinkInfo | undefined>;

/**
 * A quest's walkthrough, step by step, as the wiki bullets it
 * ([ADR 0295](../../../../specs/decisions/0295-a-quest-is-a-tree-of-steps.md)).
 *
 * Every link is looked up on its own page, so each one says what it is. An NPC gets its zone and spot
 * on the map, a zone opens the map, and another quest ("Do Frostbite's Fish") can be opened in place
 * to show its own steps. `trail` is the quests already open above this one.
 */
export default function QuestSteps({ steps, trail }: { steps: QuestStep[]; trail: string[] }) {
  const links = useStepLinks(stepLinkTitles(steps));
  return <StepList steps={steps} links={links} trail={trail} />;
}

function StepList({ steps, links, trail }: { steps: QuestStep[]; links: Links; trail: string[] }) {
  return (
    <ol className="quest-steps">
      {steps.map((step, i) => (
        <StepItem key={i} step={step} links={links} trail={trail} />
      ))}
    </ol>
  );
}

function StepItem({ step, links, trail }: { step: QuestStep; links: Links; trail: string[] }) {
  const [open, setOpen] = useState<string[]>([]);
  const toggle = (quest: string) => setOpen((now) => (now.includes(quest) ? now.filter((q) => q !== quest) : [...now, quest]));
  const canOpen = (title: string) => links[title]?.kind === "quest" && trail.length < MAX_TRAIL && !trail.includes(title);
  return (
    <li>
      <span className="step-text">
        {step.parts.map((part, i) => (
          <StepPart key={i} part={part} info={typeof part === "string" ? undefined : links[part.title]}>
            {typeof part !== "string" && canOpen(part.title) && (
              <button className="btn ghost sm" title="Show this quest's steps here" onClick={() => toggle(part.title)}>
                {open.includes(part.title) ? "▾ steps" : "▸ steps"}
              </button>
            )}
          </StepPart>
        ))}
      </span>
      {open.map((quest) => (
        <SubQuestSteps key={quest} title={quest} trail={trail} />
      ))}
      {step.steps.length > 0 && <StepList steps={step.steps} links={links} trail={trail} />}
    </li>
  );
}

/** One piece of a step's sentence: the wiki's words, or a link drawn as what its page says it is. */
function StepPart({ part, info, children }: { part: QuestStepPart; info?: StepLinkInfo; children?: React.ReactNode }) {
  if (typeof part === "string") return <>{part}</>;
  const shown = part.label ?? part.title;
  if (info?.kind === "zone") return <ZoneLink zone={part.title}>{shown}</ZoneLink>;
  return (
    <>
      <ItemLink title={wikiName(part.title)} label={shown} />
      {info?.zones?.map((zone) => (
        <span key={zone} className="muted small">
          {" "}
          <MapLink target={{ zone, loc: info.loc, label: part.title }} title={`Where ${part.title} is`}>
            {zone}
            {info.loc ? ` (${info.loc.y}, ${info.loc.x})` : ""}
          </MapLink>
        </span>
      ))}
      {children}
    </>
  );
}

/** Another quest's steps, opened inside this one. Its page is read the way a hover card is. */
function SubQuestSteps({ title, trail }: { title: string; trail: string[] }) {
  const page = useWikiPage(title);
  if (!page) return <p className="muted small">Reading {title}…</p>;
  if (!page.steps?.length) return <p className="muted small">{title} has no steps the wiki lists — open it for the walkthrough.</p>;
  return (
    <div className="quest-substeps">
      <QuestSteps steps={page.steps} trail={[...trail, title]} />
    </div>
  );
}
