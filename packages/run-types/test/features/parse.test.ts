// End-to-end tests for `createParseFn<T>()` — restore a JSON.parse output into
// the typed shape AND check it, in one walk, throwing RTParseError when it does
// not match.
//
// Two properties carry most of the weight:
//
//   - TOTALITY. Parse is the one family whose whole job is untrusted input, so
//     no leaf may throw a raw TypeError / SyntaxError on junk. The restore arms
//     it builds on assume well-formed data (`BigInt(v)`, `Temporal.X.from(v)`),
//     so every one of those gets a guard, and the junk suite below is what pins
//     it.
//   - The REPORT. `issues` must be exactly what createGetValidationErrorsFn
//     returns for the restored value, so a caller already rendering those needs
//     no second code path.

import {describe, expect, it} from 'vitest';
import {
  createGetValidationErrorsFn,
  createJsonEncoderFn,
  createParseFn,
  createValidateFn,
  getRTFunction,
  RTParseError,
  isSerializationError,
  type InjectTypeFnArgs,
  ParseMismatch,
} from '@mionjs/run-types';

type Address = {street: string; city: string};
type User = {id: number; name: string; address: Address};

describe('createParseFn — happy path', () => {
  it('returns the value when it matches', () => {
    const parseUser = createParseFn<User>();
    const data = {id: 1, name: 'Ada', address: {street: 'Main', city: 'Rome'}};
    expect(parseUser(structuredClone(data))).toEqual(data);
  });

  it('restores a bigint from its wire string', () => {
    const parse = createParseFn<{n: bigint}>();
    expect(parse({n: '42'})).toEqual({n: 42n});
  });

  it('restores a Date from its wire string', () => {
    const parse = createParseFn<{at: Date}>();
    const parsed = parse({at: '2020-01-02T03:04:05.000Z'});
    expect(parsed.at).toBeInstanceOf(Date);
    expect((parsed.at as Date).toISOString()).toBe('2020-01-02T03:04:05.000Z');
  });

  it('restores nested and array members', () => {
    const parse = createParseFn<{items: {id: number}[]}>();
    expect(parse({items: [{id: 1}, {id: 2}]})).toEqual({items: [{id: 1}, {id: 2}]});
  });
});

describe('createParseFn — rejection', () => {
  it('throws RTParseError on a type mismatch', () => {
    const parseUser = createParseFn<User>();
    expect(() => parseUser({id: 'not a number', name: 'Ada', address: {street: 'M', city: 'R'}})).toThrow(RTParseError);
  });

  it('throws when a required property is missing', () => {
    const parseUser = createParseFn<User>();
    expect(() => parseUser({id: 1, name: 'Ada'})).toThrow(RTParseError);
  });

  it('carries the same issues createGetValidationErrorsFn reports', () => {
    const parseUser = createParseFn<User>();
    const errorsOf = createGetValidationErrorsFn<User>();
    const bad = {id: 'nope', name: 'Ada', address: {street: 'M', city: 'R'}};
    let thrown: RTParseError | undefined;
    try {
      parseUser(structuredClone(bad));
    } catch (err) {
      thrown = err as RTParseError;
    }
    expect(thrown).toBeInstanceOf(RTParseError);
    // The report is built from the RESTORED value, which for this payload is the
    // input unchanged (nothing here needs rebuilding).
    expect(thrown!.issues).toEqual(errorsOf(bad));
  });

  it('names the first failure in the message', () => {
    const parseUser = createParseFn<User>();
    expect(() => parseUser({id: 'nope', name: 'Ada', address: {street: 'M', city: 'R'}})).toThrow(/id.*expected number/);
  });
});

// Totality: the restore arms this builds on would throw on these inputs.
// `BigInt('nope')` raises a SyntaxError and `Temporal.X.from(junk)` a
// RangeError. Every one must come back as a clean RTParseError instead.
describe('createParseFn — junk never escapes as a raw throw', () => {
  const cases: Array<[string, () => unknown]> = [
    ['bigint from a non-numeric string', () => createParseFn<{n: bigint}>()({n: 'not a number'})],
    // A WHOLE number is valid input (BigInt(12) works, so restoreFromJson takes
    // it); a fractional one is what BigInt() throws a RangeError on.
    ['bigint from a fractional number', () => createParseFn<{n: bigint}>()({n: 1.5})],
    ['bigint from null', () => createParseFn<{n: bigint}>()({n: null})],
    ['date from junk', () => createParseFn<{at: Date}>()({at: 'not a date'})],
    ['date from an object', () => createParseFn<{at: Date}>()({at: {}})],
    ['object from null', () => createParseFn<User>()(null)],
    ['object from undefined', () => createParseFn<User>()(undefined)],
    ['object from a string', () => createParseFn<User>()('a string')],
    ['object from an array', () => createParseFn<User>()([])],
    ['array from an object', () => createParseFn<{items: number[]}>()({items: {}})],
    ['tuple from a string', () => createParseFn<{pair: [number, string]}>()({pair: 'nope'})],
    ['map from junk', () => createParseFn<{m: Map<string, number>}>()({m: 'nope'})],
    ['set from junk', () => createParseFn<{s: Set<string>}>()({s: 42})],
  ];

  it.each(cases)('%s throws RTParseError, not a raw error', (_label, run) => {
    expect(run).toThrow(RTParseError);
  });

  // Throwing is only half the contract. An error that cannot say WHY tells the
  // caller nothing, so every case must come back with one arm filled in.
  it.each(cases)('%s reports a filled-in issues arm', (_label, run) => {
    try {
      run();
      expect.unreachable();
    } catch (err) {
      const {issues} = err as RTParseError;
      if (isSerializationError(issues)) expect(issues.deserializeError).not.toBe('');
      else expect(issues.length).toBeGreaterThan(0);
    }
  });

  it('a value that deserialized and then failed the check names the leaf', () => {
    try {
      createParseFn<{id: number}>()({id: 'not a number'});
      expect.unreachable();
    } catch (err) {
      const {issues, cause} = err as RTParseError;
      expect(issues).toEqual([{expected: 'number', path: ['id']}]);
      // Nothing threw, so there is no underlying error to carry.
      expect(cause).toBeUndefined();
    }
  });
});

