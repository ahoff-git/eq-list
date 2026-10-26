"use client";
import { useMemo } from "react";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import ItemLink from "@/app/components/items/ItemLink";
import { CheckField } from "@/app/components/ui";
import { GRID_DEFAULTS, GRID_SX_FIT, NUM_COL } from "@/app/components/dataGridDefaults";
import { gradedTitle } from "@/shared/items/item-upgrade";
import { PROC_DEX_CAP, SPELLBLADE_CLASSES, type MeleeWeights } from "@/shared/items/melee";
import type { DamageReport, ProcChoice, WeaponLine, WeaponSetup } from "@/shared/items/damage-plan";
import { normalizeItemName } from "@/shared/items/grouping";

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;

type Row = { id: string; label: string; setup: WeaponSetup };

/** One hand of a setup: the weapon, and where it's held or that it's to hunt. */
function Weapon({ line }: { line?: WeaponLine }) {
  if (!line) return <span className="muted">—</span>;
  return (
    <span title={line.heldAt ? `You hold it: ${line.heldAt}` : "To hunt"}>
      <ItemLink title={gradedTitle(line.title, line.grade)} />
      {line.proc && (
        <span className="muted small" title={line.proc.perSecond ? `${line.proc.name}: ${line.ppm} procs a minute here` : `${line.proc.name}: its damage isn't counted — none on its page, over time, or only some mobs`}>
          {" "}
          · {line.proc.name}
        </span>
      )}
      {!line.heldAt && <span className="muted small"> · hunt</span>}
    </span>
  );
}

/**
 * Where your haste stands against your level's cap, and the most any one item in reach would give. Only
 * the best worn haste item counts, so the next one is only worth what it beats yours by, up to the cap.
 */
function HasteAdvice({ report }: { report: DamageReport }) {
  const { haste, level } = report.model;
  const best = report.bestHaste;
  const room = haste.cap - haste.effective;
  const lift = best ? Math.min(haste.cap, best.haste + haste.buffs) - haste.effective : 0;
  return (
    <>
      Haste {haste.fromItem}% from your best worn item{haste.buffs ? ` + ${haste.buffs}% from buffs` : ""} = {haste.effective}% of the {haste.cap}% cap at
      level {level}
      {report.loadoutHaste.fromItem !== haste.fromItem && ` (the loadout's best item: ${report.loadoutHaste.fromItem}%, so ${report.loadoutHaste.effective}%)`}. Only your best haste item counts.{" "}
      {room <= 0 ? (
        "You're at the cap — more item haste adds nothing while those buffs hold."
      ) : best && lift > 0 ? (
        <>
          The most in reach is <ItemLink title={gradedTitle(best.title, best.grade)} /> ({best.haste}%, {best.slots.join("/")}
          {best.heldAt ? `, you hold it: ${best.heldAt}` : ", to hunt"}) — +{lift}% haste, about {Math.round((lift / (100 + haste.effective)) * 1000) / 10}% more
          swings.
        </>
      ) : (
        `${room}% of room left under the cap, and nothing in reach beats what you wear.`
      )}
    </>
  );
}

/**
 * The catalogue's hardest-hitting procs, by what each would add in your main hand. Any of them can go
 * into a weapon's proc socket as a stone, so "Want" hands it to Wanted effects, which plans it in.
 */
function MeanestProcs({ report, wanted, onWant }: { report: DamageReport; wanted: readonly string[]; onWant: (effect: string) => void }) {
  if (!report.meanestProcs.length) return null;
  const isWanted = (p: ProcChoice) => wanted.some((w) => normalizeItemName(w) === normalizeItemName(p.name));
  return (
    <div className="small">
      <span className="muted">Meanest procs in reach, in your main hand at DEX {report.model.dex}:</span>
      <ul className="bis-list">
        {report.meanestProcs.map((p) => (
          <li key={p.name}>
            <b>{p.name}</b> — {p.damage} a hit, {p.perSecond} damage/s
            <span className="muted"> · on {p.carriers} card{p.carriers === 1 ? "" : "s"}</span>{" "}
            <button
              className="btn ghost sm"
              onClick={() => onWant(p.name)}
              title={isWanted(p) ? "Stop wanting it" : "Add it to Wanted effects — the plan sockets it into a weapon, or wears something that carries it"}
            >
              {isWanted(p) ? "✓ wanted" : "+ want"}
            </button>
          </li>
        ))}
      </ul>
      {report.uncountedProcs > 0 && (
        <span className="muted">
          {report.uncountedProcs} other procs aren&apos;t counted: no damage on their spell page, damage over time, or only against undead, summoned or
          some other kind.
        </span>
      )}
    </div>
  );
}

