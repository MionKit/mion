/* eslint-disable @typescript-eslint/no-unused-vars */
// (fixture handlers below take the parameters their types declare and ignore them, like the test server)
//
// sechttp: throw hostile requests at the mion router and check the rules that
// must hold for EVERY request, whatever it carries.
//
// Two layers. The in-process layer drives `dispatchRoute` directly with seeded
// attacks (random paths including prototype names, JSON bodies mutated from
// valid ones, binary bodies with flipped bits, inflated counts and trailing
// bytes, junk query bodies, hostile batch ids, hostile headers). The
// socket layer starts the node adapter on a free port and sends raw HTTP
// (bad content-length, chunked overflow, junk `?data=`, prototype header
// names, garbage), which is where the adapter rules live.
//
// Oracles (every response, both layers):
//   SH-ALIVE     the router (and the process) still answers a known-good request
//   SH-ENVELOPE  a well-formed envelope: a 2xx/4xx status, every thrown error
//                carries a string type and publicMessage and nothing internal,
//                the x-rpc-error header is a plain token
//   SH-NO5XX     malformed input never yields a 5xx
//   SH-NOLEAK    no engine error text and no file path in any response
//   SH-TIME      one request inside its time budget
//   SH-PROTO     Object.prototype untouched after the run
//
// The seeded loop, crash guard and budget come from the RunTypes fuzz core
// (real shipped helpers, imported, never copied).

import {createConnection} from 'node:net';
import type {Server} from 'node:http';
import {runFuzzLoop, type FuzzLoopResult} from '../../../../run-types/test/fuzz/core/runLoop.ts';
import {mulberry32} from '../../../../run-types/test/fuzz/core/seededRng.ts';
import {initRouter, registerRoutes, resetRouter, getRouteExecutionChain} from '../../../src/router.ts';
import {dispatchRoute} from '../../../src/dispatch.ts';
import {headersFromRecord} from '../../../src/lib/headers.ts';
import {decodeQueryBody} from '../../../src/lib/queryBody.ts';
import {route, middleFn, headersFn} from '../../../src/lib/handlers.ts';
import {MION_BATCH_PATH} from '@mionjs/core';
import {registerBatches} from '../../../src/batches.ts';
import type {MionResponse} from '../../../src/types/context.ts';
import {HeadersSubset, MION_ROUTES, SerializerModes, serializeBinaryBody, toBase64Url} from '@mionjs/core';
import {binaryTestRoutes} from '@mionjs/test-server';
// relative on purpose: the router package does not depend on its own adapter, the lane does
import {setNodeHttpOpts, startNodeServer, resetNodeHttpOpts} from '../../../../platform-node/src/mionHttp.ts';

// ############# oracles #############

export type HttpOracleId = 'SH-ALIVE' | 'SH-ENVELOPE' | 'SH-NO5XX' | 'SH-NOLEAK' | 'SH-TIME' | 'SH-PROTO';

export interface HttpViolation {
  oracle: HttpOracleId;
  attack: string;
  seed: number;
  message: string;
  input: string;
}

export interface HttpFuzzReport extends FuzzLoopResult {
  violations: HttpViolation[];
  /** attacks applied, by attack id */
  applied: Record<string, number>;
  /** responses seen, by status code */
  statuses: Record<string, number>;
}

/** Text that only an engine error or a stack trace carries. */
const LEAK_PHRASES = [
  /Maximum call stack/,
  /Unexpected token/,
  /is not a function/,
  /Cannot read propert/,
  /Cannot convert/,
  /DataView/,
  /JSON at position/,
  /BinaryDecodeError/,
  /RangeError|TypeError|SyntaxError/,
  /\n\s+at /,
  /\/home\/|\/packages\/|node_modules/,
  /\.ts:\d+/,
];
const ERROR_HEADER = /^[A-Za-z0-9_.:@-]{1,128}$/;
const ENVELOPE_KEYS = new Set(['mion@isΣrrθr', 'type', 'publicMessage', 'errorData', 'id', 'statusCode']);
export const REQUEST_BUDGET_MS = 1500;

function responseText(response: MionResponse): string {
  if (response.serializer === SerializerModes.stringifyJson) return String(response.rawBody ?? '');
  if (response.serializer === SerializerModes.binary) return JSON.stringify(response.body);
  return JSON.stringify(response.body);
}

