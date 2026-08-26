"use client";
import { useMemo } from "react";
import { api } from "@/lib/api";
import { useBuffs, useSettings, useSpawns } from "@/lib/hooks";
import { rowsOf } from "@/lib/usePeerShare";
import { SHARE_KINDS, mergeBuffs, mergeTimers, shareKind, type ShareKind } from "@/shared/peer-share";
import { count, duration } from "@/shared/format";
import { targetLabel } from "@/shared/buff-tracking";
import { Caret } from "./ui";
import type { BuffInstance } from "@/shared/buff-tracking";
import type { SpawnTimer } from "@/shared/spawn-timers";
import type { CastWatch, NamedAlertStyle, ReceivedShare, ShoppingListEntry } from "@/shared/types";
import type { MapPin } from "@/shared/map/pins";

/**
 * What peers have handed over, and what you can do with it.
 *
 * **Nothing here applies itself.** An authored artifact lands in this tray and stays there until
 * somebody copies it onto their own list — the rule
 * [ADR 0141](../../../specs/decisions/0141-the-room-is-a-meeting-place.md) makes for the whole
 * family, because a watch that fires or a style that repaints every banner wearing it are changes to
 * what the app *does*, and "which of these did I choose?" has to stay answerable.
 *
 * The two live boards are the opposite: they are somebody else's *now*, they merge with ours by the
 * de-dupe rules in `peer-share.ts`, and there is nothing to copy because there is nothing to keep.
 * Scores get their own section (`PeerScores`) — a comparison is a table, not a list.
 */
export default function PeerTray({
  received,
  open,
  onOpen,
  onClear,
}: {
  received: ReceivedShare[];
  open: ShareKind | null;
  onOpen: (kind: ShareKind | null) => void;
  onClear: (peerId?: string, kind?: ShareKind) => void;
}) {
  // Scores are compared rather than listed, so they're drawn by `PeerScores` and skipped here.
  const kinds = useMemo(
    () =>
      SHARE_KINDS.filter((spec) => spec.key !== "scores" && spec.family !== "observation").map((spec) => ({
        spec,
        n: received.filter((r) => r.kind === spec.key).reduce((sum, r) => sum + r.rows.length, 0),
      })),
    [received],
  );
  const anything = kinds.some((k) => k.n > 0);

  return (
    <section className="peers-block">
      <h3>What&rsquo;s arrived</h3>
      {!anything ? (
        <p className="muted small">
          Nothing yet. Ask somebody above for what they&rsquo;re offering — pooled observations arrive on
          their own, everything else waits for you to ask.
        </p>
      ) : (
        kinds
          .filter((k) => k.n > 0)
          .map(({ spec, n }) => (
            <div key={spec.key} className="peers-tray-kind">
              <button className="btn ghost sm tray-head" onClick={() => onOpen(open === spec.key ? null : spec.key)}>
                <Caret open={open === spec.key} />
                {spec.label} <span className="muted">· {count(n, spec.noun)}</span>
              </button>
              {open === spec.key && (
                <div className="peers-tray-body">
                  <Body kind={spec.key} received={received} />
                  <button className="btn ghost sm" onClick={() => onClear(undefined, spec.key)}>
                    Clear these
                  </button>
                </div>
              )}
            </div>
          ))
      )}
    </section>
  );
}

function Body({ kind, received }: { kind: ShareKind; received: ReceivedShare[] }) {
  switch (kind) {
    case "watches":
      return <Watches received={received} />;
    case "styles":
      return <Styles received={received} />;
    case "lists":
      return <Lists received={received} />;
    case "pins":
      return <Pins received={received} />;
    case "timers":
      return <Timers received={received} />;
    case "buffs":
      return <Buffs received={received} />;
    default:
      // Observations never reach the tray — they're filed by main as they arrive — so this is
      // unreachable rather than a gap. Saying so beats rendering nothing and looking broken.
      return <p className="muted small">{shareKind(kind)?.label} is pooled automatically.</p>;
  }
}

/** A row's provenance, worded the same way everywhere: what it is, and whose. */
function By({ by }: { by: string }) {
  return <span className="muted small"> · from {by}</span>;
}

/**
 * Watch rules, copied onto the Alerts tab's list.
 *
 * They arrive with **fresh ids and no style** — `decodeWatches` saw to both on the way in — so
 * adding one can neither overwrite a rule you already have nor point at a saved look you haven't
 * got. Appending is the same gesture the clipboard import already uses (`WatchShare`), deliberately:
 * a rule from a stranger over a socket is a rule from a stranger over the clipboard.
 */
