import { test } from "node:test";
import assert from "node:assert/strict";

import { ALLOWLIST } from "./allowlist.mjs";
import {
  allowedBy,
  brokenTextLines,
  classify,
  describeGroup,
  findingFromEvent,
  findingsFromMainLog,
  groupFindings,
} from "./findings.mjs";

const consoleEvent = (type, ...args) => ({ type, args: args.map((value) => ({ type: "string", value })) });

test("a console error is a finding, and warnings and logs are not", () => {
  assert.equal(findingFromEvent("Runtime.consoleAPICalled", consoleEvent("log", "hello")), null);
  assert.equal(findingFromEvent("Runtime.consoleAPICalled", consoleEvent("warning", "careful")), null);
  assert.equal(findingFromEvent("Runtime.consoleAPICalled", consoleEvent("debug", "x")), null);
  const found = findingFromEvent("Runtime.consoleAPICalled", consoleEvent("error", "boom", 42));
  assert.deepEqual({ source: found.source, text: found.text }, { source: "console", text: "boom 42" });
});

test("a failed console.assert counts as an error", () => {
  assert.equal(findingFromEvent("Runtime.consoleAPICalled", consoleEvent("assert", "no")).source, "console");
});

test("an object argument reads as its description, so an Error keeps its stack", () => {
  const event = { type: "error", args: [{ type: "object", subtype: "error", description: "TypeError: x is not a function\n    at f" }] };
  assert.match(findingFromEvent("Runtime.consoleAPICalled", event).text, /^TypeError: x is not a function/);
});

test("the first frame's url rides along, so a finding says which file wrote it", () => {
  const event = { ...consoleEvent("error", "x"), stackTrace: { callFrames: [{ url: "http://localhost:3123/a.js" }] } };
  assert.equal(findingFromEvent("Runtime.consoleAPICalled", event).url, "http://localhost:3123/a.js");
});

test("an exception prefers the error's own description over the generic 'Uncaught' text", () => {
  const event = { exceptionDetails: { text: "Uncaught", exception: { description: "Error: statement is busy" } } };
  assert.equal(findingFromEvent("Runtime.exceptionThrown", event).text, "Error: statement is busy");
  assert.equal(findingFromEvent("Runtime.exceptionThrown", { exceptionDetails: { text: "Uncaught" } }).text, "Uncaught");
});

test("a Log entry is a finding only at error level", () => {
  const entry = (level) => ({ entry: { level, source: "network", text: "Failed to load resource", url: "http://x/" } });
  assert.equal(findingFromEvent("Log.entryAdded", entry("warning")), null);
  assert.equal(findingFromEvent("Log.entryAdded", entry("info")), null);
  assert.equal(findingFromEvent("Log.entryAdded", entry("error")).source, "log:network");
});

test("an event nobody asked about is not a finding", () => {
  assert.equal(findingFromEvent("Page.loadEventFired", {}), null);
});

test("a very long message is clipped rather than flooding the report", () => {
  const found = findingFromEvent("Runtime.consoleAPICalled", consoleEvent("error", "x".repeat(5000)));
  assert.ok(found.text.length < 500);
});

test("the main log yields its ERROR lines only", () => {
  const log = [
    "2026-11-09T13:00:00.000Z DEBUG tailing",
    "2026-11-09T13:00:01.000Z WARN slow",
    "2026-11-09T13:00:02.000Z ERROR uncaught Error: boom",
    "EQ List log — 2026-11-09T13:00:00.000Z",
  ].join("\n");
  assert.deepEqual(findingsFromMainLog(log), [{ source: "main", text: "uncaught Error: boom" }]);
});

test("a renderer message the main log mirrors loses its window prefix, so it reads as the page's own", () => {
  const log = "2026-11-09T13:00:02.000Z ERROR [renderer:main] Encountered two children with the same key";
  assert.deepEqual(findingsFromMainLog(log), [{ source: "main", text: "Encountered two children with the same key" }]);
});

test("nothing is allowed unless an entry names it", () => {
  const finding = { source: "console", text: "TypeError: x", where: "Now → Buffs" };
  assert.equal(allowedBy(finding, []), undefined);
  assert.equal(allowedBy(finding, [{ id: "a", text: /Range/, why: "w" }]), undefined);
});

test("every field an entry names has to match", () => {
  const finding = { source: "console", text: "TypeError: x", where: "Now → Buffs" };
  assert.ok(allowedBy(finding, [{ id: "a", text: /TypeError/, why: "w" }]));
  assert.ok(allowedBy(finding, [{ id: "a", source: "console", text: /TypeError/, where: /Buffs/, why: "w" }]));
  assert.equal(allowedBy(finding, [{ id: "a", source: "exception", text: /TypeError/, why: "w" }]), undefined);
  assert.equal(allowedBy(finding, [{ id: "a", text: /TypeError/, where: /Loot/, why: "w" }]), undefined);
});

test("an entry scoped to a step does not cover a finding that has no step", () => {
  assert.equal(allowedBy({ source: "console", text: "x" }, [{ id: "a", text: /x/, where: /Loot/, why: "w" }]), undefined);
});

test("classify keeps the allowed ones, with the entry that allowed them", () => {
  const allow = [{ id: "known", text: /known/, why: "w" }];
  const { unexpected, allowed } = classify([{ source: "console", text: "known issue" }, { source: "console", text: "new issue" }], allow);
  assert.equal(unexpected.length, 1);
  assert.equal(unexpected[0].text, "new issue");
  assert.equal(allowed[0].entry.id, "known");
});

test("the same message in many steps is one group with a count and the first few places", () => {
  const same = (where) => ({ source: "console", text: "boom", where });
  const groups = groupFindings([same("A"), same("B"), same("A"), same("C"), same("D"), same("E"), { source: "main", text: "other" }], 3);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].count, 6);
  assert.deepEqual(groups[0].where, ["A", "B", "C"]);
  assert.match(describeGroup(groups[0]), /x6 — in A \| B \| C/);
});

test("broken-value text is found, and ordinary words that merely look alike are not", () => {
  const screen = ["Damage  NaN", "Last seen: undefined", "Blade of Infinity", "Nano null guard", "name: [object Object]", "Invalid Date", "fine"].join("\n");
  assert.deepEqual(brokenTextLines(screen), ["Damage  NaN", "Last seen: undefined", "name: [object Object]", "Invalid Date"]);
});

test("every allowlist entry has an id, a reason, a pattern, and a unique name", () => {
  const ids = new Set();
  for (const entry of ALLOWLIST) {
    assert.ok(entry.id && !ids.has(entry.id), `duplicate or missing id: ${entry.id}`);
    ids.add(entry.id);
    assert.ok(entry.text instanceof RegExp, `${entry.id} needs a text pattern`);
    assert.ok(typeof entry.why === "string" && entry.why.length > 30, `${entry.id} needs a real reason`);
  }
});
