"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { when } from "@/shared/format";

/**
 * ↻ — fetch this page from the wiki again, right now, whatever its age.
 *
 * A cached page is good for a fortnight by default and may have reached you through a peer rather
 * than from eqlwiki directly ([ADR 0161](../../../specs/decisions/0161-a-public-page-is-shared-by-default.md)),
 * so there has to be a way to say *"I don't believe this one"* without waiting out a TTL or clearing
 * a cache directory by hand. It is the escape hatch, and it is deliberately per-page: a button that
 * re-fetched everything would be a three-hour job wearing the icon of a small one.
 *
 * It says **how old the page is** next to itself, because that is the question that makes somebody
 * reach for it. A page fetched an hour ago rarely needs refreshing, and knowing so is what stops the
 * button being pressed out of superstition.
 */
export default function RefreshPage({
  title,
  fetchedAt,
  onRefreshed,
}: {
  title: string;
  /** When this copy was fetched — from the wiki, or by the peer it came from. */
  fetchedAt?: string;
  /** Called once the fresh page is cached, so whoever owns the view can re-read it. */
  onRefreshed?: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api()?.wiki.refreshPage(title);
      onRefreshed?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {fetchedAt && (
        <span className="muted small page-age" title={`This copy was fetched ${when(fetchedAt)}`}>
          {when(fetchedAt)}
        </span>
      )}
      <button
        className="btn ghost sm"
        disabled={busy}
        title={busy ? "Fetching…" : "Fetch this page from eqlwiki again now"}
        onClick={() => void refresh()}
      >
        {busy ? "…" : "↻"}
      </button>
    </>
  );
}