function Watches({ received }: { received: ReceivedShare[] }) {
  const settings = useSettings();
  const rows = useMemo(() => rowsOf<CastWatch>(received, "watches"), [received]);

  const add = (watches: CastWatch[]) => {
    const existing = settings?.castAlerts.watches ?? [];
    void api()?.settings.update({ castAlerts: { watches: [...existing, ...watches] } });
  };

  return (
    <>
      <div className="tray-actions">
        <button className="btn sm" onClick={() => add(rows.map((r) => r.row))}>
          Add all {count(rows.length, "rule")}
        </button>
      </div>
      {rows.map((r, i) => (
        <div className="tray-row" key={`${r.peerId}-${i}`}>
          <span className="tray-what">
            {r.row.spell || describeConditions(r.row)}
            <By by={r.by} />
          </span>
          <span className="muted small">{summarise(r.row)}</span>
          <button className="btn ghost sm" onClick={() => add([r.row])}>
            Add
          </button>
        </div>
      ))}
    </>
  );
}

/** A rule with no label and no spell is described by what it matches, so a row is never blank. */
function describeConditions(watch: CastWatch): string {
  const first = watch.conditions?.[0];
  return first ? `${first.field} ${first.op} “${first.text}”` : "rule";
}

/** The parts of a rule worth reading at a glance, without opening it. */
function summarise(watch: CastWatch): string {
  const bits: string[] = [];
  if (watch.conditions?.length) bits.push(count(watch.conditions.length, "condition"));
  if (watch.delay) bits.push(`+${watch.delay}`);
  if (watch.repeat) bits.push(`×${watch.repeat}`);
  if (watch.onLine) bits.push("raw line");
  return bits.join(" · ");
}

/**
 * Saved looks, copied onto the Alerts tab's style list.
 *
 * Ids are regenerated on arrival for the same reason a watch's are — a peer's id colliding with one
 * of yours would silently restyle every rule wearing yours — so the worst a copy can do is add a
 * name you already have, which the list shows twice and you can rename.
 */
function Styles({ received }: { received: ReceivedShare[] }) {
  const settings = useSettings();
  const rows = useMemo(() => rowsOf<NamedAlertStyle>(received, "styles"), [received]);

  const add = (styles: NamedAlertStyle[]) => {
    const existing = settings?.castAlerts.styles ?? [];
    void api()?.settings.update({ castAlerts: { styles: [...existing, ...styles] } });
  };

  return (
    <>
      <div className="tray-actions">
        <button className="btn sm" onClick={() => add(rows.map((r) => r.row))}>
          Add all {count(rows.length, "style")}
        </button>
      </div>
      {rows.map((r, i) => (
        <div className="tray-row" key={`${r.peerId}-${i}`}>
          <span className="tray-swatch" style={{ background: r.row.style.color }} aria-hidden />
          <span className="tray-what">
            {r.row.name}
            <By by={r.by} />
          </span>
          <span className="muted small">
            {r.row.style.position} · {Math.round(r.row.style.durationMs / 100) / 10}s
            {r.row.style.sound ? ` · ${r.row.style.soundName}` : ""}
            {r.row.style.flash ? " · flash" : ""}
          </span>
          <button className="btn ghost sm" onClick={() => add([r.row])}>
            Add
          </button>
        </div>
      ))}
    </>
  );
}

/**
 * Somebody else's shopping list, copied onto yours.
 *
 * Added through `list.add` rather than written over the list wholesale, so an entry lands exactly as
 * a hand-typed one does — matched against your log from the moment it arrives, and folded into a
 * group if it names a quest you're already running. Their **counts don't travel**
 * (`readListEntry`), so what you get is what to collect, with the collecting still yours to do.
 */
