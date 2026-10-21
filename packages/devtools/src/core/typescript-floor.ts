// The supported TypeScript floor. package.json is the real contract (`typescript` is an optional peer,
// so an unmet range already prints at install); this only makes it visible again during a build, since
// install output is easy to scroll past. Deliberately off the public surface: a notice, not API.

import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';

// Keep in step with the `typescript` peer range in package.json.
export const TYPESCRIPT_FLOOR_MAJOR = 6;

// Once per process, not per build: a monorepo runs several plugin containers against one install.
let alreadyChecked = false;

// resetTypeScriptFloorCheckForTest clears the once-per-process latch. Tests only.
export function resetTypeScriptFloorCheckForTest(): void {
  alreadyChecked = false;
}

// installedTypeScriptVersion resolves from the consumer's cwd, so a workspace gets ITS copy rather than
// whichever one sits beside this plugin. Undefined is a normal setup: the resolver carries its own.
export function installedTypeScriptVersion(cwd: string): string | undefined {
  try {
    const resolveFrom = createRequire(path.join(cwd, 'noop.js'));
    const manifest = JSON.parse(fs.readFileSync(resolveFrom.resolve('typescript/package.json'), 'utf8'));
    return typeof manifest.version === 'string' ? manifest.version : undefined;
  } catch {
    return undefined;
  }
}

// warnBelowTypeScriptFloor never throws and never fails a build: type resolution runs on this package's
// OWN compiler, so an older one cannot break it. All it can do is write a tsconfig the resolver reads
// differently than the editor does, which is worth a log line and nothing more.
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
