// The bundled-API id sweep — real binary, one real fullstack project built twice,
// the generated data-type space. See apiIdsFuzz.ts for the oracles: the server
// manifest agrees with the reflection marker (A1), the client build bundles
// exactly what it calls with no diagnostic and writes the server build's api/
// tree (A2), and `mion api-check` passes (A3). Replay a reported failure with
// MION_FUZZ_SEED; widen with MION_FUZZ_ITER.
import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {entrySeed, parseSeed} from '../core/fuzzPolicy.ts';
import {apiCheck, compile, createApiProject, destroyApiProject, hasBinary, runApiIdsFuzz, writeTypes} from './apiIdsFuzz.ts';

const register = hasBinary() ? it : it.skip;

function iterations(fallback: number): number {
  return parseSeed(process.env.MION_FUZZ_ITER, fallback);
}

describe('bundled API ids fuzz (CLI end to end)', () => {
  register('two builds of one program ship the same ids to the client and the server', {timeout: 900_000}, async () => {
    const report = await runApiIdsFuzz({
      seed: entrySeed('apiids'),
      iterations: iterations(5),
    });
    expect(report.failures, report.failures.join('\n\n')).toEqual([]);
  });

  // The negative control: the oracle has to be able to fire. A client shipped
  // before a server-side type edit no longer matches the rebuilt server, and
  // api-check says so on the field that moved.
  register('negative control: a client from before a server type edit fails api-check on it', {timeout: 300_000}, () => {
    const project = createApiProject();
    try {
      writeTypes(project, 'export type Root = {id: number; note: string | undefined};\n');
      const first = compile(project, project.clientGen);
      expect(first.status, first.stderr).toBe(0);
      const shipped = path.join(project.dir, 'shipped-client-manifest.json');
      fs.copyFileSync(path.join(project.clientGen, 'api', 'client-manifest.json'), shipped);

      writeTypes(project, 'export type Root = {id: number; note: string | undefined; tags: string[]};\n');
      const rebuilt = compile(project, project.serverGen);
      expect(rebuilt.status, rebuilt.stderr).toBe(0);
      const failing = apiCheck(project, project.serverGen, shipped);
      expect(failing.status).toBe(1);
      expect(failing.stderr).toContain('r0: paramsId differs');

      const passing = apiCheck(project, project.serverGen, project.serverGen);
      expect(passing.status, passing.stderr).toBe(0);
    } finally {
      destroyApiProject(project);
    }
  });
});