// The two failures are different failures with different fixes, so parse keeps
// them apart the way `@mionjs/router` does: a throw out of the restore is a
// deserialization failure and never gets dressed up as type errors. Its data
// shape is what mion's RpcError<'serialization-error'> carries.
describe('createParseFn — deserializing threw, so no check ever ran', () => {
  type Ambiguous = {n: bigint | string};

  it('round-trips both members through their real wire form', () => {
    const encode = createJsonEncoderFn<Ambiguous>();
    const parse = createParseFn<Ambiguous>();
    expect(parse(JSON.parse(encode({n: 7n})!))).toEqual({n: 7n});
    expect(parse(JSON.parse(encode({n: 'nope'})!))).toEqual({n: 'nope'});
  });

  // A union decodes through an indexed envelope, so a bare value is not its wire
  // form at all. Before the split this reported an EMPTY validation array,
  // because the undecoded value still satisfies the `string` member.
  it('reports the deserialization failure, not an empty validation report', () => {
    try {
      createParseFn<Ambiguous>()({n: 'nope'});
      expect.unreachable();
    } catch (err) {
      const {issues, message} = err as RTParseError;
      expect(isSerializationError(issues)).toBe(true);
      expect((issues as {deserializeError: string}).deserializeError).toMatch(/json decode union/i);
      expect(message).toMatch(/^parse failed, can not deserialize: /);
    }
  });

  it('carries the raw throw as cause, so the real fault stays reachable', () => {
    try {
      createParseFn<Ambiguous>()({n: 'nope'});
      expect.unreachable();
    } catch (err) {
      expect((err as RTParseError).cause).toBeInstanceOf(Error);
    }
  });

  it('a bigint string off the wire form is left for the check, so it reports as a type error', () => {
    // The restore arm converts only the exact decimal wire form (BigInt()
    // itself would take '', ' 4 ' or '0x1f'), so 'not a number' stays a
    // string and the check names the path, not a raw SyntaxError.
    try {
      createParseFn<{n: bigint}>()({n: 'not a number'});
      expect.unreachable();
    } catch (err) {
      const {issues} = err as RTParseError;
      expect(isSerializationError(issues)).toBe(false);
      expect(JSON.stringify(issues)).toMatch(/bigint/i);
    }
  });
});

describe('createParseFn — undeclared keys', () => {
  // Loose is the DEFAULT: no pre-pass, no key check, extras kept. It is the
  // cheapest shape and it is what zod does, which strips only under `.strict()`.
  it('keeps them by default', () => {
    const parseUser = createParseFn<User>();
    const parsed = parseUser({id: 1, name: 'Ada', address: {street: 'M', city: 'R'}, admin: true});
    expect((parsed as Record<string, unknown>).admin).toBe(true);
  });

  it('blanks them under strategy strip', () => {
    const parseUser = createParseFn<User>(undefined, {strategy: 'strip'});
    const parsed = parseUser({id: 1, name: 'Ada', address: {street: 'M', city: 'R'}, admin: true});
    expect((parsed as Record<string, unknown>).admin).toBeUndefined();
  });

  it('blanks them at every depth, not just the root', () => {
    const parseUser = createParseFn<User>(undefined, {strategy: 'strip'});
    const parsed = parseUser({id: 1, name: 'Ada', address: {street: 'M', city: 'R', zip: '00184'}});
    expect(((parsed as User).address as Record<string, unknown>).zip).toBeUndefined();
  });

  it('rejects them under strategy fail', () => {
    const parseUser = createParseFn<User>(undefined, {strategy: 'fail'});
    const clean = {id: 1, name: 'Ada', address: {street: 'M', city: 'R'}};
    expect(parseUser(structuredClone(clean))).toEqual(clean);
    expect(() => parseUser({...clean, admin: true})).toThrow(RTParseError);
  });

  it('keeps them under strategy preserve', () => {
    const parseUser = createParseFn<User>(undefined, {strategy: 'preserve'});
    const parsed = parseUser({id: 1, name: 'Ada', address: {street: 'M', city: 'R'}, admin: true});
    expect((parsed as Record<string, unknown>).admin).toBe(true);
  });
});

