"use client";
import { api } from "@/lib/api";
import { alertStyle, OWN_STYLE as OWN, plan, styleWearers } from "@/shared/alert-styles";
import { wantsCast } from "@/shared/watch-conditions";
import { summarizeWatch } from "@/shared/watch-summary";
import { encodeWatches } from "@/shared/watch-share";
import AlertStyleFields from "./AlertStyleFields";
import WatchCheck from "./WatchCheck";
import WatchConditionRows from "./WatchConditionRows";
import WatchTimingFields from "./WatchTimingFields";
import { CheckField, ConfigRow } from "./ui";
import type { AlertStyle, CastAlertSettings, CastWatch } from "@/shared/types";

/** Which drawer of a watch is open. `null` is the ordinary state: a one-line row. */
export type WatchPane = "match" | "timing" | "style" | "check";

const PANES: { id: WatchPane; icon: string; label: string }[] = [
  { id: "match", icon: "⚟", label: "What sets it off — which prompts, and any conditions" },
  { id: "timing", icon: "⏱", label: "When it speaks — delay, repeat, and what calls it off" },
  { id: "style", icon: "🎨", label: "How it looks and sounds" },
  { id: "check", icon: "✓", label: "Check it — what's wrong with it, and what it would have caught" },
];

/**
 * One watch: a line you can read, and the drawers you open when you mean to change something.
 *
 * The row used to hold every control a watch had, which worked while a watch *was* four checkboxes.
 * It can now carry conditions, exclusions, a delay, a repeat, a re-trigger rule and a list of
 * cancelling phrases — far more than a line, and most of it set once and never touched. So the row
 * shows the two fields that are edited constantly (the trigger and the message) plus a **summary**
 * of everything else, and the rest lives behind ⚟ / ⏱ / 🎨 / ✓.
 *
 * One drawer is open at a time across the whole list, which is the same rule the style editor
 * already had: a settings panel where six watches are all unfolded is a panel nobody can read.
 */
