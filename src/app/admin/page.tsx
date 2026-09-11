"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { AdminField, AdminRecord, AdminSearchHit, AdminStoreInfo } from "@/shared/admin";

/** Matches `SearchPanel.tsx`'s own debounce — fast enough to feel live, slow enough that a store
 *  with thousands of rows isn't re-scanned on every keystroke. */
const SEARCH_DEBOUNCE_MS = 200;

/**
 * The hidden admin panel — inspect every registered store's records, and correct or delete one at a
 * time. See `src/shared/admin.ts` for what a record and a field are, and `electron/admin.ts` for
 * which fields a given store actually allows through `patch` (a store may list a record's identity
 * fields without letting this page touch them).
 *
 * Its own window (`electron/windows.ts`'s `createAdminWindow`), reached from the tray rather than
 * the tab bar — this is a tool for correcting bad data, not a feature, and most players will never
 * open it. `platform.capabilities.admin` is what a non-Electron host uses to say it has none of this.
 */
export default function AdminPage() {
  const [stores, setStores] = useState<AdminStoreInfo[] | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [records, setRecords] = useState<AdminRecord[] | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  // Search across every store at once, rather than the one picked on the left — its own query and
  // its own (debounced) settled term, the same split `SearchPanel.tsx` uses and for the same reason:
  // the lookup below must key on the term once typing has settled, not on every keystroke.
  const [globalQuery, setGlobalQuery] = useState("");
  const [globalTerm, setGlobalTerm] = useState("");
  const [hits, setHits] = useState<AdminSearchHit[] | null>(null);
  const searching = globalTerm.length > 0;

  const loadStores = () => void api()?.admin.stores().then(setStores);
  const loadRecords = (id: string) => void api()?.admin.records(id).then(setRecords);
  const loadHits = (term: string) => void api()?.admin.search(term).then(setHits);

  useEffect(() => {
    const id = setTimeout(() => setGlobalTerm(globalQuery.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [globalQuery]);

  useEffect(() => {
    if (globalTerm) loadHits(globalTerm);
    else setHits(null);
  }, [globalTerm]);

  useEffect(() => {
    loadStores();
    // A patch or delete from this window rebroadcasts `dataChanged`; another window's own actions (a
    // kill recorded live, a log digested) can move the same numbers, so this refreshes on either.
    return api()?.app.onDataChanged(() => {
      loadStores();
      if (storeId) loadRecords(storeId);
      if (globalTerm) loadHits(globalTerm);
    });
  }, [storeId, globalTerm]);

  const openStore = (id: string) => {
    setGlobalQuery(""); // picking a store from the sidebar means "show me that store", not a stale search
    setStoreId(id);
    setOpenKey(null);
    setFilter("");
    loadRecords(id);
  };

  const refreshOne = (id: string) => {
    if (!storeId) return;
    void api()
      ?.admin.record(storeId, id)
      .then((fresh) => {
        if (!fresh) return;
        setRecords((rows) => rows?.map((r) => (r.id === id ? fresh : r)) ?? rows);
      });
  };

  const visible = useMemo(() => {
    if (!records) return records;
    const q = filter.trim().toLowerCase();
    return q ? records.filter((r) => r.summary.toLowerCase().includes(q)) : records;
  }, [records, filter]);

  return (
    <div className="admin">
      <style>{ADMIN_CSS}</style>
      <div className="admin-sidebar">
        <h1>Admin</h1>
        <p className="admin-hint">Inspect and correct a store&rsquo;s own records. Every change is kept.</p>
        <input
          className="admin-search admin-global-search"
          placeholder="Search every store…"
          value={globalQuery}
          onChange={(e) => setGlobalQuery(e.target.value)}
        />
        {!stores && <p className="admin-hint">Loading…</p>}
        {stores?.map((s) => (
          <button
            key={s.id}
            className={`admin-store${s.id === storeId && !searching ? " active" : ""}`}
            onClick={() => openStore(s.id)}
          >
            <span>{s.label}</span>
            <span className="admin-count">
              {s.count}
              {s.editedCount > 0 && <span className="admin-flag" title={`${s.editedCount} edited`}>{s.editedCount}</span>}
            </span>
          </button>
        ))}
      </div>
      <div className="admin-main">
        {searching ? (
          <>
            <div className="admin-toolbar">
              <p className="admin-hint">
                {hits === null
                  ? "Searching…"
                  : `${hits.length} match${hits.length === 1 ? "" : "es"} across every store`}
              </p>
            </div>
            <div className="admin-list">
              {hits?.map((h) => {
                const key = `${h.storeId}:${h.record.id}`;
                return (
                  <RecordRow
                    key={key}
                    record={h.record}
                    storeLabel={h.storeLabel}
                    open={openKey === key}
                    onToggle={() => setOpenKey((k) => (k === key ? null : key))}
                    onPatched={() => loadHits(globalTerm)}
                    onRemoved={() => {
                      loadHits(globalTerm);
                      loadStores();
                    }}
                    storeId={h.storeId}
                  />
                );
              })}
              {hits && !hits.length && <p className="admin-hint">No matches anywhere.</p>}
            </div>
          </>
        ) : (
          <>
            {!storeId && <p className="admin-hint">Pick a store on the left, or search every store above.</p>}
            {storeId && (
              <>
                <div className="admin-toolbar">
                  <input
                    className="admin-search"
                    placeholder="Filter by summary…"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  />
                  <button className="btn" onClick={() => loadRecords(storeId)}>
                    Refresh
                  </button>
                </div>
                {!records && <p className="admin-hint">Loading…</p>}
                {records && !records.length && <p className="admin-hint">Nothing recorded yet.</p>}
                <div className="admin-list">
                  {visible?.map((r) => {
                    const key = `${storeId}:${r.id}`;
                    return (
                      <RecordRow
                        key={key}
                        record={r}
                        open={openKey === key}
                        onToggle={() => setOpenKey((k) => (k === key ? null : key))}
                        onPatched={() => refreshOne(r.id)}
                        onRemoved={() => {
                          setRecords((rows) => rows?.filter((row) => row.id !== r.id) ?? rows);
                          loadStores();
                        }}
                        storeId={storeId}
                      />
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function RecordRow({
  record,
  open,
  onToggle,
  onPatched,
  onRemoved,
  storeId,
  storeLabel,
}: {
  record: AdminRecord;
  open: boolean;
  onToggle: () => void;
  onPatched: () => void;
  onRemoved: () => void;
  storeId: string;
  /** Set only in cross-store search results, where the row's own store isn't otherwise visible. */
  storeLabel?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const remove = () => {
    setRemoving(true);
    setRemoveError(null);
    void api()
      ?.admin.remove(storeId, record.id)
      .then((result) => {
        setRemoving(false);
        if (result.ok) onRemoved();
        else setRemoveError(result.error);
      });
  };

  return (
    <div className="admin-record">
      <button className="admin-record-head" onClick={onToggle}>
        <span className="admin-caret">{open ? "▾" : "▸"}</span>
        {storeLabel && <span className="admin-store-badge">{storeLabel}</span>}
        <span className="admin-summary">{record.summary}</span>
        {record.edited && <span className="admin-edited">edited</span>}
      </button>
      {open && (
        <div className="admin-detail">
          {record.fields.map((f) => (
            <FieldEditor key={f.key} storeId={storeId} recordId={record.id} field={f} onPatched={onPatched} />
          ))}
          {record.history.length > 0 && (
            <div className="admin-history">
              <div className="admin-hint">History, oldest first:</div>
              <ul>
                {record.history.map((h, i) => (
                  <li key={i}>
                    <code>{h.field}</code>: {String(h.from)} → {String(h.to)}{" "}
                    <span className="admin-hint">({h.at})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="admin-danger">
            {/* Worded as outcomes ("Delete it" / "Keep it"), matching `SpawnPanel.tsx`'s own inline
                confirm — no native `confirm()`, since this is deleting data, not a dismissable alert. */}
            {confirming ? (
              <span className="admin-confirm">
                <span className="admin-hint">Delete this record for good?</span>
                <button className="btn danger sm" disabled={removing} onClick={remove}>
                  Delete it
                </button>
                <button className="btn ghost sm" disabled={removing} onClick={() => setConfirming(false)}>
                  Keep it
                </button>
              </span>
            ) : (
              <button className="btn ghost sm" onClick={() => setConfirming(true)}>
                Delete record
              </button>
            )}
            {removeError && <span className="admin-error">{removeError}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function FieldEditor({
  storeId,
  recordId,
  field,
  onPatched,
}: {
  storeId: string;
  recordId: string;
  field: AdminField;
  onPatched: () => void;
}) {
  const initial = field.type === "boolean" ? String(field.value) : field.value === null ? "" : String(field.value);
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(initial);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field.value]);

  const dirty = draft !== initial;

  const save = () => {
    setSaving(true);
    setError(null);
    void api()
      ?.admin.patch(storeId, recordId, field.key, draft)
      .then((result) => {
        setSaving(false);
        if (result.ok) onPatched();
        else setError(result.error);
      });
  };

  return (
    <div className="admin-field">
      <label className="admin-field-key">{field.key}</label>
      {field.type === "boolean" ? (
        <select value={draft} onChange={(e) => setDraft(e.target.value)}>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      ) : (
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && dirty && save()}
          placeholder={field.type === "null" ? "(empty)" : undefined}
        />
      )}
      <button className="btn primary" disabled={!dirty || saving} onClick={save}>
        Save
      </button>
      {error && <span className="admin-error">{error}</span>}
    </div>
  );
}

const ADMIN_CSS = `
.admin { display: flex; height: 100vh; background: var(--bg); color: var(--text); font-family: var(--font); }
.admin-sidebar { width: 220px; flex: none; border-right: 1px solid var(--border); padding: 14px; overflow-y: auto; }
.admin-sidebar h1 { font-size: 15px; margin-bottom: 4px; }
.admin-hint { color: var(--text-dim); font-size: 12px; margin: 6px 0; }
.admin-global-search { display: block; width: 100%; box-sizing: border-box; margin: 8px 0 12px; }
.admin-store { display: flex; justify-content: space-between; align-items: center; width: 100%; text-align: left;
  background: none; border: 1px solid transparent; border-radius: var(--radius); color: var(--text);
  padding: 6px 8px; margin: 2px 0; font: inherit; cursor: pointer; }
.admin-store:hover { background: var(--bg-raised); }
.admin-store.active { background: var(--bg-raised); border-color: var(--accent-dim); }
.admin-count { color: var(--text-dim); font-size: 12px; display: flex; align-items: center; gap: 4px; }
.admin-flag { background: var(--accent); color: #1a1206; border-radius: 999px; padding: 0 6px; font-size: 11px; }
.admin-main { flex: 1; padding: 14px; overflow-y: auto; }
.admin-toolbar { display: flex; gap: 8px; margin-bottom: 10px; }
.admin-search { flex: 1; background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--radius);
  color: var(--text); padding: 6px 10px; font: inherit; }
.admin-record { border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: 6px; overflow: hidden; }
.admin-record-head { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; background: var(--bg-raised);
  border: none; color: var(--text); padding: 8px 10px; font: inherit; cursor: pointer; }
.admin-store-badge { flex: none; background: var(--bg); border: 1px solid var(--border); border-radius: 999px;
  padding: 0 8px; font-size: 11px; color: var(--text-dim); }
.admin-summary { flex: 1; font-family: var(--mono); font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.admin-edited { background: var(--accent); color: #1a1206; border-radius: 999px; padding: 0 8px; font-size: 11px; }
.admin-detail { padding: 10px; display: flex; flex-direction: column; gap: 8px; }
.admin-field { display: flex; align-items: center; gap: 8px; }
.admin-field-key { width: 110px; flex: none; color: var(--text-dim); font-size: 12.5px; }
.admin-field input, .admin-field select { flex: 1; background: var(--bg-input); border: 1px solid var(--border);
  border-radius: var(--radius); color: var(--text); padding: 5px 8px; font: inherit; }
.admin-error { color: var(--bad); font-size: 12px; }
.admin-history { border-top: 1px solid var(--border); padding-top: 8px; font-size: 12.5px; }
.admin-history ul { padding-left: 18px; }
.admin-danger { border-top: 1px solid var(--border); padding-top: 8px; display: flex; align-items: center; gap: 8px; }
.admin-confirm { display: flex; align-items: center; gap: 8px; }
`;
