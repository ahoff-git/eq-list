"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAchievements, useLogVocabulary } from "@/lib/hooks";
import { countOf } from "@/shared/format";
import { CheckField, Empty, segCls } from "./ui";
import SuggestField from "./SuggestField";
import type { VocabularyKind } from "@/shared/log-vocabulary";
import type { AchievementCriterion, AchievementCriterionInput, RunningAchievement } from "@/shared/types";

/** How many criteria before a row grows its own filter box — a handful read fine as a plain list;
 *  "Grand Tour"'s couple hundred zones don't. */
const FILTER_ABOVE = 15;

/**
 * The Achievements tab (ADR 0212): the stock catalog plus whatever the player has typed in, each
 * with one or more criteria that check themselves off from the log or the scoreboard, or wait for a
 * tick by hand. Every row's checkbox works regardless of how a criterion is satisfied — nothing here
 * is verification, only an optional shortcut for the ones that can check themselves.
 */
export default function AchievementsPanel() {
  const view = useAchievements();
  const achievements = [...view.achievements].sort((a, b) => {
    const aDone = a.total > 0 && a.done.length >= a.total;
    const bDone = b.total > 0 && b.done.length >= b.total;
    if (aDone !== bDone) return aDone ? 1 : -1;
    return a.definition.title.localeCompare(b.definition.title);
  });

  return (
    <div className="achievements">
      <AchievementWizard />
      {achievements.length === 0 ? (
        <Empty title="No achievements yet." hint="Add one above." />
      ) : (
        achievements.map((a) => <AchievementRow key={a.definition.id} achievement={a} />)
      )}
    </div>
  );
}