export default function CastWatchRow({
  watch: w,
  alerts: ca,
  open,
  onOpen,
  onChange,
  onRemove,
  onDuplicate,
  onStyleEdit,
  onWear,
  onNameStyle,
}: {
  watch: CastWatch;
  /** The whole group, for the defaults a per-watch style starts from and the list to compare against. */
  alerts: CastAlertSettings;
  /** Which of this row's drawers is open, if any. */
  open: WatchPane | null;
  onOpen: (pane: WatchPane | null) => void;
  onChange: (patch: Partial<CastWatch>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  /**
   * Change how this rule looks. Not a plain patch: depending on what it's wearing this edits its own
   * look, edits a saved style nobody else wears, or **forks** a shared one — two writes that have to
   * land together, so the panel that owns both lists does it (`alert-styles.applyStyleEdit`).
   */
  onStyleEdit: (over: Partial<AlertStyle>) => void;
  /** Wear a different style: a saved one by id, `own` to keep its own look, `""` for the defaults. */
  onWear: (choice: string) => void;
  /** Put this rule's own look into the shared list under a name. */
  onNameStyle: () => void;
}) {
  const summary = summarizeWatch(w, ca.watches);
  const worst = summary.issues[0]?.level;
  const saved = ca.styles ?? [];
  const editing = plan(ca, w);

  return (
    <div className={`watch ${open ? "open" : ""}`}>
      <div className="row" style={{ gap: 6 }}>
        <input type="checkbox" checked={w.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} />
        {/* Trigger then message, left to right: match this, say that. They're separate on purpose —
            a fade has to be matched on the words EQ used ("light breeze"), which is rarely the
            wording you want to read mid-fight. */}
        <input
          className="field"
          style={{ flex: 3, minWidth: 0 }}
          value={w.spell}
          placeholder={w.onLine ? "words the log printed" : "spell name (or part of it)"}
          onChange={(e) => onChange({ spell: e.target.value })}
        />
        <input
          className="field"
          style={{ flex: 2, minWidth: 0 }}
          value={w.message ?? ""}
          placeholder="alert says… (optional)"
          title="What the banner should say when this fires. Leave it empty to get the usual sentence — “Root faded”, “a gnoll casting Fear”."
          onChange={(e) => onChange({ message: e.target.value })}
        />
        {/* The rule in a few words, so a folded watch can still be read rather than remembered. */}
        <div className="watch-sum" onClick={() => onOpen(open ? null : "match")} title="Open this watch">
          <span className="chip">{summary.prompts}</span>
          {summary.conditions && <span className="chip">{summary.conditions}</span>}
          {summary.timing && <span className="chip when">{summary.timing}</span>}
          {worst && (
            <span
              className={`chip ${worst}`}
              title={summary.issues.map((i) => i.message).join("\n\n")}
              onClick={(e) => {
                e.stopPropagation();
                onOpen("check");
              }}
            >
              {worst === "error" ? "✖" : "⚠"}
            </span>
          )}
        </div>
        {PANES.map((p) => (
          <button
            key={p.id}
            className={`btn ghost sm ${open === p.id ? "on" : ""} ${p.id === "style" && (w.style || w.styleId) ? "on" : ""}`}
            title={p.label}
            onClick={() => onOpen(open === p.id ? null : p.id)}
          >
            {p.icon}
          </button>
        ))}
        <button className="btn ghost sm" title="Duplicate this rule — the quickest way to a near-identical one" onClick={onDuplicate}>
          ⧉
        </button>
        <button className="btn ghost sm" title="Remove" onClick={() => onRemove()}>
          ✕
        </button>
      </div>

      {open === "match" && (
        <div className="watch-pane">
          <div className="row wrap" style={{ gap: 14, marginBottom: 6 }}>
            <span className="astyle-label">Fires on</span>
            <CheckField
              label={<span className="small">a cast</span>}
              checked={wantsCast(w)}
              onChange={(onCast) => onChange({ onCast })}
              title="Alert when this spell begins casting — the dispel-prep warning."
            />
            <CheckField
              label={<span className="small">a fade</span>}
              checked={!!w.onFade}
              onChange={(onFade) => onChange({ onFade })}
              title="Alert when this spell fades — your root wearing off a mob, your Spirit of Wolf expiring. EQ words some fades per spell (&quot;Your strength fades.&quot;) and names no spell, so match those words instead."
            />
            <CheckField
              label={<span className="small">raw text</span>}
              checked={!!w.onLine}
              onChange={(onLine) => onChange({ onLine })}
              title="Match these words anywhere in a log line, exactly as the game printed it — “invites you” for a party invite, “tells you” for a tell. Anything in your log can be a trigger this way."
            />
          </div>

          {/* Who may fire it. Only meaningful while this watch is looking at casts — a fade or a
              line names no caster to classify. */}
          {wantsCast(w) && (
            <div className="row wrap" style={{ gap: 14, marginBottom: 6 }}>
              <span className="astyle-label">Whose casts</span>
              <CheckField
                label={<span className="small">players too</span>}
                checked={!!w.includePlayers}
                onChange={(includePlayers) => onChange({ includePlayers })}
                title="Also alert when a player, pet, or named NPC casts this — not just ordinary mobs. Off keeps a groupmate's cast (e.g. BunnySlayer's Charm) quiet."
              />
              <select
                className="field sm pick wide"
                value={w.includeSelf === undefined ? "default" : w.includeSelf ? "yes" : "no"}
                title="Whether your own casting fires this. A “recast it” reminder is only ever about you, so it can say so here instead of turning your own casts on for every watch."
                onChange={(e) =>
                  onChange({ includeSelf: e.target.value === "default" ? undefined : e.target.value === "yes" })
                }
              >
                <option value="default">your casts: as set above</option>
                <option value="yes">your casts: yes</option>
                <option value="no">your casts: no</option>
              </select>
            </div>
          )}

          <ConfigRow
            label="Match"
            note={
              w.match === "any"
                ? "the words above, or any condition below — for a spell with two names"
                : "the words above, and every condition below"
            }
          >
            <select
              className="field sm pick"
              value={w.match ?? "all"}
              title="Whether the words above and every condition must all hold, or any one of them is enough. An exclusion is always “and not”, either way."
              onChange={(e) => onChange({ match: e.target.value as CastWatch["match"] })}
            >
              <option value="all">all of these</option>
              <option value="any">any of these</option>
            </select>
          </ConfigRow>

          <WatchConditionRows
            conditions={w.conditions ?? []}
            onChange={(conditions) => onChange({ conditions })}
            addLabel="+ Condition"
            empty="Just the words above. Add a condition to narrow it — “caster isn't your warder”, “zone is Lower Guk” — or to widen it with a second spelling."
          />
        </div>
      )}

      {open === "timing" && (
        <div className="watch-pane">
          <WatchTimingFields watch={w} onChange={onChange} />
        </div>
      )}

      {open === "style" && (
        <div className="watch-pane">
          <div className="astyle">
            {/* Wearing, not layering: picking a style here means this rule looks like that style.
                What happens when you then *change* something is the note below, decided by
                `alert-styles.plan` — and said before the change rather than after it. */}
            <ConfigRow label="Wearing">
              <select
                className="field sm pick wide"
                value={w.styleId ?? (w.style ? OWN : "")}
                title="Which look this rule wears. A saved style is shared with every other rule wearing it."
                onChange={(e) => onWear(e.target.value)}
              >
                <option value="">the defaults</option>
                {saved.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {styleWearers(ca, s.id) > 1 ? ` (${styleWearers(ca, s.id)} rules)` : ""}
                  </option>
                ))}
                {w.style && <option value={OWN}>its own look</option>}
              </select>
              {w.style && (
                <button
                  className="btn ghost sm"
                  title="Put this rule's own look in the shared list, so other rules can wear it too"
                  onClick={onNameStyle}
                >
                  Save as a style
                </button>
              )}
            </ConfigRow>
            <div className="hint" style={{ marginBottom: 6 }}>{editing.note}</div>
          </div>

          <AlertStyleFields style={alertStyle(ca, w)} locations={ca.locations} onChange={onStyleEdit} />

          <div className="row" style={{ gap: 8, marginTop: 4 }}>
            <button className="btn ghost sm" onClick={() => void api()?.alerts.test(w.id)}>
              Test this alert
            </button>
            <button
              className="btn ghost sm"
              title="Copy this rule as a share code you can paste to somebody else"
              onClick={() => void navigator.clipboard?.writeText(encodeWatches([w]))}
            >
              Copy rule
            </button>
          </div>
        </div>
      )}

      {open === "check" && <div className="watch-pane">
        <WatchCheck watch={w} alerts={ca} issues={summary.issues} />
      </div>}
    </div>
  );
}
