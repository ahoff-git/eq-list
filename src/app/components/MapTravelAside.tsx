"use client";
import { useState } from "react";
import { copyText } from "@/lib/clipboard";
import type { TravelSurvey } from "@/shared/types";

/**
 * **The half of the travel graph a map cannot draw** — shown beside it while the 🧭 panel is open.
 *
 * Two things about a zone are true and have no place on its map, and both matter more than the ones
 * that do:
 *
 *  - **The teleport networks.** A druid reaches every ring in the world from wherever they stand, so
 *    a faithful drawing of Misty Thicket's travel would run eighteen lines off the edge of it and say
 *    nothing except that the network exists. One chip reading `Druid Rings · 18` says exactly as much,
 *    and opens when you want the names. That is the whole of why this exists: the alternative isn't a
 *    busier map, it's an unreadable one.
 *  - **The nodes with nowhere to be.** A border only one side's mapmaker labelled is *in* this zone
 *    and has no position in it, so every walk to it is priced by a stand-in
 *    ([ADR 0062](../../../specs/decisions/0062-a-travel-graph-of-zone-lines.md)). A marker can't show
 *    that and its absence from the map reads as "no such border" — which is the opposite of the truth
 *    and precisely the thing an audit is looking for.
 *
 * Everything here is **readable, not just visible**: a chip opens, a node names its own id, and the
 * whole survey copies as text, because auditing a pack's labels means comparing our figures against
 * the game and neither eyes nor screenshots do that.
 */

/** A network you can't currently use is dimmed rather than hidden — it's still what the graph holds. */
function Network({ net }: { net: TravelSurvey["networks"][number] }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={`mta-net ${net.allowed ? "" : "off"}`}>
      <button
        className="btn ghost sm mta-chip"
        onClick={() => setOpen((o) => !o)}
        title={
          net.allowed
            ? `Every destination on this network is reachable from here, for no walking. ${net.destinations.length} of them — click to list.`
            : `Switched off in the panel, so no route uses it. ${net.destinations.length} destinations — click to list.`
        }
      >
        <span aria-hidden>{open ? "▾" : "▸"}</span> {net.label}
        <span className="mta-count">{net.destinations.length}</span>
        {net.here.length > 0 && (
          <span className="mta-here" title="One of them is in this zone — the marker on the map">
            here
          </span>
        )}
      </button>
      {open && (
        <ol className="mta-list">
          {net.destinations.map((d) => (
            <li key={d.id} className={net.here.includes(d.id) ? "is-here" : ""}>
              {d.zone.name}
              <span className="muted small"> · {d.label}</span>
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

/** The survey as text, which is what an audit is actually done in. */
function asText(survey: TravelSurvey): string {
  const lines = [`${survey.zone.name} (${survey.zone.zone})`];
  for (const node of survey.nodes) {
    const where = node.at.length
      ? node.at.map((at) => `${Math.round(at.y)}, ${Math.round(at.x)}`).join(" | ")
      : "no position in this zone";
    lines.push(`  ${node.id}\t${node.beyond ? `→ ${node.beyond.name}` : node.label}\t${node.via ?? node.kind}\t${where}`);
  }
  for (const net of survey.networks) {
    lines.push(`  ${net.label} (${net.allowed ? "on" : "off"}): ${net.destinations.map((d) => d.zone.name).join(", ")}`);
  }
  return lines.join("\n");
}

export default function MapTravelAside({ survey }: { survey: TravelSurvey | null }) {
  if (!survey) return null;
  const placed = survey.nodes.filter((n) => n.at.length);
  const unplaced = survey.nodes.filter((n) => !n.at.length);
  return (
    <aside className="map-travel-aside no-drag">
      <div className="mta-head">
        <strong>{survey.zone.name}</strong>
        <span className="muted small" title="Nodes the graph puts in this zone and can place on this map">
          {placed.length} on the map
        </span>
        <button
          className="btn ghost sm"
          title="Copy every node, its coordinates and the networks — the form an audit is actually done in"
          onClick={() => void copyText(asText(survey), "Travel nodes")}
        >
          Copy
        </button>
      </div>

      <ul className="mta-group">
        {survey.networks.map((net) => (
          <Network key={net.mode} net={net} />
        ))}
        {survey.networks.length === 0 && <li className="muted small">No teleport network reaches this zone.</li>}
      </ul>

      {unplaced.length > 0 && (
        <div className="mta-holes">
          <span
            className="muted small"
            title="The graph says this border is here and hasn't got a position for it, so every walk to it is a stand-in rather than a measurement. Nothing can be drawn, which is exactly why it's listed."
          >
            Here, but nowhere on this map
          </span>
          <ol className="mta-list">
            {unplaced.map((node) => (
              <li key={node.id}>
                {node.beyond ? `→ ${node.beyond.name}` : node.label}
                {/* Two different things wear no position, and the difference is what you'd do about
                    them: a hole in the maps is somewhere to go and read a coordinate off, a wiki claim
                    is knowledge from elsewhere that never had one to give. */}
                {node.claimed && (
                  <span className="mta-claim" title="eqlwiki lists these zones as adjacent. No map drew the crossing, so there is no distance to measure — only that it exists.">
                    wiki
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </aside>
  );
}
