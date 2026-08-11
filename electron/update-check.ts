/**
 * update-check.ts — "there's a newer build" without an auto-updater.
 *
 * CI publishes a rolling `latest` GitHub release on every push to main (ADR 0013); its tag is
 * always "latest", so the tag can't tell builds apart — but every build now stamps its run number
 * into the version (`0.1.42`, ADR 0064) and the release announces it. That version is the identity
 * we compare, and because it's a number we can ask whether it's **newer** rather than merely
 * different: a rebuild of an older commit, a re-run, or a rollback must never prompt someone to
 * "update" to a build they're already past.
 *
 * Dismissing or opening a notice records that version as seen, so the same build is never flagged
 * twice — but the next one is.
 *
 * Every failure path (offline, rate-limited, malformed, unreadable version) resolves to "nothing to
 * report": a broken update check must never interrupt the app.
 */
import fs from "node:fs";
import path from "node:path";
import { createLogger } from "../src/shared/logging";
import { isNewerVersion, versionFromRelease } from "../src/shared/version";

const log = createLogger("update-check");

/** The repository CI publishes to (see .github/workflows/build-windows.yml). */
const RELEASES_API = "https://api.github.com/repos/ahoff-git/eq-list/releases/latest";

export interface UpdateInfo {
  /** The release page to send the user to. */
  url: string;
  /** The published build's version — its identity, and what makes it newer. */
  version: string;
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

/**
 * @param currentVersion the running build's version (`app.getVersion()`).
 * @param fetchImpl injectable for tests; the real one is the global `fetch`.
 */
export function createUpdateChecker(
  userDataDir: string,
  currentVersion: string,
  fetchImpl: typeof fetch = fetch,
): UpdateChecker {
  const file = path.join(userDataDir, "update-state.json");
  let seenVersion = read();
  let found: UpdateInfo | null = null;

  function read(): string {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { seenVersion?: string };
      return typeof parsed.seenVersion === "string" ? parsed.seenVersion : "";
    } catch {
      return "";
    }
  }

  function write(version: string): void {
    seenVersion = version;
    try {
      fs.mkdirSync(userDataDir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ seenVersion }), "utf8");
    } catch (e) {
      log.warn("could not save update state:", (e as Error).message);
    }
  }

  return {
    async check() {
      try {
        const res = await fetchImpl(RELEASES_API, {
          headers: { Accept: "application/vnd.github+json", "User-Agent": "eq-list" },
        });
        if (!res.ok) {
          log.debug("update check: HTTP", res.status);
          return null;
        }
        const rel = (await res.json()) as { html_url?: string; body?: string; name?: string; published_at?: string };
        const version = versionFromRelease(rel);
        if (!version || !rel.html_url) return null;
        // The whole point: only a *higher* build number is an update.
        if (!isNewerVersion(version, currentVersion)) {
          log.debug("update check: latest is", version, "— not newer than", currentVersion);
          return null;
        }
        if (version === seenVersion) return null; // already acknowledged this one
        found = { url: rel.html_url, version, publishedAt: rel.published_at };
        log.debug("update available", found.version);
        return found;
      } catch (e) {
        // Offline, DNS failure, rate limit — never surfaced to the user.
        log.debug("update check skipped:", (e as Error).message);
        return null;
      }
    },
    latest: () => found,
    markSeen() {
      if (found) write(found.version);
    },
  };
}
