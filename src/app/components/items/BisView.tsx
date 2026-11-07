"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import ItemLink from "@/app/components/items/ItemLink";
import BisWearTable from "@/app/components/items/BisWearTable";
import BisEffects from "@/app/components/items/BisEffects";
import BisHuntTable from "@/app/components/items/BisHuntTable";
import BisStats from "@/app/components/items/BisStats";
import BisDamage from "@/app/components/items/BisDamage";
import BisDamageTaken, { type DamageControl } from "@/app/components/items/BisDamageTaken";
import BisGoals from "@/app/components/items/BisGoals";
import { Empty, segCls } from "@/app/components/ui";
import { DumpSection } from "@/app/components/exports/DumpParts";
import { useInventory, type PeerInventory } from "@/lib/exports/useGameExports";
import { useSpellCatalog } from "@/lib/hooks";
import { copyText } from "@/lib/clipboard";
import { createPlanCache, planKey } from "@/lib/items/plan-cache";
import { useSettled } from "@/lib/useSettled";
import { bisPlan, loadoutText, type BisPlan } from "@/shared/items/bis-plan";
import { HUNT_GRADE_CHOICES, bisOptionCount, lockAll, toggleTitle, withExcluded, withoutChanges, type BisOptions } from "@/shared/items/bis-options";
import { WORN_LAYOUT } from "@/shared/items/bis";
import { expectedStats } from "@/shared/items/bis-columns";
import { effectiveStats } from "@/shared/items/loadout-stats";
import { publishHeadroom } from "@/lib/combat/headroom";
import { effectiveRun, goalCount, solveGoalsAsync, type GoalOutcome } from "@/shared/items/bis-goals";
import { meleeWeighted } from "@/shared/items/melee";
import { procSpellIndex } from "@/shared/items/damage-plan";
import { gradedTitle } from "@/shared/items/item-upgrade";
import { zonesByReach } from "@/shared/items/item-era";
import { wikiName } from "@/shared/shown-name";
import { exportAgeText } from "@/shared/game-exports";
import { createLogger } from "@/shared/logging";
import { narrowing, type ExaltationCard, type SocketPlan } from "@/shared/items/exaltations";
import type { ItemCriteria, ItemRow, StatWeights } from "@/shared/items/item-search";
import type { DerivedRate } from "@/shared/items/derived-stats";

const log = createLogger("bis");

// Kept past this component: leaving the Items tab and coming back finds the plan already made.
const planCache = createPlanCache<BisPlan>();
const goalCache = createPlanCache<GoalOutcome>();

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The loadout builder: plan your gear, by the Items tab's weights and criteria.
 *
 * **One loadout** (ADR 0329), drawn from what you hold — bags, bank, Storage, wherever — and, with
 * hunting on, from the catalogue: each slot says either where you have its pick or where to go and get
 * it. Your say is `options`, held by the panel so a preset can carry it: locks (which hold until you
 * unlock them), wanted effects (part of what "best" means, so they can take a slot — a shield for its
 * focus), and exclusions (gone from every question this page asks). See `bis-plan.ts` for the rules and
 * `bis.ts` for why the loadout is exact.
 *
 * Laid out as one thing: the loadout up top with what steers it, and everything that explains or
 * refines it folded underneath.
 *
 * **Someone else's, too** (ADR 0342): given a `holder` — a peer sharing their inventory — it plans
 * from what they hold instead, by your weights and criteria, so you can work out their gear with them.
 */
