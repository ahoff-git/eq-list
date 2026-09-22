"use client";
import { useMemo } from "react";
import { api } from "@/lib/api";
import { usePersistentState } from "@/lib/usePersistentState";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import { CLASS_NAMES, CLASS_SEARCH_ALIASES, type ClassName } from "@/shared/class-names";
import { countOf } from "@/shared/format";
import { distinctSorted } from "@/shared/sorting";
import {
  ABILITY_INVOCATIONS,
  ABILITY_STANCES,
  NO_ABILITY_CRITERIA,
  STANCES_INVOCATIONS_SOURCE,
  filterAbilities,
  type Ability,
  type AbilityCriteria,
} from "@/shared/stances-invocations";
import FacetPicker from "./FacetPicker";
import SearchField from "./SearchField";
import { Empty, SourceCountRow, segCls } from "./ui";

type View = "stances" | "invocations";

/** The class picker's options, alphabetical rather than `CLASS_NAMES`'s game order — the same order
 *  every other class picker in the app already offers (Items/Spells derive theirs from the catalogue
 *  the same way, `distinctSorted`), computed once since the sixteen classes never change mid-session. */
const CLASS_PICKER_OPTIONS = distinctSorted(CLASS_NAMES);

/**
 * Which classes can use which stance or invocation — eqlwiki's own reference chart
 * ([ADR 0262](../../../specs/decisions/0262-stances-and-invocations-are-generated-static-data.md)),
 * not the log. It answers a *planning* question ("could a Ranger bring Spellblade?") rather than the
 * damage meter's ADR 0020 split, which answers an *observed* one ("which invocation was up for this
 * cast") — the two share vocabulary because EQL does, not because either reads the other.
 *
 * **One list, two ways to read it — the "reverse lookup" is the same filter, read the other
 * direction.** Ticking classes narrows the chart to a combination ("what could this trio bring
 * between them") the same way the Items tab's class facet narrows gear; typing narrows by *effect*,
 * not just name, so "what gives me double attack" (Ranged Stance) works without knowing its name up
 * front — that's the reverse question the wiki page itself can't answer, since its own table only
 * reads name → classes. A row's class chips are the answer either way: read across to see who has
 * it, and the ticked ones light up so a combination is legible without cross-checking the picker.
 */
export default function StancesPanel() {
  const [view, setView] = usePersistentState<View>(STORAGE_KEYS.stanceView, "stances");
  const [criteria, setCriteria] = usePersistentState<AbilityCriteria>(STORAGE_KEYS.stanceCriteria, NO_ABILITY_CRITERIA);
  const active = useMemo<AbilityCriteria>(() => ({ ...NO_ABILITY_CRITERIA, ...criteria }), [criteria]);
  const set = (patch: Partial<AbilityCriteria>) => setCriteria({ ...active, ...patch });

  const all = view === "stances" ? ABILITY_STANCES : ABILITY_INVOCATIONS;
  const shown = useMemo(() => filterAbilities(all, active), [all, active]);
  const conditions = (active.text.trim() ? 1 : 0) + (active.classes.length ? 1 : 0);
  const ticked = useMemo(() => new Set(active.classes), [active.classes]);

  return (
    <div className="stance-panel">
      <p className="buff-how small">
        Which classes can use which <b>stance</b> (melee) or <b>invocation</b> (casting) — straight off
        eqlwiki, not your log: this is what a class <i>could</i> do, not what it has done.
      </p>

      <div className="row wrap" style={{ marginBottom: 12 }}>
        <div className="segmented">
          <button
            className={segCls(view === "stances")}
            onClick={() => setView("stances")}
            title="Melee stances — one active at a time, alongside your invocation"
          >
            Stances ({ABILITY_STANCES.length})
          </button>
          <button
            className={segCls(view === "invocations")}
            onClick={() => setView("invocations")}
            title="Casting invocations — one active at a time, alongside your stance"
          >
            Invocations ({ABILITY_INVOCATIONS.length})
          </button>
        </div>
        <span className="spacer" />
        <FacetPicker
          label="Class"
          any="any class"
          options={CLASS_PICKER_OPTIONS}
          aliases={CLASS_SEARCH_ALIASES}
          chosen={active.classes}
          onChange={(classes) => set({ classes: classes as ClassName[] })}
        />
        <SearchField
          value={active.text}
          onChange={(text) => set({ text })}
          placeholder="Search effects…"
          title="Matches a word in the name or the effect text — the reverse lookup: type what you want, see who can bring it"
        />
        {conditions > 0 && (
          <button className="btn sm" onClick={() => setCriteria(NO_ABILITY_CRITERIA)} title="Drop every criterion">
            Clear ({conditions})
          </button>
        )}
      </div>

      <SourceCountRow
        count={countOf(shown.length, all.length, view === "stances" ? "stance" : "invocation")}
        onOpenSource={() => void api()?.wiki.openInBrowser(STANCES_INVOCATIONS_SOURCE.title)}
      />

      {!shown.length && (
        <Empty title={`No ${view} matches all of that.`} hint="Every criterion only ever removes rows — drop one and the list grows back." />
      )}

      <div className="stance-list">
        {shown.map((a) => (
          <AbilityRow key={a.name} ability={a} ticked={ticked} />
        ))}
      </div>
    </div>
  );
}

/** One stance/invocation: its name, every class that has it (as chips — the ticked ones from the
 *  class filter light up, so a combination reads at a glance), and what it does. */
function AbilityRow({ ability, ticked }: { ability: Ability; ticked: ReadonlySet<ClassName> }) {
  return (
    <div className="stance-row">
      <div className="row wrap stance-row-head">
        <b className="stance-name">{ability.name}</b>
        <span className="stance-classes">
          {ability.classes.map((c) => (
            <span key={c} className={`badge stance-class ${ticked.has(c) ? "on" : ""}`} title={c}>
              {CLASS_SEARCH_ALIASES.get(c) ?? c}
            </span>
          ))}
        </span>
      </div>
      {/* A description can be more than one wiki paragraph (Offensive's endurance-floor caveat, for
          one) — split rather than joined, since a blank line in a `\n`-flattened `<p>` collapses to
          nothing and the caveat would read as fused onto the sentence before it. */}
      {ability.description.split("\n\n").map((para, i) => (
        <p className="stance-desc muted small" key={i}>
          {para}
        </p>
      ))}
    </div>
  );
}
