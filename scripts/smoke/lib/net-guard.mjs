/**
 * net-guard.mjs — reading back what `no-network.cjs` refused.
 *
 * The guard appends each blocked URL to a file. Seeing *that the app tried* is the evidence that the
 * guard was live (a run with no attempts could mean either a quiet app or a guard that never loaded),
 * so reports carry the count and the hosts.
 */
import fs from "node:fs";

/** `{ count, hosts }` from the guard's file contents: how many fetches were refused, and which hosts they were for. */
export function summarizeBlockedFetches(text) {
  const urls = text.split(/\r?\n/).filter(Boolean);
  const hosts = new Set();
  for (const url of urls) {
    try {
      hosts.add(new URL(url).hostname);
    } catch {
      hosts.add(url.slice(0, 40));
    }
  }
  return { count: urls.length, hosts: [...hosts] };
}

/** The same, from the guard's file; a file that was never written means nothing was refused. */
export function readBlockedFetches(file) {
  return summarizeBlockedFetches(fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "");
}
