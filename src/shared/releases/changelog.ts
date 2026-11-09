/**
 * changelog.ts — the release notes, newest first. What a player is shown after an update, and the history
 * under Settings → What's new.
 *
 * The rules are in CLAUDE.md ("Release notes & how-to guides") and
 * [ADR 0373](../../../specs/decisions/0373-release-notes-are-a-release-line-and-guides-are-checked-against-the-code.md):
 *
 *  - A user-visible change gets a note in the change that makes it. One sentence each, in the player's words —
 *    what they can do now, not what the code does.
 *  - A note is a release **line** (`major.minor`). Adding one means bumping `package.json` to `<line>.0` in the
 *    same change (CI stamps the patch); `changelog.test.ts` fails if the two disagree.
 *  - A note that has been pushed is not edited — a later change is a new line. (Someone who has already been
 *    shown a line is never shown it again, so an addition to it would go unseen.)
 *  - `guide` links a change to the how-to that teaches it (`guides.ts`); the test checks the id exists.
 */
import type { ReleaseNote } from "./release-notes";

/**
 * The version everyone was on when release notes began. Every build before this was `0.1.<run>`, and an install
 * updating from one has no remembered marker (the marker didn't exist) — so it is read as *from here*, and is
 * owed every note after it, not just the newest. See `useReleases`. Never changes: it names a moment in the past.
 */
export const BEFORE_NOTES = "0.1.0";

export const CHANGELOG: readonly ReleaseNote[] = [
  {
    line: "0.3",
    date: "2026-11-08",
    title: "What's new, and how-to guides",
    changes: [
      { kind: "new", text: "After an update, a strip across the top tells you what changed — and if you skipped several updates, every one of them. Everything is kept under Settings → What's new." },
      { kind: "new", text: "Settings → How-to: short walkthroughs for the parts people tend to miss — keeping the window over the game, building a list, alerts, reading your stats, planning gear, the map's routes and the peer room." },
      { kind: "fixed", text: "The Session tab credits each mob with the XP and coin it actually paid — before, most XP was credited to no mob, and coin to the kill before. The kill ledger's per-kill coin now matches your log." },
      { kind: "fixed", text: "The Spells catalogue no longer fails to load at launch when another tab asks for the item catalogue at the same moment." },
      { kind: "fixed", text: "The breadcrumb names a tab the way the tab row does (AAs, Inventory & exports, General) instead of a capitalised internal name." },
      { kind: "fixed", text: "The Peers tab said nothing leaves your machine until you switch something on, though what you've observed, wiki pages you hold and your character stats are shared by default. It now says what is shared." },
      { kind: "fixed", text: "The map's source tooltip no longer advertises bundled maps the app stopped shipping." },
    ],
  },
  {
    line: "0.2",
    date: "2026-11-08",
    title: "Read your character's stats from the game",
    changes: [
      { kind: "new", text: "Read your real stats — HP, mana, AC, attributes and resists — straight from the game's Inventory window with a hotkey and a drag, instead of typing them in.", guide: "read-your-stats" },
      { kind: "new", text: "The same read fills in your three classes and your level, and puts your max HP and regen on the Deaths page." },
      { kind: "better", text: "The loadout builder's floors and sliders are now in the game's own numbers, measured against what you actually have.", guide: "plan-your-loadout" },
      { kind: "better", text: "A figure the read wasn't sure of is put to you to confirm instead of being guessed, and a bad capture says what went wrong." },
      { kind: "new", text: "A reminder to read your stats again appears when they've probably changed since the last read, and your read is remembered across restarts." },
      { kind: "new", text: "With the peer room connected, your read is shared with the room by default (never a figure it wasn't sure of), and you can plan gear as another player from their stats. Peers → Character stats switches it off.", guide: "peers-share" },
    ],
  },
];
