// A stub for the ONE file pg-common.ts references that this lane does not
// vendor. We take a SUBSET of drizzle's suite tree — the three driver-agnostic
// <dialect>-common.ts files and their two helpers — and a subset naturally has
// dangling edges. This is the only one.
//
// pg-common.ts type-imports `schema` from drizzle's neon-http batch suite, and
// uses it in exactly one place: the shape of a `neonPg` test context this lane
// never sets (it runs against a local postgres, not neon). So the stub only has
// to exist and export the name.
//
// It is NOT named mion-*.test.ts, so vitest's include never picks it up.
export const schema = {};
