/* eslint-disable @typescript-eslint/no-unused-vars */
/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError, FatalError, HeadersSubset} from '@mionjs/core';
import {PublicApi, Routes, createMionRouter} from '@mionjs/router';
import {setNodeHttpOpts, startNodeServer} from '@mionjs/platform-node';
import type {Server as HttpServer} from 'node:http';
import type {Server as HttpsServer} from 'node:https';
// regular import, not type-only, so the JIT functions get created
import {String, Email, UUIDv4, Transform} from '@mionjs/run-types/formats';
import {integer, pgTable, timestamp, uuid, varchar} from '@mionjs/drizzle-orm-pg-core';
import {refineTableType} from '@mionjs/drizzle-orm';
import type {InferInsertModel, InferSelectModel, InferUpdateModel} from '@mionjs/drizzle-orm';
import {Number} from '@mionjs/run-types/formats';
import {registerClassSerializer} from '@mionjs/run-types/runtime';
import {csrf, getCsrfToken, rotateCsrfToken} from './csrf.middleware.ts';

// ============ Router ============
// Every route / middleware below comes from these helpers: plain closures, so destructuring keeps
// them injected.
type TestSharedData = {user: {name: string; surname: string} | null; httpMethod: string | null};
const getSharedData = (): TestSharedData => ({user: null, httpMethod: null});
const mion = createMionRouter({contextDataFactory: getSharedData, skipClientRoutes: false});
const {route, headersFn, middleware, query, mutation, rawMiddleware} = mion;

// ============ Batch chain fixtures (flow/*) ============
// A small graph the batch e2e tests chain with inputFrom: user -> org, user -> tags, order -> product
export type FlowUser = {id: number; orgId: number; tagIds: number[]};
export type FlowOrg = {id: number; name: string};
export type FlowTag = {id: number; label: string};
export type FlowOrder = {id: number; currency: string};
export type FlowProduct = {orderId: number; currency: string; sku: string};
export type FlowStamp = {id: number; when: Date; counts: Map<string, number>; labels: Set<string>};

// ============ JSON test types ============
type User = {name: string; surname: string};
type Product = {id: string; name: string; price: number};

// nested objects, for friendlyErrors tests
type UserProfile = {
  name: string;
  email: string;
  age: number;
  address?: {
    street: string;
    city: string;
    zip: string;
  };
};

// format types, for friendlyErrors tests
export type UserWithFormats = {
  name: String<{minLength: 2; maxLength: 50}>;
  age: Number<{min: 13; max: 120; integer: true}>;
  email: Email;
};

// returned by the session middleware
type SessionInfo = {userId: string; role: 'admin' | 'user'; expiresAt: number};

// ============ Drizzle-derived models ============
// Route-level e2e for the dialect packages: the routes below take and return the DERIVED types,
// and validation plus Date serialization are generated from those types alone.
const dbUsersTable = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', {length: 100}).notNull(),
  age: integer('age').notNull(),
  createdAt: timestamp('created_at', {mode: 'date'}).notNull().defaultNow(),
});
const apiUsersTable = refineTableType(dbUsersTable, {name: {minLength: 5}, age: {min: 18}});
export type DbUser = InferSelectModel<typeof apiUsersTable>;
export type NewDbUser = InferInsertModel<typeof apiUsersTable>;
export type DbUserPatch = InferUpdateModel<typeof apiUsersTable>;
const dbUsersStore = new Map<string, DbUser>();

// ============ Shared payload types ============
export type SimpleUser = {name: string; age: number};

export type Address = {
  street: string;
  city: string;
  zip: string;
  country: string;
};

export type ComplexUser = {
  id: string;
  name: string;
  email: string;
  age: number;
  isActive: boolean;
  createdAt: Date;
  address: Address;
  tags: string[];
  scores: number[];
};

export type NestedData = {
  level1: {
    level2: {
      level3: {
        value: string;
        numbers: number[];
      };
    };
  };
};

// ============ Compact routes (per-route compact parser: positional json, no key names on the wire) ============
export type CompactEvent = {
  title: string;
  at: Date;
  place?: Address;
  attendees: SimpleUser[];
};

