/**
 * awari-bootstrap.ts — our HTTP client for the awari bootstrap service (the room directory).
 *
 * awari ships no HTTP client, so this one is ours: it implements core's `BootstrapClient` against the
 * bootstrap-service's two endpoints. Plain `fetch` and nothing else, which is why it lives in `shared`
 * rather than beside the browser-only transport code in `lib/awari/net.ts` — it can be tested.
 *
 * **Both methods are expected to reject on failure, and that is load-bearing.** Core's own comment,
 * where it promotes a peer to leader:
 *
 * > Confirm bootstrap accepts the new leader-hint *before* committing local state or accepting
 * > connections — a failed registerHint should leave this peer's view of the room unchanged (still
 * > pointing at the dead leader) rather than believing itself the leader while nobody can reach it.
 *
 * The first version of this client `await`ed the fetch and dropped the response, so a hint bootstrap
 * *refused* looked exactly like one it accepted. Core then committed leadership and started accepting
 * connections into a room the directory had never heard of — which is the "two clients never met"
 * symptom [ADR 0028](../../specs/decisions/0028-peer-networking-verified-and-repaired.md) papered over
 * with jittered rejoins. `resolve` had the matching hole: no `res.ok` check, so an error page's HTML
 * either threw inside `res.json()` or yielded a body with no `contacts`, which core reads as "room's
 * not ready" — indistinguishable from nobody being online.
 *
 * So every failure here throws, and says **which** failure it was: the message is what reaches the
 * debug log ([ADR 0052](../../specs/decisions/0052-an-error-goes-to-the-log-not-the-screen.md) — an
 * error goes to the log, not over the game), and "bootstrap is unreachable" needs to read differently
 * from "the room is empty".
 */

import type { BootstrapClient } from "@awari/core";
import type {
  BootstrapRequest,
  BootstrapResponse,
  ContactHint,
  RegisterHintResponse,
  RoomId,
} from "@awari/protocol";

/** Live bootstrap-service (room directory / peer contact registry); overridable in Settings. */
export const DEFAULT_BOOTSTRAP_URL = "https://awari-bootstrap-service.vercel.app";

/**
 * How long to wait on the service before calling it unreachable.
 *
 * There was no timeout at all, so a request that hung never came back and the join sat there for good.
 * Generous enough for a cold serverless start, short enough that a person watching a toggle finds out.
 */
export const BOOTSTRAP_TIMEOUT_MS = 8_000;

/** Just the part of `fetch` this uses, so a test can supply one without a DOM. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/**
 * `BootstrapClient` over HTTP. `fetchImpl` is injectable for tests, the way `createXpProgress` takes
 * its clock — production callers pass nothing.
 */
export function createHttpBootstrapClient(
  baseUrl: string,
  protocolVersion: string,
  fetchImpl: FetchLike = (url, init) => fetch(url, init),
): BootstrapClient {
  const base = baseUrl.replace(/\/+$/, ""); // tolerate a trailing slash

  /**
   * POST JSON and come back with a parsed body, or throw saying what went wrong.
   *
   * The three failures are told apart because they need different reactions: unreachable means the
   * service or the network, a status code means the service answered and refused, and unparseable
   * means something in between answered instead of the service.
   */
  async function post<T>(path: string, body: unknown, what: string): Promise<T> {
    let res: Response;
    try {
      res = await fetchImpl(`${base}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(BOOTSTRAP_TIMEOUT_MS),
      });
    } catch (e) {
      const why = (e as Error)?.name === "TimeoutError" ? `no answer in ${BOOTSTRAP_TIMEOUT_MS}ms` : (e as Error).message;
      throw new Error(`bootstrap unreachable at ${base} (${what}): ${why}`);
    }
    if (!res.ok) throw new Error(`bootstrap refused ${what}: HTTP ${res.status} ${res.statusText}`);
    try {
      return (await res.json()) as T;
    } catch {
      // A proxy, a captive portal, or a platform error page — anything but the service.
      throw new Error(`bootstrap sent no JSON for ${what} — something other than the service answered`);
    }
  }

  return {
    async resolve(request: BootstrapRequest): Promise<BootstrapResponse> {
      const body = await post<BootstrapResponse>("/api/bootstrap", request, "resolve");
      // Core reads `status` and hands `contacts` straight to `tryContacts`. A body missing either is
      // worse than an error, because it reads as "the room isn't ready" — i.e. nobody's online.
      if (typeof body?.status !== "string" || !Array.isArray(body?.contacts)) {
        throw new Error("bootstrap sent a body that isn't a BootstrapResponse (no status/contacts)");
      }
      return body;
    },

    async registerHint(roomId: RoomId, hint: ContactHint): Promise<void> {
      const body = await post<RegisterHintResponse>(
        "/api/bootstrap/hints",
        { roomId, protocolVersion, hint },
        "registerHint",
      );
      // **The load-bearing throw.** Anything but "registered" means the directory will not point peers
      // at us, and core is waiting on this to decide whether to commit leadership.
      if (body?.status !== "registered") {
        throw new Error(
          `bootstrap would not register our ${hint.role} for room ${roomId}: ${body?.status ?? "no status"}` +
            (body?.status === "incompatible" ? ` (protocol ${protocolVersion} — this build is out of step)` : ""),
        );
      }
    },
  };
}