/** The per-response oracles over an in-process dispatch. */
export function checkResponse(response: MionResponse, elapsedMs: number): Array<[HttpOracleId, string]> {
  const out: Array<[HttpOracleId, string]> = [];
  if (elapsedMs > REQUEST_BUDGET_MS) out.push(['SH-TIME', `took ${Math.round(elapsedMs)} ms`]);
  const status = response.statusCode;
  if (typeof status !== 'number' || status < 200 || status > 599) out.push(['SH-ENVELOPE', `status ${String(status)}`]);
  if (status >= 500) out.push(['SH-NO5XX', `status ${status}`]);
  const header = response.headers.get('x-rpc-error');
  if (header != null && !ERROR_HEADER.test(header))
    out.push(['SH-ENVELOPE', `x-rpc-error header is not a token: ${JSON.stringify(header)}`]);
  if (response.hasErrors && header == null) out.push(['SH-ENVELOPE', 'an error response without the x-rpc-error header']);
  if (response.serializer === SerializerModes.binary && !response.binSerializer)
    out.push(['SH-ENVELOPE', 'binary response without a payload']);
  const thrown = (response.body as Record<string, unknown>)[MION_ROUTES.thrownErrors];
  if (response.hasErrors && (!thrown || typeof thrown !== 'object'))
    out.push(['SH-ENVELOPE', 'hasErrors without a @thrownErrors object']);
  if (thrown && typeof thrown === 'object') {
    for (const [id, err] of Object.entries(thrown as Record<string, Record<string, unknown>>)) {
      if (!err || typeof err !== 'object') out.push(['SH-ENVELOPE', `thrown error '${id}' is not an object`]);
      else {
        if (typeof err.type !== 'string') out.push(['SH-ENVELOPE', `thrown error '${id}' has no string type`]);
        if (typeof err.publicMessage !== 'string') out.push(['SH-ENVELOPE', `thrown error '${id}' has no string publicMessage`]);
        for (const key of Object.keys(err))
          if (!ENVELOPE_KEYS.has(key)) out.push(['SH-ENVELOPE', `thrown error '${id}' exposes '${key}'`]);
      }
    }
  }
  const text = responseText(response);
  for (const phrase of LEAK_PHRASES) {
    if (phrase.test(text)) {
      out.push(['SH-NOLEAK', `response text matches ${phrase}`]);
      break;
    }
  }
  return out;
}

// ############# the fixture router #############

type User = {name: string; surname: string; age: number; tags: string[]; joined: Date; address?: {city: string; zip: string}};
type Tree = {value: number; children: Tree[]};
type Either = Date | bigint | {kind: 'a'; n: number} | string;

const routes = {
  auth: headersFn((ctx, h: HeadersSubset<'authorization'>): void => undefined),
  session: middleFn((ctx, token?: string): {ok: boolean} => ({ok: token === 'good'})),
  echoUser: route((ctx, user: User): User => user),
  sumAll: route((ctx, numbers: number[]): number => numbers.reduce((a, b) => a + b, 0)),
  withDate: route((ctx, when: Date): number => when.getTime()),
  withCollections: route((ctx, lookup: Map<string, number>, tags: Set<string>): number => lookup.size + tags.size),
  either: route((ctx, value: Either): string => typeof value),
  tree: route((ctx, tree: Tree): number => tree.children.length),
  big: route((ctx, n: bigint): string => n.toString()),
  setHeader: route((ctx, value: string): string => {
    ctx.response.headers.set('x-echo', value);
    return value;
  }),
  boom: route((ctx): void => {
    throw new Error('handler exploded with a secret /home/user/app.ts:12');
  }),
  binary: binaryTestRoutes,
};

const VALID_USER: User = {
  name: 'Leo',
  surname: 'Tungsten',
  age: 42,
  tags: ['a', 'b'],
  joined: new Date('2024-01-02T03:04:05.000Z'),
  address: {city: 'x', zip: '1'},
};

/** A valid body per JSON route, as the client would send it. */
const validBodies: Record<string, unknown> = {
  echoUser: {echoUser: [VALID_USER]},
  sumAll: {sumAll: [[1, 2, 3]]},
  withDate: {withDate: [new Date('2024-01-02T03:04:05.000Z')]},
  withCollections: {withCollections: [[['k', 1]], ['t']]},
  either: {either: [[0, '2024-01-02T03:04:05.000Z']]},
  tree: {tree: [{value: 1, children: [{value: 2, children: []}]}]},
  big: {big: ['123']},
  setHeader: {setHeader: ['plain']},
  boom: {boom: []},
};

const JSON_ROUTES = Object.keys(validBodies);
const BINARY_ROUTES = [
  'echo',
  'addNumbers',
  'getSimpleUser',
  'processSimpleUser',
  'sumArray',
  'reverseStrings',
  'createComplexUser',
  'createNestedData',
  'greet',
];
const PROTO_NAMES = ['constructor', '__proto__', 'prototype', 'toString', 'valueOf', 'hasOwnProperty'];
const JUNK_VALUES: unknown[] = [
  null,
  true,
  0,
  -1,
  1.5,
  '',
  'x'.repeat(1000),
  [],
  {},
  JSON.parse('{"__proto__": {"polluted": 1}}'),
  {length: 1e9},
  '2024-13-45',
  '12x',
  [9, '1'],
  [null],
  'Symbol:x',
  '\u0000',
  '\ud800',
];

