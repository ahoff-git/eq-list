"use client";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useClosedZones, useShoppingList } from "@/lib/hooks";
import ItemLink from "@/app/components/items/ItemLink";
import MapLink, { ZoneLink } from "@/app/components/map/MapLink";
import { segCls } from "@/app/components/ui";
import {
  planByZone,
  progressOf,
  stepPlace,
  stepStatus,
  type HasItem,
  type PlanStage,
  type PlanStep,
  type QuestPlan,
  type StepPlace,
} from "@/shared/quests/quest-plans";

const MARK = { done: "✓", todo: "○", info: "·" } as const;

/**
 * A long quest as its plan — stages of steps, or the same steps by zone — with each step's place and
 * how far along you are ([ADR 0300](../../../../specs/decisions/0300-a-long-quest-is-a-plan-of-stages.md)).
 *
 * Progress is the shopping list's: a step is ticked when every item it gets is obtained under this
 * quest, and ticking a step here marks those entries obtained. Nothing else is stored.
 */
export default function QuestPlanView({ plan }: { plan: QuestPlan }) {
  const list = useShoppingList();
  const closed = useClosedZones();
  const [byZone, setByZone] = useState(false);

  const entries = useMemo(() => {
    const quest = plan.quest.toLowerCase();
    const mine = list.entries.filter((e) => e.origin?.name.toLowerCase() === quest);
    return new Map(mine.map((e) => [e.name.toLowerCase(), e]));
  }, [list.entries, plan.quest]);
  const has: HasItem = (item) => {
    const e = entries.get(item.toLowerCase());
    return !!e && e.obtained >= e.needed;
  };
  const tracked = entries.size > 0;
  const all = plan.stages.flatMap((s) => s.steps);
  const { done, total } = progressOf(all, has);
  const shutSteps = all.filter((st) => stepPlace(st, closed).shut).length;

  /** Tick or untick a step: every item it gets, obtained in full or not at all. */
  const toggle = (step: PlanStep) => {
    const finish = stepStatus(step, has) !== "done";
    for (const item of step.gets) {
      const e = entries.get(item.toLowerCase());
      if (e) void api()?.list.update(e.id, { obtained: finish ? e.needed : 0 });
    }
  };

  return (
    <div className="quest-plan">
      <div className="row" style={{ marginTop: 12, gap: 8 }}>
        <h4 className="muted small" style={{ margin: 0 }}>
          Plan · {plan.stages.length} stages
        </h4>
        <span className={`badge ${tracked && done === total ? "done" : ""}`}>
          {tracked ? `${done}/${total} steps` : `${total} steps`}
        </span>
        {shutSteps > 0 && (
          <span className="badge era-out" title="Steps in zones this server hasn't opened">
            {shutSteps} not in era
          </span>
        )}
        <span className="spacer" />
        <div className="segmented">
          <button className={segCls(!byZone)} onClick={() => setByZone(false)}>
            By stage
          </button>
          <button className={segCls(byZone)} onClick={() => setByZone(true)}>
            By zone
          </button>
        </div>
      </div>
      {/* The page's own + Add already carries the route (withQuestPlan), so this only says what it buys. */}
      {!tracked && (
        <p className="muted small">
          Add the quest to track the route: every item a step gets becomes a list entry under it, and a step
          ticks when its items do.
        </p>
      )}
      {byZone ? (
        <ZoneView plan={plan} closed={closed} has={has} tracked={tracked} toggle={toggle} />
      ) : (
        plan.stages.map((stage) => (
          <StageView key={stage.title} stage={stage} closed={closed} has={has} tracked={tracked} toggle={toggle} />
        ))
      )}
    </div>
  );
}

interface RowProps {
  has: HasItem;
  tracked: boolean;
  toggle: (step: PlanStep) => void;
}

function StageView({ stage, closed, ...row }: { stage: PlanStage; closed: ReadonlySet<string> } & RowProps) {
  const { done, total } = progressOf(stage.steps, row.has);
  return (
    <>
      <h5 className="plan-stage">
        {stage.title}
        {total > 0 && row.tracked && <span className="muted small"> · {done}/{total}</span>}
        {stage.trigger && <span className="muted small"> · say “{stage.trigger}”</span>}
      </h5>
      <ul className="plan-steps">
        {stage.steps.map((step, i) => (
          <StepRow key={i} step={step} place={stepPlace(step, closed)} {...row} />
        ))}
      </ul>
    </>
  );
}

function ZoneView({ plan, closed, ...row }: { plan: QuestPlan; closed: ReadonlySet<string> } & RowProps) {
  return (
    <>
      {planByZone(plan, closed).map(({ zone, area, steps }) => (
        <div key={`${zone}|${area ?? ""}` || "nowhere"}>
          <h5 className="plan-stage">
            {zone ? <ZoneLink zone={zone} /> : <span className="muted">No place stated</span>}
            {area && <span> · {area}</span>}
            {steps[0]?.place.shut && <EraBadge place={steps[0].place} />}
          </h5>
          <ul className="plan-steps">
            {steps.map(({ stage, step, place }, i) => (
              <StepRow key={i} step={step} place={{ ...place, area: undefined }} stage={stage.title} hideZone {...row} />
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

function StepRow({
  step,
  place,
  stage,
  hideZone,
  has,
  tracked,
  toggle,
}: { step: PlanStep; place: StepPlace; stage?: string; hideZone?: boolean } & RowProps) {
  const status = stepStatus(step, has);
  const canTick = tracked && status !== "info";
  return (
    <li className={`plan-step depth-${Math.min(step.depth, 3)} ${status}${place.shut ? " out-of-era" : ""}`}>
      <button
        className="plan-mark"
        disabled={!canTick}
        title={canTick ? (status === "done" ? "Mark not done" : "Mark done — its items obtained") : undefined}
        onClick={() => toggle(step)}
      >
        {MARK[status]}
      </button>
      <span className="plan-text">
        {stage && <span className="muted small">{stage} · </span>}
        {step.text}
        {step.gets.length > 0 && (
          <span className="small">
            {" "}
            → {step.gets.map((g, i) => (
              <span key={g}>
                {i > 0 && ", "}
                <ItemLink title={g} />
              </span>
            ))}
          </span>
        )}
      </span>
      <PlaceLinks place={place} hideZone={hideZone} />
    </li>
  );
}

/** Where a step happens: who, the zone (a map link when the map has it), the island, the spot. */
function PlaceLinks({ place, hideZone }: { place: StepPlace; hideZone?: boolean }) {
  return (
    <span className="muted small plan-place">
      {place.who && <ItemLink title={place.who.name} />}
      {!hideZone && place.zone && (place.mapped ? <ZoneLink zone={place.zone} /> : <span>{place.zone}</span>)}
      {place.area && <span>{place.area}</span>}
      {place.zone && place.loc && place.mapped && (
        <MapLink target={{ zone: place.zone, loc: place.loc, label: place.who?.name }}>
          {place.loc.y}, {place.loc.x}
        </MapLink>
      )}
      {!hideZone && place.shut && <EraBadge place={place} />}
    </span>
  );
}

function EraBadge({ place }: { place: StepPlace }) {
  return (
    <span className="badge era-out" title={`${place.zone} isn't open on this server`}>
      {place.shut === "future" ? "not on this server" : "out of era"}
    </span>
  );
}