const COLUMNS: GridColDef<Row>[] = [
  { field: "label", headerName: "", flex: 1, minWidth: 120 },
  { field: "primary", headerName: "Main hand", flex: 2, minWidth: 160, valueGetter: (_v, row) => row.setup.primary?.title, renderCell: (p) => <Weapon line={p.row.setup.primary} /> },
  { field: "secondary", headerName: "Off hand", flex: 2, minWidth: 160, valueGetter: (_v, row) => row.setup.secondary?.title, renderCell: (p) => <Weapon line={p.row.setup.secondary} /> },
  { field: "perSecond", headerName: "Swing / s (hasted)", ...NUM_COL, flex: 1, valueGetter: (_v, row) => row.setup.perSecond },
  { field: "ppm", headerName: "Procs / min", ...NUM_COL, flex: 1, valueGetter: (_v, row) => row.setup.ppm },
  { field: "procPerSecond", headerName: "Proc dmg / s", ...NUM_COL, flex: 1, valueGetter: (_v, row) => row.setup.procPerSecond },
];

/**
 * The melee model on the loadout page (ADR 0337): what a weapon's damage and procs are worth to you,
 * the chances your classes and level give, your weapons now and in the loadout beside the best the pool
 * could swing, and what DEX and haste would add. The model is eqlwiki's — see `melee.ts`.
 */
