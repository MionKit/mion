// Default pools and option values. Ported verbatim from the reference
// mocking/constants.mock.ts — bumping any of these is a deliberate divergence.

import type {MockOptions} from './mockTypes.ts';

export const mockRegExpsList: RegExp[] = [
  /abc/,
  /def/,
  /123/,
  /xyz/,
  /[\w]+/,
  /\d{3}-\d{3}-\d{4}/,
  /[A-Z]/,
  /[a-z]/,
  /\d+/,
  /\s+/,
  /^https:\/\/[\w.-]+\.[a-zA-Z]{2,}$/i,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b\d{2}\/\d{2}\/\d{4}\b/,
  /\b\d{1,2}:\d{2}\b/,
  /\b\d{1,2}:\d{2}:\d{2}\b/,
  /\b\d{1,2}\/\d{1,2}\/\d{2}\b/,
  /\b\d{1,2}\/\d{1,2}\/\d{4}\b/,
  /\b\d{1,2}:\d{2}:\d{2} [AP]M\b/,
  /\b\d{1,2}:\d{2} [AP]M\b/,
  /abc/gi,
  /['"]/,
  /\/(.*)\/(.*)?/,
  /\/\//,
  /`/,
  /\/\\\//,
];

export const stringCharSet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890 .>?<~!@#$%^&*()_+-=[]{}|;:,';

export const emailLocalPartSymbols = '._%-';

export const anyValuesList: unknown[] = [
  {},
  {hello: 'world'},
  [],
  [1, 3, 'hello'],
  'hello',
  1234,
  BigInt(1),
  true,
  false,
  null,
  undefined,
  Symbol('hello'),
  -124,
  0,
  124,
  0.1,
  -0.1,
  Infinity,
  NaN,
  new Date(),
  /abc/,
  new Map([
    ['zero', 0],
    ['one', 1],
    ['two', 2],
    ['three', 3],
    ['four', 4],
  ]),
  new Set(['zero', 1, 2, 3, 'four']),
];

export const mockObjectList: object[] = [
  {},
  {a: 1},
  {b: 2},
  {a: 1, b: 'hello'},
  {a: 1, b: 2, c: 3},
  {a: 'hello', b: 2, c: 'wold', d: 4},
];

export const defaultMockOptions: MockOptions = {
  anyValuesList,
  promiseTimeOut: 1,
  regexpList: mockRegExpsList,
  maxRandomStringLength: 100,
  stringCharSet,
  maxRandomItemsLength: 60,
  optionalProbability: 0.5,
  objectList: mockObjectList,
  maxStackDepth: 50,
  maxMockRecursion: 10,
  nonDataTypes: false,
  invalid: false,
  invalidLeafProbability: 0.85,
  // Undefined ⇒ native randomness (the `MockRandom` instance is built per
  // generation by createMockDataFn; a seeded run sets this via `mock.seed`).
  seed: undefined,
};
