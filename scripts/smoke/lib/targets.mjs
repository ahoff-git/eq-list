/**
 * targets.mjs — picking one of the app's windows out of the debugging port's target list.
 *
 * Pure. The app has several windows, each a page of the same renderer on its own route (`/` for the
 * control window, `/alert/` for the overlay, `/map/` for the map), so a window is identified by the
 * path of its URL under the renderer's origin — not by a substring, which `/map/` and `/` both match.
 */

/** The route of a page URL under `origin` — `""` for the control window, `"alert"` for `/alert/` — or `undefined` for another origin. */
export function routeOf(url, origin) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.origin !== new URL(origin).origin) return undefined;
  return parsed.pathname.replace(/^\/+|\/+$/g, "").replace(/\/index\.html$/, "");
}

/** The page target whose route is `route` (`""` for the control window), or `undefined`. */
export function pickPage(targets, origin, route = "") {
  return targets.find((t) => t.type === "page" && routeOf(t.url, origin) === route);
}

/** `DevToolsActivePort`'s two lines — the port, then the browser socket's path — as a `{ port, path }`, or `undefined` while it is still being written. */
export function parseActivePort(text) {
  const [port, path] = text.split(/\r?\n/);
  const number = Number(port);
  return Number.isInteger(number) && number > 0 && path ? { port: number, path } : undefined;
}