export const compactTestRoutes = {
  // a spread of shapes on the compact wire
  echo: route((_ctx, message: string): string => message, {parser: 'compact'}),
  addNumbers: route((_ctx, a: number, b: number): number => a + b, {parser: 'compact'}),
  getSimpleUser: route((_ctx, name: string, age: number): SimpleUser => ({name, age}), {parser: 'compact'}),
  processSimpleUser: route((_ctx, user: SimpleUser): string => `User: ${user.name}, Age: ${user.age}`, {parser: 'compact'}),
  getComplexUser: route(
    (_ctx, id: string): ComplexUser => ({
      id,
      name: 'Compact User',
      email: 'compact@example.com',
      age: 30,
      isActive: true,
      createdAt: new Date('2024-01-15T10:30:00.000Z'),
      address: {street: '123 Main St', city: 'Springfield', zip: '12345', country: 'US'},
      tags: ['compact', 'positional'],
      scores: [95, 87, 92],
    }),
    {parser: 'compact'}
  ),
  processComplexUser: route((_ctx, user: ComplexUser): ComplexUser => ({...user, name: user.name.toUpperCase()}), {
    parser: 'compact',
  }),
  processNested: route(
    (_ctx, data: NestedData): NestedData => ({
      level1: {
        level2: {
          level3: {
            value: data.level1.level2.level3.value.toUpperCase(),
            numbers: data.level1.level2.level3.numbers.map((n) => n * 2),
          },
        },
      },
    }),
    {parser: 'compact'}
  ),
  addDays: route(
    (_ctx, date: Date, days: number): Date => {
      const result = new Date(date);
      result.setDate(result.getDate() + days);
      return result;
    },
    {parser: 'compact'}
  ),
  // an absent optional rides a null placeholder on the compact wire and comes back undefined
  describeEvent: route(
    (_ctx, event: CompactEvent, note?: string): CompactEvent => ({
      ...event,
      title: note ? `${event.title} (${note})` : event.title,
    }),
    {parser: 'compact'}
  ),
  mixed: route((_ctx, user: SimpleUser): SimpleUser => ({...user, age: user.age + 1}), {
    parser: {params: 'compact', return: 'mutate'},
  }),
  // clone never mutates the handler's value
  cloned: route((_ctx, user: SimpleUser): SimpleUser => user, {parser: 'clone'}),
  // a middleware in the chain: its params and return ride the compact wire too
  stamp: middleware(
    (_ctx, tag?: string): {tag: string; when: Date} | null => (tag ? {tag, when: new Date('2024-02-02T02:02:02.000Z')} : null),
    {
      parser: 'compact',
    }
  ),
  // a PLAIN middleware declaring no encoder: it must still carry its params AND its return value on
  // a non-default wire, never be dropped from the body
  plainStamp: middleware((_ctx, note?: string): {note: string} | null => (note ? {note} : null)),
} satisfies Routes;

// Declared next to its base in a route signature: the client gets it back as a ScopedAuthError
export class ScopedAuthError extends RpcError<'not-authorized'> {
  readonly scope: string;
  readonly retryAfter: number;
  constructor(scope: string, retryAfter: number) {
    super({publicMessage: 'Not Authorized', type: 'not-authorized', statusCode: 401});
    this.scope = scope;
    this.retryAfter = retryAfter;
  }
}
registerClassSerializer(ScopedAuthError, {deserialize: (d) => new ScopedAuthError(d.scope, d.retryAfter)});

// run count per notes route, so a client test can prove a retry never ran a mutation twice
type NoteRuns = {getNote: number; saveNote: number; touchNote: number; clearNote: number; failNote: number; adminNote: number};
const noteRuns: NoteRuns = {getNote: 0, saveNote: 0, touchNote: 0, clearNote: 0, failNote: 0, adminNote: 0};

