// The end-to-end artifacts run under plain node and keep bare `@mionjs/*`
// specifiers, which node resolves through each package's `default` export
// condition, that is `.dist/`. The workspace never builds those during
// development (tests resolve sources through the `source` condition), and they
// must NOT be built from inside a vitest run either: every package build runs the
// mion plugin over the package's gen dir and prunes the modules a sibling test
// project generated there. So the dists are built BEFORE vitest, by
// `pnpm run test:batch-e2e` (scripts/core/test-batch-e2e.mjs), and this setup only
// checks they exist. When they do not, the suite skips itself and says so.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

/** The packages the built test server and the compiled client fixture import at run time. */
export const DIST_CLOSURE = [
  '@mionjs/core',
  '@mionjs/router',
  '@mionjs/client',
  '@mionjs/platform-node',
  '@mionjs/drizzle-orm',
  '@mionjs/drizzle-orm-pg-core',
];

/** The `default` export of every closure package, as node resolves it. */
export function missingDists(): string[] {
  return DIST_CLOSURE.filter((name) => {
    const dir = path.join(REPO_ROOT, 'packages', name.slice('@mionjs/'.length));
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as {
      exports?: Record<string, {default?: string}>;
    };
    const entry = manifest.exports?.['.']?.default;
    return !entry || !fs.existsSync(path.join(dir, entry));
  });
}

export async function setup(): Promise<void> {
  const missing = missingDists();
  if (missing.length > 0) {
    console.warn(
      `batch-transport-e2e: skipped, the built dists of ${missing.join(', ')} are missing. ` +
        'Run `pnpm run test:batch-e2e`, which builds them first.'
    );
  }
}
