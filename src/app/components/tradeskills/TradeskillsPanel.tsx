"use client";
import { Fragment, createContext, useContext } from "react";
import { api } from "@/lib/api";
import { useClosedZones, useCurrentZone, useTradeskillProgress } from "@/lib/hooks";
import { usePersistentShape } from "@/lib/usePersistentState";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import { addStep } from "@/lib/tradeskills/addStep";
import { PRICES, TRADESKILLS, VENDORS } from "@/shared/tradeskills/tradeskills.generated";
import { sectionCost, type CostedStep } from "@/shared/tradeskills/section-cost";
import { whereToBuy, type MerchantHere, type ShoppingPlan } from "@/shared/tradeskills/where-to-buy";
import MapLink, { ZoneLink } from "@/app/components/map/MapLink";
import {
  RATE_BANDS,
  costText,
  estimateStep,
  placeStep,
  rangeText,
  rateFactor,
  roughCoins,
  type StepEstimate,
  type StepPlace,
} from "@/shared/tradeskills/step-cost";
import {
  MIN_SKILLUPS_FOR_RATE,
  logSkillName,
  type MeasuredRate,
  type SkillProgressView,
} from "@/shared/tradeskills/skill-progress";
import {
  eraShut,
  guidePath,
  judgeGuide,
  skillVerdict,
  withoutShut,
  type EraVerdict,
  type JudgedBlock,
  type JudgedLine,
} from "@/shared/tradeskills/tradeskill-era";
import { lineLinks, rowLinks, type StepLinks } from "@/shared/tradeskills/step-materials";
import type { GuideRun, SkillSpan, StepCost, StepNeed, Tradeskill, TradeskillGuide } from "@/shared/tradeskills/tradeskill-types";
import { AddButton, CheckField, Empty, segCls } from "@/app/components/ui";
import ItemLink from "@/app/components/items/ItemLink";
import CraftingLogView from "@/app/components/tradeskills/CraftingLogView";

const SKILLS = TRADESKILLS.filter((t) => t.kind === "skill").sort((a, b) => a.name.localeCompare(b.name));
const CULTURAL = TRADESKILLS.filter((t) => t.kind === "cultural");
const REFERENCE = TRADESKILLS.filter((t) => t.kind === "reference");

interface TradeskillView {
  /** The leveling guides, or your own crafting log. */
  mode: "guides" | "log";
  /** The skill on screen, by name. */
  skill: string;
  /** Leave out what the server hasn't opened — on by default, like the Items and Spells tabs. */
  hideOutOfEra: boolean;
}
const DEFAULT_VIEW: TradeskillView = { mode: "guides", skill: SKILLS[0]?.name ?? "", hideOutOfEra: true };

const openOnWiki = (title: string, anchor?: string) => void api()?.wiki.openInBrowser(guidePath(title, anchor));

/**
 * You, against the guide on screen: your skill as your log last stated it, and how your pace compares
 * with the guides' — worked out once in `SkillGuides` and handed down by context rather than threaded
 * through every block, line and row.
 */
interface You {
  /** Your skill, when the log has stated it. */
  skill?: number;
  /** When it last did. */
  at?: string;
  /** Combines a point relative to the model (`rateFactor`); 1 when nothing is measured. */
  factor: number;
  /** What the factor was measured on: this skill's own skill-ups, or another tradeskill's. */
  basis?: { skill: string; rate: MeasuredRate; own: boolean };
  /** The zone the log last put you in, for "where to buy". */
  zone?: string | null;
}
const NOBODY: You = { factor: 1 };
const YouContext = createContext<You>(NOBODY);

/**
 * Your standing in one tradeskill. The pace comes from the skill's own skill-ups when there are
 * enough, else from whichever tradeskill you've measured most — INT/WIS govern most of them alike, so
 * a pace measured at one station is a better guess for another than the guides' characters are.
 */