function AchievementRow({ achievement }: { achievement: RunningAchievement }) {
  const { definition, done, tally, total, completedAt } = achievement;
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const doneSet = new Set(done);
  const complete = total > 0 && done.length >= total;
  const visible = filter.trim()
    ? definition.criteria.filter((c) => c.label.toLowerCase().includes(filter.trim().toLowerCase()))
    : definition.criteria;

  return (
    <div className={`achv-row ${complete ? "completed" : ""}`}>
      <button className="achv-head" onClick={() => setOpen((o) => !o)} title={definition.description}>
        <span className="achv-icon">{complete ? "🏆" : "▸"}</span>
        <span className="achv-title">{definition.title}</span>
        {!definition.isOfficial && <span className="badge">custom</span>}
        {definition.category && <span className="muted small">{definition.category}</span>}
        <span className="spacer" />
        <span className="achv-progress small">{countOf(done.length, total, "criterion", "criteria")}</span>
      </button>
      {open && (
        <div className="achv-body">
          {definition.description && <p className="small muted">{definition.description}</p>}
          {completedAt && <p className="small muted">Completed {new Date(completedAt).toLocaleString()}</p>}
          {definition.criteria.length > FILTER_ABOVE && (
            <input
              className="field"
              placeholder="Filter…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          )}
          <div className="achv-criteria">
            {visible.map((c) => (
              <CriterionRow
                key={c.id}
                criterion={c}
                done={doneSet.has(c.id)}
                tally={tally[c.id] ?? 0}
                onChange={(v) => api()?.achievements.setManual(definition.id, c.id, v)}
              />
            ))}
          </div>
          {!definition.isOfficial && (
            <button
              className="btn sm"
              onClick={() => {
                if (confirm(`Delete "${definition.title}"?`)) api()?.achievements.deleteCustom(definition.id);
              }}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** A checkbox for most kinds; a `"count"` criterion (ADR 0214) also shows its running tally, since
 *  "14 of 25" is the whole point and a bare checkbox would hide it until the last kill. */
function CriterionRow({
  criterion,
  done,
  tally,
  onChange,
}: {
  criterion: AchievementCriterion;
  done: boolean;
  tally: number;
  onChange: (done: boolean) => void;
}) {
  const title = criterion.kind === "manual" ? "The log can't see this — tick it yourself" : "Checks itself off, or tick it yourself";
  if (criterion.kind === "count" && !done) {
    return (
      <div className="row achv-count">
        <CheckField label={criterion.label} checked={done} onChange={onChange} title={title} />
        <span className="spacer" />
        <span className="small muted achv-tally">{tally} / {criterion.count?.atLeast ?? "?"}</span>
      </div>
    );
  }
  return <CheckField label={criterion.label} checked={done} onChange={onChange} title={title} />;
}

// ── the wizard ─────────────────────────────────────────────────────────────

/**
 * What kind of thing a criterion watches for, as the wizard presents it — a friendlier layer over
 * `AchievementCriterionInput.trigger` that picks the right log-line template and the right
 * vocabulary to suggest from (ADR 0214: "use the log to shape the criteria"). `"line"` is the escape
 * hatch for anything that doesn't fit the other three — free text, exactly as before.
 */
type CriterionType = "kill" | "cast" | "zone" | "line" | "manual";

const CRITERION_TYPES: {
  value: CriterionType;
  label: string;
  vocab?: VocabularyKind;
  placeholder: string;
  template?: (name: string) => string;
  defaultLabel?: (name: string) => string;
}[] = [
  {
    value: "kill",
    label: "Kill a mob",
    vocab: "target",
    placeholder: "a hill giant",
    template: (name) => `You have slain ${name}`,
    defaultLabel: (name) => `Kill ${name}`,
  },
  {
    value: "cast",
    label: "Cast a spell",
    vocab: "spell",
    placeholder: "Resurrection",
    template: (name) => name,
    defaultLabel: (name) => `Cast ${name}`,
  },
  {
    value: "zone",
    label: "Enter a zone",
    vocab: "zone",
    placeholder: "RunnyEye Citadel",
    template: (name) => `You have entered ${name}`,
    defaultLabel: (name) => `Enter ${name}`,
  },
  {
    value: "line",
    label: "See a log line",
    placeholder: "the exact text to watch for",
  },
  {
    value: "manual",
    label: "Just check it off myself",
    placeholder: "",
  },
];

interface WizardCriterion {
  type: CriterionType;
  /** The picked mob/spell/zone name, the free-typed line, or (for `"manual"`) unused. */
  value: string;
  /** Overrides the type's default label when set. */
  label: string;
  regex: boolean;
  /** How many times, as typed — blank or "1" is an ordinary single-fire criterion. */
  count: string;
}

const blankCriterion = (): WizardCriterion => ({ type: "kill", value: "", label: "", regex: false, count: "" });

function toInput(w: WizardCriterion): AchievementCriterionInput {
  const def = CRITERION_TYPES.find((t) => t.value === w.type)!;
  if (w.type === "manual") return { label: w.label.trim() };
  const value = w.value.trim();
  const label = w.label.trim() || def.defaultLabel?.(value) || value;
  const text = w.type === "line" ? value : (def.template?.(value) ?? value);
  const countNum = Math.floor(Number(w.count));
  const count = w.count.trim() && Number.isFinite(countNum) && countNum > 1 ? countNum : undefined;
  return { label, trigger: { text, regex: w.type === "line" && w.regex, count, onCast: w.type === "cast" } };
}

const canSaveCriterion = (w: WizardCriterion) => (w.type === "manual" ? w.label.trim().length > 0 : w.value.trim().length > 0);

/**
 * A guided way to build a custom achievement (ADR 0214): pick what kind of thing each step is, then
 * fill it in from **your own log's own vocabulary** (`useLogVocabulary`, the same suggestion source
 * the Alerts and Goals tabs already use) rather than typing a log sentence from memory and hoping it
 * matches. `"See a log line"` stays the free-text escape hatch for anything that doesn't fit.
 */
function AchievementWizard() {
  const vocabulary = useLogVocabulary();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [criteria, setCriteria] = useState<WizardCriterion[]>([blankCriterion()]);

  const canSave = title.trim().length > 0 && criteria.some(canSaveCriterion);

  function patch(i: number, next: Partial<WizardCriterion>) {
    setCriteria((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...next } : c)));
  }

  function reset() {
    setTitle("");
    setDescription("");
    setCategory("");
    setCriteria([blankCriterion()]);
    setOpen(false);
  }

  async function save() {
    if (!canSave) return;
    await api()?.achievements.create({
      title: title.trim(),
      description: description.trim() || undefined,
      category: category.trim() || undefined,
      criteria: criteria.filter(canSaveCriterion).map(toInput),
    });
    reset();
  }

  if (!open) {
    return (
      <button className="btn sm primary" onClick={() => setOpen(true)}>
        ✨ Achievement Wizard
      </button>
    );
  }

  return (
    <div className="achv-form">
      <div className="row wrap">
        <input className="field" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input
          className="field"
          placeholder="Category (optional)"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
      </div>
      <textarea
        className="field"
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
      />
      <div className="achv-form-criteria">
        {criteria.map((c, i) => (
          <CriterionStep
            key={i}
            step={i + 1}
            criterion={c}
            vocabulary={vocabulary}
            onChange={(next) => patch(i, next)}
            onRemove={criteria.length > 1 ? () => setCriteria((cs) => cs.filter((_, idx) => idx !== i)) : undefined}
          />
        ))}
        <button className="btn sm" onClick={() => setCriteria((cs) => [...cs, blankCriterion()])}>
          ＋ Add a step
        </button>
      </div>
      <div className="row">
        <span className="spacer" />
        <button className="btn sm" onClick={reset}>
          Cancel
        </button>
        <button className="btn sm primary" disabled={!canSave} onClick={save}>
          Save
        </button>
      </div>
    </div>
  );
}

/** One criterion, as a self-contained wizard step: what kind of thing it is, then the one field that
 *  kind actually needs — a suggestion field over real vocabulary for the three log-driven kinds, free
 *  text for a raw line, or nothing at all for a plain manual tick. */
function CriterionStep({
  step,
  criterion,
  vocabulary,
  onChange,
  onRemove,
}: {
  step: number;
  criterion: WizardCriterion;
  vocabulary: ReturnType<typeof useLogVocabulary>;
  onChange: (next: Partial<WizardCriterion>) => void;
  onRemove?: () => void;
}) {
  const def = CRITERION_TYPES.find((t) => t.value === criterion.type)!;
  return (
    <div className="achv-step">
      <div className="row wrap">
        <span className="achv-step-no small muted">{step}.</span>
        <div className="segmented" role="tablist">
          {CRITERION_TYPES.map((t) => (
            <button
              key={t.value}
              className={segCls(criterion.type === t.value)}
              onClick={() => onChange({ type: t.value, value: "" })}
              title={t.label}
            >
              {t.label}
            </button>
          ))}
        </div>
        {onRemove && (
          <button className="btn sm" title="Remove this step" onClick={onRemove}>
            ✕
          </button>
        )}
      </div>
      <div className="row wrap">
        {criterion.type === "manual" ? (
          <input
            className="field"
            placeholder="What do you have to do?"
            value={criterion.label}
            onChange={(e) => onChange({ label: e.target.value })}
          />
        ) : criterion.type === "line" ? (
          <>
            <input
              className="field"
              placeholder={def.placeholder}
              value={criterion.value}
              onChange={(e) => onChange({ value: e.target.value })}
            />
            <CheckField label="regex" checked={criterion.regex} onChange={(v) => onChange({ regex: v })} />
          </>
        ) : (
          <SuggestField
            className="field"
            placeholder={def.placeholder}
            value={criterion.value}
            onChange={(value) => onChange({ value })}
            vocabulary={vocabulary}
            kind={def.vocab}
            title={vocabulary.size ? "Suggested from your own recent log" : "No recent log read yet — type it by hand"}
          />
        )}
        {criterion.type !== "manual" && (
          <>
            <span className="small muted">×</span>
            <input
              className="field achv-count-input"
              type="number"
              min={1}
              placeholder="1"
              value={criterion.count}
              onChange={(e) => onChange({ count: e.target.value })}
              title="How many times — leave blank (or 1) for a plain checkbox, higher for a running tally"
            />
          </>
        )}
        {criterion.type !== "manual" && (
          <input
            className="field"
            placeholder={def.defaultLabel?.(criterion.value.trim() || "…") ?? "Label (optional)"}
            value={criterion.label}
            onChange={(e) => onChange({ label: e.target.value })}
          />
        )}
      </div>
    </div>
  );
}
