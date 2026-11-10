/**
 * log-lines.mjs — EverQuest log text the suite writes into the scratch character's log.
 *
 * Pure. The app follows `eqlog_<Name>_<zone>.txt` as the game writes it, so the way to give a fresh
 * profile something to show is to append lines to that file after the app is running — a log it has
 * never seen is pinned at its end (ADR 0044), so what is *already* in it is history and is ignored.
 *
 * Stamps are the game's own local-time shape, `[Mon Nov 09 13:05:11 2026]`. They are built by hand
 * rather than with `toLocaleString`, which would follow whatever locale the machine is set to.
 */

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const two = (n) => String(n).padStart(2, "0");

/** `[Mon Nov 09 13:05:11 2026]` for a Date, in the machine's local time. */
export function eqStamp(date) {
  const day = `${DAYS[date.getDay()]} ${MONTHS[date.getMonth()]} ${two(date.getDate())}`;
  const time = `${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
  return `[${day} ${time} ${date.getFullYear()}]`;
}

/** The text of a log line without its leading stamp. */
export const unstamped = (line) => line.replace(/^\[[^\]]*\]\s*/, "");

/** Lines stamped one second apart starting at `start`, each as `[stamp] text`. */
export function stampLines(texts, start) {
  return texts.map((text, i) => `${eqStamp(new Date(start.getTime() + i * 1000))} ${text}`);
}

const FACTIONS = [
  "Guards of Qeynos",
  "Merchants of Qeynos",
  "Priests of Life",
  "Knights of Truth",
  "Qeynos Citizens",
  "Coalition of Tradefolk Underground",
  "Corrupt Qeynos Guards",
  "Karana Residents",
];
const DELTAS = [1, 2, 3, -1, -2, -3, 5, -5];

/**
 * `count` faction hits, in the game's own wording. Faction and amount are walked at different strides
 * so consecutive rows differ in both — a page of identical rows could not tell a paging control that
 * works from one that is stuck.
 */
export function factionHitTexts(count) {
  return Array.from({ length: count }, (_, i) => {
    const faction = FACTIONS[i % FACTIONS.length];
    const delta = DELTAS[(i * 3 + Math.floor(i / FACTIONS.length)) % DELTAS.length];
    return `Your faction standing with ${faction} has been adjusted by ${delta}.`;
  });
}

/** The line that tells the app which zone the character is in, so zone-aware panels have one. */
export const zoneTexts = (zone) => [`You have entered ${zone}.`];

/**
 * An evening's worth of kills, loot, coin and sales from the committed sample log, minus its stamps so
 * they can be re-stamped to now. The sample is written for exactly this (`npm run sim` replays it).
 */
export const sampleTexts = (sampleLogText) =>
  sampleLogText
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map(unstamped);