export default function BisView({
  rows,
  criteria,
  weights,
  closedZones,
  scored,
  options,
  onOptions,
  onClearName,
  rates,
  holder,
  damage,
}: {
  rows: readonly ItemRow[];
  criteria: ItemCriteria;
  weights: StatWeights;
  closedZones?: ReadonlySet<string>;
  /** Whether the weight sheet scores anything — without weights there is nothing to rank by. */
  scored: boolean;
  options: BisOptions;
  onOptions: (next: BisOptions) => void;
  /** Clear the Search box's name text — offered when it's what narrowed the hunt to nothing. */
  onClearName?: () => void;
  /** What attributes add to HP, mana and AC for your classes and level — the totals include them. */
  rates?: readonly DerivedRate[];
  /** A peer to plan for, in place of you — their shared inventory, null until it arrives. */
  holder?: PeerInventory;
  /** The window "damage taken" is read over, shared with the status bar's pill. Without it the section isn't drawn. */
  damage?: DamageControl;
}) {
  const own = useInventory();
  const { items, at } = holder ?? own;
  // What each proc's spell hits for — the Damage section's proc damage reads it.
  const { rows: spells } = useSpellCatalog();
  const procSpells = useMemo(() => procSpellIndex(spells), [spells]);
  // What's planned waits for the options to hold still — typing a melee weight is one plan, not one a
  // keystroke. The controls below show and edit the live `options`.
  const planned = useSettled(options);
  // Melee weights rank weapons on their own, so they're a yardstick even with the sheet empty.
  const goaled = goalCount(planned.goals) > 0;
  const ranked = scored || meleeWeighted(planned.melee) || goaled;
  const closedKey = closedZones && [...closedZones].sort();
  // Goals become ordinary weights (ADR 0353): the plan below is planned with what they come to, and
  // the numbers it shows are on that scale — 10,000 is the best any loadout could do for one thing.
  // The search takes a dozen plans, so it runs a plan at a time off the render, and a newer ask aborts
  // the one in flight. Until its answer lands the last one steers, so the page doesn't blank on a drag.
  const goalKey = goaled ? planKey([rows, items, procSpells], [criteria, weights, planned, rates, closedKey]) : "";
  const [, answered] = useState(0);
  const lastSteering = useRef<GoalOutcome | null>(null);
  useEffect(() => {
    if (!goaled || goalCache.peek(goalKey)) return;
    const abort = new AbortController();
    const started = performance.now();
    const run = effectiveRun((w, melee) => {
      const p = bisPlan({ rows, inventory: items ?? [], criteria, weights: w, closedZones, options: { ...planned, melee }, procSpells });
      return { total: p.loadout.total, stats: p.stats.loadout };
    }, rates ?? []);
    void solveGoalsAsync({ goals: planned.goals, sheet: weights, melee: planned.melee, rates: rates ?? [], run }, abort.signal).then((outcome) => {
      if (!outcome) return log.debug("goals aborted", Math.round(performance.now() - started), "ms in");
      log.debug("goals", { ms: Math.round(performance.now() - started), solves: outcome.solves, rows: outcome.rows });
      goalCache.set(goalKey, outcome);
      answered((n) => n + 1);
    });
    return () => abort.abort();
    // `goalKey` is everything below by content; only the big inputs are tracked by identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalKey, rows, items, procSpells]);
  const answer = goaled ? goalCache.peek(goalKey) : undefined;
  // Goals cleared and set again are a new ask: the old answer's rows would grade goals it never saw.
  if (answer || !goaled) lastSteering.current = answer ?? null;
  const steering = goaled ? (answer ?? lastSteering.current) : null;
  const searching = goaled && !answer;
  // Where to get a pick, led by a zone your criteria and the era actually allow — the reason it's offered.
  const orderZones = useMemo(() => (zones: readonly string[]) => zonesByReach(zones, criteria.facets.zone, closedZones), [criteria.facets.zone, closedZones]);
  // Stats you weighted, set a goal on or put a floor under get a column in the loadout grid.
  const statKeys = useMemo(() => expectedStats(weights, options.goals, criteria.mins), [weights, options.goals, criteria.mins]);
  const planWeights = steering?.weights ?? weights;
  const planMelee = steering?.melee ?? planned.melee;
  const plan = useMemo(() => {
    if (!ranked || (goaled && !steering)) return null;
    // Goals are keyed out: the plan never reads them, only the weights they come to — so while a new
    // goal is being searched, the last answer's plan is a hit rather than a fresh plan of the same thing.
    const key = planKey([rows, items, procSpells], [criteria, planWeights, { ...planned, goals: undefined }, planMelee, closedKey]);
    return planCache.get(key, () => {
      const started = performance.now();
      // No dump is still a plan: everything is to hunt, and nothing is worn now.
      const p = bisPlan({ rows, inventory: items ?? [], criteria, weights: planWeights, closedZones, options: { ...planned, melee: planMelee }, procSpells });
      log.debug("plan", { ms: Math.round(performance.now() - started), picks: p.loadout.picks.length, toHunt: p.toHunt, effects: p.effects.length });
      return p;
    });
  }, [items, ranked, goaled, steering, rows, criteria, planWeights, closedZones, closedKey, planned, planMelee, procSpells]);

  // The status bar's pill can't plan a loadout, so it borrows this one's answer: the AC, health and mana you
  // wear against what this loadout reaches, attributes counted. Yours only, and only with a dump to compare
  // against.
  useEffect(() => {
    if (holder || !items || !plan) return;
    const worn = effectiveStats(plan.stats.wearing, rates ?? []).total;
    const planned = effectiveStats(plan.stats.loadout, rates ?? []).total;
    const reach = (stat: "ac" | "hp" | "mana") => ({ wearing: worn[stat] ?? 0, loadout: planned[stat] ?? 0 });
    publishHeadroom({ ac: reach("ac"), hp: reach("hp"), mana: reach("mana"), at });
  }, [holder, items, plan, rates, at]);

  if (goaled && !steering) {
    return (
      <>
        <p className="muted small">Planning for your goals…</p>
        <BisGoals goals={options.goals} rows={[]} rates={rates} onGoals={(goals) => onOptions({ ...options, goals })} />
      </>
    );
  }
  if (!ranked || !plan) {
    return (
      <>
        <Empty title="Set some value weights first." hint="Open Value weights above and say what a point of each stat is worth to you — the loadout is ranked by your yardstick, not ours. Or set a goal below: HP, AC, mana, melee damage." />
        <BisGoals goals={options.goals} rows={[]} rates={rates} onGoals={(goals) => onOptions({ ...options, goals })} />
        <button
          className="btn sm"
          onClick={() => onOptions({ ...options, melee: { ...options.melee, damage: 1 } })}
          title="Rank weapons by eqlwiki's melee damage model — tune it, and procs, under Damage"
        >
          Or weigh weapons by damage
        </button>
      </>
    );
  }

  const classes = criteria.facets.class;
  const filled = plan.loadout.picks.length;
  const held = filled - plan.toHunt;
  const sockets = plan.sockets.filter((s) => s.filled || s.options.length);
  const choicesCost = round2(plan.unconstrained - plan.loadout.total);
  const met = plan.effects.filter((e) => e.how !== "missing").length;
  const improve = plan.merges.length + sockets.length;
  const skip = (title: string) => onOptions(withExcluded(options, title));

  return (
    <div className="bis">
      <p className="muted small">
        By your value weights, for {classes.length ? classes.join(" / ") : <b>any class</b>}
        {classes.length ? "" : " — tick your three classes in Class above so only what you can wear counts"}.{" "}
        {sourceText(holder, items, at)}
      </p>

      <div className="row wrap bis-steer">
        <label className="muted small" title="Off: plan from the catalogue alone, every item as it drops (+0 unless you set a grade) — the best unupgraded gear, ignoring what you hold and how far you've merged it">
          <input type="checkbox" checked={options.includeOwned} onChange={(e) => onOptions({ ...options, includeOwned: e.target.checked, includeHunt: e.target.checked ? options.includeHunt : true })} /> include what I own
        </label>
        {options.includeOwned && (
        <div className="segmented" role="group" aria-label="Plan from">
          <button
            className={segCls(!options.includeHunt)}
            onClick={() => onOptions({ ...options, includeHunt: false })}
            title="Plan only from gear you hold — nothing to hunt goes in the loadout, locked or not. What would beat it is listed under Upgrades to hunt."
          >
            Owned gear only
          </button>
          <button
            className={segCls(options.includeHunt)}
            onClick={() => onOptions({ ...options, includeHunt: true })}
            title="Plan with catalogue items you don't hold yet, beside what you do"
          >
            Owned + hunt
          </button>
        </div>
        )}
        {options.includeHunt && (
          <label className="muted small" title="Each item to hunt weighed as if merged up to this grade">
            weighed at{" "}
            <select className="select-sm" value={options.huntGrade} onChange={(e) => onOptions({ ...options, huntGrade: Number(e.target.value) })}>
              {HUNT_GRADE_CHOICES.map((g) => (
                <option key={g} value={g}>
                  +{g}
                </option>
              ))}
            </select>
          </label>
        )}
        <NameFilterNote text={criteria.text} matches={plan.catalogueMatches} hunting={options.includeHunt} onClear={onClearName} />
      </div>

      <div className="bis-summary">
        {items && (
          <>
            <span>
              Wearing now <b>{plan.wearing}</b>
            </span>
            <span>→</span>
          </>
        )}
        <span>
          Loadout <b>{plan.loadout.total}</b>
        </span>
        {items && <span className={plan.loadout.total > plan.wearing ? "good" : "muted"}>{signed(round2(plan.loadout.total - plan.wearing))}</span>}
        <span className="muted small">
          {held} held · {plan.toHunt} to hunt
        </span>
        {choicesCost > 0 && (
          <span className="muted small" title={`With no locks or wanted effects the best would be ${plan.unconstrained}`}>
            your locks and effects cost {choicesCost}
          </span>
        )}
      </div>
      {plan.unweighed.length > 0 && <p className="muted small">Not weighed — no item page here yet: {plan.unweighed.join(", ")}.</p>}

      <DumpSection
        title="Goals"
        aside={goaled ? `${goalCount(options.goals)} set${searching ? " · searching…" : ""}${steering?.rows.some((r) => !r.met) ? " · not all met" : ""}` : "set a target"}
        defaultOpen={goaled}
      >
        <BisGoals goals={options.goals} rows={steering?.rows ?? []} rates={rates} driven={steering?.driven} onGoals={(goals) => onOptions({ ...options, goals })} />
      </DumpSection>

      <BisChoices plan={plan} options={options} onOptions={onOptions} />
      <BisWearTable plan={plan} options={options} onOptions={onOptions} weights={planWeights} rates={rates} statKeys={statKeys} orderZones={orderZones} />

      <DumpSection
        title="Wanted effects"
        aside={plan.effects.length ? `${met} of ${plan.effects.length} met` : "none asked for"}
        defaultOpen={plan.effects.length > met}
      >
        <BisEffects rows={rows} wanted={options.wantEffects} plans={plan.effects} orderZones={orderZones} onWanted={(wantEffects) => onOptions({ ...options, wantEffects })} />
      </DumpSection>

      {items && (
        <DumpSection title={holder ? "Improve what they own" : "Improve what you own"} aside={improve ? `${plan.merges.length} merges · ${sockets.length} sockets` : "nothing to do"} defaultOpen={false}>
          {plan.merges.length > 0 && (
            <ul className="bis-list">
              {plan.merges.map((m) => (
                <li key={m.title}>
                  <ItemLink title={gradedTitle(m.title, m.to)} /> — merge your {m.grades.length} copies (+{m.grades.join(", +")}) into one +{m.to}
                  {m.toExp > 0 && <span className="muted" title="Exp toward the next grade already raises the bigger stats"> and {m.toExp}/{2 ** m.to} exp toward +{m.to + 1}</span>}
                  <span className="good"> {signed(m.gain)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="muted small">
            Any stone can go in any item&apos;s socket of its kind, and any effect can be taken out — ranking an item up for it is assumed. A
            stone carries one effect, never stats, so it isn&apos;t counted in the value above. Wanted effects come first; a stone planned for one
            shows on its row above.
          </p>
          {sockets.map((s, n) => (
            <SocketRow key={n} plan={s} claim={plan.socketClaims.find((c) => c.host === s.host && c.kind === s.kind)} />
          ))}
        </DumpSection>
      )}

      <DumpSection
        title="Damage"
        aside={meleeWeighted(options.melee) ? `swing ${plan.damage.loadout.perSecond} · procs ${plan.damage.loadout.ppm}/min` : "not weighted"}
        defaultOpen={false}
      >
        <BisDamage
          report={plan.damage}
          melee={options.melee}
          classes={classes}
          onMelee={(melee) => onOptions({ ...options, melee })}
          wanted={options.wantEffects}
          onWant={(effect) => onOptions({ ...options, wantEffects: toggleTitle(options.wantEffects, effect) })}
        />
      </DumpSection>

      <DumpSection title="Stats" aside={items ? "wearing now → loadout" : "the loadout"} defaultOpen={false}>
        <BisStats wearing={plan.stats.wearing} loadout={plan.stats.loadout} rates={rates} />
      </DumpSection>

      {/* The log is yours and so is the worn gear it's compared with: not offered while planning for a peer. */}
      {damage && !holder && <BisDamageTaken {...damage} wearing={plan.stats.wearing} />}

      {!options.includeHunt && (
        <DumpSection title="Upgrades to hunt" aside={`${plan.hunt.length}`} defaultOpen={false}>
          <p className="muted small">
            What it would add over what it replaces, at +0 — and at +2, +5 and +10, which take 4, 32 and 1,024 copies merged (hover a figure
            for the card at that grade). Choose <i>Owned + hunt</i> to plan them into the loadout itself.
          </p>
          {plan.hunt.length ? (
            <BisHuntTable hunt={plan.hunt} onSkip={skip} orderZones={orderZones} weights={planWeights} rates={rates} />
          ) : (
            <p className="muted small">
              Nothing you could get beats what you&apos;d wear
              {plan.loadout.locked.length ? ` in the ${WORN_LAYOUT.length - plan.loadout.locked.length} slots you haven't locked` : ""}, under your
              criteria above.
            </p>
          )}
        </DumpSection>
      )}

      <DumpSection title="Exclusions" aside={`${options.excluded.length}`} defaultOpen={options.excluded.length > 0}>
        {options.excluded.length ? (
          <TitleChips titles={options.excluded} onRemove={(t) => onOptions({ ...options, excluded: toggleTitle(options.excluded, t) })} />
        ) : (
          <p className="muted small">Nothing excluded. ⊘ on a loadout row rules an item out of everything on this page — worn, hunted, an effect&apos;s carrier or a stone&apos;s source.</p>
        )}
      </DumpSection>
    </div>
  );
}

/** Whose inventory the plan is drawn from, and how old it is. */
function sourceText(holder: PeerInventory | undefined, items: readonly unknown[] | null, at: number | undefined): string {
  const age = at ? `, written ${exportAgeText(Date.now() - at)}` : "";
  if (holder) {
    return items
      ? `From ${holder.name}'s shared inventory${age} — tick their classes in Class above, since what's weighed is by your sheet.`
      : `Waiting for ${holder.name}'s inventory…`;
  }
  return items ? `From your inventory dump${age}.` : "No inventory dump yet — /outputfile inventory in game, and what you hold joins the plan.";
}

/**
 * Says so when the Search box's name text is narrowing what can be hunted — and loudly when it narrows
 * it to nothing, which otherwise reads as a broken page (ADR 0329). The box is respected, not ignored:
 * this is what makes that visible.
 */
function NameFilterNote({ text, matches, hunting, onClear }: { text: string; matches: number; hunting: boolean; onClear?: () => void }) {
  if (!text.trim() || !hunting) return null;
  return (
    <span className={`small ${matches ? "muted" : "warn"}`}>
      {matches
        ? `Gear to hunt is narrowed to names containing “${text.trim()}” — ${matches} match.`
        : `No gear to hunt: the name box says “${text.trim()}”, and nothing wearable matches it.`}{" "}
      {onClear && (
        <button className="btn ghost sm" onClick={onClear} title="Clear the Search box's name text">
          Clear name
        </button>
      )}
    </span>
  );
}

/**
 * What you've decided, with a way back out: lock everything as it stands, unlock, copy the loadout as
 * text, or reset every lock, wanted effect and exclusion.
 */
function BisChoices({ plan, options, onOptions }: { plan: BisPlan; options: BisOptions; onOptions: (next: BisOptions) => void }) {
  const locks = Object.keys(options.locks).length;
  const changed = bisOptionCount(options);
  return (
    <div className="row wrap bis-choices">
      <button
        className="btn sm"
        title="Lock every slot to what the loadout puts there — then unlock just the ones you want re-solved"
        onClick={() => onOptions(lockAll(options, plan.loadout.picks.map((p) => ({ slotIndex: p.slotIndex, title: p.item.title }))))}
      >
        🔒 Lock all
      </button>
      {locks > 0 && (
        <button className="btn sm" onClick={() => onOptions({ ...options, locks: {} })} title="Let the solver choose every slot again">
          🔓 Unlock {locks}
        </button>
      )}
      <button className="btn sm" onClick={() => void copyText(loadoutText(plan), "the loadout")} title="Copy the loadout as text, a slot a line">
        Copy loadout
      </button>
      {changed > 0 && (
        <button className="btn sm" onClick={() => onOptions(withoutChanges(options))} title="Drop every lock, wanted effect and exclusion">
          Reset ({changed})
        </button>
      )}
    </div>
  );
}

function TitleChips({ titles, onRemove }: { titles: readonly string[]; onRemove: (title: string) => void }) {
  return (
    <div className="row wrap small">
      {titles.map((t) => (
        <span key={t} className="bis-chip">
          <ItemLink title={wikiName(t)} />
          <button className="btn ghost sm" title="Put it back into consideration" onClick={() => onRemove(t)}>
            ×
          </button>
        </span>
      ))}
    </div>
  );
}

/** What a stone's restrictions take from its host — they come with it (eqlwiki's Exaltations, Restrictions). */
function StoneCost({ base, result }: { base: ExaltationCard; result: ExaltationCard }) {
  const cost = narrowing(base, result);
  if (!cost) return null;
  return (
    <span className="warn" title="An exaltation's class and slot restrictions are applied to the item it goes into">
      {" "}
      · {cost}
    </span>
  );
}

function SocketRow({ plan, claim }: { plan: SocketPlan; claim?: BisPlan["socketClaims"][number] }) {
  return (
    <div className={`bis-socket${claim ? " claimed" : ""}`}>
      <span>
        <b>{plan.host}</b> <span className="muted">{plan.kind}</span>
      </span>
      {plan.filled ? <span className="small">holds {plan.filled}</span> : <span className="small muted">empty</span>}
      {claim && (
        <span className="small good" title="A wanted effect is planned into this socket">
          → {claim.stone.effect} (wanted)
        </span>
      )}
      {plan.options.length > 0 && (
        <ul className="bis-list small">
          {plan.options.map((o, i) => (
            <li key={i} title={o.uncertain ? "This stone's item has more than one effect; the dump can't say which it holds" : undefined}>
              {o.effect}
              {o.uncertain ? "?" : ""}{" "}
              <span className="muted">
                · from <ItemLink title={wikiName(o.from)} /> · {o.where}
              </span>
              <StoneCost base={plan.base} result={o.result} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
