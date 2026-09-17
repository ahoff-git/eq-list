/**
 * admin.ts — the live half of the hidden admin panel: turning a store's own in-memory array into
 * something a generic editor can list and patch, and turning a patch back into a mutation of the
 * exact object every other reader already holds a reference to.
 *
 * **One factory, every store.** A first pass at this wrote the same "find the record, coerce the
 * value, fold the audit trail, save" logic once per store and it was the wrong call the first time
 * too (see the loot/fights/scores duplication `repairZoneField` replaced in `migrations.ts`). Every
 * store here is a live array of plain objects, so `createArrayAdminStore` is the one place that walk
 * happens; a store just says which fields may be edited and how to save itself afterwards.
 *
 * **Changes filter through the system because nothing is copied.** `getItems()` must return the
 * store's own live array (or, for a nested store like high scores, live references pulled out of the
 * nested structure) — never a mapped or spread copy. `patch` mutates the object in place, so every
 * other reader of that same store — a derived aggregate, a broadcast to another window — sees the
 * correction the moment it's made, the same way any other write to that store would be seen.
 *
 * **The audit flag is a plain field, not a parallel store.** `__admin` rides on the record itself
 * (`AdminAudit`, `src/shared/admin.ts`), so it is written back to disk by the store's own existing
 * save path — no second file that could drift from the data it's describing — and it round-trips
 * through JSON exactly like any other field a store doesn't itself declare (the same guarantee
 * `kill-log.ts`'s own `schema` field already depends on).
 */
import {
  adminFieldType,
  adminRecordMatches,
  coerceAdminValue,
  foldAdminEdit,
  type AdminAudit,
  type AdminField,
  type AdminPatchResult,
  type AdminRecord,
  type AdminScalar,
  type AdminSearchHit,
  type AdminStoreInfo,
} from "../src/shared/admin";

/** What every record gains once the panel has touched it — present on any plain object. */
type Administrable = { __admin?: AdminAudit };

/**
 * A nullable SQLite integer column (0/1/NULL) restored to a real tri-state boolean, for a row a SQL
 * store hands to `createSqlAdminStore`. `adminFieldType` infers a field's type from its live JS
 * value, so an un-widened integer column would show in the admin panel as a plain number box rather
 * than the `true`/`false` toggle a genuinely boolean field gets everywhere else in the app — the
 * same reasoning `coerceBooleanAdminPatch` handles on the way back in. Shared rather than redeclared
 * per store: `kill-log.ts` and `combat-history.ts` both had their own copy of exactly this.
 */
export const triNull = (v: number | null): boolean | null => (v === null ? null : !!v);

/**
 * The other half of `triNull`: re-coerce a typed `"true"`/`"false"` **string** back to a real
 * boolean before it's bound into an `UPDATE`. `adminFieldType`/`coerceAdminValue`
 * (`src/shared/admin.ts`) infer a field's type from its row's *current* value — so a column that's
 * genuinely boolean but still holds SQL `NULL` (never yet determined) reads as `"null"` type, not
 * `"boolean"`, and a patch typed through the toggle arrives here as the literal string instead of a
 * boolean. `fields` names every column on this row that's boolean regardless of what it currently
 * holds — left uncorrected, the string `"false"` would bind into an `INTEGER` column and read back
 * as `true` (`!!"false"`). Returns a value ready to bind: a real `0`/`1` for a boolean column, the
 * input unchanged for anything else.
 */
export function coerceBooleanAdminPatch(fields: ReadonlySet<string>, field: string, value: AdminScalar): AdminScalar {
  const asBool = fields.has(field) && (value === "true" || value === "false") ? value === "true" : value;
  return typeof asBool === "boolean" ? (asBool ? 1 : 0) : asBool;
}

export interface AdminStore {
  label: string;
  list(): AdminRecord[];
  get(id: string): AdminRecord | undefined;
  patch(id: string, field: string, input: string): AdminPatchResult;
  remove(id: string): AdminPatchResult;
  /**
   * How many records this store holds, and how many are edited — without materializing every one of
   * them the way `list()` does. Optional: an array-backed store's `list()` is already a cheap
   * in-memory read (and every one of them is still cap-bounded), so counting via `list().length` costs
   * it nothing extra. A SQL-backed store with no cap (ADR 0232 — `faction_hits`/`loot_records` keep
   * every row forever) is a different story: `createAdminRegistry.stores()` calls this for every
   * registered store on every admin-panel open *and* on every `app.onDataChanged` broadcast the admin
   * window happens to be listening for while it's open, so a `list()`-based count there would mean a
   * multi-hundred-millisecond full-table scan — blocking the single-threaded main process for every
   * window, not just the admin one — on every kill or hit logged while the panel sits open in the
   * background.
   */
  counts?(): { total: number; edited: number };
}

