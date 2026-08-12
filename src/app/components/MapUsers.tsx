"use client";
import { count } from "@/shared/format";
import type { ConnectedUser } from "@/lib/map/useAwariRoom";

/**
 * Who else is in the room, and where.
 *
 * The dot is the distinction that matters: **connected** and **sharing a location** are different
 * things, and someone who has joined but kept their position to themselves should look like a person
 * who is there rather than a person who is missing. Their zone is a button because "where is everyone"
 * is nearly always followed by "let me look".
 */
export default function MapUsers({ users, onZone }: { users: ConnectedUser[]; onZone: (zone: string) => void }) {
  return (
    <div className="map-users no-drag">
      <div className="muted small">Connected users</div>
      {users.length === 0 ? (
        <p className="muted small">
          Nobody else is in the room yet. Anyone else running EQ List with peer networking on shows up
          here.
        </p>
      ) : (
        users.map((u) => (
          <div className="user-row" key={u.peerId}>
            <span
              className={`dot ${u.sharingLoc ? "on" : ""}`}
              title={u.sharingLoc ? "Sharing their location" : "Connected, not sharing location"}
            />
            <span className="u-name">{u.name}</span>
            {u.zone ? (
              <button className="btn ghost sm" title={`View ${u.zone}`} onClick={() => onZone(u.zone)}>
                {u.zone}
              </button>
            ) : (
              <span className="muted small">zone unknown</span>
            )}
            {u.pins > 0 && (
              <span className="muted small">· {count(u.pins, "pin")}</span>
            )}
          </div>
        ))
      )}
    </div>
  );
}
