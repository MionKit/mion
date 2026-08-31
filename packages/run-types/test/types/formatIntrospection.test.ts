// Compile-time proof for the FormatNameOf<T> / FormatParamsOf<T> introspection
// helpers: a format type yields its tag name and params, a bare primitive yields
// `never`. These are the public replacement for matching the (nominal, unexported)
// symbol sentinels downstream (any consumer branching on a format tag or params).
//
// The bodies are type-only and never invoked; the `test` references them so lint
// doesn't flag them. The real check is tsc:
//   pnpm exec tsc --noEmit -p packages/run-types/tsconfig.test.json

import {expect, test} from 'vitest';
import type {Email, UUIDv7} from '@mionjs/run-types/formats';
import type {FormatNameOf, FormatParamsOf} from '@mionjs/run-types';

/** Asserts `S` and `T` are mutually assignable. No-arg call compiles iff equivalent. */
function assertMutual<S, T>(
  ..._proof: [S] extends [T]
    ? [T] extends [S]
      ? []
      : [error: 'T not assignable to S', T, S]
    : [error: 'S not assignable to T', S, T]
): void {
  void _proof;
}

function formatNameCases(): void {
  assertMutual<FormatNameOf<Email>, 'email'>();
  assertMutual<FormatNameOf<UUIDv7>, 'uuid'>();
  // no format tag: never — key-presence detection, so bare primitives never match
  assertMutual<FormatNameOf<string>, never>();
  assertMutual<FormatNameOf<number>, never>();
  assertMutual<FormatNameOf<{name: string}>, never>();
}

function formatParamsCases(): void {
  assertMutual<FormatParamsOf<UUIDv7>, {version: '7'}>();
  assertMutual<FormatParamsOf<string>, never>();
  // params flow through usable: a param can be read off the helper's result
  assertMutual<FormatParamsOf<UUIDv7>['version'], '7'>();
}

test('FormatNameOf / FormatParamsOf compile-time contract', () => {
  expect(typeof formatNameCases).toBe('function');
  expect(typeof formatParamsCases).toBe('function');
});
