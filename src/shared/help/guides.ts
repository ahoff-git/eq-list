/**
 * guides.ts — the how-to guides: the parts of EQ List people tend to miss, a few steps each.
 *
 * Keeping these true is a rule, not an accident — see CLAUDE.md ("Release notes & how-to guides") and
 * [ADR 0373](../../../specs/decisions/0373-release-notes-are-a-release-line-and-guides-are-checked-against-the-code.md):
 * change what a guide describes and you change the guide in the same commit.
 *
 * Text conventions (`guide.ts` reads them): `**Label**` is a button or setting name exactly as the screen shows it;
 * `{hotkey:stats}` is a registered hotkey, never typed out; `section` is a key from `areas.ts` (or `MAP_WINDOW`).
 * Order is the order the cards are shown: the thing you do first, first.
 */
import { MAP_WINDOW, type Guide } from "./guide";

export const GUIDES: readonly Guide[] = [
  {
    id: "keep-it-over-the-game",
    title: "Keep EQ List over the game",
    gist: "Pin it on top, see through it, click through it, shrink it, and hide it with a key.",
    section: "settings",
    needs: "windowing",
    steps: [
      "Click **📌** in the title bar to keep EQ List above the game. Click it again to let the game cover it.",
      "Press {hotkey:overlay} from anywhere to show or hide the window. The ✕ hides it to the system tray — it keeps watching your log from there.",
      "**◐** flips this window between fully solid and the see-through level set under **Window opacity** in Settings → General.",
      "**👻** hands your clicks to the game through the panel, so you can glance at the list without it getting in the way. The title bar, tabs and status bar stay clickable, which is how you turn it off again.",
      "**A−** and **A+** make the whole interface smaller or larger (100% is the largest).",
    ],
    tips: [
      "Only the tray icon really quits the app.",
      "Mouse thumb buttons, or Alt+← and Alt+→, step back and forward through the pages you have opened.",
      "The map is its own window with its own pin, ◐, 👻 and scale buttons.",
    ],
  },
  {
    id: "lookup-from-screen",
    title: "Look up an item from the screen",
    gist: "Drag a box over an item name in the game and get its page.",
    section: "search",
    needs: "lookup",
    steps: [
      "Have the item's name showing somewhere on screen. Any monitor works.",
      "Press {hotkey:lookup}, or click **📷 Look up from screen** on the Search tab.",
      "Drag a box over the item name. The text is read from the picture and dropped into the Search box.",
      "Pick the item from the results — add it to your list from there.",
    ],
    tips: [
      "The first lookup downloads the text-reading model (a few MB) and needs internet; after that it is quick.",
      "Esc closes the screengrab if you change your mind.",
      "If a lookup keeps missing, turn on Debug logging (in the tray menu) to print exactly what it read.",
    ],
  },
  {
    id: "build-your-list",
    title: "Build a list and get told when it drops",
    gist: "Add items or a whole quest, and watch them light up as they drop.",
    section: "list",
    steps: [
      "Open Find → **Search** and type an item, quest or recipe. Spelling can be rough; it needs at least two letters.",
      "Press **+ Add** on a result. On a quest or recipe it adds everything you need to collect. Open the page instead for **+ Add full quest** or **+ Add full recipe** — a recipe also offers **+ Add just** the crafted item.",
      "Open **List**. Items sit under the quest or recipe that added them, with **Other items** at the end. Use − and + as you collect them, or click a count to type one.",
      "When a listed item drops in your log, its row flashes gold. Press the **🔔** on a row to get a banner over the game as well — it is off until you ask.",
    ],
    tips: [
      "Your log only names loot that you receive, so drops that go to other people don't count.",
      "The banner is drawn by the alert overlay, which exists only while **Cast alerts** is ticked on the Alerts tab.",
      "A mob you add from its page becomes a **hunt** row — something to kill, not something to collect.",
    ],
  },
  {
    id: "hunt",
    title: "Find where to farm what you need",
    gist: "Your list read as where to go: by zone, or by item.",
    section: "hunt",
    steps: [
      "Open List → **Hunt**. It reads your unfinished list.",
      "**By zone** answers “what does a trip there get me?”. **By item** answers “where is this most likely to drop?”, best rate first, across every zone.",
      "Tick **follow** (or the matching setting in Settings → General) to narrow to the zone you are standing in and move with you.",
      "Read the drop-rate badge: it is the wiki's figure until your own kills are enough to take over, and a **✓** on it means it is now measured from your own kills. Hover it for the counts.",
    ],
    tips: [
      "**unseen in N** means the wiki says a mob drops it but your kills haven't produced it yet.",
      "Items under **No known drop source** are likely from a vendor, a quest or a recipe.",
    ],
  },
  {
    id: "cast-alerts",
    title: "Get a warning when something is being cast",
    gist: "A banner and a beep over the game when a spell you watch for is cast — or fades.",
    section: "alerts",
    needs: "log",
    steps: [
      "Open Now → **Alerts** and make sure **Cast alerts** is ticked. It is on by default, and a handful of rules (Fear, Terror, Mesmeri, Charm, Root and Instill) come already switched on.",
      "Press **+ Add watch** and type the spell name, or part of it. Press Tab to complete from words your own log has shown. Fill in **alert says…** if you want your own wording.",
      "Or take a shortcut: tap a **Suggested** chip, browse the **Library**, or paste a rule someone sent you under **Import / export**.",
      "Press the **🔔** on a rule to ring it now — a sample banner on the overlay with that rule's own wording and look.",
      "Open a rule's **✓** drawer to replay your log and see what the rule would have caught, and whether anything is wrong with it.",
    ],
    tips: [
      "The banner is drawn by a click-through overlay over the game; the beep plays from the main window.",
      "Your own casts are ignored unless you tick **Include my own casts**, or set that one rule's “your casts” to yes.",
      "A fade has to match the words EverQuest printed (“light breeze”), not the spell name — use **raw text** for those.",
      "Enemy casts the log doesn't name (“begins to cast a spell”) can't be recognised.",
    ],
  },
  {
    id: "read-your-stats",
    title: "Read your stats from the game",
    gist: "Drag a box over your Inventory window and plan with your real HP, AC and attributes.",
    section: "items",
    needs: "lookup",
    steps: [
      "In the game, type **/outputfile inventory** once, so the planner knows what you are carrying.",
      "Open your Inventory window (I by default) on its **Equipment** tab, so Character Vitals and Stats and Resists are showing.",
      "Press {hotkey:stats} — or **Read my stats** in Settings → General — and drag a box over the **whole window**, top-right corner included.",
      "Open Find → **Items** → **Loadout builder**. Your classes and level are already set from the corner of the window, and its floors now count what you have beyond your gear.",
      "If a figure was hard to read, the builder asks about it. Press **Yes, use** it to keep what it read, or **No, leave** it out to drop it (the buttons say “them” when there are several).",
    ],
    tips: [
      "The read waits for your inventory dump: if the builder says a stats read is waiting for it, type **/outputfile inventory** in the game and it goes through.",
      "It reads what is on screen, so scroll the rows into view first. A capture that goes wrong says what went wrong.",
      "No hotkey, or a read that won't take? Type your HP and AC under **What the game shows you** in the builder's goals instead.",
      "It has to be the character you are playing — a different window is refused.",
      "Your read is remembered across restarts. When your gear, level or buffs have probably moved, a reminder offers **Read my stats again**, or **Nothing's changed**.",
      "With the peer room connected, what it read is shared with the room — never a figure it wasn't sure of. Switch it off under Peers → **Character stats**.",
      "If another program owns the hotkey, EQ List says so; use the button instead.",
    ],
  },
  {
    id: "plan-your-loadout",
    title: "Plan your best gear",
    gist: "Ask what you could wear — from what you own and what you could hunt — by what you value.",
    section: "items",
    steps: [
      "Open Find → **Items** and switch to **Loadout builder**.",
      "Tick your classes under **Class** (reading your stats does it for you), your race, and set the level slider so you only see what you could actually use.",
      "Say what matters. Open **Value weights** and give each stat a weight, or start from a goal — Tank, Melee damage, Caster — and adjust. A priority pulls a stat up; **At least** holds it above a floor.",
      "Read the plan: **Wearing now** against the **Loadout**, and for each slot what to wear and where you hold it or could get it. Lock a slot with 🔒 to keep it.",
      "Press **Copy loadout** to take the list with you.",
    ],
    tips: [
      "It only knows items whose pages have been fetched. **Fill the catalogue** fetches the rest in the background.",
      "Floors are in the game's own numbers, so reading your stats makes them accurate.",
      "**include what I own** needs the inventory dump from **/outputfile inventory**.",
      "Without weights it says **Set some value weights first.**",
    ],
  },
  {
    id: "peers-share",
    title: "Share with other players",
    gist: "Join the room, choose what to share, ask for what others have, and plan as them.",
    section: "peers",
    steps: [
      "Open Settings → **Peers** and tick **Connect to the peer-to-peer network**. Connecting makes you visible, and starts sharing what is on by default (below).",
      "Put your name in **Shown to peers**.",
      "Under **What you share**, choose what you offer. What you've observed (mob and kill observations, respawn times) and copies of wiki pages are on by default; things you made — rules, styles, your list, your pins — are off until you switch them on.",
      "**Who's here** lists the room. Press a button under someone's name to ask for that kind of thing. What arrives waits under **What's arrived** — things somebody made are only added when you press **Add**.",
      "To plan gear as another player, open Find → Items → **Loadout builder**, choose their name under **Loadout for**, and press **Plan as** their name. They need to share their **Inventory** as well.",
    ],
    tips: [
      "**Character stats** send nothing until you have read your own stats, and never a figure the read wasn't sure of.",
      "Everything you switch on is only shared while you are connected; turning the connection off stops it all.",
      "Peer plans keep their own locks and numbers and never touch yours.",
    ],
  },
  {
    id: "map-and-route",
    title: "Use the map and find a route",
    gist: "See where you are, mark places, and ask how to get from one zone to another.",
    section: MAP_WINDOW,
    steps: [
      "Click the **🗺** button in the title bar. The map follows your zone — type **/loc** in the game to put your dot on it.",
      "Drop pins from the toolbar (Star, Danger, Camp, Loot, Note), or paste a location to jump to it.",
      "Type the zone you want to go to in the title bar's zone picker and press Tab, then Enter, so the map is showing your destination.",
      "Press **🧭**. **From** is where your log says you are, and **To** is the map you are viewing — change either box if you like.",
      "Tick the ways you can travel — **Druid ports**, **Wizard spires**, **Translocator gnomes**, **Succor / pick** — then read the steps. Press ✕ on a step you can't take, and it finds the next best route.",
    ],
    tips: [
      "Maps come from your EverQuest install's maps folder, found through the log folder in Settings.",
      "Distances are straight-line and only good for ordering routes — a **?** marks a stand-in rather than a measurement.",
      "👁 chooses what is drawn, 📖 shows what killing things here has taught us, and ☠ shows the kill heatmap.",
    ],
  },
];
