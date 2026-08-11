/**
 * Our HTTP client for the awari bootstrap service.
 *
 * The whole subject here is **failing loudly**, because core depends on it. From core, promoting a peer
 * to leader:
 *
 * > Confirm bootstrap accepts the new leader-hint *before* committing local state or accepting
 * > connections — a failed registerHint should leave this peer's view of the room unchanged … rather
 * > than believing itself the leader while nobody can reach it.
 *
 * The first version `await`ed the fetch and dropped the response, so a refusal was indistinguishable
 * from acceptance and core committed leadership anyway. These tests exist to keep that from coming
 * back: every one of them is a way the service can fail, and every one must reject.
 *
 * `fetch` is injected rather than stubbed globally, so nothing here depends on a DOM or leaks between
 * tests.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ContactHint } from "@awari/protocol";
import { BOOTSTRAP_TIMEOUT_MS, createHttpBootstrapClient, type FetchLike } from "../../src/shared/awari-bootstrap";

const VERSION = "1.2.3";
const REQUEST = { roomId: "eq-list", protocolVersion: VERSION, sessionId: "s-1" };
const HINT: ContactHint = { role: "leader-hint", connectionData: "peer-abc" };

/** A `fetch` that answers with whatever you give it, and records what it was asked. */
function stub(reply: Partial<Response> & { json?: () => Promise<unknown> }): { fetch: FetchLike; calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = [];
  return {
    calls,
    fetch: (url, init) => {
      calls.push({ url, init });
      return Promise.resolve({ ok: true, status: 200, statusText: "OK", json: () => Promise.resolve({}), ...reply } as Response);
    },
  };
}

const client = (fetchImpl: FetchLike, base = "https://bootstrap.example") =>
  createHttpBootstrapClient(base, VERSION, fetchImpl);

test("a good answer comes straight back, and the request is shaped as the service expects", async () => {
  const s = stub({ json: () => Promise.resolve({ status: "ready", contacts: [HINT] }) });
  const answer = await client(s.fetch).resolve(REQUEST);
  assert.deepEqual(answer, { status: "ready", contacts: [HINT] });

  assert.equal(s.calls[0].url, "https://bootstrap.example/api/bootstrap");
  assert.equal(s.calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(String(s.calls[0].init.body)), REQUEST);
  // Every request carries a deadline — there was none at all, so a hung one never came back.
  assert.ok(s.calls[0].init.signal, `expected an abort signal (${BOOTSTRAP_TIMEOUT_MS}ms)`);
});

test("a trailing slash on the configured URL doesn't double up", async () => {
  // The URL is user-editable in Settings, so it arrives however they typed it.
  const s = stub({ json: () => Promise.resolve({ status: "ready", contacts: [] }) });
  await client(s.fetch, "https://bootstrap.example///").resolve(REQUEST);
  assert.equal(s.calls[0].url, "https://bootstrap.example/api/bootstrap");
});

test("an HTTP error is an error, not an empty room", async () => {
  // This is the `res.ok` hole: a 500 used to fall through to `res.json()`.
  const s = stub({ ok: false, status: 502, statusText: "Bad Gateway" });
  await assert.rejects(() => client(s.fetch).resolve(REQUEST), /502 Bad Gateway/);
});

test("an error page instead of JSON says so, rather than throwing a parse error", async () => {
  const s = stub({ json: () => Promise.reject(new SyntaxError("Unexpected token '<'")) });
  await assert.rejects(() => client(s.fetch).resolve(REQUEST), /other than the service answered/);
});

test("an unreachable service is told apart from a timeout", async () => {
  const dead: FetchLike = () => Promise.reject(new TypeError("Failed to fetch"));
  await assert.rejects(() => client(dead).resolve(REQUEST), /unreachable.*Failed to fetch/s);

  const timeout: FetchLike = () => Promise.reject(Object.assign(new Error("aborted"), { name: "TimeoutError" }));
  await assert.rejects(() => client(timeout).resolve(REQUEST), new RegExp(`no answer in ${BOOTSTRAP_TIMEOUT_MS}ms`));
});

test("a body that isn't a BootstrapResponse is refused, not passed to core", async () => {
  // Core reads `status` and hands `contacts` straight to `tryContacts`, so a body missing either reads
  // as "the room isn't ready" — the same thing an empty room looks like.
  for (const body of [{}, { status: "ready" }, { contacts: [] }, { status: 200, contacts: [] }, null]) {
    const s = stub({ json: () => Promise.resolve(body) });
    await assert.rejects(() => client(s.fetch).resolve(REQUEST), /isn't a BootstrapResponse/, JSON.stringify(body));
  }
});

test("registering a hint that bootstrap accepts resolves quietly", async () => {
  const s = stub({ json: () => Promise.resolve({ status: "registered", hint: HINT }) });
  await client(s.fetch).registerHint("eq-list", HINT);

  assert.equal(s.calls[0].url, "https://bootstrap.example/api/bootstrap/hints");
  // The protocol version is ours to send — core doesn't pass it to `registerHint`.
  assert.deepEqual(JSON.parse(String(s.calls[0].init.body)), { roomId: "eq-list", protocolVersion: VERSION, hint: HINT });
});

test("a hint bootstrap REFUSES must reject — the bug this client was written to fix", async () => {
  // Core awaits this before committing leadership and accepting connections. Resolving here is what let
  // a peer believe it led a room the directory had never heard of.
  for (const status of ["not-found", "incompatible", "anything-else"]) {
    const s = stub({ json: () => Promise.resolve({ status }) });
    await assert.rejects(() => client(s.fetch).registerHint("eq-list", HINT), /would not register our leader-hint/, status);
  }
  // A body with no status at all is a refusal too — silence is not consent.
  const empty = stub({ json: () => Promise.resolve({}) });
  await assert.rejects(() => client(empty.fetch).registerHint("eq-list", HINT), /no status/);
});

test("an incompatible protocol says which version we sent", async () => {
  // The one refusal a person can act on: this build is out of step with the service.
  const s = stub({ json: () => Promise.resolve({ status: "incompatible" }) });
  await assert.rejects(() => client(s.fetch).registerHint("eq-list", HINT), new RegExp(`protocol ${VERSION}`));
});

test("registerHint fails loudly on the transport failures too", async () => {
  const s = stub({ ok: false, status: 503, statusText: "Service Unavailable" });
  await assert.rejects(() => client(s.fetch).registerHint("eq-list", HINT), /503/);

  const dead: FetchLike = () => Promise.reject(new TypeError("network down"));
  await assert.rejects(() => client(dead).registerHint("eq-list", HINT), /unreachable/);
});
