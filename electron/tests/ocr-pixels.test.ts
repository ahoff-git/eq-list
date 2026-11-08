/**
 * Black-box tests for making a game window readable (`src/shared/chrome/ocr-pixels.ts`): whatever colour the
 * text is and whichever way round the window is painted, the result is dark ink on a pale page.
 * Only need re-running if that module changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readable, type Bitmap } from "../../src/shared/chrome/ocr-pixels";

type Rgb = [number, number, number];

/** A bitmap of `background` with `marks` painted over its first pixels, one colour per run of `count` pixels. */
function paint(width: number, height: number, background: Rgb, marks: { color: Rgb; count: number }[]): { bitmap: Bitmap; ranges: { color: Rgb; from: number; to: number }[] } {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) put(data, i, background);
  const ranges: { color: Rgb; from: number; to: number }[] = [];
  let at = 0;
  for (const { color, count } of marks) {
    for (let i = at; i < at + count; i++) put(data, i, color);
    ranges.push({ color, from: at, to: at + count });
    at += count;
  }
  return { bitmap: { data, width, height }, ranges };
}

/** BGRA, as Electron hands it over. */
function put(data: Uint8Array, pixel: number, [r, g, b]: Rgb) {
  data[pixel * 4] = b;
  data[pixel * 4 + 1] = g;
  data[pixel * 4 + 2] = r;
  data[pixel * 4 + 3] = 255;
}

const valueAt = (bitmap: Bitmap, pixel: number) => bitmap.data[pixel * 4 + 1];

test("on a dark window every colour of text comes out dark, however saturated — a red digit is as dark as a white one", () => {
  const { bitmap, ranges } = paint(40, 10, [16, 16, 16], [
    { color: [255, 255, 255], count: 40 },
    { color: [0, 200, 0], count: 40 }, // a buffed stat
    { color: [200, 30, 30], count: 40 }, // a debuffed one (SV. Fire 19, on the real page)
    { color: [150, 150, 150], count: 40 }, // the dim grey of a max or a divider
  ]);
  const out = readable(bitmap, "soft");
  for (const { color, from, to } of ranges) {
    const darkest = Math.max(...Array.from({ length: to - from }, (_, k) => valueAt(out, from + k)));
    assert.ok(darkest < 130, `${color} should be dark ink, got ${darkest}`);
  }
  assert.ok(valueAt(out, 399) > 240, "and the panel behind it is paper");
});

test("on a light skin, dark text stays dark and the panel stays pale — it is not inverted into white-on-black", () => {
  const { bitmap, ranges } = paint(40, 10, [232, 232, 232], [
    { color: [20, 20, 20], count: 40 },
    { color: [200, 20, 20], count: 40 }, // red on white is low in green and blue; "brightest channel" would call it paper
  ]);
  const out = readable(bitmap, "soft");
  for (const { color, from, to } of ranges) assert.ok(valueAt(out, from) < 90 && valueAt(out, to - 1) < 90, `${color} should be dark ink`);
  assert.ok(valueAt(out, 399) > 240);
});

test("the strict tone is solid: a dim stroke becomes black and nothing is left grey", () => {
  const { bitmap } = paint(40, 10, [16, 16, 16], [
    { color: [255, 255, 255], count: 40 },
    { color: [150, 150, 150], count: 40 },
  ]);
  const out = readable(bitmap, "strict");
  for (let i = 0; i < 400; i++) assert.ok([0, 255].includes(valueAt(out, i)), `pixel ${i} is ${valueAt(out, i)}`);
  assert.equal(valueAt(out, 60), 0, "dim grey ink is solid black");
  assert.equal(valueAt(out, 399), 255);
});

test("the soft tone keeps the anti-aliasing the strict one throws away", () => {
  const { bitmap } = paint(40, 10, [16, 16, 16], [
    { color: [255, 255, 255], count: 40 },
    { color: [130, 130, 130], count: 40 },
  ]);
  const grey = valueAt(readable(bitmap, "soft"), 60);
  assert.ok(grey > 0 && grey < 255, `a mid-grey stays mid-grey, got ${grey}`);
});

test("an image with no text to bring out is left alone, not stretched into noise", () => {
  const flat = paint(8, 8, [30, 30, 30], []);
  const out = readable(flat.bitmap, "soft");
  assert.equal(out.width, 8);
  assert.equal(out.height, 8);
  const first = valueAt(out, 0);
  assert.ok(Number.isFinite(first));
  for (let i = 0; i < 64; i++) assert.equal(valueAt(out, i), first);
});

test("the result is the same size, opaque, and grey", () => {
  const { bitmap } = paint(13, 7, [10, 10, 10], [{ color: [255, 255, 255], count: 20 }]);
  const out = readable(bitmap, "soft");
  assert.equal(out.data.length, 13 * 7 * 4);
  for (let i = 0; i < 13 * 7; i++) {
    assert.equal(out.data[i * 4 + 3], 255);
    assert.equal(out.data[i * 4], out.data[i * 4 + 1]);
    assert.equal(out.data[i * 4 + 1], out.data[i * 4 + 2]);
  }
});
