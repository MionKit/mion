// The bundled-API id sweep over the generated data-type space; oracles A1-A3 live in apiIdsFuzz.ts.
// Replay a reported failure with MION_FUZZ_SEED; widen with MION_FUZZ_ITER.
import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {entrySeed, parseSeed} from '../core/fuzzPolicy.ts';
import {
  apiCheck,
  apiTypes,
  compile,
  createApiProject,
  destroyApiProject,
  hasBinary,
  runApiIdsFuzz,
  writeTypes,
} from './apiIdsFuzz.ts';

const register = hasBinary() ? it : it.skip;

function iterations(fallback: number): number {
  return parseSeed(process.env.MION_FUZZ_ITER, fallback);
}

describe('bundled API ids fuzz (CLI end to end)', () => {
  register('a client and a separately built server ship the same ids', {timeout: 900_000}, async () => {
    const report = await runApiIdsFuzz({
      seed: entrySeed('apiids'),
      iterations: iterations(5),
    });
    expect(report.failures, report.failures.join('\n\n')).toEqual([]);
  });

  // Proves the oracle can fire.
  register('negative control: a client from before a server type edit fails api-check on it', {timeout: 300_000}, () => {
    const project = createApiProject();
    try {
      writeTypes(project, 'export type Root = {id: number; note: string | undefined};\n');
      const first = compile(project, 'client');
      expect(first.status, first.stderr).toBe(0);
      const shipped = path.join(project.dir, 'shipped-client-manifest.json');
      fs.copyFileSync(path.join(project.clientGen, 'api', 'client-manifest.json'), shipped);

      writeTypes(project, 'export type Root = {id: number; note: string | undefined; tags: string[]};\n');
      const rebuilt = compile(project, 'server');
      expect(rebuilt.status, rebuilt.stderr).toBe(0);
      const failing = apiCheck(project, project.serverGen, shipped);
      expect(failing.status).toBe(1);
      expect(failing.stderr).toContain('r0: paramsId differs');

      const current = compile(project, 'client');
      expect(current.status, current.stderr).toBe(0);
      const passing = apiCheck(project, project.serverGen, project.clientGen);
      expect(passing.status, passing.stderr).toBe(0);
    } finally {
      destroyApiProject(project);
    }
  });

  register(
    'negative control: a client of a types package from before a server type edit fails api-check on it',
    {timeout: 300_000},
    () => {
      const project = createApiProject();
      try {
        writeTypes(project, 'export type Root = {id: number; note: string | undefined};\n');
        const published = apiTypes(project);
        expect(published.status, published.stderr).toBe(0);
        const stale = compile(project, 'types-client');
        expect(stale.status, stale.stderr).toBe(0);

        writeTypes(project, 'export type Root = {id: number; note: string | undefined; tags: string[]};\n');
        const rebuilt = compile(project, 'server');
        expect(rebuilt.status, rebuilt.stderr).toBe(0);
        const failing = apiCheck(project, project.serverGen, project.typesClientGen);
        expect(failing.status).toBe(1);
        expect(failing.stderr).toContain('r0: paramsId differs');

        const republished = apiTypes(project);
        expect(republished.status, republished.stderr).toBe(0);
        const current = compile(project, 'types-client');
        expect(current.status, current.stderr).toBe(0);
        const passing = apiCheck(project, project.serverGen, project.typesClientGen);
        expect(passing.status, passing.stderr).toBe(0);
      } finally {
        destroyApiProject(project);
      }
    }
  );
});
