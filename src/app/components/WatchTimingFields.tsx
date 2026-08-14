"use client";
import { COMBAT_CUE_WITHIN_SECONDS, formatDelay, MAX_REPEAT, parseDelay } from "@/shared/alert-schedule";
import WatchConditionRows from "./WatchConditionRows";
import { ConfigRow } from "./ui";
import type { Vocabulary } from "@/shared/log-vocabulary";
import type { CastWatch } from "@/shared/types";

/**
 * **When** a watch speaks, as opposed to whether: the delay that turns a warning into a cue, how
 * often it repeats, what a second match does to a cue already waiting, and the two ways of calling
 * one off — your death, and the log's own words.
 *
 * Everything here is inert until there's a delay, so the controls below it stay hidden until one is
 * typed. That keeps the ordinary watch — alert me now — a single empty box, and stops the panel
 * asking four questions nobody with an immediate alert has an answer for.
 */
export default function WatchTimingFields({
  watch: w,
  onChange,
  vocabulary,
}: {
  watch: CastWatch;
  onChange: (patch: Partial<CastWatch>) => void;
  /** The log's own words, for completing the lines that call a cue off. */
  vocabulary: Vocabulary;
}) {
  const seconds = parseDelay(w.delay);
  const delayed = !!seconds;
  // What `auto` will actually do, said in words — the rule is a good guess, and a guess the player
  // should be able to see before deciding whether to overrule it.
  const autoMeans =
    seconds && seconds <= COMBAT_CUE_WITHIN_SECONDS
      ? `auto (yes — under ${formatDelay(COMBAT_CUE_WITHIN_SECONDS)})`
      : "auto (no — it's a long cue)";

  return (
    <div className="astyle">
      <ConfigRow
        label="Delay"
        note={
          seconds === null
            ? "can't read that"
            : delayed
              ? `alerts ${formatDelay(seconds)} after it matches`
              : "alerts straight away"
        }
      >
        <input
          className={`field sm time ${seconds === null ? "bad" : ""}`}
          value={w.delay ?? ""}
          placeholder="now"
          title="How long to hold the alert: “25” for 25 seconds, “8m” for eight minutes, “1m 30s” for both. Up to 30m. Empty alerts the moment it matches."
          onChange={(e) => onChange({ delay: e.target.value })}
        />
      </ConfigRow>

      {delayed && (
        <>
          <ConfigRow label="Repeat" note={`extra times, ${formatDelay(seconds)} apart`}>
            <input
              className="field sm time"
              type="number"
              min={0}
              max={MAX_REPEAT}
              value={w.repeat ?? 0}
              title="Say it again this many times, one delay apart. Needs something able to stop it — words to cancel on, or a death that cancels it."
              onChange={(e) => onChange({ repeat: Number(e.target.value) || 0 })}
            />
          </ConfigRow>

          <ConfigRow
            label="If it fires again"
            note={
              w.retrigger === "queue"
                ? "two placeholders died, so two cues are due"
                : w.retrigger === "ignore"
                  ? "the first cue keeps its own timing"
                  : "re-cast it and the countdown restarts"
            }
          >
            <select
              className="field sm pick"
              value={w.retrigger ?? "restart"}
              title="What a second match does while this cue is still waiting."
              onChange={(e) => onChange({ retrigger: e.target.value as CastWatch["retrigger"] })}
            >
              <option value="restart">start over</option>
              <option value="queue">wait as well</option>
              <option value="ignore">change nothing</option>
            </select>
          </ConfigRow>

          <ConfigRow label="If you die">
            <select
              className="field sm pick wide"
              value={w.cancelOnDeath ?? "auto"}
              title="Whether dying calls this cue off. A reminder to re-cast is noise from a corpse; a spawn timer doesn't care."
              onChange={(e) => onChange({ cancelOnDeath: e.target.value as CastWatch["cancelOnDeath"] })}
            >
              <option value="auto">{autoMeans}</option>
              <option value="always">cancel it</option>
              <option value="never">keep waiting</option>
            </select>
          </ConfigRow>

          <ConfigRow label="Stop it when" align="top">
            <div style={{ flex: 1, minWidth: 0 }}>
              <WatchConditionRows
                conditions={w.cancelWhen ?? []}
                onChange={(cancelWhen) => onChange({ cancelWhen })}
                vocabulary={vocabulary}
                allowExclude={false}
                addLabel="+ Cancel on"
                empty="Nothing calls this off early. Add a line to watch for — “has been slain” to drop a re-mez reminder once the mob is dead."
              />
            </div>
          </ConfigRow>
        </>
      )}
    </div>
  );
}