// Round-trip: whatever the encoder writes, parse must read back unchanged. This
// is the property the fuzz oracle generalises.
describe('createParseFn — round-trips the encoder', () => {
  it('recovers a value through encode + JSON.parse + parse', () => {
    type Payload = {id: number; name: string; at: Date; big: bigint; tags: string[]};
    const encode = createJsonEncoderFn<Payload>();
    const parse = createParseFn<Payload>();
    const original: Payload = {
      id: 7,
      name: 'Ada',
      at: new Date('2020-06-01T00:00:00.000Z'),
      big: 90071992547409n,
      tags: ['x', 'y'],
    };
    expect(parse(JSON.parse(encode(original)!))).toEqual(original);
  });
});

// A parsed value must satisfy the validator for the same type — the two families
// are compiled from one reflection graph, so a disagreement means one of them is
// wrong.
describe('createParseFn — agrees with createValidateFn', () => {
  it('everything parse returns passes validate', () => {
    const parse = createParseFn<User>();
    const isUser = createValidateFn<User>();
    expect(isUser(parse({id: 1, name: 'Ada', address: {street: 'M', city: 'R'}}))).toBe(true);
  });

  it('rejects exactly what validate rejects, once restored', () => {
    const parse = createParseFn<User>();
    const isUser = createValidateFn<User>();
    for (const value of [
      {id: 1, name: 'Ada', address: {street: 'M', city: 'R'}},
      {id: 'x', name: 'Ada', address: {street: 'M', city: 'R'}},
      {id: 1, name: 'Ada'},
      null,
      'nope',
    ]) {
      let parsed: unknown;
      let threw = false;
      try {
        parsed = parse(structuredClone(value));
      } catch {
        threw = true;
      }
      expect(threw).toBe(!isUser(structuredClone(value)));
      if (!threw) expect(isUser(parsed)).toBe(true);
    }
  });
});

// Parse fuses restoreFromJson with validate, so it must accept exactly what that
// composition accepts — including a value that is ALREADY in its runtime form.
// `BigInt(42n)` and `new Date(dateObj)` are both fine, so a guard that only let
// strings through made parse stricter than the function it replaces, and made
// parse(parse(x)) throw where parse(x) succeeded. Found by the O19 fuzz oracle.
describe('createParseFn — already-restored input', () => {
  it('accepts a live bigint, a whole number, and the wire string alike', () => {
    const parse = createParseFn<{n: bigint}>();
    expect(parse({n: '42'})).toEqual({n: 42n});
    expect(parse({n: 42n})).toEqual({n: 42n});
    expect(parse({n: 42})).toEqual({n: 42n});
    // Still rejects what BigInt() would throw on.
    expect(() => parse({n: 1.5})).toThrow(RTParseError);
    expect(() => parse({n: 'nope'})).toThrow(RTParseError);
  });

  it('accepts a live Date as well as its wire string', () => {
    const parse = createParseFn<{at: Date}>();
    const at = new Date('2020-01-02T03:04:05.000Z');
    expect(parse({at})).toEqual({at});
    expect(parse({at: '2020-01-02T03:04:05.000Z'})).toEqual({at});
    // An Invalid Date instance is still a mismatch, like any unparseable input.
    expect(() => parse({at: new Date('junk')})).toThrow(RTParseError);
  });

  it('is idempotent: parsing its own output succeeds', () => {
    const parse = createParseFn<{n: bigint; at: Date}>();
    const once = parse({n: '7', at: '2020-01-02T03:04:05.000Z'});
    expect(parse(structuredClone(once))).toEqual(once);
  });
});

// The RAW compiled body, recovered the way a framework wrapper recovers it. It
// returns the typed value or THROWS — no status, no wrapper object on the happy
// path.
function recoverParse<T>(_val?: T, id?: InjectTypeFnArgs<T, 'prs'>) {
  return getRTFunction<'prs'>(id);
}

describe('the raw parse body — throwing contract', () => {
  it('throws ParseMismatch, not RTParseError, and carries the restored value', () => {
    const parse = recoverParse<{at: Date; id: number}>();
    let thrown: unknown;
    try {
      parse({at: '2020-01-02T03:04:05.000Z', id: 'not a number'});
    } catch (err) {
      thrown = err;
    }
    // The raw body never builds a report — that costs a second walk the caller
    // may not want. createParseFn is what turns this into an RTParseError.
    expect(thrown).toBeInstanceOf(ParseMismatch);
    expect(thrown).not.toBeInstanceOf(RTParseError);
    // The value it carries is RESTORED, which is what makes the report accurate:
    // a Date reported as a string would be a false error.
    const carried = (thrown as ParseMismatch).value as {at: unknown};
    expect(carried.at).toBeInstanceOf(Date);
  });

  it('returns the typed value with no wrapper when it matches', () => {
    const parse = recoverParse<{id: number}>();
    expect(parse({id: 1})).toEqual({id: 1});
  });
});