function scalarField(key: string, value: unknown): AdminField {
  const type = adminFieldType(value);
  if (type === "number" || type === "boolean") return { key, value: value as number | boolean, type };
  if (type === "null") return { key, value: null, type };
  return { key, value: String(value), type: "string" };
}

function fieldsOf<T extends object>(item: T, editable: readonly string[]): AdminField[] {
  const raw = item as Record<string, unknown>;
  return editable.map((key) => scalarField(key, raw[key]));
}

export interface ArrayAdminOptions<T extends object> {
  /** This record's id — stable across a save, since the panel opens one by it. */
  idOf: (item: T) => string;
  /** The one-line label a list row shows before anything is expanded. */
  summaryOf: (item: T) => string;
  /** Which fields may be changed. Anything else is visible on the record but not through `patch`. */
  editable: readonly string[];
  /** Take this record out of whatever backing structure holds it — a splice for a flat array, a
   *  `delete` for one nested under a key. `getItems()` may rebuild its returned array fresh on every
   *  call (a nested store's flatMap), so removal can't be done generically by index into that array —
   *  each store says how its own record actually leaves. */
  remove: (item: T) => void;
  /** Persist the store — its own existing save, debounced or not; this never invents a new one. */
  save: () => void;
  /** Tell the rest of the running app something changed, if the store has a broadcast for that. */
  onChanged?: () => void;
}

/**
 * Wrap a live array of plain records as an `AdminStore`. `getItems()` is called fresh each time —
 * never cached here — so a store that replaces its whole array (a clear, a re-import) is picked up
 * without the admin layer needing to know that happened.
 */
export function createArrayAdminStore<T extends object>(
  label: string,
  getItems: () => T[],
  opts: ArrayAdminOptions<T>,
): AdminStore {
  const toRecord = (item: T): AdminRecord => {
    const admin = (item as Administrable).__admin;
    return {
      id: opts.idOf(item),
      summary: opts.summaryOf(item),
      edited: !!admin?.edited,
      history: admin?.history ?? [],
      fields: fieldsOf(item, opts.editable),
    };
  };

  const find = (id: string): T | undefined => getItems().find((item) => opts.idOf(item) === id);

  return {
    label,
    list: () => getItems().map(toRecord),
    get: (id) => {
      const item = find(id);
      return item ? toRecord(item) : undefined;
    },
    patch(id, field, input) {
      if (!opts.editable.includes(field)) return { ok: false, error: `"${field}" is not editable` };
      const item = find(id);
      if (!item) return { ok: false, error: "no such record" };
      // Not `T & Record<string, unknown>` — TS refuses to index-*write* through a generic type
      // intersected with an index signature. `item` and `raw` are the same object either way.
      const raw = item as Record<string, unknown> & Administrable;
      const current = raw[field] as AdminScalar;
      const coerced = coerceAdminValue(current, input);
      if (!coerced.ok) return coerced;
      const at = new Date().toISOString();
      raw.__admin = foldAdminEdit(raw.__admin, { field, from: current, to: coerced.value ?? null, at });
      raw[field] = coerced.value;
      opts.save();
      opts.onChanged?.();
      return { ok: true };
    },
    remove(id) {
      const item = find(id);
      if (!item) return { ok: false, error: "no such record" };
      opts.remove(item);
      opts.save();
      opts.onChanged?.();
      return { ok: true };
    },
  };
}

export interface SqlAdminOptions<Row extends object> {
  /** Every row, freshest read each call — never cached, the same contract `createArrayAdminStore`'s
   *  `getItems()` makes, just satisfied by a query instead of a reference to a live array. */
  list: () => Row[];
  /** This record's id — stable across a save, since the panel opens one by it. */
  idOf: (row: Row) => string;
  /** The one-line label a list row shows before anything is expanded. */
  summaryOf: (row: Row) => string;
  /** Which fields may be changed. Anything else is visible on the record but not through `patch`. */
  editable: readonly string[];
  /** This row's own audit trail, already parsed from wherever the store keeps it. */
  auditOf: (row: Row) => AdminAudit | undefined;
  /** Write one field's coerced value and the folded audit trail back to this row. `field` is always
   *  a member of `editable` by the time this is called — `patch` below checks that first — so it is
   *  safe for a store to interpolate directly into an `UPDATE ... SET <field> = ?`. */
  applyPatch: (id: string, field: string, value: AdminScalar, audit: AdminAudit) => void;
  /** Delete this row from wherever it lives. */
  removeRow: (id: string) => void;
  /** Tell the rest of the running app something changed, if the store has a broadcast for that. */
  onChanged?: () => void;
  /** Cheap `COUNT(*)`-shaped totals, so `AdminStore.counts()` doesn't have to fall back to scanning
   *  and mapping every row through `list()` just to report how many there are — see `AdminStore`'s
   *  own doc on why that matters for a store with no cap. Optional only because a store that hasn't
   *  gotten around to it yet still works, falling back to `list()`. */
  counts?: () => { total: number; edited: number };
}

