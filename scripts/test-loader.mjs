/**
 * Registers the "@/" alias resolver for `npm test` runs. Node's built-in test
 * runner strips types natively but does NOT read tsconfig `paths`, so any
 * tested module whose import graph uses the project's "@/*" alias needs this
 * hook (wired via `node --import ./scripts/test-loader.mjs`; the test runner
 * propagates it to its child processes).
 */
import { register } from "node:module";

register(new URL("./test-alias-resolver.mjs", import.meta.url));
