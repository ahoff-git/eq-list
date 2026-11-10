import { test } from "node:test";
import assert from "node:assert/strict";

import { parseActivePort, pickPage, routeOf } from "./targets.mjs";

const ORIGIN = "http://localhost:3123";

test("a window is told by its route, so the map and the control window are not confused", () => {
  assert.equal(routeOf("http://localhost:3123/", ORIGIN), "");
  assert.equal(routeOf("http://localhost:3123/#trail", ORIGIN), "");
  assert.equal(routeOf("http://localhost:3123/map/", ORIGIN), "map");
  assert.equal(routeOf("http://localhost:3123/alert", ORIGIN), "alert");
  assert.equal(routeOf("http://localhost:3123/map/index.html", ORIGIN), "map");
});

test("a page from another origin has no route at all", () => {
  assert.equal(routeOf("http://localhost:9999/", ORIGIN), undefined);
  assert.equal(routeOf("https://eqlwiki.com/", ORIGIN), undefined);
  assert.equal(routeOf("not a url", ORIGIN), undefined);
});

test("only a page target counts, and the right route is the one picked", () => {
  const targets = [
    { type: "service_worker", url: "http://localhost:3123/" },
    { type: "page", url: "http://localhost:3123/alert/", id: "alert" },
    { type: "page", url: "http://localhost:3123/", id: "main" },
  ];
  assert.equal(pickPage(targets, ORIGIN).id, "main");
  assert.equal(pickPage(targets, ORIGIN, "alert").id, "alert");
  assert.equal(pickPage(targets, ORIGIN, "map"), undefined);
});

test("the active-port file is read only once it is complete", () => {
  assert.deepEqual(parseActivePort("53211\n/devtools/browser/abc-123\n"), { port: 53211, path: "/devtools/browser/abc-123" });
  assert.equal(parseActivePort("53211\n"), undefined);
  assert.equal(parseActivePort(""), undefined);
  assert.equal(parseActivePort("0\n/x"), undefined);
});
