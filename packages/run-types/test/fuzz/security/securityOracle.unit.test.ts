// Negative controls for the security oracles (the iron rule: a red lane must
// mean a real bug, so every oracle is proven to FIRE on a deliberately broken
// decoder), including the todo's required control: the PRE-FIX binary reader
// paired with the pre-fix `string[]` decode body, run through the real worker
// host under a heap cap, so the silent truncation lands as an SB-BOUNDS
// violation and the count bomb as an out-of-memory crash record carrying its
// seed and attack, not as a dead test process.
//
// Binary-free apart from the worker (which loads the built run-types dist);
// runs in the unit lane.

import {describe, expect, it, afterAll} from 'vitest';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {
  checkBinaryDecode,
  checkIsolation,
  checkJsonDecode,
  checkPrototypes,
  checkGlobals,
  snapshotGlobals,
  checkFormatCall,
  type BinaryDecodeProbe,
  type SecurityViolation,
} from './securityOracle.ts';
import {createPreFixDeserializer, preFixStringArrayDecode, stringArrayEncode, stringArrayValidate} from './prefixReader.ts';
import {encodeVarint} from './wireMutations.ts';
import {SecurityWorkerHost} from './securityWorkerHost.ts';
import {defineOwn} from './attackDictionary.ts';

const ctx = {target: 'control', seed: 0x1234};
const DIST = new URL('../../../dist/index.js', import.meta.url);
const ABORT_WORKER = fileURLToPath(new URL('./abortWorker.ts', import.meta.url));

/** The pre-fix decoder as an in-thread probe. **/
const preFixProbe: BinaryDecodeProbe = {
  decode: (bytes) => {
    const des = createPreFixDeserializer(bytes);
    const value = preFixStringArrayDecode(des);
    return {value, index: des.index, byteLength: des.byteLength};
  },
  validate: stringArrayValidate,
  encode: (value) => stringArrayEncode(value as string[]),
};

const oracles = (violations: SecurityViolation[]): string[] => violations.map((v) => v.oracle);