const routes = {
  // ============ Shared middleware ============
  // A gate: a present but WRONG token answers a FatalError, typed for the client and ending the
  // chain so the route never runs. A missing header fails header validation before the handler.
  auth: headersFn((ctx, h: HeadersSubset<'Authorization'>): void | RpcError<'not-authorized'> => {
    if (h.headers.Authorization === 'WRONG-TOKEN') {
      return new FatalError({publicMessage: 'Not Authorized', type: 'not-authorized', statusCode: 401});
    }
    ctx.shared.user = {name: 'John', surname: 'Doe'};
  }),
  session: middleware((ctx, sessionToken?: string): SessionInfo | RpcError<'session-expired'> | null => {
    if (!sessionToken) return null;
    if (sessionToken === 'expired') {
      return new RpcError({publicMessage: 'Session expired', type: 'session-expired'});
    }
    return {
      userId: 'user-123',
      role: 'admin',
      expiresAt: Date.now() + 3600000, // 1 hour from now
    };
  }),

  // ============ JSON routes (default parser) ============
  sayHello: route((_ctx, user: User): string | RpcError<'some-error'> => `Hello ${user.name} ${user.surname}`),
  alwaysFails: route((ctx, user: User): User | RpcError<'unknown-error'> => {
    return new RpcError({publicMessage: 'Something fails', type: 'unknown-error'});
  }),
  calculateAge: route((_ctx, birthYear: number): number => new Date().getFullYear() - birthYear),
  createProduct: route(
    (_ctx, product: Product): Product => ({
      ...product,
      id: product.id || 'generated-id',
    })
  ),
  sumNumbers: route((_ctx, numbers: number[]): number => numbers.reduce((a, b) => a + b, 0)),
  greetUser: route((_ctx, name: string, greeting?: string): string => `${greeting || 'Hello'} ${name}`),

  // The in-memory store stands in for the database; the point is the WIRE: payloads validate
  // against the derived types and Dates survive the JSON serializer both directions.
  dbUsers: {
    insert: route((_ctx, user: NewDbUser): DbUser => {
      const row: DbUser = {
        id: user.id ?? crypto.randomUUID(),
        name: user.name,
        age: user.age,
        createdAt: user.createdAt ?? new Date(),
      };
      dbUsersStore.set(row.id, row);
      return row;
    }),
    select: route((_ctx, id: string): DbUser | RpcError<'user-not-found'> => {
      return dbUsersStore.get(id) ?? new RpcError({publicMessage: 'User not found', type: 'user-not-found'});
    }),
    update: route((_ctx, id: string, patch: DbUserPatch): DbUser | RpcError<'user-not-found'> => {
      const existing = dbUsersStore.get(id);
      if (!existing) return new RpcError({publicMessage: 'User not found', type: 'user-not-found'});
      const next: DbUser = {...existing, ...patch};
      dbUsersStore.set(id, next);
      return next;
    }),
  },

  utils: {
    // a SCOPED middleware: runs for the utils.* routes only, never for a top-level route
    scopeTag: middleware((_ctx, tag?: string): string | null => tag ?? null),
    sumTwo: route((ctx, a: number): number => a + 2),
    multiply: route((ctx, a: number, b: number): number => a * b),
    processUser: route((ctx, user: User): string => `Processed: ${user.name} ${user.surname}`),
  },

  createUserProfile: route((_ctx, user: UserProfile): UserProfile => user),
  // `mutateStrict` keeps every key the caller sent and then rejects the undeclared ones, on the server and in the
  // client's own pre-validation (R17). `clone` and `compact` would drop the extra key before anything could report it.
  createUserStrict: route((_ctx, user: User): User => user, {parser: {params: 'mutateStrict'}}),
  // sanitizeParams routes: the email's declared transform runs after decode and before validation
  // on the server, and locally on the client when its own sanitizeParams option is on
  sanitizeEmail: route((_ctx, email: Transform<Email, {trim: true; lowercase: true}>): string => email, {
    sanitizeParams: true,
  }),
  // same transform declared on the type, but the route never asks for it: the handler gets the raw value
  rawEmail: route((_ctx, email: Transform<Email, {trim: true; lowercase: true}>): string => email),
  validateUserData: route(
    (_ctx, name: string, age: number, email: string): string => `User: ${name}, Age: ${age}, Email: ${email}`
  ),

  // format types, for friendlyErrors tests
  createUserWithFormats: route((_ctx, user: UserWithFormats): UserWithFormats => user),
  validateName: route((_ctx, name: String<{minLength: 2; maxLength: 20}>): string => `Name: ${name}`),
  validateAge: route((_ctx, age: Number<{min: 0; max: 150; integer: true}>): string => `Age: ${age}`),

  log: middleware((ctx): void => undefined, {alwaysRun: true}),

  // Declared as RpcError but answers a FatalError: the client decodes it by the declared type
  fatalAsRpcError: route((_ctx, msg: string): string | RpcError<'gate-closed'> => {
    return new FatalError({publicMessage: msg, type: 'gate-closed'});
  }),
  // Declared as FatalError: the client decodes it back to a real FatalError
  fatalDeclared: route((_ctx, msg: string): string | FatalError<'gate-closed'> => {
    return new FatalError({publicMessage: msg, type: 'gate-closed'});
  }),
  // Both classes in one signature: each answer must decode as the class it was declared under,
  // whichever member the checker lists first
  fatalMixed: route((_ctx, mode: string): string | RpcError<'soft'> | FatalError<'gate-closed'> => {
    if (mode === 'soft') return new RpcError({publicMessage: 'soft', type: 'soft'});
    if (mode === 'gate') return new FatalError({publicMessage: 'closed', type: 'gate-closed'});
    return 'open';
  }),

  subclassError: route((_ctx, mode: string): string | ScopedAuthError | RpcError<'not-authorized'> => {
    if (mode === 'deny') return new ScopedAuthError('admin', 30);
    return 'open';
  }),

  // THROWS an undeclared error instead of returning it: pins thrown -> unexpected-slot dispatch
  throwsUnexpectedly: route((_ctx, msg: string): string => {
    // eslint-disable-next-line @mionjs/no-throw-in-handlers -- throwing IS what this fixture pins
    throw new RpcError({publicMessage: msg, type: 'db-connection-lost'});
  }),

  // an alwaysRun middleware that can fail: pins unexpected-slot precedence when several errors exist
  audit: middleware(
    (_ctx, fail?: boolean): string | RpcError<'audit-failed'> => {
      if (fail) return new RpcError({publicMessage: 'Audit failed', type: 'audit-failed'});
      return 'audited';
    },
    {alwaysRun: true}
  ),

  // UUID validation
  validateUUID: route((_ctx, uuid: UUIDv4): string => `Valid UUID: ${uuid}`),
  getUserById: route((_ctx, userId: UUIDv4): {id: UUIDv4; name: string} => ({id: userId, name: 'Test User'})),

  // serialization of complex types
  getSameDate: route((_ctx, date: Date): Date => date),
  getDatePlusDays: route((_ctx, date: Date, days: number): Date => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }),
  getSameMap: route((_ctx, map: Map<string, number>): Map<string, number> => map),
  mergeMap: route((_ctx, map: Map<string, number>, key: string, value: number): Map<string, number> => {
    map.set(key, value);
    return map;
  }),
  getSameBigInt: route((_ctx, value: bigint): bigint => value),
  // nested shapes: the optimistic wire form has to survive a Map inside a Map, a Date inside a Set
  // and a bigint under both, not just a flat one
  getSameNestedMap: route((_ctx, nested: Map<string, Map<string, bigint>>): Map<string, Map<string, bigint>> => nested),
  getSameDateSet: route((_ctx, dates: Set<Date>): Set<Date> => dates),
  getSameMapOfDates: route((_ctx, dates: Map<string, Date>): Map<string, Date> => dates),
  // a union of a JSON member and a JavaScript-only one: its wire form is a [index, value] envelope,
  // which the optimistic body cannot write, so this route is the retry case
  echoStringOrDate: route((_ctx, value: string | Date): string => (value instanceof Date ? value.toISOString() : value)),
  getSameSet: route((_ctx, set: Set<string>): Set<string> => set),
  addToSet: route((_ctx, set: Set<string>, item: string): Set<string> => {
    set.add(item);
    return set;
  }),

  // batch inputFrom: output→input mapping between routes
  getCustomerById: route((_ctx, customerId: number): {id: number; name: string; preferenceId: number} => ({
    id: customerId,
    name: 'Test Customer',
    preferenceId: customerId + 100,
  })),
  getPreferencesById: route((_ctx, prefId: number): {id: number; userId: number; theme: string; lang: string} => ({
    id: prefId,
    userId: prefId - 100,
    theme: prefId % 2 === 0 ? 'dark' : 'light',
    lang: 'en',
  })),

  // Batch chain fixtures: every value is derived from the input so a test can predict it
  flow: {
    // negative ids answer a DECLARED error, so a mapper downstream sees an RpcError as its source value
    getUser: route((_ctx, id: number): FlowUser | RpcError<'user-not-found'> => {
      if (id < 0) return new RpcError({publicMessage: 'User not found', type: 'user-not-found'});
      return {id, orgId: id * 10, tagIds: [id, id + 1]};
    }),
    // id 0 answers null, so a mapper reading a property of it throws
    getUserOrNull: route((_ctx, id: number): FlowUser | null => (id === 0 ? null : {id, orgId: id * 10, tagIds: [id]})),
    getOrg: route((_ctx, orgId: number): FlowOrg => ({id: orgId, name: `Org ${orgId}`})),
    getOrgLabel: route((_ctx, orgName: string): string => `[${orgName}]`),
    getTags: route((_ctx, ids: number[]): FlowTag[] => ids.map((id) => ({id, label: `tag-${id}`}))),
    getOrder: route((_ctx, id: number): FlowOrder => ({id, currency: id % 2 === 0 ? 'EUR' : 'USD'})),
    // two params, so a mapping can land at index 0 or index 1
    getProduct: route(
      (_ctx, orderId: number, currency: string): FlowProduct => ({
        orderId,
        currency,
        sku: `SKU-${orderId}-${currency}`,
      })
    ),
    getStamp: route(
      (_ctx, id: number): FlowStamp => ({
        id,
        when: new Date(Date.UTC(2024, 0, id)),
        counts: new Map([['id', id]]),
        labels: new Set([`s${id}`]),
      })
    ),
    describeStamp: route((_ctx, when: Date, counts: Map<string, number>, labels: Set<string>): string => {
      return `${when.toISOString()}|${counts.get('id')}|${[...labels].join(',')}`;
    }),
  },

  captureHttpMethod: rawMiddleware((ctx, rawReq: any): void => {
    ctx.shared.httpMethod = rawReq?.method || 'UNKNOWN';
  }),

  // A route answering with headers: the client rebuilds the HeadersSubset from the response headers
  respondHeaders: route((_ctx, tag: string): HeadersSubset<'x-mion-echo'> => new HeadersSubset({'x-mion-echo': tag})),

  // query(): the client uses GET with ?data= for small payloads
  getRequestInfo: query((ctx, message: string): {message: string; httpMethod: string; urlQuery: string | undefined} => ({
    message,
    httpMethod: ctx.shared.httpMethod || 'UNKNOWN',
    urlQuery: ctx.urlQuery,
  })),

  // mutation(): the client always uses POST
  mutateRequestInfo: mutation((ctx, message: string): {message: string; httpMethod: string; urlQuery: string | undefined} => ({
    message,
    httpMethod: ctx.shared.httpMethod || 'UNKNOWN',
    urlQuery: ctx.urlQuery,
  })),

  // for timeout and cancellation tests
  sleep: route(async (_ctx, ms: number): Promise<number> => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return ms;
  }),

  // ============ Isolated reusable middleware (csrf.middleware.ts) ============
  // Scoped to a group: at the root its required token would break every other route's tests.
  csrfToken: query((): string => getCsrfToken()),
  rotateCsrfToken: mutation((): string => rotateCsrfToken()),
  noteRuns: query((): NoteRuns => ({...noteRuns})),
  resetNoteRuns: mutation((): void => {
    (Object.keys(noteRuns) as (keyof NoteRuns)[]).forEach((key) => (noteRuns[key] = 0));
  }),
  notes: {
    csrf: middleware(csrf),
    getNote: query((_ctx, id: string): string => `note ${id} (${++noteRuns.getNote})`),
    saveNote: mutation((_ctx, text: string): string => `saved ${text} (${++noteRuns.saveNote})`),
    touchNote: route((_ctx, id: string): string => `touched ${id} (${++noteRuns.touchNote})`),
    clearNote: mutation((_ctx, _id: string): void => {
      noteRuns.clearNote++;
    }),
    failNote: mutation((_ctx, _id: string): RpcError<'note-failed'> => {
      noteRuns.failNote++;
      return new RpcError({type: 'note-failed', publicMessage: 'The note could not be saved'});
    }),
    admin: {
      csrf: middleware(csrf),
      getNote: query((_ctx, id: string): string => `admin note ${id} (${++noteRuns.adminNote})`),
    },
    // runs AFTER the routes above, so its declared error arrives once the route already ran
    audit: middleware((_ctx, flag?: boolean): void | RpcError<'audit-flagged'> => {
      if (flag) return new RpcError({type: 'audit-flagged', publicMessage: 'Flagged by the audit'});
    }),
  },

  // ============ Compact routes (per-route compact encoder) ============
  compact: compactTestRoutes,
} satisfies Routes;

// Used when the caller names no port.
const defaultPort = process.env.MION_TEST_PORT
  ? parseInt(process.env.MION_TEST_PORT, 10)
  : process.argv[2]
    ? parseInt(process.argv[2], 10)
    : 8076;

/** Starts the server and hands back the listening node server, so the caller can close it. A test
 *  project's vitest globalSetup calls this in the SAME process, nothing is spawned. */
export async function startTestServer(port: number = defaultPort): Promise<HttpServer | HttpsServer> {
  // Registers the routes, the internal mion routes (methodsMetadataById, …) included.
  mion.initRoutes(routes);
  setNodeHttpOpts({port});
  const server = await startNodeServer();
  console.log(`Test server started on port ${port}`);
  // Graceful shutdown on SIGINT is already handled by @mionjs/platform-node.
  return server;
}

// used by the client tests
export type TestServerApi = PublicApi<typeof routes>;

// Importing this module NEVER starts a server; the env var is the explicit opt-in, set by the lanes
// that run this entry as a program of its own.
if (process.env.MION_TEST_SERVER_AUTO_START === 'true') {
  void startTestServer().catch((error) => {
    console.error('Failed to start test server:', error);
    process.exit(1);
  });
}
