"use client";
import { useNpcSightings } from "@/lib/hooks";
import MapLink, { ZoneLink } from "@/app/components/map/MapLink";
import { sightingPlace, type NpcSighting, type SightingHow } from "@/shared/npc/npc-sightings";

const HOW: Record<SightingHow, [one: string, many: string]> = {
  hail: ["hail", "hails"],
  speech: ["thing they said", "things they said"],
  consider: ["consider", "considers"],
};

/**
 * Where **you've stood next to** the NPC whose page you're reading: every zone you've hailed, heard,
 * or considered them in, with the spot your nearest `/loc` puts them at (ADR 0298).
 *
 * The other half of `MobKills` for someone you never kill — a quest giver, a merchant. Renders
 * nothing until you've seen them.
 */
export default function NpcSightings({ name }: { name: string }) {
  const seen = useNpcSightings(name);
  if (!seen.length) return null;
  return (
    <>
      <h4 className="muted small" style={{ marginTop: 12 }}>
        Where you&apos;ve seen them
      </h4>
      <ul>
        {seen.map((s) => (
          <SightingRow key={s.zone} sighting={s} />
        ))}
      </ul>
    </>
  );
}

function SightingRow({ sighting: s }: { sighting: NpcSighting }) {
  const place = sightingPlace(s);
  const last = s.samples[s.samples.length - 1] ?? s.first;
  const placedBy = place && `${place.samples} ${HOW[place.how][place.samples === 1 ? 0 : 1]}`;
  return (
    <li>
      <ZoneLink zone={s.zone} />
      {place ? (
        <MapLink
          target={{ zone: s.zone, loc: { y: place.y, x: place.x }, label: s.name }}
          title={`Your /loc beside them, from ${placedBy} — rough, not their exact spot`}
        >
          {place.y}, {place.x}
          {place.spread > 0 ? ` ±${place.spread}` : ""}
        </MapLink>
      ) : (
        <span className="muted small">no /loc nearby</span>
      )}
      <span className="muted small">
        {placedBy ? `from ${placedBy} · ` : ""}first {day(s.first.at)}
        {last.at !== s.first.at ? ` · last ${day(last.at)}` : ""}
      </span>
    </li>
  );
}

function day(iso: string): string {
  return iso.slice(0, 10);
}