export default function BisDamage({
  report,
  melee,
  classes,
  onMelee,
  wanted,
  onWant,
}: {
  report: DamageReport;
  melee: MeleeWeights;
  classes: readonly string[];
  onMelee: (next: MeleeWeights) => void;
  /** The loadout's wanted effects — a proc wanted here is socketed or worn by the plan. */
  wanted: readonly string[];
  onWant: (effect: string) => void;
}) {
  const { model } = report;
  const { haste } = model;
  const c = model.chances;
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    if (report.wearing) out.push({ id: "wearing", label: "Wearing now", setup: report.wearing });
    out.push({ id: "loadout", label: "Loadout", setup: report.loadout });
    if (report.bestDualWield) out.push({ id: "dw", label: c.dualWield > 0 ? "Most damage, 1H" : "Most damage, 1H (no dual wield)", setup: report.bestDualWield });
    if (report.bestTwoHanded) out.push({ id: "2h", label: "Most damage, 2H", setup: report.bestTwoHanded });
    return out;
  }, [report, c.dualWield]);

  const dw = report.bestDualWield?.perSecond ?? 0;
  const th = report.bestTwoHanded?.perSecond ?? 0;
  const spellblade = classes.some((k) => SPELLBLADE_CLASSES.has(k));
  const number = (v: string) => (v.trim() === "" || !Number.isFinite(Number(v)) ? 0 : Number(v));

  return (
    <div className="bis-damage">
      <div className="row wrap">
        <label className="iw-stat" title="Value points per point of swing score (per second) — set it and weapons are weighed by the model in the hands, not by their DMG/delay weights">
          <span className={melee.damage ? "iw-name on" : "iw-name"}>Swing</span>
          <input className="field sm iw-box" type="number" step="any" value={melee.damage || ""} onChange={(e) => onMelee({ ...melee, damage: number(e.target.value) })} />
        </label>
        <label className="iw-stat" title="Value points per proc a minute, from a weapon that procs — also makes DEX worth more until 255">
          <span className={melee.procs ? "iw-name on" : "iw-name"}>Procs</span>
          <input className="field sm iw-box" type="number" step="any" value={melee.procs || ""} onChange={(e) => onMelee({ ...melee, procs: number(e.target.value) })} />
        </label>
        <CheckField label="Ambidexterity" title="The AA: dual wield chance ×1.32" checked={melee.ambidexterity} onChange={(ambidexterity) => onMelee({ ...melee, ambidexterity })} />
        <label className="muted small" title="The AA's rank: 7/11/15% flurry chance after a main-hand triple attack">
          Burst of Power{" "}
          <select className="select-sm" value={melee.burstOfPower} onChange={(e) => onMelee({ ...melee, burstOfPower: Number(e.target.value) })}>
            {[0, 1, 2, 3].map((r) => (
              <option key={r} value={r}>
                {r || "none"}
              </option>
            ))}
          </select>
        </label>
        <CheckField
          label="Count proc damage"
          title="Add each weapon's proc damage per second to its swing, at the Swing weight — instant procs that hit anything, at your DEX"
          checked={melee.procDamage}
          onChange={(procDamage) => onMelee({ ...melee, procDamage })}
        />
        <label className="iw-stat" title="Haste from buffs and songs you usually have (an Enchanter's, a Bard's), in percent — it adds to your best worn haste item, up to your level's cap">
          <span className={melee.buffHaste ? "iw-name on" : "iw-name"}>Buff haste %</span>
          <input className="field sm iw-box" type="number" min={0} step={1} value={melee.buffHaste || ""} onChange={(e) => onMelee({ ...melee, buffHaste: Math.max(0, number(e.target.value)) })} />
        </label>
      </div>

      <p className="muted small" title="Skills are taken as trained to the wiki's modelled cap for your classes and level">
        Level {model.level}
        {classes.length ? ` ${classes.join(" / ")}` : " — tick your classes above"}: dual wield {pct(c.dualWield)} (skill {c.skills.dualWield}) · double attack{" "}
        {pct(c.doubleAttack)} · triple attack {pct(c.tripleAttack)}
        {c.tripleAttack > 0 && c.flurry > 1 && ` · flurry ×${c.flurry}`}. Swings are at your {haste.effective}% haste now.
      </p>

      <DataGrid {...GRID_DEFAULTS} sx={GRID_SX_FIT} columns={COLUMNS} rows={rows} autoHeight hideFooter />

      <MeanestProcs report={report} wanted={wanted} onWant={onWant} />

      <ul className="bis-list small">
        {dw > 0 && th > 0 && (
          <li>
            {dw >= th ? "Two one-handers" : "A two-hander"} swing{dw >= th ? "" : "s"} hardest here: {Math.max(dw, th)} against {Math.min(dw, th)}
            {c.dualWield === 0 && " — your classes can't dual wield, so an off hand adds nothing"}.
          </li>
        )}
        <li>
          {report.dexToCap > 0 ? (
            <>
              DEX {model.dex}
              {!model.dexKnown && " (tick one race above for an exact base)"} — {report.dexToCap} more to {PROC_DEX_CAP} adds {report.ppmAtCap} procs a minute
              from a main-hand proc, half that from the off hand.
            </>
          ) : (
            <>DEX {model.dex} is at {PROC_DEX_CAP}: more adds no procs.</>
          )}
        </li>
        <li>
          <HasteAdvice report={report} />
        </li>
        {spellblade && <li>Spellblade procs your top spell gem more often with more max mana and a cheaper spell. The wiki gives no rate, so it isn&apos;t counted.</li>}
        <li className="muted">
          Not in the model: STR, ATK, Offense, hit rate, crits and mitigation. From eqlwiki&apos;s{" "}
          <a href="https://eqlwiki.com/Skill_Dual_Wield#Working_Legends_Damage_Bonus_Model" target="_blank" rel="noreferrer">
            working damage model
          </a>{" "}
          and{" "}
          <a href="https://eqlwiki.com/Weapon_Procs" target="_blank" rel="noreferrer">
            Weapon Procs
          </a>{" "}
          and the{" "}
          <a href="https://eqlwiki.com/Haste_Guide" target="_blank" rel="noreferrer">
            Haste Guide
          </a>
          , none of them confirmed by the developers.
        </li>
      </ul>
    </div>
  );
}
