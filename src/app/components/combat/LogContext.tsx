"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Empty } from "@/app/components/ui";
import type { LogLines, LogSearchHit } from "@/shared/types";
import { createLogger } from "@/shared/logging";
import LogLineRow from "./LogLineRow";

const log = createLogger("log-context");

/** Lines read either side of the hit when it opens. */
const CONTEXT_LINES = 100;
/** Lines read per step when the scroll nears an edge. */
const PAGE_LINES = 200;
/** How near an edge (px) the scroll gets before the next page is read. */
const EDGE_PX = 300;

/** What has been read so far: `from`..`to` are the line numbers asked for, not just those that held a line. */
interface View {
  lines: LogSearchHit[];
  from: number;
  to: number;
  /** The file ran out at `to` — nothing later, until the game writes more. */
  end: boolean;
}

interface Props {
  /** The search hit's line number — the line this view opens on. */
  line: number;
  needle: string;
  file?: string;
  onClose: () => void;
}

async function readLines(from: number, to: number): Promise<LogLines | undefined> {
  try {
    return await api()?.log.lines(from, to);
  } catch (err) {
    log.warn("log lines read failed", { from, to, err });
    return undefined;
  }
}

/** Where a read that hit the end of the file really stopped, so "newer lines" starts after it. */
const lastAsked = (got: LogLines, asked: number, before: number): number =>
  got.end ? (got.lines.at(-1)?.line ?? before) : asked;

/**
 * A search hit in context: the log around one line, the way the game wrote it, opened centred on
 * that line and read a page at a time as you scroll toward either edge — so "what happened just
 * before that resist" is a scroll, not another search.
 */
export default function LogContext({ line, needle, file, onClose }: Props) {
  const [view, setView] = useState<View | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const busy = useRef(false);
  /** Set when the view has been scrolled to its line once; later renders leave the scroll alone. */
  const centred = useRef(false);
  /** The scroll before lines were added above, so the line being read stays put. */
  const anchor = useRef<{ height: number; top: number } | null>(null);
  /** Bumped per opened line, so a page that lands after a reopen is dropped. */
  const generation = useRef(0);

  useEffect(() => {
    const mine = ++generation.current;
    centred.current = false;
    setView(null);
    const from = Math.max(1, line - CONTEXT_LINES);
    const to = line + CONTEXT_LINES;
    void readLines(from, to).then((got) => {
      if (generation.current !== mine) return;
      setView({ lines: got?.lines ?? [], from, to: got ? lastAsked(got, to, from - 1) : to, end: got?.end ?? true });
    });
  }, [line, file]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || !view) return;
    if (!centred.current) {
      const row = list.querySelector<HTMLElement>(".log-hit.on");
      if (row) list.scrollTop = row.offsetTop - list.clientHeight / 2 + row.offsetHeight / 2;
      centred.current = true;
    } else if (anchor.current) {
      list.scrollTop = anchor.current.top + (list.scrollHeight - anchor.current.height);
      anchor.current = null;
    }
  }, [view]);

  const loadEarlier = async (current: View) => {
    const to = current.from - 1;
    const from = Math.max(1, to - PAGE_LINES + 1);
    const mine = generation.current;
    busy.current = true;
    const got = await readLines(from, to);
    busy.current = false;
    const list = listRef.current;
    if (!got || generation.current !== mine || !list) return;
    anchor.current = { height: list.scrollHeight, top: list.scrollTop };
    setView((v) => v && { ...v, lines: [...got.lines, ...v.lines], from });
  };

  const loadLater = async (current: View) => {
    const from = current.to + 1;
    const to = current.to + PAGE_LINES;
    const mine = generation.current;
    busy.current = true;
    const got = await readLines(from, to);
    busy.current = false;
    if (!got || generation.current !== mine) return;
    setView((v) => v && { ...v, lines: [...v.lines, ...got.lines], to: lastAsked(got, to, v.to), end: got.end });
  };

  const onScroll = () => {
    const list = listRef.current;
    if (!list || !view || busy.current) return;
    if (list.scrollTop < EDGE_PX && view.from > 1) void loadEarlier(view);
    else if (list.scrollHeight - list.scrollTop - list.clientHeight < EDGE_PX && !view.end) void loadLater(view);
  };

  const atStart = view ? view.from <= 1 : false;

  return (
    <div className="log-context">
      <div className="row wrap" style={{ marginBottom: 8 }}>
        <button className="btn ghost sm" onClick={onClose} title="Back to the search results">
          ← Results
        </button>
        <span className="muted small">Line {line.toLocaleString()} in context — scroll for what came before and after</span>
      </div>

      {!view ? (
        <Empty title="Reading the log…" hint="Finding that line in the file." />
      ) : !view.lines.length ? (
        <Empty title="That line isn't in the log any more" hint="The file may have been replaced since you searched." />
      ) : (
        <ol className="log-hits" ref={listRef} onScroll={onScroll}>
          {atStart && <li className="log-edge muted small">Start of log</li>}
          {view.lines.map((hit) => (
            <LogLineRow key={hit.line} hit={hit} needle={needle} file={file} on={hit.line === line} />
          ))}
          {view.end && (
            <li className="log-edge muted small">
              End of log ·{" "}
              <button className="link" onClick={() => void loadLater(view)}>
                check for newer lines
              </button>
            </li>
          )}
        </ol>
      )}
    </div>
  );
}