describe('SB oracles fire on the pre-fix reader (negative controls)', () => {
  const validWire = stringArrayEncode(['hello', 'world', 'abc']);

  it('SB-BOUNDS fires on a truncated buffer that decodes to garbage', () => {
    // Cut inside the last string: the pre-fix reader clamps the slice and
    // walks its index past the end instead of failing.
    const truncated = validWire.subarray(0, validWire.length - 2);
    const result = checkBinaryDecode(preFixProbe, {id: 'truncate', expect: 'any', bytes: truncated}, ctx);
    expect(oracles(result.violations)).toContain('SB-BOUNDS');
    expect(result.violations[0].message).toContain('["hello","world","a"]');
    expect(result.outcome).toBe('returned');
  });

  it('SB-REJECT fires when bytes that cannot encode the type still validate', () => {
    // A count larger than the bytes left: the pre-fix reader fills the tail
    // with empty strings, which `string[]` happily accepts.
    const bomb = Uint8Array.from([...encodeVarint(5), ...stringArrayEncode(['a']).subarray(1)]);
    const result = checkBinaryDecode(preFixProbe, {id: 'count.remaining+1', expect: 'reject', bytes: bomb}, ctx);
    expect(oracles(result.violations)).toContain('SB-REJECT');
  });

  it('SB-THROWS fires on a non-Error throw', () => {
    const probe: BinaryDecodeProbe = {
      ...preFixProbe,
      decode: () => {
        throw 'not an error';
      },
    };
    const result = checkBinaryDecode(probe, {id: 'x', expect: 'any', bytes: validWire}, ctx);
    expect(oracles(result.violations)).toEqual(['SB-THROWS']);
    expect(result.outcome).toBe('non-Error');
  });

  it('SB-PROTO fires on a decode result with a foreign prototype', () => {
    const polluted: Record<string, unknown> = {};
    polluted['__proto__'] = {polluted: true};
    const probe: BinaryDecodeProbe = {
      ...preFixProbe,
      decode: () => ({value: polluted, index: 0, byteLength: 0}),
      validate: () => true,
    };
    const result = checkBinaryDecode(probe, {id: 'x', expect: 'any', bytes: validWire}, ctx);
    expect(oracles(result.violations)).toContain('SB-PROTO');
  });

  it('SB-TOTAL fires when validate throws on the decoded value', () => {
    const probe: BinaryDecodeProbe = {
      ...preFixProbe,
      validate: () => {
        throw new TypeError('boom');
      },
    };
    const result = checkBinaryDecode(probe, {id: 'x', expect: 'any', bytes: validWire}, ctx);
    expect(oracles(result.violations)).toEqual(['SB-TOTAL']);
  });

  it('SB-TIME fires on a decode that runs past its budget', () => {
    const probe: BinaryDecodeProbe = {
      ...preFixProbe,
      decode: (bytes) => {
        const until = performance.now() + 300;
        while (performance.now() < until) {
          /* spin */
        }
        return preFixProbe.decode(bytes);
      },
    };
    const result = checkBinaryDecode(probe, {id: 'slow', expect: 'any', bytes: validWire}, ctx);
    expect(oracles(result.violations)).toContain('SB-TIME');
  });

  it('SB-ISOLATION fires when the valid wire stops round-tripping', () => {
    let poisoned = false;
    const probe: BinaryDecodeProbe = {
      ...preFixProbe,
      encode: (value) => (poisoned ? stringArrayEncode([]) : stringArrayEncode(value as string[])),
    };
    expect(checkIsolation(probe, validWire, 'before', ctx)).toBeNull();
    poisoned = true;
    expect(checkIsolation(probe, validWire, 'after', ctx)?.oracle).toBe('SB-ISOLATION');
  });

  it('every oracle stays quiet on the valid wire', () => {
    const result = checkBinaryDecode(preFixProbe, {id: 'valid', expect: 'any', bytes: validWire}, ctx);
    expect(result.violations).toEqual([]);
    expect(checkIsolation(preFixProbe, validWire, 'valid', ctx)).toBeNull();
  });
});

