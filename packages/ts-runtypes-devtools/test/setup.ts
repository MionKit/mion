// Per-test-file setup. Wired via vitest.config.ts `setupFiles`. Runs once
// per test file (inside the worker, before any test in the file is
// collected), so the afterAll registered here applies to every test in
// every file automatically — no individual test file needs to opt in.
//
// Single responsibility: between test files, wipe the resolver state so
// one file's overlay / cache / sites can't leak into the next. The
// underlying ts-runtypes child process stays alive across files —
// it's the per-worker singleton spawned lazily by helpers/inline.ts.
import {afterAll} from 'vitest';
import {resetSharedClient} from './helpers/inline.ts';

afterAll(async () => {
  await resetSharedClient();
});
