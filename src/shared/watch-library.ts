/**
 * watch-library.ts — rules worth having, ready to add.
 *
 * [cast-suggestions.ts](./cast-suggestions.ts) answers "what should I watch for?" with a substring —
 * the hard part when a fear is called *Screaming Terror*. This answers the question that came after
 * it: **what is a good rule shaped like?** A rule can now hold conditions, a delay, a repeat and a
 * list of cancelling phrases, and none of that is discoverable by looking at an empty row. Somebody
 * who has never seen a cue doesn't know to ask for one.
 *
 * So each entry here is a whole worked example, built out of the same fields a hand-made rule has —
 * add it, then take it apart to see how it works. Several exist mainly to demonstrate a mechanism:
 * the re-mez cue is the canonical delay-plus-cancel, and the party invite is the `any` fold doing
 * the thing [ADR 0050](../../specs/decisions/0050-a-watch-can-read-a-whole-log-line.md) had to ship
 * as two separate chips.
 *
 * **Every phrase here is one the log really prints.** Where a count is quoted it came from replaying
 * a real log, the same discipline the suggestion chips were chosen under; where a rule needs the
 * player's own word — a placeholder's name, a zone — it says so in `fill`, because a preset that
 * looks finished and matches nothing is worse than one that asks for a word.
 *
 * Pure data plus one function, so the panel that draws it and the test that pins it share a source.
 */
import type { CastWatch } from "./types";

/** A rule as the library holds it: everything but the id and the enabled flag, which are the adder's. */
export type LibraryWatch = Omit<CastWatch, "id" | "enabled">;

export interface LibraryRule {
  /** Stable, so "already added" can be judged and a rule can be referred to in a bug report. */
  id: string;
  name: string;
  /** What it's for, in a sentence — the reason to add it, not a description of its fields. */
  what: string;
  /** The word only the player knows, when there is one. Shown as the thing to edit after adding. */
  fill?: string;
  watch: LibraryWatch;
}

export interface LibraryGroup {
  category: string;
  /** Why these belong together, when the heading isn't self-evident. */
  note?: string;
  rules: LibraryRule[];
}

