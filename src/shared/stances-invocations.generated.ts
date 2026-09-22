/**
 * Which classes can use which stance or invocation — GENERATED, do not edit by hand.
 *
 * Regenerate with `npm run stances:fetch` (`scripts/fetch-stances-invocations.mjs`), which fetches
 * and parses "Stances & Invocations" (scraped 2026-09-21T17:40:23.607Z). Shipped rather than fetched at
 * runtime — see this script's own header and
 * [ADR 0262](../../specs/decisions/0262-stances-and-invocations-are-generated-static-data.md).
 *
 * `classes` is the wiki's own three-letter code per class (`class-names.ts`'s
 * `CLASS_ABBREVIATIONS`) — translated to the app's full class names in `stances-invocations.ts`,
 * not here, so this file only ever says what the wiki said. Nothing should import this file
 * directly; the lookup over it lives beside it in `stances-invocations.ts`.
 *
 * 9 stances, 9 invocations.
 */

export interface StanceInvocationAbility {
  name: string;
  description: string;
  classes: string[];
}

export const STANCES_INVOCATIONS_SOURCE = { title: "Stances & Invocations", scrapedAt: "2026-09-21T17:40:23.608Z" };

export const STANCES: StanceInvocationAbility[] = [
  { name: "Balanced", description: "All incoming damage is reduced by 10% and your chance to hit is increased by 10%. Endurance regen excluding out of combat bonus regen is doubled. There is no endurance cost to upkeep this stance.", classes: ["BER", "BRD", "BST", "MNK", "PAL", "RNG", "ROG", "SHD", "WAR"] },
  { name: "Berserker", description: "While this stance is active, attack speed and combat skill recharge rate is doubled and your chance to hit and combat skill damage is increased by 25%. Every point of damage dealt consumes half that amount in endurance, with a reduction based on your Strategy skill. You also take 8.3% of outgoing damage to yourself. Bonus damage from critical hits and similar effects do not cost endurance.", classes: ["BER"] },
  { name: "Channeler", description: "All incoming damage is reduced by 40% and your chance to successfully channel is increased. Half of the mitigated damage is charged to both mana and endurance, with a reduction based on your Strategy skill.", classes: ["CLR", "DRU", "ENC", "MAG", "NEC", "SHM", "WIZ"] },
  { name: "Defensive", description: "All incoming melee damage is reduced by 50% and incoming magical damage is reduced by 20%. Every point of damage reduced consumes an equal amount of endurance, with a reduction based on your Strategy skill.", classes: ["PAL", "SHD", "WAR"] },
  { name: "Evasive", description: "You have a 95% chance to evade all incoming attacks. Every point of damage evaded consumes 2 endurance, with a reduction based on your Strategy skill. Evasion will fail if you have insufficient endurance, or while playing dead.", classes: ["BRD", "MNK", "RNG", "BST", "ROG"] },
  { name: "Mage Hunter", description: "All incoming spell damage is reduced by 50% and incoming physical damage is reduced by 20%. Every point of damage reduced consumes an equal amount of endurance, with a reduction based on your Strategy skill.", classes: ["BER", "PAL", "SHD"] },
  { name: "Offensive", description: "Outgoing melee damage is increased by 100% and your chance to hit is increased by 25%. Every point of bonus damage dealt consumes an equal amount of endurance, with a reduction based on your Strategy skill.\n\nWhen below 25% endurance, the chance to hit bonus is reduced based on the remaining percent of endurance.\n\nBonus damage from critical hits and similar effects do not cost endurance.", classes: ["BER", "BRD", "BST", "MNK", "PAL", "RNG", "ROG", "SHD", "WAR"] },
  { name: "Ranged", description: "Your range attack has no minimum distance, gains a 25% accuracy bonus, and can double and triple attack. Every point of damage consumes endurance, with a reduction based on your Strategy skill.", classes: ["BER", "MNK", "RNG", "ROG"] },
  { name: "Striker", description: "Outgoing weapon skill abilities deal 3x damage and non-weapon skill abilities deal 5x damage, and your chance to hit is increased by 25%. Every point of damage dealt consumes an equal amount of endurance, with a reduction based on your Strategy skill.\n\nWhen below 25% endurance, the chance to hit bonus is reduced based on the remaining percent of endurance. Bonus damage from critical hits and similar effects do not cost endurance.", classes: ["BER", "MNK", "ROG", "WAR"] },
];

export const INVOCATIONS: StanceInvocationAbility[] = [
  { name: "Arcane Mastery", description: "Spell cast and recovery times are reduced by 20% plus 10% per additional intelligence class. The mana cost of detrimental spells is reduced by 10% plus 5% per additional intelligence class.", classes: ["ENC", "MAG", "NEC", "SHD", "WIZ"] },
  { name: "Divine", description: "Spending mana will heal the group member with the lowest hp percentage by that amount.\n\nFor every additional wisdom class, this will repeat with a heal for 33% of the mana spent.", classes: ["BST", "CLR", "DRU", "PAL", "RNG", "SHM"] },
  { name: "Empower", description: "Adds 20% plus 10% per additional non-hybrid casting class to Damage effects at the cost of 20% more mana.\n\nAdds 10% plus 5% per additional non-hybrid casting class to Healing effects at the cost of 10% more mana.", classes: ["CLR", "DRU", "ENC", "MAG", "NEC", "SHM", "WIZ"] },
  { name: "Inversion", description: "Shifts two-thirds of spell cast time into the global recovery time and 20% of the mana cost into half as much in endurance cost.", classes: ["BRD", "BST", "PAL", "CLR", "DRU", "ENC", "MAG", "NEC", "RNG", "SHD", "SHM", "WIZ"] },
  { name: "Inviolable", description: "Cast spells are uninterruptible at the cost of 100% more mana and the same amount as endurance.", classes: ["BRD", "WIZ"] },
  { name: "Over Channel", description: "Cast spells have a -150 resist adjust plus another -15 for every non-hybrid caster class at a cost of 10% of the mana cost in endurance.", classes: ["BRD", "BST", "PAL", "CLR", "DRU", "ENC", "MAG", "NEC", "RNG", "SHD", "SHM", "WIZ"] },
  { name: "Recovery", description: "You regenerate mana twice as fast and spells have a 5% reduced mana cost.\n\nOut of combat regen bonus is not affected.\n\nWhile out of combat, the regeneration modifier of this invocation is active even if this invocation is not.", classes: ["BRD", "BST", "PAL", "CLR", "DRU", "ENC", "MAG", "NEC", "RNG", "SHD", "SHM", "WIZ"] },
  { name: "Spellblade", description: "Treats the first spell-gem slot as a proc that consumes both mana and endurance on activation.\n\n40% of the spell's mana cost is paid as mana and 20% as endurance.\n\nThe spell must have a reuse time less than or equal to its cast time.", classes: ["BST", "PAL", "RNG", "SHD"] },
  { name: "Unyielding", description: "Health regen excluding out of combat bonus regen is doubled, with a 25% resistance increase to loss of control from fear, mez, and charm. There is no mana cost to upkeep this stance.", classes: ["BER", "MNK", "ROG", "WAR"] },
];
