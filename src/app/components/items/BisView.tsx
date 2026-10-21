"use client";
import { useMemo } from "react";
import ItemLink from "@/app/components/items/ItemLink";
import BisWearTable from "@/app/components/items/BisWearTable";
import BisEffects from "@/app/components/items/BisEffects";
import BisHuntTable from "@/app/components/items/BisHuntTable";
import BisStats from "@/app/components/items/BisStats";
import { Empty } from "@/app/components/ui";
import { DumpSection } from "@/app/components/exports/DumpParts";
import { useInventory } from "@/lib/exports/useGameExports";
import { copyText } from "@/lib/clipboard";
import { bisPlan, loadoutText, type BisPlan } from "@/shared/items/bis-plan";
import { NO_BIS_OPTIONS, bisOptionCount, lockAll, toggleTitle, type BisOptions } from "@/shared/items/bis-options";
import { WORN_LAYOUT } from "@/shared/items/bis";
import { gradedTitle } from "@/shared/items/item-upgrade";
import { wikiName } from "@/shared/shown-name";
import { exportAgeText } from "@/shared/game-exports";
import { createLogger } from "@/shared/logging";
import type { SocketPlan } from "@/shared/items/exaltations";
import type { ItemCriteria, ItemRow, StatWeights } from "@/shared/items/item-search";

const log = createLogger("bis");

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Best in slot: the Items tab's weights and criteria turned on your inventory dump.
 *
 * Three answers, in the order you'd act on them — **wear** (the best loadout from what you already
 * hold, wherever it is, and what that's worth over what you have on), **improve** (wanted effects,
 * merges and exaltation sockets), **hunt** (what to go and get, by how much it would add, and what
 * farming more copies of it would buy). Your own say — locks, wanted effects, benched items, skipped
 * hunts — is `options`, held by the panel so a preset can carry it. See `bis-plan.ts` for the rules
 * and `bis.ts` for why the loadout is exact.
 */