describe('the worker host turns the pre-fix count bomb into a crash record (SB-OOM)', () => {
  const host = new SecurityWorkerHost({heapMb: 96, stepTimeoutMs: 60_000});
  afterAll(() => host.close());
  const register = existsSync(DIST) ? it : it.skip;

  register(
    'reports out-of-memory with the attack and seed, and the test process survives',
    async () => {
      const validWire = stringArrayEncode(['hello', 'world']);
      // The spike's finding: a varint for 2^31 followed by nothing. The
      // pre-fix arm allocates a 2^31-slot array and fills it until the heap
      // cap trips (2^24 merely takes seconds and 128 MB, which is the SB-TIME
      // and SB-BOUNDS finding the in-thread control above already pins).
      const bomb = encodeVarint(2 ** 31);
      const result = await host.run({
        type: 'prefix-control',
        seed: 0xbeef,
        target: 'string[] (pre-fix)',
        attacks: [
          {id: 'valid', expect: 'any', bytes: validWire},
          {id: 'count.2^31-then-nothing', expect: 'reject', bytes: bomb},
        ],
        validWire,
      });
      expect(result.done).toBeUndefined();
      expect(result.crash).toBeDefined();
      expect(result.crash!.seed).toBe(0xbeef);
      expect(result.crash!.attack).toBe('count.2^31-then-nothing');
      expect(result.crash!.message).toMatch(/out of memory|did not return/);
    },
    120_000
  );

  // The same record, without needing a real heap to fill: the fixture child
  // dies with a bare SIGABRT and an empty stderr, which is what the real one
  // does on macOS with Node 26. Not gated on the dist (the fixture loads
  // nothing), so it holds the classification on every host.
  it('reports out of memory when a heap-capped child dies with a bare SIGABRT', async () => {
    const aborting = new SecurityWorkerHost({heapMb: 96, stepTimeoutMs: 10_000, workerPath: ABORT_WORKER});
    try {
      const validWire = stringArrayEncode(['hello', 'world']);
      const result = await aborting.run({
        type: 'prefix-control',
        seed: 0xf00d,
        target: 'string[] (abort fixture)',
        attacks: [{id: 'count.2^31-then-nothing', expect: 'reject', bytes: encodeVarint(2 ** 31)}],
        validWire,
      });
      expect(result.done).toBeUndefined();
      expect(result.crash).toBeDefined();
      expect(result.crash!.seed).toBe(0xf00d);
      expect(result.crash!.attack).toBe('count.2^31-then-nothing');
      expect(result.crash!.message).toContain('out of memory');
      expect(result.crash!.message).toContain('SIGABRT');
      // Nothing on stderr to match: the signal alone earned the record.
      expect(result.crash!.message).not.toMatch(/heap out of memory|Allocation failed/i);
    } finally {
      aborting.close();
    }
  }, 30_000);

  register('reports the truncation as SB-BOUNDS from inside the worker, and keeps working after a crash', async () => {
    const validWire = stringArrayEncode(['hello', 'world', 'abc']);
    const result = await host.run({
      type: 'prefix-control',
      seed: 0xcafe,
      target: 'string[] (pre-fix)',
      attacks: [{id: 'truncate', expect: 'any', bytes: validWire.subarray(0, validWire.length - 2)}],
      validWire,
    });
    expect(result.crash).toBeUndefined();
    expect(oracles(result.done!.violations)).toContain('SB-BOUNDS');
    expect(result.done!.decodes).toBe(1);
  });
});

