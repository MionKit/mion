import {describe, expect, it} from 'vitest';
import {handleRequestLine, runJobs} from '../src/jobs.ts';

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
    const [result] = runJobs([{id: 9, op: 'minify', source: '^a$'}]);
    expect(result).toEqual({id: 9, error: 'unknown op "minify"'});
  });
});

describe('runJobs — generate op', () => {
  it('generates count deterministic values that all match the pattern', () => {
    const job = {id: 20, op: 'generate', source: '^[a-z]{3}[0-9]$', count: 8, seed: 42, maxAttempts: 80};
    const [first] = runJobs([job]);
    const [second] = runJobs([job]);
    expect(first.values).toBeDefined();
    expect(first.values).toHaveLength(8);
    const tester = /^[a-z]{3}[0-9]$/;
    for (const value of first.values!) expect(value).toMatch(tester);
    // Determinism: same seed, same list, same order.
    expect(second.values).toEqual(first.values);
  });

  it('different seeds produce different lists', () => {
    const base = {id: 21, op: 'generate', source: '^[a-z]{6}$', count: 6, maxAttempts: 60};
    const [a] = runJobs([{...base, seed: 1}]);
    const [b] = runJobs([{...base, seed: 2}]);
    expect(a.values).not.toEqual(b.values);
  });

  it('dedupes and accepts fewer values for a small finite language', () => {
    const [result] = runJobs([{id: 22, op: 'generate', source: '^(a|b)$', count: 100, seed: 7, maxAttempts: 1000}]);
    expect(result.values?.slice().sort()).toEqual(['a', 'b']);
  });

  it('respects declared length bounds via the self-check filter', () => {
    const [result] = runJobs([
      {id: 23, op: 'generate', source: '^x+$', count: 10, seed: 9, maxAttempts: 100, minLength: 3, maxLength: 5},
    ]);
    expect(result.values!.length).toBeGreaterThan(0);
    for (const value of result.values!) {
      expect(value.length).toBeGreaterThanOrEqual(3);
      expect(value.length).toBeLessThanOrEqual(5);
    }
  });

  it('reports generateError when randexp cannot handle the construct (lookbehind throws)', () => {
    const [result] = runJobs([{id: 24, op: 'generate', source: '(?<=x)y', count: 5, seed: 1, maxAttempts: 50}]);
    expect(result.generateError).toBeTruthy();
    expect(result.values).toBeUndefined();
  });

  it('reports generateError when the retry budget yields nothing', () => {
    // Impossible bounds: the pattern only produces 1-char values but
    // minLength demands 5 — every attempt is filtered, budget exhausts.
    const [result] = runJobs([{id: 25, op: 'generate', source: '^a$', count: 3, seed: 1, maxAttempts: 30, minLength: 5}]);
    expect(result.generateError).toMatch(/survived 30 attempts/);
  });

  it('reports compileError for invalid syntax on the generate op too', () => {
    const [result] = runJobs([{id: 26, op: 'generate', source: '^[a-z+$', count: 3, seed: 1}]);
    expect(result.compileError).toBeTruthy();
    expect(result.generateError).toBeUndefined();
  });
});

describe('handleRequestLine', () => {
  it('answers a request line with a response line (shared by stdio shell and WASM hook)', () => {
    const response = JSON.parse(
      handleRequestLine(JSON.stringify({v: 1, jobs: [{id: 1, op: 'validate', source: '^a$', samples: ['a', 'b']}]}))
    );
    expect(response.v).toBe(1);
    expect(response.results[0]).toEqual({id: 1, offenders: ['b']});
  });

  it('turns a malformed request into a protocol error response', () => {
    const response = JSON.parse(handleRequestLine('not json'));
    expect(response.v).toBe(1);
    expect(response.error).toBeTruthy();
  });
});
