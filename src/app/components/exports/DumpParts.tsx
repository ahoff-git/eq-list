"use client";
import { useState, type ReactNode } from "react";
import { Caret } from "@/app/components/ui";

/** Case-insensitive "does any of these contain the query" — the dump views filter, they don't rank. */
export function textMatches(query: string, ...texts: string[]): boolean {
  const q = query.trim().toLowerCase();
  return !q || texts.some((t) => t.toLowerCase().includes(q));
}

/**
 * A heading that folds what's under it. `forceOpen` overrides the reader's choice while it's set —
 * a search opens every section with a hit in it, and closing them again is the search's job.
 */
export function DumpSection({
  title,
  aside,
  defaultOpen = true,
  forceOpen,
  children,
}: {
  title: ReactNode;
  aside?: ReactNode;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const shown = forceOpen || open;
  return (
    <section className="dump-section">
      <button type="button" className="dump-section-head" onClick={() => setOpen(!shown)}>
        <Caret open={shown} />
        <span className="dump-section-title">{title}</span>
        {aside && <span className="dump-section-aside">{aside}</span>}
      </button>
      {shown && <div className="dump-section-body">{children}</div>}
    </section>
  );
}

/** A thin fill bar, 0–1. */
export function DumpBar({ fraction, title }: { fraction: number; title?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  return (
    <span className="dump-bar" title={title}>
      <span className="dump-fill" style={{ width: `${pct}%` }} />
    </span>
  );
}
