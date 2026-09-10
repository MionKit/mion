// The bundled-API id sweep — real binary, a real server project and a real
// client project with a different tsconfig, the generated data-type space.
// See apiIdsFuzz.ts for the oracles: the server manifest agrees with the
// reflection marker (A1), the client bundles exactly what it calls with no
// diagnostic (A2), and `mion api-check` passes (A3). Replay a reported failure
// with MION_FUZZ_SEED; widen with MION_FUZZ_ITER.
import {describe, expect, it} from 'vitest';
import {entrySeed, parseSeed} from '../core/fuzzPolicy.ts';
import {
  apiCheck,
  compileClient,
  compileServer,
  createApiProjects,
  destroyApiProjects,
  hasBinary,
  runApiIdsFuzz,
  writeTypes,
} from './apiIdsFuzz.ts';

const register = hasBinary() ? it : it.skip;

function iterations(fallback: number): number {
  return parseSeed(process.env.MION_FUZZ_ITER, fallback);
}

describe('bundled API ids fuzz (CLI end to end)', () => {
  register(
    'a client built against the server program ships the server ids, whatever its own tsconfig',
    {timeout: 900_000},
    async () => {
      const report = await runApiIdsFuzz({
        seed: entrySeed('apiids'),
        iterations: iterations(5),
      });
      expect(report.failures, report.failures.join('\n\n')).toEqual([]);
    }
  );

  // The negative control: the oracle has to be able to fire. An explicit
  // `| undefined` member is exactly what the client's `strictNullChecks: false`
  // erases, so a client built WITHOUT the pointer compiles a different type,
  // and api-check says so on the field that moved; WITH the pointer it passes.
  register(
    'negative control: without --api-tsconfig the client tsconfig moves an id and api-check fails on it',
    {timeout: 300_000},
    () => {
      const projects = createApiProjects();
      try {
        writeTypes(projects, 'export type Root = {id: number; note: string | undefined; tags: (string | null)[]};\n');
        const server = compileServer(projects);
        expect(server.status, server.stderr).toBe(0);

        const withoutPointer = compileClient(projects, false);
        expect(withoutPointer.status, withoutPointer.stderr).toBe(0);
        const failing = apiCheck(projects);
        expect(failing.status).toBe(1);
        expect(failing.stderr).toContain('r0: paramsId differs');

        const withPointer = compileClient(projects, true);
        expect(withPointer.status, withPointer.stderr).toBe(0);
        const passing = apiCheck(projects);
        expect(passing.status, passing.stderr).toBe(0);
      } finally {
        destroyApiProjects(projects);
      }
    }
  );
});
