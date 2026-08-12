"use client";
import { api } from "@/lib/api";
import { alertStyle } from "@/shared/cast-alerts";
import AlertStyleFields from "./AlertStyleFields";
import type { CastAlertSettings, CastWatch } from "@/shared/types";

/**
 * One watched spell: whether it's on, what to match, how to match it, and — folded away until asked
 * for — a style of its own.
 *
 * A row rather than lines inside the list because there are three independent things going on in it
 * (the match, the match *mode*, and an optional style editor that only one row shows at a time), and
 * inline they sat five levels deep inside two nested `.map`s.
 */
export default function CastWatchRow({
  watch: w,
  alerts: ca,
  styling,
  onStyling,
  onChange,
  onRemove,
}: {
  watch: CastWatch;
  /** The whole group, for the defaults a per-watch style starts from. */
  alerts: CastAlertSettings;
  /** True while this row's style editor is the open one. */
  styling: boolean;
  onStyling: (open: boolean) => void;
  onChange: (patch: Partial<CastWatch>) => void;
  onRemove: () => void;
}) {
  return (
    <div style={{ marginBottom: 4 }}>
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
      {/* Only meaningful while this watch is looking at casts — a fade or a line names
          no caster to classify. */}
      {w.onCast !== false && (
        <label
          className="row"
          style={{ gap: 4 }}
          title="Also alert when a player, pet, or named NPC casts this — not just ordinary mobs. Off keeps a groupmate's cast (e.g. BunnySlayer's Charm) quiet."
        >
          <input
            type="checkbox"
            checked={!!w.includePlayers}
            onChange={(e) => onChange({ includePlayers: e.target.checked })}
          />
          <span className="small muted">players</span>
        </label>
      )}
      {/* Which prompt this watch is for. Casting means "stop that"; fading means "do
          that again", and plenty of spells are only worth one or the other. */}
      <label
        className="row"
        style={{ gap: 4 }}
        title="Alert when this spell begins casting — the dispel-prep warning. Turn it off for a watch that only cares about the spell fading."
      >
        <input
          type="checkbox"
          checked={w.onCast !== false}
          onChange={(e) => onChange({ onCast: e.target.checked })}
        />
        <span className="small muted">cast</span>
      </label>
      <label
        className="row"
        style={{ gap: 4 }}
        title="Alert when this spell fades — your root wearing off a mob, your Spirit of Wolf expiring. Note EQ words some fades per spell (&quot;Your strength fades.&quot;) and names no spell, so match those words instead."
      >
        <input
          type="checkbox"
          checked={!!w.onFade}
          onChange={(e) => onChange({ onFade: e.target.checked })}
        />
        <span className="small muted">fades</span>
      </label>
      {/* The escape hatch: points the same text at whole log lines, so anything the game prints is
          alertable whether or not a parser models it. "line" said what it matched against but not
          what it was *for*, and it's the answer to most "why doesn't this alert?" questions. */}
      <label
        className="row"
        style={{ gap: 4 }}
        title="Match these words anywhere in a log line, exactly as the game printed it — “invites you” for a party invite, “tells you” for a tell, “the mystical path fades away” for a buff the parser can't model. Anything in your log can be a trigger this way; pair it with a message to say what you want."
      >
        <input
          type="checkbox"
          checked={!!w.onLine}
          onChange={(e) => onChange({ onLine: e.target.checked })}
        />
        <span className="small muted">raw text</span>
      </label>
      {/* Its own look and sound, so two emergencies can be told apart without reading
          the banner. A watch either follows the defaults or carries a full style. */}
      <button
        className={`btn ghost sm ${w.style ? "on" : ""}`}
        title={
          w.style
            ? "This alert has its own style — click to go back to the defaults"
            : "Give this alert its own color, sound, position, motion and duration"
        }
        onClick={() => {
          // Taking a style *opens* the editor; giving it back closes it — the button is one gesture.
          onChange({ style: w.style ? undefined : { ...alertStyle(ca) } });
          onStyling(!w.style);
        }}
      >
        🎨
      </button>
      <button className="btn ghost sm" title="Remove" onClick={() => onRemove()}>
        ✕
      </button>
      </div>
      {/* Open only for the watch being styled, so a long list stays readable. */}
      {w.style && styling && (
        <div className="watch-style">
          <span className="hint" style={{ display: "block", marginBottom: 4 }}>
            This alert&apos;s own style. It started as a copy of the defaults, so editing
            the defaults later won&apos;t move it — 🎨 again to give it back.
          </span>
          <AlertStyleFields
            style={alertStyle(ca, w)}
            locations={ca.locations}
            onChange={(over) => onChange({ style: { ...w.style, ...over } })}
          />
          <div className="row" style={{ gap: 8, marginTop: 4 }}>
            <button className="btn ghost sm" onClick={() => void api()?.alerts.test(w.id)}>
              Test this alert
            </button>
            <button className="btn ghost sm" onClick={() => onStyling(false)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
