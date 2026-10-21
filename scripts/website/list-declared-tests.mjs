// list-declared-tests.mjs: write every test the vitest config declares, skipped ones
// included, as JSON [{file, projectName}] to the path in argv[2].
//
// `vitest list` drops skipped tests, and many suites skip on the host (no resolver
// binary, no playground wasm, a soak or race env var unset), so its count moves
// with the machine. This collects through the same API without that filter.
// Run as its own process: collection runs each project's globalSetup (the client
// tests start a server), which must not live inside the caller.

import {writeFileSync} from 'node:fs';
import {createVitest} from 'vitest/node';

const out = process.argv[2];
if (!out) throw new Error('usage: list-declared-tests.mjs <out.json>');

const vitest = await createVitest('test', {watch: false, run: true});
try {
  const {testModules, unhandledErrors} = await vitest.collect();
  if (unhandledErrors.length) throw new Error(`vitest collection hit ${unhandledErrors.length} unhandled error(s): ${unhandledErrors[0]}`);
  const tests = [];
  for (const testModule of testModules) {
    const errors = [testModule, ...testModule.children.allSuites()].flatMap((suite) => suite.errors());
    if (errors.length) throw new Error(`${testModule.moduleId} failed to collect: ${errors[0].message}`);
    for (const test of testModule.children.allTests()) tests.push({file: testModule.moduleId, projectName: test.project.name});
  }
  writeFileSync(out, JSON.stringify(tests));
} finally {
  await vitest.close();
}