function Lists({ received }: { received: ReceivedShare[] }) {
  const rows = useMemo(() => rowsOf<ShoppingListEntry>(received, "lists"), [received]);

  const add = (entries: ShoppingListEntry[]) => {
    const a = api();
    if (!a) return;
    for (const e of entries) {
      void a.list.add({ name: e.name, kind: e.kind, needed: e.needed, wikiPath: e.wikiPath, note: e.note, origin: e.origin });
    }
  };

  // Grouped by what put them on the list, because "the list for that quest" is what somebody is
  // actually being handed — a flat run of thirty item names is not a thing anybody wants to copy
  // one at a time.
  const groups = useMemo(() => {
    const by = new Map<string, { title: string; entries: ShoppingListEntry[]; by: string }>();
    for (const r of rows) {
      const title = r.row.origin ? `${r.row.origin.name} (${r.row.origin.kind})` : "Other items";
      const key = `${r.by}:${title}`;
      const group = by.get(key);
      if (group) group.entries.push(r.row);
      else by.set(key, { title, entries: [r.row], by: r.by });
    }
    return [...by.values()];
  }, [rows]);

  return (
    <>
      {groups.map((group, i) => (
        <div className="tray-group" key={i}>
          <div className="tray-row">
            <span className="tray-what">
              <b>{group.title}</b>
              <By by={group.by} />
            </span>
            <span className="muted small">{count(group.entries.length, "entry", "entries")}</span>
            <button className="btn sm" onClick={() => add(group.entries)}>
              Add all
            </button>
          </div>
          {group.entries.map((e, j) => (
            <div className="tray-row tray-sub" key={j}>
              <span className="tray-what">
                {e.name}
                {e.kind === "mob" ? <span className="muted small"> · mob</span> : null}
              </span>
              <span className="muted small">×{e.needed}</span>
              <button className="btn ghost sm" onClick={() => add([e])}>
                Add
              </button>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

/**
 * Pins, handed to the map window rather than copied here.
 *
 * Pins live in the map's own storage and nowhere this window can reach, so the copy is a request
 * across to it (which opens it if it's shut — you asked to see them somewhere). Grouped by zone,
 * because a pin set is nearly always about one place and taking somebody's whole atlas to get one
 * camp is the wrong unit.
 */
function Pins({ received }: { received: ReceivedShare[] }) {
  const rows = useMemo(() => rowsOf<MapPin>(received, "pins"), [received]);

  const zones = useMemo(() => {
    const by = new Map<string, { zone: string; pins: MapPin[]; by: string }>();
    for (const r of rows) {
      const key = `${r.by}:${r.row.zone}`;
      const group = by.get(key);
      if (group) group.pins.push(r.row);
      else by.set(key, { zone: r.row.zone, pins: [r.row], by: r.by });
    }
    return [...by.values()].sort((a, b) => a.zone.localeCompare(b.zone));
  }, [rows]);

  return (
    <>
      {zones.map((group, i) => (
        <div className="tray-row" key={i}>
          <span className="tray-what">
            {group.zone}
            <By by={group.by} />
          </span>
          <span className="muted small">{count(group.pins.length, "pin")}</span>
          <button className="btn sm" title="Add these to your own map pins" onClick={() => api()?.map.addPins(group.pins)}>
            Add to map
          </button>
        </div>
      ))}
    </>
  );
}

/**
 * The camp's countdowns: everyone's clocks for one spawn shown as one row.
 *
 * The merge is `mergeTimers`, so which clock a row shows is decided by the evidence — somebody who
 * can *see* the mob outranks any countdown, then whoever has more gaps behind their interval, then
 * the tightest bound. `agreeing` is what makes that legible: three names on a row is three
 * independent arrivals at the same answer, which is the real reason to want this at a shared camp.
 */
function Timers({ received }: { received: ReceivedShare[] }) {
  const { view, now } = useSpawns();
  const theirs = useMemo(
    () => rowsOf<SpawnTimer>(received, "timers").map((r) => ({ timer: r.row, by: r.by, agreeing: [] })),
    [received],
  );
  const merged = useMemo(() => mergeTimers(view.running, theirs), [view.running, theirs]);

  return (
    <>
      {merged.map((entry) => (
        <div className="tray-row" key={`${entry.timer.key}-${entry.timer.dueAt}`}>
          <span className="tray-what">
            {entry.timer.mob}
            <span className="muted small"> · {entry.timer.place}</span>
          </span>
          <span className={entry.timer.seenAt ? "sc-value" : "muted small"}>
            {entry.timer.seenAt ? "up now" : dueIn(entry.timer.dueAt, now)}
          </span>
          <span className="muted small" title={`Clocks that agree: ${entry.agreeing.join(", ")}`}>
            {entry.agreeing.length > 1 ? `${entry.agreeing.length} agree` : entry.by ?? "yours"}
          </span>
        </div>
      ))}
    </>
  );
}

/** How long until a countdown is due, in the board's own words. Past due reads as due, not negative. */
function dueIn(dueAt: string, now: number): string {
  const ms = (Date.parse(dueAt) || 0) - now;
  return ms <= 0 ? "due" : duration(Math.round(ms / 1000));
}

/**
 * The group's buff board.
 *
 * Every target was resolved to a name before it left its own machine (`shareableBuffs`), which is
 * what makes one key work across installs — a `you` replayed verbatim would put everybody's
 * self-buffs on your own row. So a row here names a person, and `mergeBuffs` keeps the freshest
 * report of each spell-on-a-person.
 */
function Buffs({ received }: { received: ReceivedShare[] }) {
  const mine = useBuffs();
  const theirs = useMemo(
    () => rowsOf<BuffInstance>(received, "buffs").map((r) => ({ buff: r.row, by: r.by })),
    [received],
  );
  const merged = useMemo(() => mergeBuffs(mine.active, theirs), [mine.active, theirs]);

  return (
    <>
      {merged.map((entry, i) => (
        <div className="tray-row" key={i}>
          <span className="tray-what">{entry.buff.spell}</span>
          <span className="muted small">{targetLabel(entry.buff.target)}</span>
          <span className="muted small">{entry.by ? `via ${entry.by}` : "yours"}</span>
        </div>
      ))}
    </>
  );
}
