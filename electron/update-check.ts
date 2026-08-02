/**
 * update-check.ts — "there's a newer build" without an auto-updater.
 *
 * CI publishes a rolling `latest` GitHub release on every push to main (ADR 0013); its tag is
 * always "latest", so the version can't tell builds apart — but the release *body* records the
 * commit it was built from ("Automated build of <sha>"). That commit is the identity we compare.
 *
 * We remember the commit we last acknowledged. The first check ever just records the current
 * latest (a fresh install is almost always current, and notifying someone who just installed is
 * noise); after that, a different latest commit means a newer build is out. Dismissing or opening
 * it records that commit as seen, so the same build is never flagged twice — but the next one is.
 *
 * Every failure path (offline, rate-limited, malformed) resolves to "nothing to report": a broken
 * update check must never interrupt the app.
 */
import fs from "node:fs";
import path from "node:path";
import { createLogger } from "../src/shared/logging";

const log = createLogger("update-check");

/** The repository CI publishes to (see .github/workflows/build-windows.yml). */
const RELEASES_API = "https://api.github.com/repos/ahoff-git/eq-list/releases/latest";

export interface UpdateInfo {
  /** The release page to send the user to. */
  url: string;
  /** The commit the latest build was made from — its identity. */
  commit: string;
  publishedAt?: string;
}

export interface UpdateChecker {
  /** Ask GitHub; returns a newer build when there is one, else null. Stashes it as `latest()`. */
  check(): Promise<UpdateInfo | null>;
  /** The newer build found this session, or null. */
  latest(): UpdateInfo | null;
  /** Record the found build as acknowledged, so it isn't flagged again. */
  markSeen(): void;
}

export function createUpdateChecker(userDataDir: string): UpdateChecker {
  const file = path.join(userDataDir, "update-state.json");
  let seenCommit = read();
  let found: UpdateInfo | null = null;

  function read(): string {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { seenCommit?: string };
      return typeof parsed.seenCommit === "string" ? parsed.seenCommit : "";
    } catch {
      return "";
    }
  }

  function write(commit: string): void {
    seenCommit = commit;
    try {
      fs.mkdirSync(userDataDir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ seenCommit }), "utf8");
    } catch (e) {
      log.warn("could not save update state:", (e as Error).message);
    }
  }

  return {
    async check() {
      try {
        const res = await fetch(RELEASES_API, {
          headers: { Accept: "application/vnd.github+json", "User-Agent": "eq-list" },
        });
        if (!res.ok) {
          log.debug("update check: HTTP", res.status);
          return null;
        }
        const rel = (await res.json()) as { html_url?: string; body?: string; published_at?: string };
        const commit = rel.body?.match(/build of ([0-9a-f]{7,40})/i)?.[1] ?? "";
        if (!commit || !rel.html_url) return null;
        // First check ever: assume the install matches, just record the baseline silently.
        if (!seenCommit) {
          write(commit);
          return null;
        }
        if (commit === seenCommit) return null; // nothing new since we last acknowledged
        found = { url: rel.html_url, commit, publishedAt: rel.published_at };
        log.debug("update available", found.commit);
        return found;
      } catch (e) {
        // Offline, DNS failure, rate limit — never surfaced to the user.
        log.debug("update check skipped:", (e as Error).message);
        return null;
      }
    },
    latest: () => found,
    markSeen() {
      if (found) write(found.commit);
    },
  };
}
