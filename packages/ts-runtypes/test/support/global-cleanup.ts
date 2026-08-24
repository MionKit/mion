// Vitest globalSetup — TEARDOWN only. No setup work happens here: the
// ts-runtypes-devtools plugin spawns the Go binary from its `configResolved` hook,
// which fires BEFORE any globalSetup, so binary-related work can't live here
// (see the root vitest.config.ts note). What this DOES own is cleanup.
//
// During the run the plugin generates the files-mode output tree under this
// package's default outDir (`<PACKAGE_ROOT>/__runtypes`, inferred from the
// tsconfig). Remove it once the whole suite finishes so a test run never leaves
// generated modules behind on disk — the .gitignore entry stays only as a
// safety net for an interrupted run.
import {rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const OUTPUT_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '__runtypes');

export default function (): () => Promise<void> {
  return async () => {
    await rm(OUTPUT_DIR, {recursive: true, force: true});
  };
}