function youIn(skill: Tradeskill, progress: SkillProgressView): You {
  const name = logSkillName(skill.name);
  const stated = progress.skills[name];
  const base = { skill: stated?.value, at: stated?.at };
  const own = progress.rates[name];
  const ownFactor = rateFactor(own, MIN_SKILLUPS_FOR_RATE);
  if (own && ownFactor !== undefined) return { ...base, factor: ownFactor, basis: { skill: name, rate: own, own: true } };
  const best = Object.entries(progress.rates)
    .map(([s, rate]) => ({ s, rate, factor: rateFactor(rate, MIN_SKILLUPS_FOR_RATE) }))
    .filter((b) => b.factor !== undefined)
    .sort((a, b) => b.rate.points - a.rate.points)[0];
  if (!best) return { ...base, factor: 1 };
  return { ...base, factor: best.factor!, basis: { skill: best.s, rate: best.rate, own: false } };
}

/** A step's span as it stands for you — nothing left of it, the part still ahead, or all of it. */
function forYou(span: SkillSpan | undefined | null, you: You): { place: StepPlace; span?: SkillSpan } {
  const place = placeStep(span, you.skill);
  if (place.at === "done") return { place };
  return { place, span: place.at === "current" ? place.remaining : (span ?? undefined) };
}

/** One step, worked out once for both its own line and its section's total. */
interface StepPlan {
  place: StepPlace;
  estimate?: StepEstimate;
  /** The step as `sectionCost` reads it — absent for a step you're past, or one with no span. */
  costed?: CostedStep;
  /** What it uses, for "where to buy". */
  materials: string[];
}

function planFor(span: SkillSpan | undefined | null, needs: StepNeed[] | undefined, cost: StepCost | undefined, you: You): StepPlan {
  const mine = forYou(span, you);
  const estimate = estimateStep(mine.span, needs, cost, PRICES, you.factor);
  const materials = mine.place.at === "done" ? [] : (needs ?? []).map((n) => n.name);
  if (!estimate || !mine.span) return { place: mine.place, estimate, materials };
  const totals = (needs ?? []).filter((n) => n.total);
  const fixed = totals.reduce((sum, n) => sum + (PRICES[n.name]?.copper ?? 0) * n.qty, 0);
  const unpriced = [...(cost?.unpriced ?? []), ...totals.filter((n) => !PRICES[n.name]).map((n) => n.name)];
  return {
    place: mine.place,
    estimate,
    materials,
    costed: { span: mine.span, perCombine: cost?.copper, fixed, unpriced },
  };
}

/**
 * A guide's sections: what comes before its first heading, then each heading's run of blocks. Each
 * holds its steps' plans, so its total and its shopping list read the same figures its lines show.
 */
function sectionsOf(blocks: readonly JudgedBlock[], you: You): Map<number, StepPlan[]> {
  const sections = new Map<number, StepPlan[]>([[-1, []]]);
  let at = -1;
  blocks.forEach((b, i) => {
    if (b.kind === "heading") sections.set((at = i), []);
    else if (b.kind === "list") for (const l of b.items) sections.get(at)!.push(planFor(l.skill, l.needs, l.cost, you));
    else if (b.kind === "table") for (const r of b.rows) sections.get(at)!.push(planFor(r.skill, r.needs, r.cost, you));
  });
  return sections;
}

const PLACE_CLASS: Record<StepPlace["at"], string | undefined> = {
  done: "step-done",
  current: "step-current",
  ahead: undefined,
  unknown: undefined,
};

/** Puts one step's materials on the shopping list — `addStep` knows how; this only carries where. */
type OnAddStep = (step: StepLinks, planned?: Planned) => void;
/** What the generator stored for a step, so "+ List" files what the estimate shows. */
type Planned = { needs?: StepNeed[]; estimate?: StepEstimate };

/**
 * Tradeskills — each skill's leveling guide off eqlwiki, kept as the wiki wrote it, with what the
 * server hasn't opened marked or left out
 * ([ADR 0302](../../../../specs/decisions/0302-tradeskill-guides-are-generated-static-data.md)).
 *
 * Laid out like an item or quest page (`.page-detail`), because it is read the same way: a title, gold
 * section headings, blue links. Hovering an ingredient says where to buy it (`craft-notes.ts`), and
 * each step's **+ List** files what it needs on the shopping list (`addStep`).
 *
 * **Live against your log** ([ADR 0303](../../../../specs/decisions/0303-a-tradeskill-guide-follows-your-skill.md)):
 * your skill as the log last stated it greys out the steps you're past, marks the one you're in and
 * re-estimates it from where you actually are, at the pace your own skill-ups have shown.
 */
