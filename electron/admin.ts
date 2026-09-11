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
  coerceAdminValue,
  foldAdminEdit,
  type AdminAudit,
  type AdminField,
  type AdminPatchResult,
  type AdminRecord,
  type AdminScalar,
  type AdminStoreInfo,
} from "../src/shared/admin";

/** What every record gains once the panel has touched it — present on any plain object. */
type Administrable = { __admin?: AdminAudit };

export interface AdminStore {
  label: string;
  list(): AdminRecord[];
  get(id: string): AdminRecord | undefined;
  patch(id: string, field: string, input: string): AdminPatchResult;
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
}

export function createAdminRegistry(stores: Record<string, AdminStore>): AdminRegistry {
  return {
    stores: () =>
      Object.entries(stores).map(([id, store]) => {
        const list = store.list();
        return { id, label: store.label, count: list.length, editedCount: list.filter((r) => r.edited).length };
      }),
    records: (storeId) => stores[storeId]?.list() ?? [],
    record: (storeId, id) => stores[storeId]?.get(id),
    patch: (storeId, id, field, input) => stores[storeId]?.patch(id, field, input) ?? { ok: false, error: "no such store" },
  };
}
