/**
 * no-network.cjs — loaded into the app's **main** process (NODE_OPTIONS=--require), so that a smoke run
 * cannot reach the internet from there.
 *
 * `--host-resolver-rules` blocks the renderer, but the main process uses Node's own `fetch`, which
 * that flag does not touch: a fresh profile downloads eqlwiki's whole title index on its first launch.
 * A suite that runs on every change must not do that to someone else's server, and a test instance
 * with a working connection is one config slip from being found in the real peer room.
 *
 * Anything that is not the local machine is refused, and each refusal is appended to the file named
 * by EQL_SMOKE_NETLOG so the report can say what the app tried. Plain CommonJS and dependency-free,
 * because it runs before the app does.
 */
const fs = require("node:fs");

const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const logFile = process.env.EQL_SMOKE_NETLOG;
const realFetch = globalThis.fetch;

function note(url) {
  if (!logFile) return;
  try {
    fs.appendFileSync(logFile, `${url}\n`);
  } catch {
    /* the refusal still stands without its record */
  }
}

if (typeof realFetch === "function") {
  globalThis.fetch = function guardedFetch(input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || String(input);
    let host = "";
    try {
      host = new URL(url).hostname;
    } catch {
      /* a relative or malformed URL is not going anywhere either */
    }
    if (!LOCAL.has(host)) {
      note(url);
      return Promise.reject(new TypeError(`fetch failed: ${host || url} is blocked by the smoke suite`));
    }
    return realFetch.call(this, input, init);
  };
}
