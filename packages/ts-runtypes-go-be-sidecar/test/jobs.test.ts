import {afterEach, describe, expect, it} from 'vitest';
import {handleRequestLine, MATCH_TIMED_OUT, runJobs, setPatternMatcher} from '../src/jobs.ts';

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

  // The JSON Schema door compiles every schema `pattern` in `u` mode, where
  // \p{...} means what the author wrote. randexp cannot parse those escapes, so
  // the generator source expands them first; these pin that a pool comes back
  // AND that every value satisfies the ORIGINAL pattern.
  it('generates values for unicode property escapes in u mode', () => {
    const [letters] = runJobs([
      {id: 30, op: 'generate', source: '^\\p{Letter}+$', flags: 'u', count: 5, seed: 7, maxAttempts: 200},
    ]);
    expect(letters.generateError).toBeUndefined();
    expect(letters.values!.length).toBeGreaterThan(0);
    for (const value of letters.values!) expect(value).toMatch(/^\p{Letter}+$/u);

    // Inside an existing class the members splice in bare — a nested [...] would
    // not parse — and the negated form works the same way.
    const [mixed] = runJobs([
      {id: 31, op: 'generate', source: '^[\\p{Nd}abc]+$', flags: 'u', count: 4, seed: 7, maxAttempts: 200},
    ]);
    expect(mixed.generateError).toBeUndefined();
    for (const value of mixed.values!) expect(value).toMatch(/^[\p{Nd}abc]+$/u);

    const [negated] = runJobs([
      {id: 32, op: 'generate', source: '^\\P{Letter}+$', flags: 'u', count: 4, seed: 7, maxAttempts: 200},
    ]);
    expect(negated.generateError).toBeUndefined();
    for (const value of negated.values!) expect(value).toMatch(/^\P{Letter}+$/u);
  });

  it('measures the declared length bounds in code points, like the emitted validator', () => {
    // Two astral characters are two code points but FOUR UTF-16 units, so under
    // maxLength 2 the old `.length` filter dropped every draw and the job died
    // with generateError. The validator counts code points, so the pool must
    // keep them.
    const [result] = runJobs([
      {
        id: 33,
        op: 'generate',
        source: '^(?:\u{1F600}|\u{1F601}){2}$',
        flags: 'u',
        count: 2,
        seed: 11,
        maxAttempts: 200,
        maxLength: 2,
      },
    ]);
    expect(result.generateError).toBeUndefined();
    for (const value of result.values!) {
      expect([...value]).toHaveLength(2);
      expect(value.length).toBe(4); // two surrogate pairs
    }
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

// A host that can bound a runaway match reports it through the matcher; these
// pin what a bounded verdict turns into, without depending on a host that can
// actually interrupt one (see index.ts).
describe('bounded pattern matching', () => {
  afterEach(() => setPatternMatcher((tester, sample) => tester.test(sample)));

  it('reports a timed-out validate sample as a compileError, not as an offender', () => {
    setPatternMatcher(() => MATCH_TIMED_OUT);
    const [result] = runJobs([{id: 1, op: 'validate', source: '(x|y)+.*.*', samples: ['x'.repeat(2110)]}]);
    expect(result.id).toBe(1);
    expect(result.compileError).toMatch(/timed out .* may backtrack catastrophically/);
    // Never an offender: the sample was not judged, so calling it a mismatch
    // would be a lie, and never `error`, which kills the engine Go-side.
    expect(result.offenders).toBeUndefined();
    expect(result.error).toBeUndefined();
  });

  it('counts the sample in code points when naming its size', () => {
    setPatternMatcher(() => MATCH_TIMED_OUT);
    const [result] = runJobs([{id: 2, op: 'validate', source: 'a', samples: ['😀😀']}]);
    expect(result.compileError).toMatch(/on a 2-character sample/);
  });

  it('reports a timed-out generate self-check as a generateError', () => {
    setPatternMatcher(() => MATCH_TIMED_OUT);
    const [result] = runJobs([{id: 3, op: 'generate', source: '[a-z]{3}', count: 1}]);
    expect(result.id).toBe(3);
    expect(result.generateError).toMatch(/timed out/);
    expect(result.values).toBeUndefined();
  });

  it('leaves ordinary verdicts alone when the matcher never times out', () => {
    setPatternMatcher((tester, sample) => tester.test(sample));
    const [result] = runJobs([{id: 4, op: 'validate', source: '^[a-z]+$', samples: ['ok', 'NOPE']}]);
    expect(result).toEqual({id: 4, offenders: ['NOPE']});
  });
});
