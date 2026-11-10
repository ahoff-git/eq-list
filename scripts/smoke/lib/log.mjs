/**
 * log.mjs — the suite's own debug logging, through the repo's one logger (`src/shared/logging.ts`).
 *
 * Silent by default; `EQL_DEBUG=1 npm run smoke` turns it on — and, since the environment is passed on
 * to the app it launches, turns the app's own debug output on too. Importing this needs the compiled
 * main-process build, which `smoke.mjs` makes sure exists before anything imports it.
 */
import { load } from "../../lib/cli.mjs";

const { createLogger } = load("src/shared/logging.js");

export const log = createLogger("smoke");
