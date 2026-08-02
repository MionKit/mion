// Family 14 — JSON Schema as a first-class input. Mirrors guide/json-schema-*.ts.
// Proves the PACKED @ts-runtypes/core/json-schema subpath export resolves, that
// the bundler's RunTypes plugin rewrites the BUILDER call form (a trailing
// injected argument, not a stripped type argument), and that a schema-authored
// type converges on the same generated function as its hand-written twin.
import * as RT from '@ts-runtypes/core/schema';
import {createValidateFn, createMockDataFn, getRunTypeId} from '@ts-runtypes/core';
import {runTypeFromJsonSchema, type FromJsonSchema} from '@ts-runtypes/core/json-schema';
import {type CheckResult, eq, ok} from './check';

const ACCOUNT_SCHEMA = {
  type: 'object',
  properties: {
    id: {type: 'number'},
    name: {type: 'string'},
    tags: {type: 'array', items: {type: 'string'}},
  },
  required: ['id', 'name', 'tags'],
} as const;

// The hand-written twin of ACCOUNT_SCHEMA — the convergence reference.
export interface Account {
  id: number;
  name: string;
  tags: string[];
}

export const isAccountTypeFirst = createValidateFn<Account>();
export const isAccountJsonSchema = createValidateFn(runTypeFromJsonSchema(ACCOUNT_SCHEMA));

// FromJsonSchema recovers the TS type, so this annotation is the type-level half.
const recovered: FromJsonSchema<typeof ACCOUNT_SCHEMA> = {id: 1, name: 'Ada', tags: ['math']};

// Constraint keywords must survive into the generated validator.
export const isConstrained = createValidateFn(
  runTypeFromJsonSchema({
    type: 'object',
    properties: {
      email: {type: 'string', format: 'email'},
      age: {type: 'integer', minimum: 0, maximum: 130},
    },
    required: ['email', 'age'],
  })
);

// The /schema utility builders compose over a runTypeFromJsonSchema result.
export const accountRunType = runTypeFromJsonSchema(ACCOUNT_SCHEMA);
export const isAccountPatch = createValidateFn(RT.partial(accountRunType));

export const mockAccount = createMockDataFn(runTypeFromJsonSchema(ACCOUNT_SCHEMA));

// Both marker call shapes plus the builder form (CLAUDE.md marker rule).
export const accountIdStatic = getRunTypeId<Account>();
const sampleAccount: Account = {id: 1, name: 'Ada', tags: ['math']};
export const accountIdFromValue = getRunTypeId(sampleAccount);
export const accountIdFromSchema = getRunTypeId(runTypeFromJsonSchema(ACCOUNT_SCHEMA));

export function checkJsonSchema(): CheckResult[] {
  const good: Account = {id: 1, name: 'Ada', tags: ['math']};
  const bad = {id: 'one', name: 5, tags: 'nope'};
  const mocked = mockAccount();

  return [
    ok('json-schema: validator accepts a good value', isAccountJsonSchema(good)),
    ok('json-schema: validator rejects a bad value', !isAccountJsonSchema(bad)),
    // If the plugin had no-op'd the BUILDER call site, no cache tuple would be
    // injected and the factory could not have produced a working validator.
    ok('json-schema: builder-form call site was rewritten', typeof isAccountJsonSchema === 'function' && isAccountJsonSchema(good)),
    ok('json-schema: agrees with the hand-written type-first twin (good)', isAccountTypeFirst(good) === isAccountJsonSchema(good)),
    ok('json-schema: agrees with the hand-written type-first twin (bad)', isAccountTypeFirst(bad) === isAccountJsonSchema(bad)),
    // Structural-id convergence across all three authoring forms.
    eq('json-schema: static id ≡ value-first id', accountIdStatic, accountIdFromValue),
    eq('json-schema: static id ≡ schema-authored id', accountIdStatic, accountIdFromSchema),
    ok('json-schema: constraint keywords are enforced', isConstrained({email: 'ada@example.com', age: 36})),
    ok('json-schema: a bad format is rejected', !isConstrained({email: 'nope', age: 36})),
    ok('json-schema: a bound is rejected', !isConstrained({email: 'ada@example.com', age: 200})),
    ok('json-schema: /schema utilities compose over a schema value', isAccountPatch({name: 'Ada'})),
    ok('json-schema: mock data satisfies its own schema', isAccountJsonSchema(mocked)),
    ok('json-schema: FromJsonSchema recovers a usable type', recovered.name === 'Ada'),
  ];
}