// ############# seeded helpers #############

export interface Rng {
  next(): number;
  int(max: number): number;
  pick<T>(items: readonly T[]): T;
  chance(p: number): boolean;
}

export function makeRng(seed: number): Rng {
  const next = mulberry32(seed);
  return {
    next,
    int: (max) => Math.floor(next() * max),
    pick: (items) => items[Math.floor(next() * items.length)],
    chance: (p) => next() < p,
  };
}

function protoSnapshot(): string {
  return JSON.stringify([
    Object.getOwnPropertyNames(Object.prototype).sort(),
    Object.getOwnPropertyNames(Array.prototype).sort(),
  ]);
}

// ############# JSON body attacks #############

type JsonAttack = {id: string; run: (rng: Rng, body: unknown) => unknown};

/** Replace the value at a random path in the parsed body. */
function mutateAtRandomPath(rng: Rng, node: unknown, replacement: unknown): unknown {
  if (!node || typeof node !== 'object') return replacement;
  if (rng.chance(0.3)) return replacement;
  if (Array.isArray(node)) {
    if (node.length === 0) return replacement;
    const copy = node.slice();
    const i = rng.int(copy.length);
    copy[i] = mutateAtRandomPath(rng, copy[i], replacement);
    return copy;
  }
  const keys = Object.keys(node);
  if (keys.length === 0) return replacement;
  const copy: Record<string, unknown> = {...(node as Record<string, unknown>)};
  const key = rng.pick(keys);
  copy[key] = mutateAtRandomPath(rng, copy[key], replacement);
  return copy;
}

const jsonAttacks: JsonAttack[] = [
  {id: 'json.wrong-type', run: (rng, body) => mutateAtRandomPath(rng, body, rng.pick(JUNK_VALUES))},
  {
    id: 'json.proto-key',
    run: (rng, body) => mutateAtRandomPath(rng, body, JSON.parse(`{"${rng.pick(PROTO_NAMES)}": {"polluted": 1}}`)),
  },
  {id: 'json.drop-key', run: (rng, body) => mutateAtRandomPath(rng, body, undefined)},
  {
    id: 'json.deep-nest',
    run: (rng, body) => {
      const depth = 2000 + rng.int(4000);
      return mutateAtRandomPath(rng, body, JSON.parse('['.repeat(depth) + '1' + ']'.repeat(depth)));
    },
  },
  {
    id: 'json.huge-array',
    run: (rng, body) => mutateAtRandomPath(rng, body, new Array(1000 + rng.int(4000)).fill(rng.pick(JUNK_VALUES))),
  },
  {id: 'json.non-object-root', run: (rng) => rng.pick([null, 0, false, '', 'str', 1e3, [], [1, 2]])},
  {
    id: 'json.unknown-route',
    run: (rng, body) => ({[rng.pick([...PROTO_NAMES, 'nope', 'binary/echo', ''])]: [1], ...(body as object)}),
  },
  {
    id: 'json.params-not-array',
    run: (rng, body) => Object.fromEntries(Object.entries(body as object).map(([k]) => [k, rng.pick(JUNK_VALUES)])),
  },
  {
    id: 'json.extra-params',
    run: (rng, body) =>
      Object.fromEntries(
        Object.entries(body as object).map(([k, v]) => [
          k,
          [...(v as unknown[]), ...new Array(1 + rng.int(20)).fill(rng.pick(JUNK_VALUES))],
        ])
      ),
  },
];

/** Attacks on the JSON TEXT rather than the parsed tree. */
const textAttacks: Array<{id: string; run: (rng: Rng, text: string) => string}> = [
  {id: 'text.truncate', run: (rng, text) => text.slice(0, rng.int(text.length))},
  {
    id: 'text.flip',
    run: (rng, text) =>
      text.slice(0, rng.int(text.length)) +
      rng.pick(['"', '{', '}', '[', ']', ',', ':', '\\', '\u0000', 'é']) +
      text.slice(rng.int(text.length)),
  },
  {
    id: 'text.deep-nest',
    run: (rng) => {
      const depth = 3000 + rng.int(30000);
      // sometimes cut short, so both a valid deep tree and a truncated one reach the router
      const close = rng.chance(0.5) ? depth : rng.int(depth);
      return `{"tree":[${'{"value":1,"children":['.repeat(depth)}{"value":1,"children":[]}${']}'.repeat(close)}]}`;
    },
  },
  {
    id: 'text.number-edge',
    run: (rng) => `{"sumAll":[[${rng.pick(['1e999', '-1e999', '1e-999', '0.1e1', '-0', '9007199254740993', '1e309'])}]]}`,
  },
  {
    id: 'text.duplicate-key',
    run: () => '{"echoUser":[{"name":"a","name":"b","surname":"c","age":1,"tags":[],"joined":"2024-01-02T03:04:05.000Z"}]}',
  },
  {id: 'text.huge', run: (rng) => `{"echoUser":[{"name":"${'x'.repeat(50_000 + rng.int(100_000))}"}]}`},
  {id: 'text.junk', run: (rng) => Array.from({length: 1 + rng.int(64)}, () => String.fromCharCode(rng.int(0x7f))).join('')},
];