export default function TradeskillsPanel() {
  const [view, setView] = usePersistentShape(STORAGE_KEYS.tradeskillView, DEFAULT_VIEW);
  const progress = useTradeskillProgress();
  const crafted = progress.crafting.sittings.length;
  return (
    <div className="tradeskills-panel">
      <div className="row wrap" style={{ marginBottom: 8 }}>
        <div className="segmented">
          <button className={segCls(view.mode === "guides")} onClick={() => setView({ ...view, mode: "guides" })}>
            Guides
          </button>
          <button
            className={segCls(view.mode === "log")}
            onClick={() => setView({ ...view, mode: "log" })}
            title="Every combine your log records — by sitting, by item, and by item at each skill level"
          >
            Crafting log{crafted ? ` (${crafted})` : ""}
          </button>
        </div>
      </div>
      {view.mode === "log" ? (
        <div className="page-detail tradeskill-detail">
          <CraftingLogView progress={progress} />
        </div>
      ) : (
        <TradeskillGuides view={view} setView={setView} progress={progress} />
      )}
    </div>
  );
}

/** The guides half of the tab: a skill picker, the era toggle, the guide, and the pages out. */
function TradeskillGuides({
  view,
  setView,
  progress,
}: {
  view: TradeskillView;
  setView: (v: TradeskillView) => void;
  progress: SkillProgressView;
}) {
  const closed = useClosedZones();
  const skill = SKILLS.find((s) => s.name === view.skill) ?? SKILLS[0];
  const cultural = CULTURAL.map((page) => ({ page, shut: skillVerdict(page, closed) }));
  const culturalShown = view.hideOutOfEra ? cultural.filter((c) => !c.shut) : cultural;
  return (
    <>
      <div className="row wrap" style={{ marginBottom: 8 }}>
        <div className="segmented wrap">
          {SKILLS.map((s) => {
            const mine = progress.skills[logSkillName(s.name)];
            return (
              <button key={s.name} className={segCls(s === skill)} onClick={() => setView({ ...view, skill: s.name })}>
                {s.name}
                {mine && <span className="seg-skill">{mine.value}</span>}
              </button>
            );
          })}
        </div>
        <span className="spacer" />
        <CheckField
          label="in era only"
          title="Leave out steps the server hasn't opened — a step marked with a shut era, a step needing an item from one, or a part the guide itself says isn't available"
          checked={view.hideOutOfEra}
          onChange={(hideOutOfEra) => setView({ ...view, hideOutOfEra })}
        />
      </div>

      {skill ? (
        <SkillGuides skill={skill} closed={closed} hideOutOfEra={view.hideOutOfEra} progress={progress} />
      ) : (
        <Empty title="No tradeskills in this build." hint="Regenerate with npm run tradeskills:fetch." />
      )}

      <div className="page-detail tradeskill-detail">
        <h4>Cultural tradeskills</h4>
        <p className="muted small">Each race&apos;s own armour and weapon recipes, on eqlwiki.</p>
        <div className="row wrap tradeskill-pages">
          {culturalShown.map(({ page, shut }) => (
            <span key={page.title} className={shut ? "era-shut" : undefined}>
              <button className="btn ghost sm" onClick={() => openOnWiki(page.title)} title={`Open ${page.title} on eqlwiki`}>
                ↗ {page.name}
              </button>
              {shut && <EraBadge shut={shut} />}
            </span>
          ))}
        </div>
        {culturalShown.length < cultural.length && (
          <p className="muted small">
            {cultural.length - culturalShown.length} hidden — the server hasn&apos;t opened their era. Untick
            &ldquo;in era only&rdquo; to see them.
          </p>
        )}
        {REFERENCE.length > 0 && (
          <>
            <h4>Gear for crafting</h4>
            {REFERENCE.map((page) => (
              <button key={page.title} className="btn ghost sm" onClick={() => openOnWiki(page.title)} title="Gear that raises INT/WIS cheaply">
                ↗ {page.name}
              </button>
            ))}
          </>
        )}
      </div>
    </>
  );
}

