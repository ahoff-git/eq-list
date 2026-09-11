/**
 * admin.ts — the shapes behind the hidden admin panel, and the one rule that keeps a structured
 * edit from degrading into raw JSON typing: a new value has to match the field's own current type.
 *
 * The panel exists for exactly the failure this app has already had once
 * ([ADR 0226](../../specs/decisions/0226-a-restriction-notice-is-not-a-zone-wherever-it-landed.md)):
 * bad data reaching a store with no general way to find and correct it short of a one-off migration.
 * Every field here is a scalar (string, number, boolean, or null) on purpose — a record's nested
 * shape (an area estimate, a drop-count map) is shown but not edited through this path, since a
 * generic editor can validate "is this a number" and has no way to validate "is this a sane object".
 *
 * Pure and dependency-free: what a store *is* (`electron/admin.ts`) lives beside the process that can
 * hold live records in memory; this is only the shape of a record and the rule for changing one field
 * of it, which is exactly what a renderer needs to draw the panel and what a test needs to pin down
 * without a store at all.
 */

/** A field's value, narrowed to what an admin editor can safely round-trip through an HTML input. */
export type AdminScalar = string | number | boolean | null;

export type AdminFieldType = "string" | "number" | "boolean" | "null";

/** One editable field of a record, as the panel shows it. */
export interface AdminField {
  key: string;
  value: AdminScalar;
  type: AdminFieldType;
}

/** One change the panel made, kept forever rather than overwritten by the next one. */
export interface AdminEdit {
  field: string;
  from: AdminScalar;
  to: AdminScalar;
  /** ISO timestamp of the edit itself — not to be confused with any `at` the record carries. */
  at: string;
}

/** The internal flag a record carries once the panel has touched it — see the file header. */
export interface AdminAudit {
  edited: true;
  history: AdminEdit[];
}

/** One record, as the panel lists or opens it. */
export interface AdminRecord {
  id: string;
  /** A human-readable one-liner — what the row is, for a list too long to show every field of. */
  summary: string;
  fields: AdminField[];
  edited: boolean;
  history: AdminEdit[];
}

/** One registered store, as the panel's landing list shows it — before any record is opened. */
export interface AdminStoreInfo {
  id: string;
  label: string;
  count: number;
  /** How many of `count` carry the edited flag — visible without opening the store, since finding
   *  what's already been touched is half of what an audit trail is for. */
  editedCount: number;
}

export type AdminPatchResult = { ok: true } | { ok: false; error: string };

/** `coerceAdminValue`'s success case also carries the value it settled on. */
export type AdminCoerceResult = AdminPatchResult & { value?: AdminScalar };

/**
 * Turn what an admin editor typed (always a string — an HTML input has no other kind) into a value
 * matching the field's **current** type, or refuse it.
 *
 * This is the one guard that makes "structured" mean something: an editor that accepted anything
 * would be a JSON blob wearing a form. A field's type is taken from its live value rather than
 * declared anywhere, so a store never has to say in advance what a field's shape is allowed to be —
 * it already knows, because the value is sitting right there.
 *
 * A `null`/string field accepts an empty edit as "clear it back to null" — the only one of the three
 * kinds where "nothing typed" is itself a meaningful value rather than an invalid one.
 */
export function coerceAdminValue(current: AdminScalar, input: string): AdminCoerceResult {
  if (typeof current === "number") {
    const n = Number(input);
    if (input.trim() === "" || !Number.isFinite(n)) return { ok: false, error: `"${input}" is not a number` };
    return { ok: true, value: n };
  }
  if (typeof current === "boolean") {
    if (input !== "true" && input !== "false") return { ok: false, error: 'must be "true" or "false"' };
    return { ok: true, value: input === "true" };
  }
  // A string field, or one that was null — either way, free text; empty text clears it.
  return { ok: true, value: input === "" ? null : input };
}

/** A field's declared type, from whatever its value happens to be right now. */
export function adminFieldType(value: unknown): AdminFieldType {
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (value === null || value === undefined) return "null";
  return "string";
}

/** Fold one more edit into a record's audit trail — `undefined` in, a fresh trail of one, out. */
export function foldAdminEdit(prior: AdminAudit | undefined, edit: AdminEdit): AdminAudit {
  return { edited: true, history: [...(prior?.history ?? []), edit] };
}

const isScalar = (v: unknown): v is AdminScalar => v === null || ["string", "number", "boolean"].includes(typeof v);

const isAdminEdit = (v: unknown): v is AdminEdit => {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return typeof e.field === "string" && typeof e.at === "string" && isScalar(e.from) && isScalar(e.to);
};

/**
 * Is this really an `AdminAudit`? A pooled store's `sanitize` rebuilds a record from named fields
 * rather than trusting the payload's shape (contributions.ts's rule 4 — "untrusted on arrival"), so
 * without this the `__admin` flag a store's own admin edit wrote would be silently stripped the next
 * time that peer's report is re-vetted, or a peer could hand us a fabricated one that reads as if we
 * had edited their data ourselves. Checked the same way every other field a peer sends is: shape,
 * not trust.
 */
export function isAdminAudit(v: unknown): v is AdminAudit {
  if (!v || typeof v !== "object") return false;
  const a = v as Record<string, unknown>;
  return a.edited === true && Array.isArray(a.history) && a.history.every(isAdminEdit);
}
