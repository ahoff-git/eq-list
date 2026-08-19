/**
 * protocol.ts — serves the exported Next renderer (`out/`) over a custom
 * `app://` scheme in production. A custom scheme (rather than file://) gives the
 * page a real origin, so absolute asset paths like `/_next/...` resolve cleanly
 * and standard web security applies.
 *
 * Files are read with Electron's fs (which is asar-aware) rather than
 * net.fetch(file://), so the renderer still loads when packaged inside an asar.
 */
import { protocol } from "electron";
import fs from "node:fs";
import path from "node:path";
import { createLogger } from "../src/shared/logging";

const log = createLogger("protocol");
export const APP_SCHEME = "app";

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".map": "application/json",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain",
};

/** Must be called before app `ready` — declares the scheme's privileges. */
export function registerAppProtocolScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
    },
  ]);
}

/** Must be called after app `ready` — maps app:// requests into `outDir`. */
export function handleAppProtocol(outDir: string): void {
  // Said once, at the top, because the alternative is silence: a missing export answers every request
  // with a 404 *body*, which a frameless transparent window renders as nothing at all. The window
  // layer now treats that 404 as a dead renderer, but this is the line that says why.
  if (!fs.existsSync(path.join(outDir, "index.html"))) {
    log.error("no exported renderer at", outDir, "— run `npm run build`; windows have nothing to show");
  }
  protocol.handle(APP_SCHEME, async (request) => {
    const { pathname } = new URL(request.url);
    const rel = decodeURIComponent(pathname).replace(/^\/+/, "") || "index.html";
    const resolved = path.normalize(path.join(outDir, rel));
    // Never escape outDir.
    if (resolved !== outDir && !resolved.startsWith(outDir + path.sep)) {
      log.warn("blocked path traversal", rel);
      return new Response("Forbidden", { status: 403 });
    }
    try {
      const data = await fs.promises.readFile(resolved);
      const type = MIME[path.extname(resolved).toLowerCase()] ?? "application/octet-stream";
      return new Response(new Uint8Array(data), { headers: { "content-type": type } });
    } catch {
      // Debug-gated: source maps and probes miss routinely, and the one miss that matters — the
      // document itself — is reported by the window that asked for it (`guardRenderer`).
      log.debug("no such asset", rel);
      return new Response("Not found", { status: 404 });
    }
  });
}
