"use client";
import { api } from "@/lib/api";
import { usePersistentShape } from "@/lib/usePersistentState";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import { countOf } from "@/shared/format";
import { SPELL_CLASSES } from "@/shared/spell-file";
import { distinctSorted } from "@/shared/sorting";
import { AA_LIST, AA_LIST_SOURCE, NO_AA_CRITERIA, filterAA, type AlternateAdvancement } from "@/shared/aa-list";
import { Empty, PickField, SourceCountRow } from "./ui";
import SearchField from "./SearchField";

/** The class picker's — and the browse order's — options, alphabetical rather than `SPELL_CLASSES`'s
 *  file-column order (that order matters for parsing the spell file and must stay put there; nothing
 *  here needs it). The same order every other class picker in the app already offers (Items/Spells
 *  derive theirs from the catalogue the same way, `distinctSorted`). Computed once, at module load. */
const CLASS_ORDER = distinctSorted(SPELL_CLASSES);

/**
 * AAs — a searchable, filterable mirror of eqlwiki's "Alternate Advancement" page
 * ([ADR 0263](../../../specs/decisions/0263-the-alternate-advancement-page-is-generated-static-data.md)),
 * the fourth shelf of the same cabinet `StancesPanel` describes: Items browses what you could wear,
 * Spells what you could cast, Stances what you could *do*, this what you could *train*.
 *
 * **Static data, not a fetch.** `AA_LIST` ships with the app, so unlike every other reference tab
 * there is no loading state and no "nothing cached yet" `Empty` — the only empty state here is a
 * search/class combination that matched nothing.
 *
 * **The search box is the reverse lookup** — the same shape Stances' own text filter answers "what
 * gives me double attack" with: it matches a word in the *description*, not just the name, because
 * "which AAs help direct damage" is a question about effect text, and `filterAA` (`aa-list.ts`) reads
 * it literally rather than fuzzily, for the same reason `stances-invocations.ts` does.
 */
export default function AAPanel() {
  // `usePersistentShape`, not the plain `usePersistentState` StancesPanel's own criteria started
  // from: a stored value written before a field existed (the way `class` arrived after `text`) would
  // otherwise spread the gap straight back into `criteria`, and `conditions` below calling `.trim()`
  // on a missing `text` would throw instead of just reading as "not set".
  const [criteria, setCriteria] = usePersistentShape(STORAGE_KEYS.aaCriteria, NO_AA_CRITERIA);
  const shown = filterAA(AA_LIST, criteria);
  const conditions = (criteria.text.trim() ? 1 : 0) + (criteria.class ? 1 : 0);

  return (
    <div className="aa-panel">
      <div className="row wrap" style={{ marginBottom: 8 }}>
        <PickField
          value={criteria.class}
          onChange={(cls) => setCriteria({ ...criteria, class: cls as typeof criteria.class })}
          blank="all classes"
          options={CLASS_ORDER.map((c) => ({ value: c, label: c }))}
          title="Show only this class's AAs — General, Archetype and Special AAs always stay visible"
        />
        <SearchField
          value={criteria.text}
          onChange={(text) => setCriteria({ ...criteria, text })}
          placeholder="Search AAs…"
          title="Matches the name and the description — try “direct damage”"
        />
        {conditions > 0 && (
          <button className="btn sm" onClick={() => setCriteria(NO_AA_CRITERIA)} title="Drop every criterion">
            Clear ({conditions})
          </button>
        )}
      </div>

      <SourceCountRow
        count={countOf(shown.length, AA_LIST.length, "AA")}
        onOpenSource={() => void api()?.wiki.openInBrowser(AA_LIST_SOURCE.title)}
      />

      {!shown.length && (
        <Empty
          title="No AA matches all of that."
          hint="Every criterion only ever removes rows — drop one and the list grows back."
        />
      )}

      {groupedByCategory(shown).map((group) => (
        <section key={group.label} className="aa-category">
          <h3>{group.label}</h3>
          <div className="aa-list">
            {group.items.map((aa) => (
              <AARow key={aaKey(aa)} aa={aa} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Category/class isn't unique to an AA's name alone (nothing collides today, but nothing promises
 *  it never will), so the row key pins both. */
function aaKey(aa: AlternateAdvancement): string {
  return `${aa.category === "class" ? aa.class : aa.category}:${aa.name}`;
}

const CATEGORY_LABEL = { general: "General AAs", archetype: "Archetype AAs", special: "Special AAs" } as const;

/** The browse order: General, Archetype, each class alphabetically (`CLASS_ORDER`, so the class
 *  filter's dropdown and the browse order agree), then Special. A group renders only while it has
 *  entries — the class filter (or a text filter narrow enough to empty one out) can leave it empty. */
function groupedByCategory(items: AlternateAdvancement[]): { label: string; items: AlternateAdvancement[] }[] {
  const groups: { label: string; items: AlternateAdvancement[] }[] = [];
  const general = items.filter((a) => a.category === "general");
  if (general.length) groups.push({ label: CATEGORY_LABEL.general, items: general });
  const archetype = items.filter((a) => a.category === "archetype");
  if (archetype.length) groups.push({ label: CATEGORY_LABEL.archetype, items: archetype });
  for (const cls of CLASS_ORDER) {
    const clsItems = items.filter((a) => a.category === "class" && a.class === cls);
    if (clsItems.length) groups.push({ label: cls, items: clsItems });
  }
  const special = items.filter((a) => a.category === "special");
  if (special.length) groups.push({ label: CATEGORY_LABEL.special, items: special });
  return groups;
}

/** One AA: name, its short Ranks/Cost facts, then the full effect text as its own wrapped line. No
 *  `ItemLink`/hover wiring — a description names no other wiki page for this app to open. */
function AARow({ aa }: { aa: AlternateAdvancement }) {
  return (
    <div className="aa-row">
      <div className="aa-row-body">
        <span className="aa-name">{aa.name}</span>
        <span className="aa-meta muted small">
          Ranks: {aa.ranks || "—"} · Cost: {aa.cost || "—"}
        </span>
        <span className="aa-description muted small">{aa.description}</span>
      </div>
    </div>
  );
}