/**
 * The SQL-backed twin of `createArrayAdminStore`, for a store whose rows live in a database table
 * instead of an in-memory array (ADR 0232). Same field-typing and audit-folding rules, care of the
 * same `fieldsOf`/`coerceAdminValue`/`foldAdminEdit` helpers — only how a row is found, changed and
 * removed differs, which is exactly what `list`/`auditOf`/`applyPatch`/`removeRow` let a store say
 * for itself.
 */
export function createSqlAdminStore<Row extends object>(label: string, opts: SqlAdminOptions<Row>): AdminStore {
  const find = (id: string): Row | undefined => opts.list().find((row) => opts.idOf(row) === id);
  const toRecord = (row: Row): AdminRecord => {
    const audit = opts.auditOf(row);
    return {
      id: opts.idOf(row),
      summary: opts.summaryOf(row),
      edited: !!audit?.edited,
      history: audit?.history ?? [],
      fields: fieldsOf(row, opts.editable),
    };
  };

  return {
    label,
    list: () => opts.list().map(toRecord),
    get: (id) => {
      const row = find(id);
      return row ? toRecord(row) : undefined;
    },
    patch(id, field, input) {
      if (!opts.editable.includes(field)) return { ok: false, error: `"${field}" is not editable` };
      const row = find(id);
      if (!row) return { ok: false, error: "no such record" };
      const current = (row as Record<string, unknown>)[field] as AdminScalar;
      const coerced = coerceAdminValue(current, input);
      if (!coerced.ok) return coerced;
      const at = new Date().toISOString();
      const value = coerced.value ?? null;
      const audit = foldAdminEdit(opts.auditOf(row), { field, from: current, to: value, at });
      opts.applyPatch(id, field, value, audit);
      opts.onChanged?.();
      return { ok: true };
    },
    remove(id) {
      if (!find(id)) return { ok: false, error: "no such record" };
      opts.removeRow(id);
      opts.onChanged?.();
      return { ok: true };
    },
    counts: opts.counts,
  };
}

/**
 * Every registered store, addressed by id. The panel never sees a store object directly — only this
 * — so adding one is always the same shape: build it with `createArrayAdminStore`, add it to the
 * record passed in here, and it appears in the panel with no other wiring.
 */
export interface AdminRegistry {
  stores(): AdminStoreInfo[];
  records(storeId: string): AdminRecord[];
  record(storeId: string, id: string): AdminRecord | undefined;
  patch(storeId: string, id: string, field: string, input: string): AdminPatchResult;
  remove(storeId: string, id: string): AdminPatchResult;
  /** Every record, from any store, whose summary or fields contain this term — the "search anywhere"
   *  the panel's per-store filter can't do, since picking a store first is no longer a precondition. */
  search(term: string): AdminSearchHit[];
}

export function createAdminRegistry(stores: Record<string, AdminStore>): AdminRegistry {
  return {
    stores: () =>
      Object.entries(stores).map(([id, store]) => {
        if (store.counts) {
          const { total, edited } = store.counts();
          return { id, label: store.label, count: total, editedCount: edited };
        }
        const list = store.list();
        return { id, label: store.label, count: list.length, editedCount: list.filter((r) => r.edited).length };
      }),
    records: (storeId) => stores[storeId]?.list() ?? [],
    record: (storeId, id) => stores[storeId]?.get(id),
    patch: (storeId, id, field, input) => stores[storeId]?.patch(id, field, input) ?? { ok: false, error: "no such store" },
    remove: (storeId, id) => stores[storeId]?.remove(id) ?? { ok: false, error: "no such store" },
    search: (term) => {
      const q = term.trim().toLowerCase();
      if (!q) return [];
      const hits: AdminSearchHit[] = [];
      for (const [storeId, store] of Object.entries(stores)) {
        for (const record of store.list()) {
          if (adminRecordMatches(record, q)) hits.push({ storeId, storeLabel: store.label, record });
        }
      }
      return hits;
    },
  };
}
