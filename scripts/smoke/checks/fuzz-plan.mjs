/**
 * fuzz-plan.mjs — what the IPC fuzz calls, with what, and what it leaves alone.
 *
 * Pure, so the lists are unit-tested: a skip pattern that stops matching would quietly start calling
 * a function that opens a window over the player's game.
 */

/** Calls left alone, and why. First match wins. */
export const SKIPPED = [
  [/^win\./, "moves, hides or closes the real window"],
  [/^update\./, "checks for or installs an update"],
  [/^lookup\./, "opens the full-screen screengrab selector"],
  [/^(awari|peer)\./, "the peer room: an isolated instance must never connect and announce itself"],
  [/^admin\./, "edits the stores behind the app's back"],
  [/^map\.(open|openAt|openP99)$/, "opens windows or a browser"],
  [/^(alerts\.(test|preview|placeLocation)|records\.test)$/, "draws banners over the player's screen"],
  [/pick/i, "opens a native dialog that blocks until someone answers it"],
  [/openInBrowser|openLog|openCheatSheet|^shell\./i, "launches an external program"],
  [/^app\.selfCheckFix$/, "runs a repair"],
  [/clear/i, "wipes a ledger"],
  [/harvest/i, "starts a long network crawl"],
  [/refresh/i, "re-fetches pages from the wiki"],
  [/^(settings\.update|ui\.set|statsRecord\.set)$/, "rewrites the settings this run depends on"],
  [/^(search\.(onPrefill|show|openPage)|nav\.)/, "drives the window's own navigation"],
  [/\.on[A-Z]/, "subscribes a callback; not a call"],
];

/** The hostile argument lists tried on every function, by name. Written as source so the page can build the 2 MB one itself. */
export const ARG_SHAPES = [
  ["no arguments", "[]"],
  ["null", "[null]"],
  ["{}", "[{}]"],
  ["a string", "['x']"],
  ["-1", "[-1]"],
  ["[]", "[[]]"],
  ["NaN", "[NaN]"],
  ["two nulls", "[null, null]"],
  ["a nested object", "[{ a: { b: { c: [1, 2, { d: null }] } } }]"],
  ["a 2 MB string", "['x'.repeat(2e6)]"],
];

/** Split every function name into the ones to call and the ones to leave, with the reason for each skip. */
export function fuzzTargets(names, skipped = SKIPPED) {
  const targets = [];
  const left = [];
  for (const name of names) {
    const why = skipped.find(([pattern]) => pattern.test(name))?.[1];
    if (why) left.push({ name, why });
    else targets.push(name);
  }
  return { targets, left };
}

/** The page-side call: one function, one argument list, bounded so a never-answering handler cannot stall the run. */
export function callExpression(name, argsSource, timeoutMs) {
  if (!/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(name)) throw new Error(`not a function path: ${name}`);
  return `(async () => {
    try {
      await Promise.race([window.eql.${name}(...${argsSource}), new Promise((resolve) => setTimeout(resolve, ${timeoutMs}))]);
      return "answered";
    } catch (error) {
      return "rejected";
    }
  })()`;
}