describe('SJ oracles fire on broken JSON decoders (negative controls)', () => {
  const identity = (text: string): unknown => JSON.parse(text);
  const accepting = (): boolean => true;

  it('SJ-PROTO fires on a polluted result', () => {
    const polluter = (): unknown => {
      const out: Record<string, unknown> = {};
      out['__proto__'] = {polluted: true};
      return out;
    };
    const result = checkJsonDecode(
      {decoders: {bad: polluter}, validate: accepting},
      {id: 'x', expect: 'any', text: '{}', tree: {}},
      ctx
    );
    expect(oracles(result.violations)).toEqual(['SJ-PROTO']);
  });

  it('SJ-PROTO fires when an encoder writes a prototype-named key back onto the wire', () => {
    const result = checkJsonDecode(
      {
        decoders: {ok: () => ({a: 1})},
        validate: accepting,
        encoders: {bad: () => '{"a":1,"nested":{"__proto__":{"polluted":true}}}'},
      },
      {id: 'object.proto-key', expect: 'any', text: '{}', tree: {}},
      ctx
    );
    expect(oracles(result.violations)).toEqual(['SJ-PROTO']);
    expect(result.violations[0].message).toContain("'__proto__'");
  });

  it('SJ-PROTO fires when the clone of a decoded value carries a foreign prototype', () => {
    const polluter = (): unknown => {
      const out: Record<string, unknown> = {};
      out['__proto__'] = {polluted: true};
      return out;
    };
    const result = checkJsonDecode(
      {decoders: {ok: () => ({a: 1})}, validate: accepting, clone: polluter},
      {id: 'record.proto-key', expect: 'any', text: '{}', tree: {}},
      ctx
    );
    expect(oracles(result.violations)).toEqual(['SJ-PROTO']);
    expect(result.violations[0].message).toContain('ok→clone');
  });

  it('SJ-PROTO stays quiet on an own __proto__ key, a class instance, Map/Set/Date and null prototypes', () => {
    class Point {
      x = 1;
    }
    const out: SecurityViolation[] = [];
    checkPrototypes(defineOwn({}, '__proto__', {polluted: true}), 'p', 'x', ctx, out, '');
    checkPrototypes(new Point(), 'p', 'x', ctx, out, '');
    checkPrototypes({a: new Map([[1, new Set([new Date()])]]), b: Object.create(null)}, 'p', 'x', ctx, out, '');
    expect(out).toEqual([]);
  });

  it('SJ-PARSE fires when parse throws a raw engine error', () => {
    const parse = (): unknown => {
      throw new SyntaxError('Cannot convert 12x to a BigInt');
    };
    const result = checkJsonDecode(
      {parse, decoders: {}, validate: accepting},
      {id: 'x', expect: 'any', text: '"12x"', tree: '12x'},
      ctx
    );
    expect(oracles(result.violations)).toEqual(['SJ-PARSE']);
  });

  it('SJ-REJECT fires when parse accepts a payload the type rules out', () => {
    const result = checkJsonDecode(
      {parse: (v) => v, decoders: {}, validate: accepting},
      {id: 'x', expect: 'reject', text: '"wrong"', tree: 'wrong'},
      ctx
    );
    expect(oracles(result.violations)).toEqual(['SJ-REJECT']);
  });

  it('SJ-REJECT fires when a decoder turns a rejected payload into an accepted value', () => {
    const result = checkJsonDecode(
      {decoders: {lenient: identity}, validate: accepting},
      {id: 'x', expect: 'reject', text: '"wrong"', tree: 'wrong'},
      ctx
    );
    expect(oracles(result.violations)).toEqual(['SJ-REJECT']);
  });

  it('a decoder throw is a histogram entry, not a violation', () => {
    const throwing = (): unknown => {
      throw new RangeError('nope');
    };
    const result = checkJsonDecode(
      {decoders: {t: throwing}, validate: accepting},
      {id: 'x', expect: 'reject', text: '1', tree: 1},
      ctx
    );
    expect(result.violations).toEqual([]);
    expect(result.throws).toEqual({'t:RangeError': 1});
  });

  it('SJ-GLOBAL fires when Object.prototype gained a key', () => {
    const before = snapshotGlobals();
    (Object.prototype as unknown as Record<string, unknown>).zzSecurityCanary = 1;
    try {
      expect(checkGlobals(before, 'x', ctx)?.oracle).toBe('SJ-GLOBAL');
    } finally {
      delete (Object.prototype as unknown as Record<string, unknown>).zzSecurityCanary;
    }
    expect(checkGlobals(before, 'x', ctx)).toBeNull();
  });
});

describe('SF oracles fire on a slow or throwing validator (negative controls)', () => {
  it('SF-PATTERN-TIME fires on catastrophic backtracking', () => {
    // 2^24 backtracking steps: a few hundred ms, well past the 250 ms budget
    // and well short of the test timeout.
    const evil = /^(a+)+$/;
    const result = checkFormatCall('evil', (s) => evil.test(s), 'a'.repeat(24) + '!', 'pump', ctx, 'SF-PATTERN-TIME');
    expect(oracles(result.violations)).toContain('SF-PATTERN-TIME');
  }, 60_000);

  it('SF-TOTAL fires on a throw and on a non-boolean', () => {
    const throwing = checkFormatCall(
      't',
      () => {
        throw new Error('x');
      },
      'in',
      'pump',
      ctx,
      'SF-TIME'
    );
    expect(oracles(throwing.violations)).toEqual(['SF-TOTAL']);
    const stringy = checkFormatCall('s', () => 'yes', 'in', 'pump', ctx, 'SF-TIME');
    expect(oracles(stringy.violations)).toEqual(['SF-TOTAL']);
  });

  it('stays quiet on a linear validator', () => {
    const result = checkFormatCall('ok', (s) => s.length > 0, 'a'.repeat(65536), 'pump', ctx, 'SF-TIME');
    expect(result.violations).toEqual([]);
  });
});
