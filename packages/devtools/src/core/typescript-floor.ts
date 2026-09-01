// The supported TypeScript floor, and the one place that says so at build time.
//
// package.json is the real contract: `typescript` is an optional peer with the
// range below, so an unmet one already prints at install. This module only makes
// that visible again during a build, since install output is easy to scroll past.
//
// Deliberately not on the package's public surface (no `exports` entry): it is a
// build-time notice, not API.

import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';

// Keep in step with the `typescript` peer range in package.json.
export const TYPESCRIPT_FLOOR_MAJOR = 6;

// Once per process, not once per build: a monorepo runs several plugin
// containers against one install, and the notice is about the install.
let alreadyChecked = false;

// resetTypeScriptFloorCheckForTest clears the once-per-process latch. Tests only.
export function resetTypeScriptFloorCheckForTest(): void {
  alreadyChecked = false;
}

// installedTypeScriptVersion reads the consumer's own TypeScript, resolved from
// their cwd so a workspace gets ITS copy rather than whichever one happens to sit
// beside this plugin. Undefined when there is no install to find, which is a
// perfectly normal setup: the resolver carries its own compiler.
export function installedTypeScriptVersion(cwd: string): string | undefined {
  try {
    const resolveFrom = createRequire(path.join(cwd, 'noop.js'));
    const manifest = JSON.parse(fs.readFileSync(resolveFrom.resolve('typescript/package.json'), 'utf8'));
    return typeof manifest.version === 'string' ? manifest.version : undefined;
  } catch {
    return undefined;
  }
}

// warnBelowTypeScriptFloor logs once if the consumer's TypeScript is older than
// the floor. Never throws and never fails a build: type resolution runs on this
// package's OWN compiler and never loads the consumer's, so an older one cannot
// break it. What it can do is write a tsconfig the resolver reads differently
// than the editor does, which is worth a line in the log and nothing more.
export function warnBelowTypeScriptFloor(cwd: string, pluginName: string, warn = console.warn): void {
  if (alreadyChecked) return;
  alreadyChecked = true;
  const version = installedTypeScriptVersion(cwd);
  if (version === undefined) return;
  const major = Number.parseInt(version, 10);
  if (!Number.isFinite(major) || major >= TYPESCRIPT_FLOOR_MAJOR) return;
  warn(
    `${pluginName}: TypeScript ${version} is below the supported floor of ${TYPESCRIPT_FLOOR_MAJOR}.0.0. ` +
      `Type resolution uses this package's own compiler, so builds keep working, ` +
      `but your tsconfig may be read differently than your editor reads it.`
  );
}
