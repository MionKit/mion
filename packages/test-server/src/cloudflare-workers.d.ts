/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The little bit of workerd's own surface test-server-cloudflare-storage.ts uses.
//
// Hand-rolled on purpose, the same posture as packages/platform-cloudflare/src/types.ts:
// @cloudflare/workers-types is not a workspace dependency, and pulling it in would
// put workerd's global Request and Response into every program that reaches this
// package.
//
// It is not optional cosmetics. An UNRESOLVED import poisons the whole file for
// the resolver: every marker in it resolves to `any`, and the build fails with
// MKR007 rather than generate validators that check nothing. So the routes in
// that worker only validate because this file exists.

interface SqlStorage {
  exec(query: string, ...bindings: unknown[]): unknown;
}

interface DurableObjectStorage {
  sql: SqlStorage;
}

interface DurableObjectState {
  storage: DurableObjectStorage;
}

declare module 'cloudflare:workers' {
  export abstract class DurableObject<Env = unknown> {
    constructor(ctx: DurableObjectState, env: Env);
    protected ctx: DurableObjectState;
    protected env: Env;
  }
}