export const WATCH_LIBRARY: readonly LibraryGroup[] = [
  {
    category: "Reminders",
    note: "The rules that exist because of the delay: a match now, a prompt later. Each carries something able to stop it, so it can't nag after the moment has passed.",
    rules: [
      {
        id: "remez",
        name: "Recast your mez",
        what: "You cast a mez; 25 seconds later it says so — unless the mob died first. The canonical cue, and the one to copy for any “it's about to wear off” reminder.",
        watch: {
          spell: "Mesmeri",
          includeSelf: true,
          includePlayers: true,
          message: "RECAST MEZ",
          delay: "25",
          repeat: 1,
          retrigger: "restart",
          cancelWhen: [{ field: "line", op: "contains", text: "has been slain" }],
        },
      },
      {
        id: "placeholder",
        name: "Placeholder is back",
        what: "The placeholder dies, and eight minutes later you're told to look again. Set to wait alongside rather than restart, since two placeholders dying is two spawns due.",
        fill: "Put the placeholder's name in the trigger, and check the timer against the camp.",
        watch: {
          spell: "a placeholder",
          onCast: false,
          onLine: true,
          message: "PH UP",
          delay: "8m",
          retrigger: "queue",
          cancelOnDeath: "never",
          conditions: [{ field: "line", op: "contains", text: "has been slain" }],
        },
      },
      {
        id: "corpse-run",
        name: "After you die",
        what: "Two minutes after your death — long enough to have loaded back in — a reminder to re-buff and go fetch your corpse. Deliberately set to survive the death that raised it.",
        watch: {
          spell: "You have been slain",
          onCast: false,
          onLine: true,
          message: "Re-buff, then corpse run",
          delay: "2m",
          cancelOnDeath: "never",
        },
      },
    ],
  },
  {
    category: "Crowd control",
    note: "The original job: something is being cast at you and you have a moment to answer it.",
    rules: [
      {
        id: "cc-inbound",
        name: "Crowd control, from mobs only",
        what: "Fear, mez, charm and this server's root line in one rule, and quiet when the caster is a player or a pet — a group-mate landing a mez isn't a threat to prep against.",
        watch: {
          spell: "Fear",
          match: "any",
          conditions: [
            { field: "subject", op: "contains", text: "Terror" },
            { field: "subject", op: "contains", text: "Mesmeri" },
            { field: "subject", op: "contains", text: "Charm" },
            { field: "subject", op: "contains", text: "Instill" },
          ],
          message: "CC INBOUND",
        },
      },
      {
        id: "not-my-pet",
        name: "…but never from your own pet",
        what: "The same idea with the exclusion spelled out. Worth adding once to see how “not” reads, then folding into a rule of your own.",
        watch: {
          spell: "Charm",
          includePlayers: true,
          conditions: [{ field: "caster", op: "contains", text: "warder", exclude: true }],
        },
      },
    ],
  },
  {
    category: "Said to you",
    note: "Not spells at all — the sentences that are easy to miss with the chat window buried under a fight. Every phrase was read off a real log.",
    rules: [
      {
        id: "invite-either",
        name: "Any invite, either wording",
        what: "A group invite and an instance invite share no words at all, so this is one rule with “any”: “<name> invites you to join a group.” or “…has asked you to join the instance:”.",
        watch: {
          spell: "invites you",
          onCast: false,
          onLine: true,
          match: "any",
          message: "Invite",
          conditions: [{ field: "line", op: "contains", text: "asked you to join" }],
        },
      },
      {
        id: "tell-quiet",
        name: "A tell, minus the noise",
        what: "“<name> tells you” fired 123 times in two weeks of real play, which is a banner every couple of hours. This one drops the auction channel and your own outgoing tells.",
        fill: "Add an exclusion per person or channel you'd rather not hear about.",
        watch: {
          spell: "tells you",
          onCast: false,
          onLine: true,
          message: "Tell",
          conditions: [
            { field: "line", op: "starts", text: "You tell", exclude: true },
            { field: "line", op: "contains", text: "auction", exclude: true },
          ],
        },
      },
    ],
  },
  {
    category: "Buffs and travel",
    note: "Fades EQ words per spell rather than by name, which is why each matches the sentence and says something else on the banner.",
    rules: [
      {
        id: "sow-gone",
        name: "Spirit of Wolf wore off",
        what: "The fade of a run buff, worded by the game as “The spirit of wolf leaves you.” — no spell name in it, hence matching the words and reading your own.",
        watch: {
          spell: "spirit of wolf",
          onCast: false,
          onFade: true,
          onLine: true,
          message: "SoW gone",
        },
      },
      {
        id: "port-window",
        name: "Your port is up",
        what: "“A mystical path appears before you.” is the portal opening; this says so and then, 25 seconds later, that it's about to close.",
        watch: {
          spell: "mystical path appears",
          onCast: false,
          onLine: true,
          message: "PORT — go",
          delay: "25",
          cancelOnDeath: "never",
          cancelWhen: [{ field: "line", op: "contains", text: "mystical path fades away" }],
        },
      },
    ],
  },
  {
    category: "Camp",
    note: "Rules about where you are and what's happening around you, rather than about one spell.",
    rules: [
      {
        id: "zone-scoped",
        name: "Only while you're here",
        what: "Any rule can be pinned to one zone — a raid call that means nothing anywhere else, a camp's own named. The zone comes from the app's tracking, not from the line.",
        fill: "Put your words in the trigger and your zone in the condition.",
        watch: {
          spell: "",
          onCast: false,
          onLine: true,
          conditions: [
            { field: "line", op: "contains", text: "shouts" },
            { field: "zone", op: "contains", text: "Lower Guk" },
          ],
        },
      },
      {
        id: "named-up",
        name: "A named you're waiting for",
        what: "Watches every line for a mob's name, which catches it being pulled, hitting somebody, or dying — whichever the log says first. Blunt on purpose: you want to know it exists.",
        fill: "Put the named's name in the trigger. A short name will fire on ordinary chat.",
        watch: {
          spell: "Lord Nagafen",
          onCast: false,
          onLine: true,
          message: "NAMED UP",
        },
      },
    ],
  },
];

/**
 * Is this library rule already on the list? Judged by the **trigger and the prompts**, not by name,
 * because what makes two rules the same is what they match — and a player who has edited a preset's
 * wording shouldn't be told it's still on offer.
 */
export function isAdded(watches: CastWatch[], rule: LibraryRule): boolean {
  const needle = rule.watch.spell.trim().toLowerCase();
  return watches.some(
    (w) =>
      w.spell.trim().toLowerCase() === needle &&
      w.onCast !== false === (rule.watch.onCast !== false) &&
      !!w.onLine === !!rule.watch.onLine,
  );
}
