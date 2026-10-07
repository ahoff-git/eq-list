/**
 * auto-update.ts — fetches and installs the app's own updates, replacing the old notify-only
 * checker (`update-check.ts`, retired by ADR 0279). It rides the same rolling `latest` GitHub
 * release CI already publishes (ADR 0013) and the same build-number versioning (ADR 0064):
 * electron-updater reads `latest.yml` from that release to decide whether a newer build exists,
 * downloads it in the background, and installs it on restart (or on the next ordinary quit, via
 * `autoInstallOnAppQuit`).
 *
 * The electron-updater singleton is injected behind the small `UpdaterLike` interface below, so
 * this state machine is a tested black box — no real network, filesystem, or installer in the
 * test, just a fake emitter standing in for `autoUpdater`.
 *
 * Every failure (offline, rate-limited, malformed feed) resolves to the `error` state and is only
 * logged, never surfaced as an interruption — the same rule `update-check.ts` followed.
 */
import { createLogger } from "../src/shared/logging";

const log = createLogger("auto-update");

export type AutoUpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available"; version: string }
  | { state: "downloading"; percent: number }
  | { state: "ready"; version: string }
  | { state: "error"; message: string };

/** The slice of electron-updater's `autoUpdater` this module drives. */
export interface UpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  logger: unknown;
  on(event: "checking-for-update", listener: () => void): unknown;
  on(event: "update-available" | "update-not-available" | "update-downloaded", listener: (info: { version: string }) => void): unknown;
  on(event: "download-progress", listener: (progress: { percent: number }) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
}

export interface AutoUpdater {
  status(): AutoUpdateStatus;
  /** Fires on every state change. Returns an unsubscribe. */
  onChange(cb: (status: AutoUpdateStatus) => void): () => void;
  /** Ask the feed. A no-op while a check or download is already in flight. */
  check(): void;
  /** Quit and run the already-downloaded installer. Only meaningful once status is "ready". */
  restartAndInstall(): void;
}

export function createAutoUpdater(impl: UpdaterLike): AutoUpdater {
  impl.autoDownload = true;
  impl.autoInstallOnAppQuit = true;
  impl.logger = log;

  let status: AutoUpdateStatus = { state: "idle" };
  const listeners = new Set<(s: AutoUpdateStatus) => void>();
  function set(next: AutoUpdateStatus): void {
    status = next;
    for (const cb of listeners) cb(status);
  }

  impl.on("checking-for-update", () => set({ state: "checking" }));
  impl.on("update-available", (info) => set({ state: "available", version: info.version }));
  // Nothing newer than what's running — back to quiet rather than a dead-end "checking" state.
  impl.on("update-not-available", () => set({ state: "idle" }));
  impl.on("download-progress", (progress) => set({ state: "downloading", percent: Math.round(progress.percent) }));
  impl.on("update-downloaded", (info) => set({ state: "ready", version: info.version }));
  impl.on("error", (err) => {
    // warn, not debug: a broken feed (bad URL, rate limit, offline) must show up in the debug
    // log by default, or "it's just not updating" has no trail to diagnose from.
    log.warn("update check failed:", err.message);
    set({ state: "error", message: err.message });
  });

  return {
    status: () => status,
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    check() {
      if (status.state === "checking" || status.state === "downloading") return;
      void impl.checkForUpdates().catch((err: Error) => {
        log.warn("update check failed:", err.message);
        set({ state: "error", message: err.message });
      });
    },
    restartAndInstall() {
      impl.quitAndInstall();
    },
  };
}
