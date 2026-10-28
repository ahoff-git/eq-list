"use client";
import type { ReactNode } from "react";
import { when } from "@/shared/format";
import type { LogSearchHit } from "@/shared/types";

interface Props {
  hit: LogSearchHit;
  /** Marked wherever it occurs in the line — the search term. */
  needle: string;
  file?: string;
  /** The line being looked at, among the lines around it. */
  on?: boolean;
  /** A trailing control, such as "open in context". */
  action?: ReactNode;
}

/** One log line as the searcher shows it: its time, what the parser read it as, and its text. */
export default function LogLineRow({ hit, needle, file, on = false, action }: Props) {
  return (
    <li className={`log-hit${on ? " on" : ""}`}>
      <span className="lh-when" title={`Line ${hit.line.toLocaleString()} of ${file ?? "the log"}`}>
        {when(hit.at)}
      </span>
      <span className="lh-kind muted small" title="What the parser read this line as">
        {hit.kind ?? ""}
      </span>
      <span className="lh-text">
        <Highlighted text={hit.message} needle={needle} />
      </span>
      <span className="lh-action">{action}</span>
    </li>
  );
}

/** `text` with every case-insensitive occurrence of `needle` marked. */
function Highlighted({ text, needle }: { text: string; needle: string }) {
  const lower = text.toLowerCase();
  const find = needle.toLowerCase();
  const parts: { text: string; hit: boolean }[] = [];
  let from = 0;
  for (let at = lower.indexOf(find); at !== -1 && find; at = lower.indexOf(find, from)) {
    if (at > from) parts.push({ text: text.slice(from, at), hit: false });
    parts.push({ text: text.slice(at, at + find.length), hit: true });
    from = at + find.length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), hit: false });
  return <>{parts.map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}</>;
}
