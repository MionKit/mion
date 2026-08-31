import {createGetValidationErrorsFn, createJsonEncoderFn, createParseFn, type GetValidationErrorsFn} from '@ts-runtypes/core';

// PARSE — `createParseFn<T>()`: restore a JSON.parse output into the typed shape
// and check it, in one walk, throwing RTParseError when it does not match.
//
// Its own small suite rather than a section of the validation one, because parse
// is checked on different axes. A validator is a predicate over a value you
// already hold; parse is a boundary function over untrusted wire data, so what
// has to be true of it is:
//
//   ROUND-TRIP   whatever the encoder wrote, parse reads back
//   TOTALITY     no input, however malformed, escapes as anything but RTParseError
//   RESTORATION  wire forms become real values (a Date, not an ISO string)
//   STRATEGY     undeclared keys are stripped / rejected / kept as asked
//
// The `wire` samples below are JSON-shaped on purpose: a Date arrives as its ISO
// string and a bigint as its decimal string, because that is what JSON.parse
// hands over. Writing them as live values would test a different function.

/** One parse case. `roundTrip` values are live typed values fed through the
 *  encoder; `wire` values are already JSON-shaped, as a real caller's would be. */
export interface ParseCase {
  title: string;
  description: string;
  /** Live values that must survive encode → JSON.parse → parse unchanged. */
  roundTrip: unknown[];
  /** JSON-shaped inputs parse must accept, each with what it must produce. */
  wire: {input: unknown; expect: unknown}[];
  /** JSON-shaped inputs parse must reject. Includes the junk that would make an
   *  unguarded restore throw a raw SyntaxError / RangeError. */
  invalid: unknown[];
  parse: () => (value: unknown) => unknown;
  encode: () => (value: unknown) => string | undefined;
  /** The report the throw must carry, built from the restored value. */
  errors: () => GetValidationErrorsFn;
}

interface Scalars {
  id: number;
  name: string;
  active: boolean;
}

interface Restoring {
  at: Date;
  big: bigint;
  pattern: RegExp;
}

interface Address {
  street: string;
  city: string;
}

interface Order {
  id: string;
  customer: {id: number; email: string};
  items: {sku: string; qty: number}[];
  shipping: Address;
  status: 'pending' | 'paid' | 'shipped';
  total: number;
  note?: string;
}

export const PARSE = {
  scalars: {
    title: 'Flat scalars',
    description: 'Nothing to restore: every member already has its runtime form on the wire, so parse is a check plus a rebuild.',
    roundTrip: [{id: 1, name: 'Ann', active: true} satisfies Scalars],
    wire: [{input: {id: 1, name: 'Ann', active: true}, expect: {id: 1, name: 'Ann', active: true}}],
    invalid: [
      {id: '1', name: 'Ann', active: true}, // wrong type
      {id: 1, name: 'Ann'}, // missing a required key
      null,
      undefined,
      'not-an-object',
      42,
      [],
    ],
    parse: () => createParseFn<Scalars>(),
    encode: () => createJsonEncoderFn<Scalars>(),
    errors: () => createGetValidationErrorsFn<Scalars>(),
  },

  restoring: {
    title: 'Members that need restoring',
    description:
      'A Date, a bigint and a RegExp: the three wire forms that come back as strings and have to be rebuilt. Each is also a leaf whose restore would throw on junk without a guard.',
    roundTrip: [{at: new Date('2020-06-01T00:00:00.000Z'), big: 90071992547409n, pattern: /ab+c/gi} satisfies Restoring],
    wire: [
      {
        input: {at: '2020-06-01T00:00:00.000Z', big: '90071992547409', pattern: '/ab+c/gi'},
        expect: {at: new Date('2020-06-01T00:00:00.000Z'), big: 90071992547409n, pattern: /ab+c/gi},
      },
    ],
    invalid: [
      // BigInt('nope') throws a SyntaxError unguarded.
      {at: '2020-06-01T00:00:00.000Z', big: 'nope', pattern: '/a/'},
      // Fractional, not whole: BigInt(12) is fine and restoreFromJson accepts it,
      // so parse must too. BigInt(1.5) is the one that throws a RangeError.
      {at: '2020-06-01T00:00:00.000Z', big: 1.5, pattern: '/a/'},
      // new Date('junk') yields an Invalid Date rather than throwing.
      {at: 'not a date', big: '1', pattern: '/a/'},
      {at: {}, big: '1', pattern: '/a/'},
      // The RegExp arm indexes .match() output with no null check.
      {at: '2020-06-01T00:00:00.000Z', big: '1', pattern: 'nope'},
      {at: '2020-06-01T00:00:00.000Z', big: '1', pattern: 7},
      null,
      'not-an-object',
    ],
    parse: () => createParseFn<Restoring>(),
    encode: () => createJsonEncoderFn<Restoring>(),
    errors: () => createGetValidationErrorsFn<Restoring>(),
  },

  realworld_order: {
    title: 'Real-world order DTO',
    description:
      'The order shape the validation and strict suites use: a nested object, an array of objects, a named nested type, a union and one optional key.',
    roundTrip: [
      {
        id: 'ord-1',
        customer: {id: 7, email: 'buyer@example.com'},
        items: [{sku: 'A-1', qty: 2}],
        shipping: {street: '1 Main St', city: 'Lisbon'},
        status: 'paid',
        total: 43,
      } satisfies Order,
      // The optional present, and the union on a different member.
      {
        id: 'ord-2',
        customer: {id: 8, email: 'other@example.com'},
        items: [],
        shipping: {street: '2 Side St', city: 'Porto'},
        status: 'shipped',
        total: 0,
        note: 'leave at the door',
      } satisfies Order,
    ],
    wire: [],
    invalid: [
      // Wrong type, missing key, and outside the union.
      {
        id: 'ord-1',
        customer: {id: 7, email: 'buyer@example.com'},
        items: [{sku: 'A-1', qty: 2}],
        shipping: {street: '1 Main St', city: 'Lisbon'},
        status: 'paid',
        total: '43',
      },
      {
        customer: {id: 7, email: 'buyer@example.com'},
        items: [{sku: 'A-1', qty: 2}],
        shipping: {street: '1 Main St', city: 'Lisbon'},
        status: 'paid',
        total: 43,
      },
      {
        id: 'ord-1',
        customer: {id: 7, email: 'buyer@example.com'},
        items: [{sku: 'A-1', qty: 2}],
        shipping: {street: '1 Main St', city: 'Lisbon'},
        status: 'refunded',
        total: 43,
      },
      null,
      'not-an-object',
    ],
    parse: () => createParseFn<Order>(),
    encode: () => createJsonEncoderFn<Order>(),
    errors: () => createGetValidationErrorsFn<Order>(),
  },
} as const satisfies Record<string, ParseCase>;

/** The undeclared-key strategies, kept separate from the cases above because
 *  each needs its own compiled function per strategy rather than per shape. */
export interface StrategyShape {
  id: number;
  nested: {a: string};
}

export const PARSE_STRATEGIES = {
  strip: createParseFn<StrategyShape>(),
  fail: createParseFn<StrategyShape>(undefined, {strategy: 'fail'}),
  preserve: createParseFn<StrategyShape>(undefined, {strategy: 'preserve'}),
};
