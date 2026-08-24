// Per-test-file setup. Wired via vitest.config.ts `setupFiles`. Runs
// once per test file (inside the worker), so the afterAll registered
// here applies to every test in every file automatically.
//
// In this package the resolver is owned by the vite-plugin instance
// installed in vitest's vite pipeline — the plugin spawns + closes
// the binary itself via its `configResolved` / `buildEnd` hooks. No
// per-file reset is needed today (each test file's transform happens
// once at vite-load time; the resolver's cumulative cache is harmless
// to subsequent tests because the rewrite IDs are deterministic
// hashes of type structure).
//
// File kept so the wiring matches `packages/ts-runtypes-devtools/test/
// setup.ts` and so future expansions (multiple test files needing
// state isolation) drop in cleanly.
//
// Temporal needs no setup: the repo baseline is Node >= 26, which ships the
// global `Temporal` unflagged (ES2026), the same native global production
// consumers use. The old temporal-polyfill shim for Node < 26 is gone.