function SkillGuides({
  skill,
  closed,
  hideOutOfEra,
  progress,
}: {
  skill: Tradeskill;
  closed: ReadonlySet<string>;
  hideOutOfEra: boolean;
  progress: SkillProgressView;
}) {
  const zone = useCurrentZone();
  const you = { ...youIn(skill, progress), zone };
  return (
    <YouContext.Provider value={you}>
      <div className="page-detail tradeskill-detail">
        <div className="row">
          <h3>{skill.name}</h3>
          <span className="badge kind-recipe">tradeskill</span>
          <span className="spacer" />
          <button className="btn ghost sm" onClick={() => openOnWiki(skill.title)} title="The whole page, recipes and all">
            ↗ eqlwiki
          </button>
        </div>
        <YouLine skill={skill} you={you} progress={progress} />
        <p className="muted small">
          Hover an ingredient for where to buy it. <b>+ List</b> puts a step&apos;s materials on your shopping list, where
          each row says where to get them — set the group&apos;s runs to the number of combines.
        </p>
        {skill.guides.map((g) => (
          <Guide key={g.anchor} skill={skill} guide={g} closed={closed} hideOutOfEra={hideOutOfEra} />
        ))}
      </div>
    </YouContext.Provider>
  );
}

/** "about the guides' pace", or how far off it — rounded to what a measurement can bear. */
function paceWords(factor: number): string {
  const r = Math.round(factor * 10) / 10;
  return r === 1 ? "about the guides' pace" : `${r}× the guides' combines a point`;
}

/**
 * Where you stand: the skill your log last stated, and the pace the estimates below are scaled to.
 * Says plainly when it's still reading the log, or when the log hasn't shown this skill. Nothing at
 * all without a log (the web build), where the guide is just the guide.
 */
function YouLine({ skill, you, progress }: { skill: Tradeskill; you: You; progress: SkillProgressView }) {
  if (!progress.character) return null;
  const name = logSkillName(skill.name);
  const jump = () => document.querySelector(".tradeskill-detail .step-current")?.scrollIntoView({ behavior: "smooth", block: "center" });
  const rate = you.basis?.rate;
  return (
    <div className="you-line small">
      {you.skill !== undefined ? (
        <span title={`From your log: "You have become better at ${name}! (${you.skill})", ${you.at?.replace("T", " ")}`}>
          {progress.character}&apos;s {name}: <b className="you-skill">{you.skill}</b>
        </span>
      ) : (
        <span className="muted">
          {progress.scanning ? `Reading ${progress.character}'s log for skill-ups…` : `${progress.character}'s log hasn't shown a ${name} skill-up yet.`}
        </span>
      )}
      {you.basis && rate && (
        <span
          className="muted"
          title={
            `${rate.combines} combines led to ${rate.points} ${you.basis.skill} skill-ups (${rate.from}→${rate.to}): ` +
            `${(rate.combines / rate.points).toFixed(1)} a point. Combines after a sitting's last skill-up aren't counted — they raised nothing. ` +
            `The estimates below are scaled by this.`
          }
        >
          · your pace: {paceWords(you.factor)}
          {you.basis.own ? "" : ` (from your ${you.basis.skill})`}
        </span>
      )}
      {you.skill !== undefined && (
        <button className="btn ghost sm" onClick={jump} title="Scroll to the step you're on">
          ↓ my step
        </button>
      )}
    </div>
  );
}