export default function BisView({
  rows,
  criteria,
  weights,
  closedZones,
  scored,
  options,
  onOptions,
}: {
  rows: readonly ItemRow[];
  criteria: ItemCriteria;
  weights: StatWeights;
  closedZones?: ReadonlySet<string>;
  /** Whether the weight sheet scores anything — without weights there is nothing to rank by. */
  scored: boolean;
  options: BisOptions;
  onOptions: (next: BisOptions) => void;
}) {
  const { items, at } = useInventory();
  const plan = useMemo(() => {
    if (!items || !scored) return null;
    const started = performance.now();
    const p = bisPlan({ rows, inventory: items, criteria, weights, closedZones, options });
    log.debug("plan", { ms: Math.round(performance.now() - started), picks: p.loadout.picks.length, hunt: p.hunt.length, effects: p.effects.length });
    return p;
  }, [items, scored, rows, criteria, weights, closedZones, options]);

  if (!items) {
    return <Empty title="No inventory dump yet." hint="In game, type /outputfile inventory (Exports tab has a copy button) — this works from what you hold." />;
  }
  if (!scored || !plan) {
    return <Empty title="Set some value weights first." hint="Open Value weights above and say what a point of each stat is worth to you — best in slot ranks by your yardstick, not ours." />;
  }

  const classes = criteria.facets.class;
  const filled = plan.loadout.picks.length;
  const sockets = plan.sockets.filter((s) => s.filled || s.options.length);
  const quietHosts = [...new Set(plan.sockets.filter((s) => !s.filled && !s.options.length).map((s) => s.host))];
  const choicesCost = round2(plan.unconstrained - plan.loadout.total);
  const skip = (title: string) => onOptions({ ...options, skipHunt: toggleTitle(options.skipHunt, title) });

  return (
    <div className="bis">
      <p className="muted small">
        By your value weights, for {classes.length ? classes.join(" / ") : <b>any class</b>}
        {classes.length ? "" : " — tick your three classes in Class above so only what you can wear counts"}. From your inventory dump
        {at ? `, written ${exportAgeText(Date.now() - at)}` : ""}.
      </p>

      <div className="bis-summary">
        <span>
          Wearing now <b>{plan.wearing}</b>
        </span>
        <span>→</span>
        <span>
          Best from what you hold <b>{plan.loadout.total}</b>
        </span>
        <span className={plan.loadout.total > plan.wearing ? "good" : "muted"}>{signed(round2(plan.loadout.total - plan.wearing))}</span>
        {choicesCost > 0 && (
          <span className="muted small" title={`With no locks, benches or wanted effects the best would be ${plan.unconstrained}`}>
            your choices cost {choicesCost}
          </span>
        )}
      </div>
      {plan.unweighed.length > 0 && <p className="muted small">Not weighed — no item page here yet: {plan.unweighed.join(", ")}.</p>}

      <BisChoices plan={plan} options={options} onOptions={onOptions} />

      <DumpSection title="Wear" aside={`${filled} of ${WORN_LAYOUT.length} slots filled`}>
        <BisWearTable plan={plan} options={options} onOptions={onOptions} />
      </DumpSection>

      <DumpSection title="Stats" aside="wearing now → best in slot" defaultOpen>
        <BisStats wearing={plan.stats.wearing} loadout={plan.stats.loadout} />
      </DumpSection>

      <DumpSection
        title="Wanted effects"
        aside={plan.effects.length ? `${plan.effects.filter((e) => e.how !== "missing").length} of ${plan.effects.length} met` : "none asked for"}
        defaultOpen
      >
        <BisEffects rows={rows} wanted={options.wantEffects} plans={plan.effects} onWanted={(wantEffects) => onOptions({ ...options, wantEffects })} />
      </DumpSection>

      {plan.merges.length > 0 && (
        <DumpSection title="Merge" aside={`${plan.merges.length}`}>
          <ul className="bis-list">
            {plan.merges.map((m) => (
              <li key={m.title}>
                <ItemLink title={gradedTitle(m.title, m.to)} /> — merge your {m.grades.length} copies (+{m.grades.join(", +")}) into one +{m.to}
                {m.toExp > 0 && <span className="muted" title="Exp toward the next grade already raises the bigger stats"> and {m.toExp}/{2 ** m.to} exp toward +{m.to + 1}</span>}
                <span className="good"> {signed(m.gain)}</span>
              </li>
            ))}
          </ul>
        </DumpSection>
      )}

      <DumpSection title="Exaltations" aside={`${sockets.length} sockets`} defaultOpen={sockets.length > 0}>
        <p className="muted small">
          A grade opens one socket of each kind — focus at +1, click at +2, worn at +3, proc at +4. A stone carries one effect,
          never stats, so it isn&apos;t counted in the value above. Wanted effects and the ones picked in the Effects filters come first.
        </p>
        {sockets.map((s, n) => (
          <SocketRow key={n} plan={s} claim={plan.socketClaims.find((c) => c.host === s.host && c.kind === s.kind)} />
        ))}
        {quietHosts.length > 0 && <p className="muted small">Open with nothing you hold that fits: {quietHosts.join(", ")}.</p>}
      </DumpSection>

      <DumpSection title="Hunt" aside={`${plan.hunt.length}`}>
        <p className="muted small">
          What it would add over what it replaces, at +0 — and at +1, +2, +3, which take 2, 4 and 8 copies merged. Narrowed by the
          criteria above, so set the level band to what you can reach. Locked slots aren&apos;t hunted for.
        </p>
        <BisHuntTable hunt={plan.hunt} onSkip={skip} />
      </DumpSection>
    </div>
  );
}

/**
 * What you've told best in slot, at a glance, with a way back out of each: the locks (and a way to
 * lock everything as it stands), benched items, skipped hunts — and the loadout as text to paste.
 */
function BisChoices({ plan, options, onOptions }: { plan: BisPlan; options: BisOptions; onOptions: (next: BisOptions) => void }) {
  const locks = Object.keys(options.locks).length;
  const changed = bisOptionCount(options);
  return (
    <div className="bis-choices">
      <div className="row wrap">
        <span className="muted small">Your choices:</span>
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
          <button className="btn sm" onClick={() => onOptions(NO_BIS_OPTIONS)} title="Drop every lock, wanted effect, bench and skip">
            Reset ({changed})
          </button>
        )}
      </div>
      {options.benched.length > 0 && (
        <TitleChips label="Benched — never worn" titles={options.benched} onRemove={(t) => onOptions({ ...options, benched: toggleTitle(options.benched, t) })} />
      )}
      {options.skipHunt.length > 0 && (
        <TitleChips label="Not hunting" titles={options.skipHunt} onRemove={(t) => onOptions({ ...options, skipHunt: toggleTitle(options.skipHunt, t) })} />
      )}
    </div>
  );
}

function TitleChips({ label, titles, onRemove }: { label: string; titles: readonly string[]; onRemove: (title: string) => void }) {
  return (
    <div className="row wrap small">
      <span className="muted">{label}:</span>
      {titles.map((t) => (
        <span key={t} className="bis-chip">
          <ItemLink title={wikiName(t)} />
          <button className="btn ghost sm" title="Undo" onClick={() => onRemove(t)}>
            ×
          </button>
        </span>
      ))}
    </div>
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
              {o.uncertain ? "?" : ""} <span className="muted">
                · from <ItemLink title={wikiName(o.from)} /> · {o.where}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