// ############# binary body attacks #############

function validBinaryWire(routeId: string): Uint8Array {
  const path = `/binary/${routeId}`;
  const chain = getRouteExecutionChain(path)!.methods;
  const params: Record<string, unknown[]> = {
    echo: ['hi'],
    addNumbers: [1, 2],
    getSimpleUser: ['Ana', 30],
    processSimpleUser: [{name: 'Ana', age: 30}],
    sumArray: [[1, 2, 3]],
    reverseStrings: [['a', 'b']],
    createComplexUser: ['id-1', 'Ana', 'ana@example.com'],
    createNestedData: ['deep', [1, 2, 3]],
    greet: ['Ana'],
  };
  const body = {[`binary/${routeId}`]: params[routeId] ?? []};
  return new Uint8Array(serializeBinaryBody(path, chain, body, false).serializer.getBuffer());
}

const binaryAttacks: Array<{id: string; run: (rng: Rng, wire: Uint8Array) => Uint8Array}> = [
  {
    id: 'bin.bit-flip',
    run: (rng, wire) => {
      const copy = new Uint8Array(wire);
      for (let n = 1 + rng.int(3); n > 0; n--) copy[rng.int(copy.length)] ^= 1 << rng.int(8);
      return copy;
    },
  },
  {id: 'bin.truncate', run: (rng, wire) => wire.slice(0, rng.int(wire.length))},
  {
    id: 'bin.inflate-varint',
    run: (rng, wire) => {
      const copy = new Uint8Array(wire);
      const at = 4 + rng.int(Math.max(1, copy.length - 4));
      copy[at] = 0x80 | (copy[at] ?? 0);
      return copy;
    },
  },
  {
    id: 'bin.count-bomb',
    run: (rng, wire) => {
      const copy = new Uint8Array(wire);
      new DataView(copy.buffer).setUint32(0, rng.pick([0xffffffff, 0x80000000, 1000, 2]), true);
      return copy;
    },
  },
  {
    id: 'bin.trailing',
    run: (rng, wire) => {
      const out = new Uint8Array(wire.length + 1 + rng.int(8));
      out.set(wire);
      for (let i = wire.length; i < out.length; i++) out[i] = rng.int(256);
      return out;
    },
  },
  {id: 'bin.random', run: (rng) => Uint8Array.from({length: rng.int(64)}, () => rng.int(256))},
  {
    id: 'bin.proto-key',
    run: (rng) => {
      const key = new TextEncoder().encode(rng.pick(PROTO_NAMES));
      const out = new Uint8Array(5 + key.length);
      new DataView(out.buffer).setUint32(0, 1, true);
      out[4] = key.length;
      out.set(key, 5);
      return out;
    },
  },
];

// ############# query, batch and header attacks #############

const queryAttacks: Array<{id: string; run: (rng: Rng) => string}> = [
  {id: 'query.junk-base64', run: (rng) => `data=${rng.pick(['!', 'a', 'YQ=', '%%%', 'YW..Jj', '=', '===', 'ab\u0000'])}`},
  {
    id: 'query.valid-junk-json',
    run: (rng) => `data=${toBase64Url(rng.pick(['null', '0', '[', '{"echoUser":1}', '{"__proto__":{"x":1}}']))}`,
  },
  {id: 'query.huge', run: (rng) => `data=${'A'.repeat(4 * (16_000 + rng.int(30_000)))}`},
];

/** The one batch the fixture server registers: a batch request may only name an id the build
 *  compiled in, so every attack here is an id the table does not hold, or a known id with a
 *  hostile body. Nothing about the chain travels any more. */
const KNOWN_BATCH_ID = 'b_fuzzKnown';
const KNOWN_BATCH = {routes: ['echoUser', 'sumAll']};