function Guide({
  skill,
  guide,
  closed,
  hideOutOfEra,
}: {
  skill: Tradeskill;
  guide: TradeskillGuide;
  closed: ReadonlySet<string>;
  hideOutOfEra: boolean;
}) {
  const judged = judgeGuide(guide, closed);
  const { blocks, hidden } = hideOutOfEra ? withoutShut(judged) : { blocks: judged, hidden: 0 };
  const onAdd: OnAddStep = (step, planned) => void addStep(skill, guide.anchor, step, planned);
  const you = useContext(YouContext);
  const sections = sectionsOf(blocks, you);
  const all = [...sections.values()].flat();
  return (
    <section className="tradeskill-guide">
      <div className="row tradeskill-guide-head">
        <h4>{guide.name}</h4>
        <CostToFinish steps={all} label="this guide" />
        <span className="spacer" />
        <button className="btn ghost sm" onClick={() => openOnWiki(skill.title, guide.anchor)} title="This leveling guide on eqlwiki">
          ↗ leveling guide
        </button>
      </div>
      {hidden > 0 && (
        <p className="muted small">
          {hidden} out-of-era {hidden === 1 ? "part" : "parts"} left out. Untick &ldquo;in era only&rdquo; to see{" "}
          {hidden === 1 ? "it" : "them"}.
        </p>
      )}
      <SectionSummary steps={sections.get(-1) ?? []} closed={closed} />
      {blocks.map((b, i) => (
        <Fragment key={i}>
          <Block block={b} closed={closed} onAdd={onAdd} />
          {b.kind === "heading" && <SectionSummary steps={sections.get(i) ?? []} closed={closed} withCost />}
        </Fragment>
      ))}
    </section>
  );
}

/** "≈ 12pp–31pp to finish" — the point-by-point total (`sectionCost`), with what it leaves out. */
function CostToFinish({ steps, label }: { steps: StepPlan[]; label: string }) {
  const you = useContext(YouContext);
  const total = sectionCost(steps.flatMap((s) => (s.costed ? [s.costed] : [])), you.factor);
  if (!total) return null;
  if (!total.pricedPoints) {
    // Steps ahead, but nothing in them the wiki prices — say so rather than show nothing, so a blank
    // never reads as "free".
    return (
      <span className="section-cost unpriced" title="None of what's left here has a price on the wiki — its merchants are listed below">
        cost unknown{total.unpriced.length ? ` (no price for ${total.unpriced.slice(0, 3).join(", ")})` : ""}
      </span>
    );
  }
  const partial = total.unpricedPoints > 0 || total.unpriced.length > 0;
  const hover =
    `To finish ${label}${you.skill !== undefined ? ` from your ${you.skill}` : ""}: each skill point ahead bought with the cheapest step ` +
    `that covers it, ${rangeText(total.combines)} combines in all, plus each chosen step's one-off purchases. ` +
    (total.unpricedPoints ? `${total.unpricedPoints} of ${total.unpricedPoints + total.pricedPoints} points have no priced step and aren't counted. ` : "") +
    (total.unpriced.length ? `No price on the wiki for: ${total.unpriced.join(", ")}.` : "");
  return (
    <span className="section-cost" title={hover}>
      ≈ {costText(total.cost)}
      {partial ? "+" : ""} to finish
    </span>
  );
}

/**
 * A section's cost to finish and where to buy what's left of it — open on the section you're in,
 * folded on the others so the guide still reads as a guide.
 */
function SectionSummary({ steps, closed, withCost }: { steps: StepPlan[]; closed: ReadonlySet<string>; withCost?: boolean }) {
  const you = useContext(YouContext);
  const materials = steps.flatMap((s) => s.materials);
  if (!materials.length && !(withCost && steps.some((s) => s.costed))) return null;
  const plan = whereToBuy(materials, VENDORS, you.zone, closed);
  const current = steps.some((s) => s.place.at === "current");
  const soldHere = new Set(plan.here.map((h) => h.item)).size;
  return (
    <div className="section-summary">
      {withCost && <CostToFinish steps={steps} label="this section" />}
      {materials.length > 0 && (
        <details className="where-to-buy" open={current}>
          <summary>
            Where to buy{you.zone ? ` — you're in ${you.zone}` : ""}
            {soldHere ? ` · ${soldHere} sold here` : ""}
          </summary>
          <ShoppingView plan={plan} zone={you.zone} />
        </details>
      )}
    </div>
  );
}

