// The batch transport end-to-end lane: build the framework dists the artifacts
// import at run time, THEN run the `batch-transport-e2e` vitest project on its own.
//
// The builds must not happen inside a vitest run: every package build runs the
// mion plugin over that package's gen dir and prunes the modules a sibling test
// project generated there. Built here, before vitest starts, nothing else is
// running. The package list is the suite's own (packages/devtools/test/e2e), so
// the two cannot drift.
import {execFileSync} from 'node:child_process';
import {REPO_ROOT} from '../lib/env.mjs';

const DIST_CLOSURE = [
  '@mionjs/core',
  '@mionjs/router',
  '@mionjs/client',
  '@mionjs/platform-node',
  '@mionjs/drizzle-orm',
  '@mionjs/drizzle-orm-pg-core',
];

export function main() {
  const filters = DIST_CLOSURE.flatMap((name) => ['--filter', name]);
  console.log(`test-batch-e2e: building ${DIST_CLOSURE.join(', ')}`);
  execFileSync('pnpm', [...filters, 'run', 'build'], {cwd: REPO_ROOT, stdio: 'inherit'});
  console.log('test-batch-e2e: running the batch-transport-e2e project');
  execFileSync('pnpm', ['exec', 'vitest', 'run', '--project', 'batch-transport-e2e'], {cwd: REPO_ROOT, stdio: 'inherit'});
}

main();