const batchAttacks: Array<{id: string; run: (rng: Rng) => {urlQuery: string | undefined; body: string}}> = [
  {
    id: 'batch.unknown-id',
    run: (rng) => ({
      urlQuery: `id=b_${rng.pick(['nope', 'x'.repeat(7), 'fuzzKnowN'])}`,
      body: JSON.stringify(validBodies.echoUser),
    }),
  },
  {
    id: 'batch.junk-id',
    run: (rng) => ({
      urlQuery: `id=${rng.pick([
        ...PROTO_NAMES,
        '',
        'b_' + 'A'.repeat(1000 + rng.int(20_000)),
        '%E0%A4%A',
        '%00',
        '\u0000',
        '{"routes":["/echoUser"]}',
        '../echoUser',
        'b_fuzzKnown&id=b_nope',
      ])}`,
      body: JSON.stringify(validBodies.echoUser),
    }),
  },
  {
    id: 'batch.missing-id',
    run: (rng) => ({
      urlQuery: rng.pick([undefined, '', 'data=' + toBase64Url('{"routes":["/echoUser"]}'), 'ids=' + KNOWN_BATCH_ID]),
      body: JSON.stringify(validBodies.echoUser),
    }),
  },
  {
    id: 'batch.known-id-bad-body',
    run: (rng) => ({
      urlQuery: `id=${KNOWN_BATCH_ID}`,
      body: rng.pick([
        '',
        'null',
        '[]',
        '{"__proto__":{"x":1}}',
        '{"echoUser":1}',
        '{"sumAll":[[1,2]],"echoUser":[',
        'x'.repeat(70_000),
      ]),
    }),
  },
];

function hostileHeaders(rng: Rng): Record<string, string> {
  const out: Record<string, string> = {};
  for (let n = rng.int(4); n > 0; n--) {
    const name = rng.pick([...PROTO_NAMES, 'authorization', 'content-type', 'x-' + 'h'.repeat(rng.int(200))]);
    out[name] = rng.pick(['1', '', 'x'.repeat(rng.int(5000)), 'a\r\nx-injected: 1', '\u0000', 'Bearer ' + 'y'.repeat(100)]);
  }
  return out;
}

function hostilePath(rng: Rng): string {
  return rng.pick([
    `/${rng.pick(JSON_ROUTES)}`,
    `/binary/${rng.pick(BINARY_ROUTES)}`,
    `/${rng.pick(PROTO_NAMES)}`,
    '/nope',
    '/',
    '',
    '/echoUser/',
    '/a/../echoUser',
    '/echoUser%00',
    '/' + 'p'.repeat(1000 + rng.int(3000)),
    MION_BATCH_PATH,
    '/binary',
  ]);
}

// ############# the lane #############

interface Lane {
  violations: HttpViolation[];
  applied: Record<string, number>;
  statuses: Record<string, number>;
  protoBefore: string;
}

async function openLane(): Promise<Lane> {
  resetRouter();
  await initRouter({contextDataFactory: () => ({user: null}), maxBodySize: 64_000, maxContextPoolSize: 8});
  await registerRoutes(routes);
  // the one batch the fixture server knows, so a known-id attack reaches a real chain
  registerBatches({[KNOWN_BATCH_ID]: KNOWN_BATCH});
  return {violations: [], applied: {}, statuses: {}, protoBefore: protoSnapshot()};
}

interface Attack {
  id: string;
  path: string;
  body: string | Uint8Array | undefined;
  bodyType?: 'json' | 'binary';
  urlQuery?: string;
  headers: Record<string, string>;
}

/** The fixture router has a headers middleFn on every route, so a request that means to reach a
 *  handler carries the header; hostile header sets sometimes drop it on purpose. */
const AUTH_HEADERS = {authorization: 'Bearer ok'};

function buildAttack(rng: Rng): Attack {
  const kind = rng.pick(['json', 'json', 'text', 'binary', 'binary', 'query', 'batch', 'headers', 'path'] as const);
  const hostile = kind === 'headers' || rng.chance(0.2);
  const headers = hostile ? {...(rng.chance(0.5) ? AUTH_HEADERS : {}), ...hostileHeaders(rng)} : {...AUTH_HEADERS};
  switch (kind) {
    case 'json': {
      const routeId = rng.pick(JSON_ROUTES);
      const attack = rng.pick(jsonAttacks);
      let body = JSON.parse(JSON.stringify(validBodies[routeId]));
      for (let n = 1 + rng.int(2); n > 0; n--) body = attack.run(rng, body);
      return {id: attack.id, path: `/${routeId}`, body: JSON.stringify(body) ?? 'undefined', headers};
    }
    case 'text': {
      const routeId = rng.pick(JSON_ROUTES);
      const attack = rng.pick(textAttacks);
      return {id: attack.id, path: `/${routeId}`, body: attack.run(rng, JSON.stringify(validBodies[routeId])), headers};
    }
    case 'binary': {
      const routeId = rng.pick(BINARY_ROUTES);
      const attack = rng.pick(binaryAttacks);
      return {
        id: attack.id,
        path: `/binary/${routeId}`,
        body: attack.run(rng, validBinaryWire(routeId)),
        bodyType: 'binary',
        headers,
      };
    }
    case 'query': {
      const attack = rng.pick(queryAttacks);
      return {id: attack.id, path: `/${rng.pick(JSON_ROUTES)}`, body: undefined, urlQuery: attack.run(rng), headers};
    }
    case 'batch': {
      const attack = rng.pick(batchAttacks);
      const {urlQuery, body} = attack.run(rng);
      return {id: attack.id, path: MION_BATCH_PATH, body, urlQuery, headers};
    }
    case 'headers':
      return {
        id: 'headers.hostile',
        path: `/${rng.pick(JSON_ROUTES)}`,
        body: JSON.stringify(validBodies[rng.pick(JSON_ROUTES)]),
        headers,
      };
    case 'path':
      return {id: 'path.hostile', path: hostilePath(rng), body: JSON.stringify(validBodies.echoUser), headers};
  }
}