/** Here's merchants, grouped by merchant; then the best other stops; then what no merchant sells. */
function ShoppingView({ plan, zone }: { plan: ShoppingPlan; zone?: string | null }) {
  const byMerchant = new Map<string, MerchantHere[]>();
  for (const h of plan.here) byMerchant.set(h.merchant, [...(byMerchant.get(h.merchant) ?? []), h]);
  return (
    <div className="shopping small">
      {byMerchant.size > 0 && (
        <div className="shopping-group">
          <span className="shopping-label">Here:</span>
          {[...byMerchant.values()].map((sells) => (
            <span key={sells[0].merchant} className="shopping-merchant">
              <Merchant name={sells[0].merchant} zone={sells[0].zone} loc={sells[0].loc} area={sells[0].area} />:{" "}
              {sells.map((s, i) => (
                <span key={s.item}>
                  {i > 0 && ", "}
                  <ItemLink title={s.item} craft />
                </span>
              ))}
            </span>
          ))}
        </div>
      )}
      {plan.stops.map((stop) => (
        <div key={stop.zone} className="shopping-group">
          <span className="shopping-label">
            <ZoneLink zone={stop.zone} />:
          </span>
          {stop.items.map((s) => (
            <span key={s.item} className="shopping-merchant">
              <ItemLink title={s.item} craft /> (<Merchant name={s.merchant} zone={stop.zone} loc={s.loc} area={s.area} />)
            </span>
          ))}
        </div>
      ))}
      {plan.notSold.length > 0 && (
        <div className="shopping-group muted" title="No merchant the wiki lists, in a zone that's open, sells these — they drop, are foraged, or are made first">
          <span className="shopping-label">Not sold:</span>
          {plan.notSold.map((item, i) => (
            <span key={item}>
              {i > 0 && ", "}
              <ItemLink title={item} craft />
            </span>
          ))}
        </div>
      )}
      {!zone && <p className="muted small">The log hasn&apos;t said which zone you&apos;re in yet, so these are only the best stops.</p>}
    </div>
  );
}

/** A merchant, clickable to their page; and their spot, clickable to the map, when the wiki gives one. */
function Merchant({ name, zone, loc, area }: { name: string; zone: string; loc?: { y: number; x: number }; area?: string }) {
  return (
    <>
      <ItemLink title={name} />
      {loc && (
        <>
          {" "}
          <MapLink target={{ zone, loc, label: name }}>
            {loc.y}, {loc.x}
          </MapLink>
        </>
      )}
      {area && <span className="muted"> ({area})</span>}
    </>
  );
}

function Block({ block, closed, onAdd }: { block: JudgedBlock; closed: ReadonlySet<string>; onAdd: OnAddStep }) {
  switch (block.kind) {
    case "heading":
      return (
        <h5 className={block.shut ? "tradeskill-stage era-shut" : "tradeskill-stage"} style={{ marginLeft: (block.level - 1) * 12 }}>
          {block.text} {block.shut && <EraBadge shut={block.shut} />}
        </h5>
      );
    case "text":
      return (
        <p className={["small", block.strong && "tradeskill-label", block.shut && "era-shut"].filter(Boolean).join(" ")}>
          <Runs runs={block.runs} closed={closed} />
          {block.shut && <EraBadge shut={block.shut} />}
        </p>
      );
    case "list":
      return <Lines lines={block.items} closed={closed} onAdd={onAdd} />;
    case "table":
      return <GuideTable block={block} closed={closed} onAdd={onAdd} />;
  }
}

