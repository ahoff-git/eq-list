/**
 * cdp.mjs — a small Chrome DevTools Protocol client, and the timing helpers every probe leans on.
 *
 * Node's own global `WebSocket` is the transport (no dependency). Everything that waits has a bound:
 * an un-timed sweep once hung the *script* rather than the app, which looks exactly like an app hang.
 */
import { log } from "./log.mjs";

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** `promise`, or a rejection naming what was being waited for if it takes longer than `ms`. */
export function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms: ${label}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Poll `check` until it returns something truthy, or fail with `label` after `timeoutMs`. `giveUp`, if
 * given, is asked each round for a reason to stop waiting early (the process being waited on has died).
 */
export async function until(check, { timeoutMs = 15000, everyMs = 150, label = "condition", giveUp = () => undefined } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const reason = giveUp();
    if (reason) throw new Error(`gave up waiting for ${label}: ${reason}`);
    try {
      const value = await check();
      if (value) return value;
    } catch {
      /* not ready yet */
    }
    if (Date.now() > deadline) throw new Error(`timed out after ${timeoutMs} ms waiting for ${label}`);
    await sleep(everyMs);
  }
}

/** GET JSON from the browser's debugging port. */
export async function fetchJson(url, timeoutMs = 3000) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
}

/**
 * A connection to one DevTools target (a page) or to the browser itself.
 *
 *   send(method, params, timeoutMs)   a command; rejects on a protocol error or a timeout
 *   evaluate(expression, opts)        Runtime.evaluate with the result by value; rejects on a thrown error
 *   on(method, handler)               an event subscription; returns the unsubscribe function
 *   close()
 */
export async function connect(webSocketUrl) {
  const ws = new WebSocket(webSocketUrl);
  await withTimeout(
    new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = () => reject(new Error(`could not open ${webSocketUrl}`));
    }),
    8000,
    `opening ${webSocketUrl}`,
  );

  let nextId = 0;
  const pending = new Map();
  const handlers = new Map();
  let closed = false;

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== undefined) {
      const waiting = pending.get(message.id);
      if (!waiting) return;
      pending.delete(message.id);
      if (message.error) waiting.reject(new Error(`${waiting.method}: ${message.error.message}`));
      else waiting.resolve(message.result);
      return;
    }
    for (const handler of handlers.get(message.method) ?? []) handler(message.params ?? {});
  };
  ws.onclose = () => {
    closed = true;
    for (const waiting of pending.values()) waiting.reject(new Error(`${waiting.method}: the connection closed`));
    pending.clear();
  };

  const send = (method, params = {}, timeoutMs = 15000) => {
    if (closed) return Promise.reject(new Error(`${method}: the connection is closed`));
    const id = ++nextId;
    log.debug("cdp →", method);
    const reply = new Promise((resolve, reject) => {
      pending.set(id, { method, resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
    return withTimeout(reply, timeoutMs, method).catch((error) => {
      pending.delete(id);
      throw error;
    });
  };

  const evaluate = async (expression, { timeoutMs = 15000 } = {}) => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, timeoutMs);
    if (result.exceptionDetails) {
      throw new Error(`evaluate threw: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`);
    }
    return result.result?.value;
  };

  const on = (method, handler) => {
    const set = handlers.get(method) ?? new Set();
    set.add(handler);
    handlers.set(method, set);
    return () => set.delete(handler);
  };

  return { send, evaluate, on, close: () => ws.close(), isClosed: () => closed };
}