function describeAttack(attack: Attack): string {
  const body =
    attack.body instanceof Uint8Array
      ? `<${attack.body.length} bytes: ${Array.from(attack.body.slice(0, 24)).join(',')}>`
      : String(attack.body).slice(0, 200);
  return `${attack.path}${attack.urlQuery ? `?${attack.urlQuery.slice(0, 80)}` : ''} headers=${JSON.stringify(attack.headers).slice(0, 120)} body=${body}`;
}

/** One in-process request, adapter-style: the query body is decoded first, as every adapter does. */
async function dispatchAttack(attack: Attack): Promise<MionResponse> {
  const reqHeaders = headersFromRecord(attack.headers);
  const respHeaders = headersFromRecord({});
  let body: string | Uint8Array | undefined = attack.body;
  let bodyType = attack.bodyType === 'binary' ? SerializerModes.binary : SerializerModes.stringifyJson;
  try {
    const query = decodeQueryBody(attack.urlQuery, body);
    if (query) {
      body = query.rawBody;
      bodyType = query.bodyType;
    }
  } catch (err) {
    // an adapter turns this into the fatal envelope; the in-process layer treats it as answered
    const {getRouterFatalErrorResponse} = await import('../../../src/lib/dispatchError.ts');
    return getRouterFatalErrorResponse(err as never, respHeaders);
  }
  return dispatchRoute(
    attack.path,
    body as never,
    reqHeaders,
    respHeaders,
    {headers: reqHeaders, body},
    {},
    bodyType,
    attack.urlQuery
  );
}

async function probeAlive(): Promise<string | null> {
  const body = JSON.stringify(validBodies.echoUser);
  const h = headersFromRecord({...AUTH_HEADERS});
  const response = await dispatchRoute('/echoUser', body, h, headersFromRecord({}), {headers: h, body}, {});
  if (response.statusCode !== 200 || response.hasErrors)
    return `status ${response.statusCode} ${JSON.stringify(response.body).slice(0, 200)}`;
  const echoed = (response.body as {echoUser: User}).echoUser;
  if (!echoed || echoed.name !== 'Leo' || !(echoed.joined instanceof Date))
    return `unexpected echo ${JSON.stringify(echoed).slice(0, 200)}`;
  return null;
}

async function attackOnce(lane: Lane, rng: Rng, seed: number): Promise<void> {
  const attack = buildAttack(rng);
  lane.applied[attack.id] = (lane.applied[attack.id] ?? 0) + 1;
  const input = describeAttack(attack);
  const push = (oracle: HttpOracleId, message: string) => lane.violations.push({oracle, attack: attack.id, seed, message, input});
  const started = performance.now();
  let response: MionResponse;
  try {
    response = await dispatchAttack(attack);
  } catch (err) {
    // dispatchRoute rejects only for a batch id the router refuses before the chain exists:
    // an adapter turns that into the fatal envelope, so it counts as a typed answer, never a crash
    const typed = err && typeof err === 'object' && typeof (err as {type?: unknown}).type === 'string';
    if (!typed) push('SH-ENVELOPE', `dispatch threw a non-mion error: ${String(err).slice(0, 200)}`);
    else if (LEAK_PHRASES.some((phrase) => phrase.test(JSON.stringify(err))))
      push('SH-NOLEAK', `the thrown envelope carries engine text`);
    lane.statuses.thrown = (lane.statuses.thrown ?? 0) + 1;
    const alive = await probeAlive();
    if (alive) push('SH-ALIVE', alive);
    return;
  }
  const elapsed = performance.now() - started;
  lane.statuses[String(response.statusCode)] = (lane.statuses[String(response.statusCode)] ?? 0) + 1;
  for (const [oracle, message] of checkResponse(response, elapsed)) push(oracle, message);
  const alive = await probeAlive();
  if (alive) push('SH-ALIVE', alive);
}

