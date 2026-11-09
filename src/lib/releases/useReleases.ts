"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAppInfo } from "@/lib/hooks";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import { BEFORE_NOTES, CHANGELOG } from "@/shared/releases/changelog";
import { countFrom, firstLaunchMarker, nextSeen, notesSince, readSeen, updateHeadline, type ReleaseNote } from "@/shared/releases/release-notes";
import { createLogger } from "@/shared/logging";

const log = createLogger("releases");

export interface Releases {
  /** The running build's version; "" where the host has none (the web build). */
  current: string;
  /**
   * The newest version whose notes had been shown when this window opened — fixed for the session, so the
   * panel can keep marking what was new after the banner has been answered. Null: nothing remembered.
   */
  seenAtLaunch: string | null;
  /** The notes owed — everything after `seenAtLaunch` up to `current`, newest first. Empty until both are known. */
  fresh: readonly ReleaseNote[];
  /** Whether the player has been shown them this session (opened the panel, or dismissed the banner). */
  answered: boolean;
  /** The banner's one line; "" when there is nothing to announce. */
  headline: string;
  /** Record that the notes were shown: hides the banner and remembers the version. */
  answer(): void;
}

/**
 * What the player has and hasn't been told about this build.
 *
 * Reads the marker from main's store directly (`ui.all`) and waits for it — a banner that guessed "nothing
 * remembered" while the answer was still in flight would announce the newest release on every launch for a
 * moment, which is worse than a banner that arrives a beat late. Writing goes the same way, once, when the
 * notes are answered: not at launch, so a window closed before the banner was read doesn't lose it.
 */
export function useReleases(): Releases {
  const info = useAppInfo();
  const current = info?.version ?? "";
  // undefined: not asked yet. Otherwise what main held: the marker (null if there is none), and whether it held anything else —
  // which is how an install updating from before this was tracked is told apart from a first one.
  const [stored, setStored] = useState<{ seen: string | null; usedBefore: boolean } | undefined>(undefined);
  const [answered, setAnswered] = useState(false);

  useEffect(() => {
    const a = api();
    const blank = { seen: null, usedBefore: false };
    if (!a) return setStored(blank);
    void a.ui
      .all()
      .then((all) => setStored({ seen: readSeen(all[STORAGE_KEYS.releaseSeen]), usedBefore: Object.keys(all).some((k) => k !== STORAGE_KEYS.releaseSeen) }))
      .catch(() => setStored(blank));
  }, []);

  // Held at the first answer: `stored` itself never changes after, `answer` writes through to main alone.
  const seenAtLaunch = stored?.seen ?? null;
  const from = countFrom(seenAtLaunch, stored?.usedBefore ?? false, BEFORE_NOTES);
  const ready = stored !== undefined && info !== null;
  const fresh = useMemo(() => (ready ? notesSince(CHANGELOG, from, current) : []), [ready, from, current]);
  const headline = useMemo(() => updateHeadline(fresh, seenAtLaunch, current), [fresh, seenAtLaunch, current]);

  // A first install starts counting from this build at once — see `firstLaunchMarker`. `seenAtLaunch` stays null for this
  // session, so the courtesy banner still shows; it is the *next* launch that has something to read the marker from.
  useEffect(() => {
    if (!ready || !stored) return;
    const first = firstLaunchMarker(stored.seen, stored.usedBefore, current);
    if (first) void api()?.ui.set(STORAGE_KEYS.releaseSeen, first);
  }, [ready, stored, current]);

  const answer = useCallback(() => {
    if (!ready || answered) return;
    setAnswered(true);
    // Nothing was owed (another build of the same line, or a host with no version): nothing to remember.
    if (!fresh.length) return;
    const next = nextSeen(seenAtLaunch, current);
    log.debug("notes answered", { seenAtLaunch, current, remember: next });
    if (next) void api()?.ui.set(STORAGE_KEYS.releaseSeen, next);
  }, [ready, answered, fresh, seenAtLaunch, current]);

  return { current, seenAtLaunch, fresh, answered, headline, answer };
}
