/**
 * allowlist.mjs — the console errors and exceptions the sweep has agreed to live with.
 *
 * Every entry says **why** it is allowed; an entry with no reason is a hole, and findings.test.mjs
 * fails on one. The list is meant to stay short and to shrink: an error worth allowing is usually an
 * error worth fixing, so an entry is a debt with a name on it, not a place to put noise. Entries that
 * stand for a *bug in the app* say so and say what to remove them for.
 *
 * Shape (see `allowedBy` in findings.mjs): `{ id, source?, text: RegExp, where?: RegExp, why }`. The text
 * is matched without anchors, so it covers both the page's own report and the main log's mirror of it.
 */
export const ALLOWLIST = [
  {
    id: "offline-by-design",
    source: "log:network",
    text: /net::ERR_NAME_NOT_RESOLVED|net::ERR_BLOCKED_BY_CLIENT|net::ERR_INTERNET_DISCONNECTED/,
    why:
      "The suite launches the renderer with --host-resolver-rules so that nothing in it can reach the network " +
      "(an isolated instance must not announce itself in the real peer room). A page that tries an outside " +
      "host, such as an image on a wiki card, is refused by design; the refusal is not a bug in the app.",
  },
  {
    id: "mui-datagrid-scroll-timeline",
    text: /Custom state pseudo classes have been changed from ":--scroll-timeline"/,
    why:
      "Third-party: @mui/x-data-grid's GridShadowScrollArea ships CSS using the old custom-state syntax, and " +
      "this Chromium warns about it (at error level) the first time a grid mounts. Nothing in this repo writes " +
      "that selector. Remove the entry when a DataGrid update stops emitting it.",
  },
];