function finishReport(lane: Lane, loop: FuzzLoopResult): HttpFuzzReport {
  if (protoSnapshot() !== lane.protoBefore)
    lane.violations.push({
      oracle: 'SH-PROTO',
      attack: 'run',
      seed: loop.seed,
      message: 'a prototype changed during the run',
      input: '',
    });
  delete (Object.prototype as Record<string, unknown>).polluted;
  return {...loop, violations: lane.violations, applied: lane.applied, statuses: lane.statuses};
}

/** Replay ONE step by its step seed (the `seed=0x…` a violation or crash record prints): the same
 *  attack is rebuilt and dispatched, and whatever it throws is rethrown, so a crash can be read. */
export async function replayAttack(stepSeed: number): Promise<{attack: string; violations: HttpViolation[]}> {
  const lane = await openLane();
  await attackOnce(lane, makeRng(stepSeed), stepSeed);
  return {attack: describeAttack(buildAttack(makeRng(stepSeed))), violations: lane.violations};
}

export interface HttpFuzzOptions {
  seed?: number;
  iterations?: number;
}

const DEFAULT_SEED = 0x5ec477;
const DEFAULT_ITERATIONS = 60;

export async function runHttpFuzz(options: HttpFuzzOptions = {}): Promise<HttpFuzzReport> {
  const lane = await openLane();
  const loop = await runFuzzLoop<HttpViolation>(
    {
      seed: options.seed,
      defaultSeed: DEFAULT_SEED,
      rounds: options.iterations ?? DEFAULT_ITERATIONS,
      violations: lane.violations,
    },
    (round) => round.run('sechttp', round.round, (stepSeed) => attackOnce(lane, makeRng(stepSeed), stepSeed))
  );
  return finishReport(lane, loop);
}

export async function runHttpFuzzForDuration(
  durationMs: number,
  options: HttpFuzzOptions = {},
  onViolation?: (v: HttpViolation) => void
): Promise<HttpFuzzReport> {
  const lane = await openLane();
  const loop = await runFuzzLoop<HttpViolation>(
    {seed: options.seed, durationMs, violations: lane.violations, onViolation},
    (round) => round.run('sechttp', round.round, (stepSeed) => attackOnce(lane, makeRng(stepSeed), stepSeed))
  );
  return finishReport(lane, loop);
}

// ############# the socket layer (node adapter) #############

export interface SocketAttack {
  id: string;
  /** the raw bytes written to the socket, headers and body */
  request: string;
}

const JSON_POST = (path: string, body: string, extra = '') =>
  `POST ${path} HTTP/1.1\r\nHost: x\r\nAuthorization: Bearer ok\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\n${extra}\r\n${body}`;

export function socketAttacks(rng: Rng): SocketAttack[] {
  const valid = JSON.stringify(validBodies.echoUser);
  const chunk = 'x'.repeat(4000);
  const chunked = `${chunk.length.toString(16)}\r\n${chunk}\r\n`;
  return [
    {
      id: 'sock.content-length-too-big',
      request: `POST /echoUser HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: 999999\r\n\r\n{"echoUser":`,
    },
    {
      id: 'sock.content-length-lies',
      request: `POST /echoUser HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: 5\r\n\r\n${valid}`,
    },
    {
      id: 'sock.chunked-overflow',
      request: `POST /echoUser HTTP/1.1\r\nHost: x\r\nTransfer-Encoding: chunked\r\nContent-Type: application/json\r\n\r\n${chunked.repeat(20)}0\r\n\r\n`,
    },
    {id: 'sock.query-junk', request: `GET /echoUser?data=${rng.pick(['!', 'a', '%%%', 'YQ='])} HTTP/1.1\r\nHost: x\r\n\r\n`},
    {id: 'sock.proto-header', request: JSON_POST('/echoUser', valid, `${rng.pick(PROTO_NAMES)}: 1\r\n`)},
    {id: 'sock.huge-header', request: JSON_POST('/echoUser', valid, `X-Big: ${'h'.repeat(9000 + rng.int(9000))}\r\n`)},
    {id: 'sock.bad-json', request: JSON_POST('/echoUser', valid.slice(0, rng.int(valid.length)))},
    {
      id: 'sock.binary-junk',
      request: `POST /binary/echo HTTP/1.1\r\nHost: x\r\nContent-Type: application/octet-stream\r\nContent-Length: 6\r\n\r\n\u0000\u0000\u0000\u0080\u0000\u0000`,
    },
    {id: 'sock.proto-path', request: JSON_POST(`/${rng.pick(PROTO_NAMES)}`, valid)},
    {
      id: 'sock.garbage',
      request: Array.from({length: 8 + rng.int(200)}, () => String.fromCharCode(rng.int(0x7f))).join('') + '\r\n\r\n',
    },
    {
      id: 'sock.method',
      request: `${rng.pick(['PUT', 'DELETE', 'OPTIONS', 'HEAD', 'PATCH'])} /echoUser HTTP/1.1\r\nHost: x\r\nContent-Length: 0\r\n\r\n`,
    },
    {id: 'sock.query-huge', request: `GET /echoUser?data=${'A'.repeat(20_000)} HTTP/1.1\r\nHost: x\r\n\r\n`},
  ];
}

