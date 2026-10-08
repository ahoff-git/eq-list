/**
 * room-watch.ts — when a room of one is worth doubting, and what settles it.
 *
 * Two clients that start at the same instant can each resolve an empty directory, find nobody, and
 * each become the genesis leader of their own room under the same id. Both look perfectly connected.
 * Both are alone. Neither has any way to notice, because from the inside a room you made and a room
 * nobody else has joined yet are the same room.
 *
 * Everything the app has done about that until now has been a **guess on a timer**: three jittered
 * re-joins at the start ([ADR 0070](../../specs/decisions/0070-a-dropped-room-rejoins-itself.md)) and
 * a five-minute watchdog after that ([ADR 0145](../../specs/decisions/0145-a-room-checks-itself-and-needs-no-game.md)).
 * A guess has to be wrong in one direction or the other: fast enough to reunite a split pair means a
 * solitary player re-joins all evening, and quiet enough for a solitary player means a split pair
 * stays split for as long as it takes somebody to notice.
 *
 * There is no need to guess. awari's `pingRoomStatus` is a **read-only probe** that asks the
 * directory who leads this room and asks *them* who is in it — and, unlike a join, it never falls
 * back to becoming the leader itself. So a client sitting alone can find out which of the two rooms
 * the directory actually points at:
 *
 *   - **somebody answered** — the room the world can find is not the room we are in, because if it
 *     were we would be looking at them. That is a split, proven rather than suspected, and the cure
 *     is to re-join into the room everyone else will find.
 *   - **nobody answered** — the directory points at a leader no one can reach, and the most likely
 *     leader nobody can reach is *us* (a peer cannot dial itself). We are the room the world finds.
 *     Being alone in it means being alone, and re-joining would only churn.
 *
 * That asymmetry is the whole mechanism, and it is what makes the split heal **without** both sides
 * acting: of two clients that raced, exactly one is the one the directory forgot, and exactly that
 * one moves.
 *
 * This module is the policy and holds no clock, no socket and no awari: `saw` says when a look is
 * due and `probed` reads the answer. The looking is the caller's job (`src/lib/awari/net.ts`), which
 * is what keeps every rule here testable without a network.
 */

/**
 * How long to sit in a room of one before looking again, per consecutive fruitless look.
 *
 * It **escalates and never stops**, which is the opposite of ADR 0070's bounded ladder and is only
 * affordable because a look is no longer a re-join: the first rungs are cheap enough to reunite two
 * people who sat down together within half a minute, and the last one costs a genuinely solitary
 * player one bootstrap POST and one failed dial every five minutes, for ever. Giving up was only
 * ever necessary while the alternative to waiting was tearing down a working session.
 */
export const ALONE_CHECKS_MS = [20_000, 45_000, 90_000, 180_000, 300_000];

/**
 * Scatter a delay over ±50% of itself.
 *
 * Two clients that started together are equally lonely and would otherwise look, and re-join, in
 * lockstep — racing each other into a fresh room every time, which is the failure the retries exist
 * to fix reproducing itself inside them. Measured, in the version of this that had no spread: three
 * synchronised retries, still two rooms.
 */
export function spread(ms: number, random: () => number = Math.random): number {
  return Math.round(ms * (0.5 + random()));
}

/** What the room looks like from inside, which is all `saw` is allowed to know. */
export interface RoomLook {
  /** The **real** connection — a live session, not the `connectPeers` setting. */
  connected: boolean;
  /** How many other peers we can see. Anything above zero is a room that works. */
  peers: number;
}

/**
 * The answer to a probe.
 *
 * `reached` is the only bit that decides anything; `peers` rides along for the log, because
 * "re-joining — the room everyone else can find has 3 in it" is a line worth being able to read.
 */
export type RoomProbe = { reached: true; peers: number } | { reached: false };

export interface RoomWatch {
  /** Take a look at the room. `"probe"` means it is time to find out whether we are really alone. */
  saw: (look: RoomLook) => "wait" | "probe";
  /** What the probe found. `"rejoin"` means we are in the wrong room. */
  probed: (result: RoomProbe) => "rejoin" | "wait";
  /** How long until the next look is due — what a caller schedules on. Always finite. */
  waiting: () => number;
  /** Fruitless looks since we last had company. Exposed for logs and tests, not for decisions. */
  attempts: () => number;
}

/**
 * A watch over one room.
 *
 * Stateful on purpose — the rung of the ladder we are on and the moment the next look falls due are
 * exactly the things that must survive a re-join to pace the one after it, and a caller that had to
 * carry them would be the caller re-implementing this.
 */
export function createRoomWatch(deps: { now?: () => number; random?: () => number } = {}): RoomWatch {
  const now = deps.now ?? (() => Date.now());
  const random = deps.random ?? Math.random;

  /** Rung of `ALONE_CHECKS_MS`, held at the last one rather than running off the end. */
  let attempt = 0;
  /** Whether the previous look saw a live session, so joining can be told from staying joined. */
  let wasConnected = false;
  let due = now() + spread(ALONE_CHECKS_MS[0], random);

  /** Wait out the rung we are on, from now. */
  function rest(): void {
    due = now() + spread(ALONE_CHECKS_MS[Math.min(attempt, ALONE_CHECKS_MS.length - 1)], random);
  }

  return {
    saw(look) {
      // A room we are not in is the reconnect backoff's problem, not this one's. Hold the clock so
      // an outage doesn't bank time towards a probe there'd be nothing to probe with.
      if (!look.connected) {
        wasConnected = false;
        rest();
        return "wait";
      }
      // Company is the one unambiguous proof that this room is the room. It refunds the ladder,
      // which is what stops a client that met somebody an hour ago from being stuck on the slowest
      // rung when they are left on their own again.
      if (look.peers > 0) {
        attempt = 0;
        wasConnected = true;
        rest();
        return "wait";
      }
      // A join that has only just landed has had no chance to meet anybody yet.
      if (!wasConnected) {
        wasConnected = true;
        rest();
        return "wait";
      }
      if (now() < due) return "wait";
      return "probe";
    },

    probed(result) {
      // The rung advances on the **look**, not on the verdict: a probe that found nothing is what
      // makes the next one worth spacing out, and a probe that found a room is about to be answered
      // by a re-join that resets everything anyway.
      attempt = Math.min(attempt + 1, ALONE_CHECKS_MS.length - 1);
      rest();
      return result.reached ? "rejoin" : "wait";
    },

    waiting: () => Math.max(0, due - now()),
    attempts: () => attempt,
  };
}
