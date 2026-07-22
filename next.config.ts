import type { NextConfig } from "next";

/**
 * The renderer is a static SPA loaded by Electron:
 *  - dev:  Electron points at the `next dev` server (http://localhost:3000)
 *  - prod: Electron serves the exported `out/` dir via the custom `app://` protocol
 *
 * `output: "export"` produces plain HTML/JS with no Node server. All runtime data
 * (log events, wiki lookups, the shopping list) arrives over IPC from the Electron
 * main process, so nothing here needs SSR.
 */
const nextConfig: NextConfig = {
  output: "export",
  // Electron loads assets over app:// — keep image handling static.
  images: { unoptimized: true },
  // A trailing slash makes each route export to its own <route>/index.html,
  // which the app:// protocol handler resolves cleanly (e.g. /overlay/index.html).
  trailingSlash: true,
};

export default nextConfig;
