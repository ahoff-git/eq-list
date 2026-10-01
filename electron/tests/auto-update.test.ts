/**
 * Black-box tests for the auto-update state machine. electron-updater itself is faked — what's
 * under test is the status this module derives from its events, and that every failure resolves
 * to a quiet "error" state rather than throwing or hanging.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAutoUpdater, type UpdaterLike } from "../auto-update";

type Listener = (...args: never[]) => void;

/** A fake `autoUpdater`: records its config, lets a test fire any event, and controls checkForUpdates(). */
function fakeUpdater(opts: { checkForUpdates?: () => Promise<unknown> } = {}) {
  const handlers = new Map<string, Listener[]>();
  const impl: UpdaterLike = {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    logger: null,
    on: (event: string, listener: Listener) => {
      const list = handlers.get(event) ?? [];
      list.push(listener);
      handlers.set(event, list);
      return impl;
    },
    checkForUpdates: opts.checkForUpdates ?? (async () => null),
    quitAndInstall: () => {
      installed = true;
    },
  };
  let installed = false;
  const fire = (event: string, ...args: unknown[]) => {
    for (const listener of handlers.get(event) ?? []) (listener as (...a: unknown[]) => void)(...args);
  };
  return { impl, fire, wasInstalled: () => installed };
}

test("configures the real updater for silent background updates", () => {
  const { impl } = fakeUpdater();
  createAutoUpdater(impl);
  assert.equal(impl.autoDownload, true);
  assert.equal(impl.autoInstallOnAppQuit, true);
  assert.ok(impl.logger); // wired to the project's logger, not console
});

test("idle until something happens", () => {
  const { impl } = fakeUpdater();
  const updater = createAutoUpdater(impl);
  assert.deepEqual(updater.status(), { state: "idle" });
});

test("walks available -> downloading -> ready", () => {
  const { impl, fire } = fakeUpdater();
  const updater = createAutoUpdater(impl);

  fire("checking-for-update");
  assert.deepEqual(updater.status(), { state: "checking" });

  fire("update-available", { version: "0.1.43" });
  assert.deepEqual(updater.status(), { state: "available", version: "0.1.43" });

  fire("download-progress", { percent: 37.8 });
  assert.deepEqual(updater.status(), { state: "downloading", percent: 38 });

  fire("update-downloaded", { version: "0.1.43" });
  assert.deepEqual(updater.status(), { state: "ready", version: "0.1.43" });
});

test("nothing newer settles back to idle, not stuck checking", () => {
  const { impl, fire } = fakeUpdater();
  const updater = createAutoUpdater(impl);
  fire("checking-for-update");
  fire("update-not-available", { version: "0.1.42" });
  assert.deepEqual(updater.status(), { state: "idle" });
});

test("an updater error is reported, never thrown", () => {
  const { impl, fire } = fakeUpdater();
  const updater = createAutoUpdater(impl);
  fire("error", new Error("getaddrinfo ENOTFOUND"));
  assert.deepEqual(updater.status(), { state: "error", message: "getaddrinfo ENOTFOUND" });
});

test("a rejected checkForUpdates() is caught, not an unhandled rejection", async () => {
  const { impl } = fakeUpdater({ checkForUpdates: () => Promise.reject(new Error("rate limited")) });
  const updater = createAutoUpdater(impl);
  updater.check();
  await new Promise((r) => setTimeout(r, 0)); // let the rejection's .catch run
  assert.deepEqual(updater.status(), { state: "error", message: "rate limited" });
});

test("restartAndInstall quits and runs the installer", () => {
  const { impl, wasInstalled } = fakeUpdater();
  const updater = createAutoUpdater(impl);
  updater.restartAndInstall();
  assert.ok(wasInstalled());
});

test("onChange can unsubscribe", () => {
  const { impl, fire } = fakeUpdater();
  const updater = createAutoUpdater(impl);
  const seen: string[] = [];
  const unsubscribe = updater.onChange((s) => seen.push(s.state));
  fire("checking-for-update");
  unsubscribe();
  fire("update-available", { version: "0.1.43" });
  assert.deepEqual(seen, ["checking"]);
});
