"use client";
import { Empty, segCls } from "@/app/components/ui";
import { useExportDump, useExportTimes } from "@/lib/exports/useGameExports";
import { usePersistentState } from "@/lib/usePersistentState";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import {
  ALL_EXPORT_COMMANDS,
  exportCommandFor,
  exportFilePrefix,
  GAME_EXPORT_COMMANDS,
  lastExportedAt,
  RECIPE_EXPORT_COMMANDS,
  type GameExportCommand,
  type GameExportTimes,
} from "@/shared/game-exports";
import ExportButton from "./ExportButton";
import InventoryDumpView from "./InventoryDumpView";
import FactionDumpView from "./FactionDumpView";
import AchievementsDumpView from "./AchievementsDumpView";
import DumpTableView from "./DumpTableView";

const COMMANDS = "commands";

/**
 * The Exports tab. **Commands** is a copy button per `/outputfile` command, coloured by how long ago
 * the game last wrote that dump for the character you're logged in as — the game only writes them
 * when the player types the command, so nudging them to type it again is the most this app can do.
 * Beside it, one view per dump that exists, reading what's inside.
 */
export default function GameExportsPanel() {
  const { times, now, logFile } = useExportTimes();
  const [view, setView] = usePersistentState<string>(STORAGE_KEYS.exportsView, COMMANDS);

  const prefix = exportFilePrefix(logFile);
  const available = ALL_EXPORT_COMMANDS.filter((c) => lastExportedAt(c, times) !== undefined);
  // A remembered view whose dump isn't there (another character, or a file deleted) falls back.
  const shown = available.find((c) => c.fileType === view);

  if (!prefix) {
    return (
      <Empty
        title="No character to match exports to"
        hint="Exports are named after the character in your log file (eqlog_<Character>_<server>.txt). Turn on /log in game, or follow a log in Settings."
      />
    );
  }

  return (
    <div className="game-exports">
      <div className="segmented game-export-views">
        <button className={segCls(!shown)} onClick={() => setView(COMMANDS)}>Commands</button>
        {available.map((c) => (
          <button key={c.fileType} className={segCls(shown === c)} onClick={() => setView(c.fileType)}>
            {c.label}
          </button>
        ))}
      </div>
      {shown ? (
        <DumpView cmd={shown} times={times} now={now} />
      ) : (
        <Commands prefix={prefix} times={times} now={now} />
      )}
    </div>
  );
}

function Commands({ prefix, times, now }: { prefix: string; times: GameExportTimes; now: number }) {
  return (
    <>
      <p className="muted small">
        The game only writes these when you type the command. Copy one, paste it into EverQuest chat,
        and its button turns green again. Files land as <code>{prefix}&lt;Type&gt;.txt</code> beside your{" "}
        <code>Logs</code> folder. For the Tradeskill Depot and Dragon&apos;s Hoard to be in the inventory dump,
        open their windows at a banker first.
      </p>
      <div className="game-export-list">
        {GAME_EXPORT_COMMANDS.map((cmd) => (
          <ExportButton key={cmd.command} cmd={cmd} times={times} now={now} />
        ))}
      </div>
      {/* One per tradeskill: the EQL client refuses `/outputfile recipes all`. */}
      <h4 className="game-export-heading">
        Recipes <code className="muted small">/outputfile recipes &lt;skill&gt;</code>
      </h4>
      <div className="game-export-grid">
        {RECIPE_EXPORT_COMMANDS.map((cmd) => (
          <ExportButton key={cmd.command} cmd={cmd} times={times} now={now} compact />
        ))}
      </div>
    </>
  );
}

/** One dump's contents, under its own copy button so retaking it is one click from reading it. */
function DumpView({ cmd, times, now }: { cmd: GameExportCommand; times: GameExportTimes; now: number }) {
  const dump = useExportDump(cmd.fileType, lastExportedAt(cmd, times));
  return (
    <>
      <ExportButton cmd={cmd} times={times} now={now} />
      {dump === undefined && <p className="muted">Reading…</p>}
      {dump === null && <p className="muted">Couldn&apos;t read this dump.</p>}
      {dump && (
        <>
          <p className="muted small">{dump.fileName}</p>
          <DumpBody cmd={cmd} text={dump.text} />
        </>
      )}
    </>
  );
}

/** The reader for a dump's kind; anything without one is shown as the table it is. */
function DumpBody({ cmd, text }: { cmd: GameExportCommand; text: string }) {
  if (cmd === exportCommandFor("inventory")) return <InventoryDumpView text={text} />;
  if (cmd === exportCommandFor("faction")) return <FactionDumpView text={text} />;
  if (cmd === exportCommandFor("achievements")) return <AchievementsDumpView text={text} />;
  return <DumpTableView text={text} columns={cmd.columns} emptyText={cmd.emptyText ?? "This dump is empty."} />;
}