export function rawSocketRequest(
  port: number,
  request: string,
  timeoutMs = 3000
): Promise<{status: number; headers: string; body: string; closed: boolean}> {
  return new Promise((resolve) => {
    let data = '';
    let done = false;
    const finish = (closed: boolean) => {
      if (done) return;
      done = true;
      const status = Number(/^HTTP\/1\.1 (\d{3})/.exec(data)?.[1] ?? 0);
      const split = data.indexOf('\r\n\r\n');
      resolve({
        status,
        headers: split === -1 ? data : data.slice(0, split),
        body: split === -1 ? '' : data.slice(split + 4),
        closed,
      });
    };
    const socket = createConnection({host: '127.0.0.1', port}, () => socket.write(request, 'latin1'));
    socket.setEncoding('latin1');
    socket.on('data', (chunk) => {
      data += chunk;
      // one response is enough: the server may keep the connection open
      if (/^HTTP\/1\.1 \d{3}/.test(data) && /\r\n\r\n/.test(data) && bodyComplete(data)) {
        socket.destroy();
        finish(false);
      }
    });
    socket.on('error', () => finish(true));
    socket.on('close', () => finish(true));
    setTimeout(() => {
      socket.destroy();
      finish(true);
    }, timeoutMs);
  });
}

function bodyComplete(data: string): boolean {
  const length = /content-length: (\d+)/i.exec(data);
  if (!length) return true;
  const split = data.indexOf('\r\n\r\n');
  return data.length - split - 4 >= Number(length[1]);
}

export interface SocketReport {
  port: number;
  violations: HttpViolation[];
  applied: Record<string, number>;
  close: () => Promise<void>;
}

/** Starts the node adapter over the fixture router on a free port and runs every socket attack,
 *  probing liveness after each one. Call `close()` when done. */
export async function runSocketAttacks(seed: number, rounds = 2): Promise<SocketReport> {
  await openLane();
  resetNodeHttpOpts();
  // resetNodeHttpOpts resets the router too: register again on the fresh state
  await openLane();
  setNodeHttpOpts({port: 0, maxBodySize: 64_000});
  const server: Server = (await startNodeServer()) as Server;
  const port = (server.address() as {port: number}).port;
  const violations: HttpViolation[] = [];
  const applied: Record<string, number> = {};
  const rng = makeRng(seed);
  const alive = JSON_POST('/echoUser', JSON.stringify(validBodies.echoUser));
  for (let round = 0; round < rounds; round++) {
    for (const attack of socketAttacks(rng)) {
      applied[attack.id] = (applied[attack.id] ?? 0) + 1;
      const push = (oracle: HttpOracleId, message: string) =>
        violations.push({oracle, attack: attack.id, seed, message, input: attack.request.slice(0, 200)});
      const started = performance.now();
      const answer = await rawSocketRequest(port, attack.request);
      if (performance.now() - started > REQUEST_BUDGET_MS * 2)
        push('SH-TIME', `took ${Math.round(performance.now() - started)} ms`);
      // node itself answers 400/431 for what it cannot parse; a mion answer is a JSON envelope
      if (answer.status === 0) push('SH-ENVELOPE', `no HTTP response (closed=${answer.closed})`);
      if (answer.status >= 500) push('SH-NO5XX', `status ${answer.status}`);
      if (/content-type: application\/json/i.test(answer.headers)) {
        try {
          const body = JSON.parse(answer.body);
          const thrown = body[MION_ROUTES.thrownErrors];
          if (answer.status >= 400 && (!thrown || typeof thrown !== 'object'))
            push('SH-ENVELOPE', 'an error status without a @thrownErrors object');
        } catch {
          push('SH-ENVELOPE', 'a JSON response that does not parse');
        }
      }
      if (LEAK_PHRASES.some((phrase) => phrase.test(answer.body))) push('SH-NOLEAK', 'response text carries engine text');
      const probe = await rawSocketRequest(port, alive);
      if (probe.status !== 200) push('SH-ALIVE', `the next request got ${probe.status || 'no answer'}`);
    }
  }
  return {
    port,
    violations,
    applied,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export function renderHttpViolations(violations: HttpViolation[], limit = 25): string {
  const lines = violations
    .slice(0, limit)
    .map((v) => `  [${v.oracle}] ${v.attack} (seed=0x${v.seed.toString(16)}): ${v.message}\n      ${v.input}`);
  if (violations.length > limit) lines.push(`  …and ${violations.length - limit} more`);
  return lines.join('\n');
}