function GuideTable({
  block,
  closed,
  onAdd,
}: {
  block: Extract<JudgedBlock, { kind: "table" }>;
  closed: ReadonlySet<string>;
  onAdd: OnAddStep;
}) {
  const you = useContext(YouContext);
  return (
    <div className="table-scroll">
      <table className="stat-table tradeskill-table">
        {block.header.length > 0 && (
          <thead>
            <tr>
              {block.header.map((h, i) => (
                <th key={i}>{h}</th>
              ))}
              <th aria-label="Add to list" />
            </tr>
          </thead>
        )}
        <tbody>
          {block.rows.map((row, r) => {
            const step = rowLinks(block.header, row.cells, row.makes);
            const { place, estimate } = planFor(row.skill, row.needs, row.cost, you);
            const mine = { place };
            const classes = [row.shut && "era-shut", PLACE_CLASS[mine.place.at]].filter(Boolean);
            const last = row.cells.length - 1;
            return (
              <Fragment key={r}>
                <tr className={[...classes, estimate && "has-estimate"].filter(Boolean).join(" ") || undefined}>
                  {row.cells.map((cell, c) => (
                    <td key={c}>
                      <Runs runs={cell} closed={closed} />
                      {c === last && <Makes titles={row.makes} />}
                      {c === last && <PlaceBadge place={mine.place} span={row.skill} you={you} />}
                      {row.shut && c === last && <EraBadge shut={row.shut} />}
                    </td>
                  ))}
                  <td className="tradeskill-add">{hasLinks(step) && <ListButton step={step} planned={{ needs: row.needs, estimate }} onAdd={onAdd} />}</td>
                </tr>
                {estimate && (
                  <tr className={["step-estimate-row", ...classes].join(" ")}>
                    <td colSpan={row.cells.length + 1}>
                      <StepEstimateView estimate={estimate} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** A guide's bullets. Only a top-level bullet is a step — what's nested under it is part of it. */
function Lines({
  lines,
  closed,
  onAdd,
  depth = 0,
}: {
  lines: JudgedLine[];
  closed: ReadonlySet<string>;
  onAdd: OnAddStep;
  depth?: number;
}) {
  const you = useContext(YouContext);
  return (
    <ul className="tradeskill-lines small">
      {lines.map((l, i) => {
        const top = depth === 0;
        const step = top ? lineLinks(l) : undefined;
        const plan = planFor(l.skill, l.needs, l.cost, you);
        const mine = { place: plan.place };
        const estimate = top ? plan.estimate : undefined;
        const classes = [l.shut && "era-shut", top && PLACE_CLASS[mine.place.at]].filter(Boolean).join(" ");
        return (
          <li key={i} className={classes || undefined}>
            <Runs runs={l.runs} closed={closed} />
            <Makes titles={l.makes} />
            {top && <PlaceBadge place={mine.place} span={l.skill} you={you} />}
            {l.shut && <EraBadge shut={l.shut} />}
            {step && hasLinks(step) && <ListButton step={step} planned={{ needs: l.needs, estimate }} onAdd={onAdd} />}
            <StepEstimateView estimate={estimate} needsFor={l.needsFor} />
            {l.children && l.children.length > 0 && <Lines lines={l.children} closed={closed} onAdd={onAdd} depth={depth + 1} />}
          </li>
        );
      })}
    </ul>
  );
}

const hasLinks = (step: StepLinks) => step.results.length > 0 || step.candidates.length > 0;

function ListButton({ step, planned, onAdd }: { step: StepLinks; planned?: Planned; onAdd: OnAddStep }) {
  return (
    <AddButton
      className="btn ghost sm tradeskill-list-btn"
      onAdd={() => onAdd(step, planned)}
      title={`Put what “${step.label}” needs on your shopping list — each row there says where to buy it`}
    >
      + List
    </AddButton>
  );
}

/** A line as the wiki wrote it: text, item links (hover for where to buy it, click to open), era badges. */
function Runs({ runs, closed }: { runs: GuideRun[]; closed: ReadonlySet<string> }) {
  return (
    <>
      {runs.map((r, i) =>
        typeof r === "string" ? (
          <span key={i}>{r}</span>
        ) : "era" in r ? (
          <span key={i} className={`badge ${eraShut(r.era, closed) ? "era-out" : "era-ok"}`}>
            {r.era}
          </span>
        ) : (
          <ItemLink key={i} title={r.link} label={r.text} craft />
        ),
      )}
    </>
  );
}

/** "2.5 a point below 150, 7.5 above" — the rates the ceiling uses, from `RATE_BANDS`. */
const RATES_IN_WORDS = RATE_BANDS.map((b, i) =>
  Number.isFinite(b.below) ? `${b.rate} a point below ${b.below}` : `${b.rate} ${i ? "above" : "throughout"}`,
).join(", ");

function combinesHover(e: StepEstimate, you: You): string {
  const pace = you.basis
    ? `the guides' measured rates (${RATES_IN_WORDS}) scaled to your pace — ${paceWords(you.factor)}, from your ${you.basis.skill} skill-ups`
    : `the slowest rates the guides measured (${RATES_IN_WORDS}) — lower INT/WIS than theirs runs longer`;
  return (
    `At least ${e.combines.low}: a combine raises the skill one point at most, and this crosses ${e.combines.low}. ` +
    `Up to ${e.combines.high} at ${pace}. Failed combines count: they use up the materials too.`
  );
}

function costHover(e: StepEstimate): string {
  const how =
    e.how === "stated"
      ? "The guide states this step's cost per combine."
      : e.how === "recipe"
        ? `A combine's cost as the ${e.source ?? "skill"} page prices it.`
        : e.how === "materials"
          ? "Its materials at the vendor prices the wiki gives."
          : "Only the materials the wiki prices.";
  const missing = e.unpriced?.length ? ` Not counted — no price on the wiki: ${e.unpriced.join(", ")}.` : "";
  return `${how}${missing} Wiki prices are approximate; charisma and faction move what a merchant charges.`;
}

/**
 * How many combines a step takes, what that costs, and how much of each material — the estimate
 * `step-cost.ts` makes from the step's span (or, for the step you're in, what's left of it). Every
 * figure says on hover where it came from, because two of the three are estimates.
 */
function StepEstimateView({ estimate, needsFor }: { estimate: StepEstimate | undefined; needsFor?: { result: string; options: number } }) {
  const you = useContext(YouContext);
  if (!estimate) return null;
  const { combines, cost, materials, unpriced } = estimate;
  return (
    <div className="step-estimate">
      {needsFor && (
        <span
          className="muted"
          title={`The step offers ${needsFor.options} things to make, any of them; each combine makes one. These are the materials for ${needsFor.result} — open another one for its own.`}
        >
          for {needsFor.result} (1 of {needsFor.options}):
        </span>
      )}
      <span className="step-estimate-figure" title={combinesHover(estimate, you)}>
        ≈ {rangeText(combines)} combines
      </span>
      {cost && (
        <span className="step-estimate-figure" title={costHover(estimate)}>
          ≈ {costText(cost)}
          {unpriced?.length ? "+" : ""}
        </span>
      )}
      {materials.map((m) => (
        <span key={m.name} className="step-estimate-material">
          <ItemLink title={m.name} craft /> ×{rangeText(m.qty)}
          {m.each !== undefined && <span className="muted"> @ {roughCoins(m.each)}</span>}
        </span>
      ))}
    </div>
  );
}

/**
 * What a step makes, when the guide only named its ingredients and the generator found the recipe
 * (`tradeskill-results.mjs`). Marked as ours rather than the wiki's — the hover says how it was found.
 */
function Makes({ titles }: { titles?: string[] }) {
  if (!titles?.length) return null;
  return (
    <span className="tradeskill-makes" title="The guide names only the ingredients — this is the recipe they make, matched from the wiki's recipe pages">
      {" → makes "}
      {titles.map((t, i) => (
        <span key={t}>
          {i > 0 && " or "}
          <ItemLink title={t} craft />
        </span>
      ))}
    </span>
  );
}

/** "trivial for you" on a step you're past; "you · 60" on the one you're in. Nothing otherwise. */
function PlaceBadge({ place, span, you }: { place: StepPlace; span?: SkillSpan | null; you: You }) {
  if (place.at === "done") {
    return (
      <span className="badge step-done-badge" title={`Your skill (${you.skill}) is at or past ${span?.to}, where this step stops raising it.`}>
        trivial for you
      </span>
    );
  }
  if (place.at === "current") {
    return (
      <span
        className="badge step-here-badge"
        title={`You're at ${you.skill}, inside this step's ${span?.from}–${span?.to}: the estimate is for the ${place.remaining.to - place.remaining.from} points left.`}
      >
        you · {you.skill}
      </span>
    );
  }
  return null;
}

function EraBadge({ shut }: { shut: EraVerdict }) {
  return (
    <span className="badge era-out" title={shut.because}>
      {shut.why === "future" ? "not on this server" : "out of era"}
    </span>
  );
}
