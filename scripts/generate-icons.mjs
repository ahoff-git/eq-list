/**
 * generate-icons.mjs — rasterize assets/icon.svg into the app icon(s).
 *
 * Produces a multi-size Windows `src/app/favicon.ico` (used by the web favicon, the tray,
 * and the app windows) plus a 256px `assets/icon.png`. Run `npm run icons` after editing
 * the SVG; the generated files are committed so normal builds don't need this script.
 *
 * Uses `sharp` (present transitively via electron-builder). No new dependency.
 */
import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const svg = readFileSync(path.join(root, "assets", "icon.svg"));

// Sizes a Windows .ico should carry (16 for the tray/titlebar, 256 for the installer/exe).
const SIZES = [16, 24, 32, 48, 64, 128, 256];

// Render each size from the SVG. High density → crisp downscales at every size.
const pngs = await Promise.all(
  SIZES.map((s) => sharp(svg, { density: 288 }).resize(s, s).png().toBuffer()),
);

/** Assemble PNG-compressed images into a multi-image .ico (Windows Vista+). */
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  const dir = Buffer.alloc(16 * images.length);
  let offset = 6 + 16 * images.length;
  images.forEach((img, i) => {
    const s = SIZES[i];
    const e = i * 16;
    dir.writeUInt8(s >= 256 ? 0 : s, e + 0); // width (0 means 256)
    dir.writeUInt8(s >= 256 ? 0 : s, e + 1); // height
    dir.writeUInt8(0, e + 2); // palette size
    dir.writeUInt8(0, e + 3); // reserved
    dir.writeUInt16LE(1, e + 4); // color planes
    dir.writeUInt16LE(32, e + 6); // bits per pixel
    dir.writeUInt32LE(img.length, e + 8); // image byte length
    dir.writeUInt32LE(offset, e + 12); // image byte offset
    offset += img.length;
  });

  return Buffer.concat([header, dir, ...images]);
}

writeFileSync(path.join(root, "src", "app", "favicon.ico"), buildIco(pngs));
mkdirSync(path.join(root, "assets"), { recursive: true });
writeFileSync(path.join(root, "assets", "icon.png"), pngs[SIZES.indexOf(256)]);

console.log(`wrote src/app/favicon.ico (${SIZES.join(", ")}px) and assets/icon.png`);
