import {describe, expect, it} from 'vitest';
import {runJobs} from '../src/jobs.ts';

describe('runJobs', () => {
  it('reports the samples that do not match the pattern', () => {
    const [result] = runJobs([{id: 1, op: 'validate', source: '^[a-z-]+$', samples: ['my-slug', 'NOPE', 'ok', '99']}]);
    expect(result).toEqual({id: 1, offenders: ['NOPE', '99']});
  });

  it('returns a bare result when every sample matches', () => {
    const [result] = runJobs([{id: 2, op: 'validate', source: '^[0-9a-f]+$', flags: 'i', samples: ['DEADbeef', '00ff']}]);
    expect(result).toEqual({id: 2});
  });

  it('strips g and y flags so .test never carries lastIndex between samples', () => {
    // With `g` intact the second identical sample would start matching at
    // lastIndex and fail; the strip keeps .test stateless.
    const [result] = runJobs([{id: 3, op: 'validate', source: 'ab', flags: 'g', samples: ['ab', 'ab', 'ab']}]);
    expect(result).toEqual({id: 3});
  });

  it('reports a compileError for invalid regex syntax', () => {
    const [result] = runJobs([{id: 4, op: 'validate', source: '^[a-z+$', samples: ['a']}]);
    expect(result.id).toBe(4);
    expect(result.compileError).toMatch(/regular expression/i);
    expect(result.offenders).toBeUndefined();
  });

  it('validates JS-only syntax RE2 cannot compile (lookbehind)', () => {
    const [good, bad] = runJobs([
      {id: 5, op: 'validate', source: '(?<=x)y', samples: ['xy']},
      {id: 6, op: 'validate', source: '(?<=x)y', samples: ['zz']},
    ]);
    expect(good).toEqual({id: 5});
    expect(bad).toEqual({id: 6, offenders: ['zz']});
  });

  it('treats an empty sample list as a pure compile check', () => {
    const [ok, broken] = runJobs([
      {id: 7, op: 'validate', source: '^a$', samples: []},
      {id: 8, op: 'validate', source: '(unclosed', samples: []},
    ]);
    expect(ok).toEqual({id: 7});
    expect(broken.compileError).toBeTruthy();
  });

  it('rejects unknown ops with a protocol error', () => {
    const [result] = runJobs([{id: 9, op: 'generate', source: '^a$'}]);
    expect(result).toEqual({id: 9, error: 'unknown op "generate"'});
  });
});
