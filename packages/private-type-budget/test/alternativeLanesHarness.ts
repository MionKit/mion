// Two alternative ways to declare the same model, measured against each
// dialect's slim table lane in modelPipelineHarness.ts.
//
//   slim       a table built from the slim recorder builders, model derived flat
//   type-only  the row written as a plain TypeScript type (formats by hand)
//   builder    the row built with the RT.* / TF.* value-first builders
//
// Steps 2 to 5 (refinement, the Select/Insert/Update models, the mion route api
// and the client's Result-tuple mapping) are deliberately IDENTICAL across the
// two lanes here, and steps 4 and 5 match the slim lane's too. That is what
// makes the comparison mean something: only step 1 (how the formatted row is
// declared) differs, so whatever separates the totals is the cost of HOW the
// model was declared.
//
// This prices the three approaches. It does not rank them. The slim lane
// derives the model from the table, so the schema and the API types cannot drift
// apart, and it is the only lane that also yields a runnable drizzle table
// (toDrizzle; its db-step cost lives in the pipeline suite). Read the numbers
// as the cost of each convenience, not a verdict.

import {fileURLToPath} from 'node:url';
import {makeMeasurer} from '../../run-types/test/types/compileHarness.ts';
import {RESOLVING_OPTIONS, type DialectName, type PipelineStep} from './modelPipelineHarness.ts';

// Steps 2 to 5, shared verbatim between the two lanes below. Both lanes reach
// step 2 with a `Row` type carrying the same formats, so everything downstream
// is the same text and any difference in the deltas is noise worth explaining.
const SHARED_TAIL: Array<Omit<PipelineStep, 'budget'>> = [
  {
    label: '2 + refinement mapped type',
    body: `
type Refine<T, R> = {[K in keyof T]: K extends keyof R ? MergeFormat<T[K], R[K]> : T[K]};
type ApiRow = Refine<Row, {name: {minLength: 10}; age: {min: 18}}>;
declare const refinedRow: ApiRow;
export const refinedName: string = refinedRow.name;
export const refinedAge: number = refinedRow.age;
`,
  },
  {
    label: '3 + Select/Insert/Update models',
    body: `
type User = SelectModel<ApiRow>;
type NewUser = InsertModel<ApiRow, never, 'createdAt'>;
type UserPatch = UpdateModel<ApiRow>;
export const newUser: NewUser = {name: 'a-long-name', age: 21};
export const userPatch: UserPatch = {age: 30};
export const selectedUser: User = {name: 'a-long-name', age: 21, createdAt: new Date()};
`,
  },
  {
    label: '4 + mion route api',
    body: `
const store = new Map<string, User>();
const mion = createMionRouter({});
const usersApi = mion.initRoutes({
  users: {
    insert: mion.route((_ctx, user: NewUser): User | RpcError<'bad-insert'> => {
      const row: User = {name: user.name, age: user.age, createdAt: user.createdAt ?? new Date()};
      store.set(row.name, row);
      return row;
    }),
    select: mion.route((_ctx, name: string): User | RpcError<'user-not-found'> =>
      store.get(name) ?? new RpcError({publicMessage: 'User not found', type: 'user-not-found'})),
    update: mion.route((_ctx, name: string, patch: UserPatch): User | RpcError<'user-not-found'> => {
      const existing = store.get(name);
      if (!existing) return new RpcError({publicMessage: 'User not found', type: 'user-not-found'});
      const patched: User = {...existing, ...patch};
      store.set(name, patched);
      return patched;
    }),
  },
});
type UsersApi = typeof usersApi;
`,
  },
  {
    label: '5 + initClient',
    body: `
const {routes} = initClient<UsersApi>({baseURL: 'http://localhost:3000'});
const [inserted, insertError] = await routes.users.insert({name: 'a-long-name', age: 21}).call();
const [found] = await routes.users.select('a-long-name').call();
const [updated, updateError] = await routes.users.update('a-long-name', {age: 31}).call();
export const insertedName: string | undefined = inserted?.name;
export const insertedWhen: Date | undefined = inserted?.createdAt;
export const foundAge: number | undefined = found?.age;
export const updatedName: string | undefined = updated?.name;
export const errorName: string | undefined = insertError?.name ?? updateError?.name;
`,
  },
];

const TYPE_ONLY_HEADER = `
import type {Date as RTDate, Number as RTNumber, String as RTString, MergeFormat} from '@mionjs/run-types/formats';
import type {InsertModel, SelectModel, UpdateModel} from '@mionjs/run-types';
import {RpcError} from '@mionjs/core';
import {createMionRouter} from '@mionjs/router';
import {initClient} from '@mionjs/client';
export {};
`;

const BUILDER_HEADER = `
import * as RT from '@mionjs/run-types/builders';
import * as TF from '@mionjs/run-types/formats';
import type {String as RTString, MergeFormat} from '@mionjs/run-types/formats';
import type {InferType, InsertModel, SelectModel, UpdateModel, FormatNameOf, FormatParamsOf} from '@mionjs/run-types';
import {RpcError} from '@mionjs/core';
import {createMionRouter} from '@mionjs/router';
import {initClient} from '@mionjs/client';
export {};
`;

export interface Lane {
  /** Column heading in the comparison table. **/
  name: string;
  steps: PipelineStep[];
  /** Compiles the cumulative snippet for this lane. **/
  measure: (snippet: string) => {errors: string[]; netInstantiations: number};
  /** Assertions that the lane really carries the refined formats, so a lane
   *  cannot look cheap by quietly measuring plain strings and numbers. **/
  shapePins: string;
}

/** The age format each dialect's integer column yields, written by hand (type-only) and with TF (builder). **/
interface AgeFormat {
  params: string;
  builderParams: string;
  refinedParams: string;
}
const INT32_AGE: AgeFormat = {
  params: '{integer: true; min: -2147483648; max: 2147483647}',
  builderParams: '{integer: true, min: -2147483648, max: 2147483647}',
  refinedParams: '{integer: true; max: 2147483647; min: 18}',
};
// sqlite's integer is a plain integer format, no 32-bit range.
const AGE_FORMATS: Record<DialectName, AgeFormat> = {
  pg: INT32_AGE,
  mysql: INT32_AGE,
  sqlite: {params: '{integer: true}', builderParams: '{integer: true}', refinedParams: '{integer: true; min: 18}'},
};

/** Per-step budgets of the two lanes, one set per dialect. ONE-WAY DOWNWARD. **/
interface LaneBudgets {
  typeOnly: [number, number, number, number, number];
  builder: [number, number, number, number, number];
}
const LANE_BUDGETS: Record<DialectName, LaneBudgets> = {
  // builder step 1 576 -> 553: lowered, the budget never followed an earlier drop in the RT.* builders.
  pg: {typeOnly: [47, 393, 254, 500, 3106], builder: [553, 384, 262, 496, 3346]},
  mysql: {typeOnly: [47, 393, 254, 500, 3106], builder: [553, 384, 262, 496, 3346]},
  sqlite: {typeOnly: [47, 388, 254, 500, 3106], builder: [549, 379, 262, 496, 3346]},
};

const typeOnlyMeasure = makeMeasurer(TYPE_ONLY_HEADER, {
  options: RESOLVING_OPTIONS,
  snippetFile: fileURLToPath(new URL('./__typeOnlyCase__.ts', import.meta.url)),
  diagnosticsScope: 'snippet',
});
const builderMeasure = makeMeasurer(BUILDER_HEADER, {
  options: RESOLVING_OPTIONS,
  snippetFile: fileURLToPath(new URL('./__builderCase__.ts', import.meta.url)),
  diagnosticsScope: 'snippet',
});

const withBudgets = (steps: Array<Omit<PipelineStep, 'budget'>>, budgets: number[]): PipelineStep[] =>
  steps.map((step, i) => ({...step, budget: budgets[i]}));

function typeOnlyLane(age: AgeFormat, budgets: LaneBudgets['typeOnly']): Lane {
  return {
    name: 'type-only',
    measure: typeOnlyMeasure,
    steps: withBudgets(
      [
        {
          // The formats the dialect's slim builders capture for the three columns, written out by hand.
          label: '1 format-branded row',
          body: `
type Row = {
  name: RTString<{maxLength: 100}>;
  age: RTNumber<${age.params}>;
  createdAt: RTDate;
};
declare const brandedRow: Row;
export const brandedName: string = brandedRow.name;
export const brandedAge: number = brandedRow.age;
export const brandedWhen: Date = brandedRow.createdAt;
`,
        },
        ...SHARED_TAIL,
      ],
      budgets
    ),
    // Written with the format aliases, so exact identity holds here.
    shapePins: `
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
type _name = Expect<Equal<User['name'], RTString<{maxLength: 100; minLength: 10}>>>;
type _age = Expect<Equal<User['age'], RTNumber<${age.refinedParams}>>>;
type _date = Expect<Equal<User['createdAt'], RTDate>>;
type _insertOptional = Expect<Equal<NewUser['createdAt'], RTDate | undefined>>;
type _clientValue = Expect<Equal<typeof inserted, User | undefined>>;
export type _TypeOnlyPins = [_name, _age, _date, _insertOptional, _clientValue];
`,
  };
}

function builderLane(age: AgeFormat, budgets: LaneBudgets['builder']): Lane {
  return {
    name: 'builder',
    measure: builderMeasure,
    steps: withBudgets(
      [
        {
          label: '1 format-params builder object',
          body: `
const rowRt = RT.object({
  name: TF.string({maxLength: 100}),
  age: TF.number(${age.builderParams}),
  createdAt: TF.date(),
});
type Row = InferType<typeof rowRt>;
declare const brandedRow: Row;
export const brandedName: string = brandedRow.name;
export const brandedAge: number = brandedRow.age;
export const brandedWhen: Date = brandedRow.createdAt;
`,
        },
        ...SHARED_TAIL,
      ],
      budgets
    ),
    // The builders infer the brand with READONLY params and no alias, so the
    // spelling is not identical to `RTString<…>` even though the information is
    // the same. Pin the information: the family, the merged params, and one-way
    // assignability to the alias form.
    shapePins: `
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
type _nameFamily = Expect<Equal<FormatNameOf<User['name']>, 'stringFormat'>>;
type _nameMin = Expect<Equal<FormatParamsOf<User['name']>['minLength'], 10>>;
type _nameMax = Expect<Equal<FormatParamsOf<User['name']>['maxLength'], 100>>;
type _ageFamily = Expect<Equal<FormatNameOf<User['age']>, 'numberFormat'>>;
type _ageMin = Expect<Equal<FormatParamsOf<User['age']>['min'], 18>>;
type _nameAssignable = Expect<User['name'] extends RTString<{maxLength: 100; minLength: 10}> ? true : false>;
// TF.date() yields a plain Date, where the type-only lane writes RTDate. Pinned
// as it is rather than as it "should" be: it is a real difference between the
// two authoring surfaces, and the pin is here to notice if it ever changes.
type _date = Expect<Equal<User['createdAt'], Date>>;
type _clientValue = Expect<Equal<typeof inserted, User | undefined>>;
export type _BuilderPins = [_nameFamily, _nameMin, _nameMax, _ageFamily, _ageMin, _nameAssignable, _date, _clientValue];
`,
  };
}

/** The type-only and builder lanes, spelling the row `dialect`'s slim table yields. **/
export function alternativeLanes(dialect: DialectName): Lane[] {
  const age = AGE_FORMATS[dialect];
  const budgets = LANE_BUDGETS[dialect];
  return [typeOnlyLane(age, budgets.typeOnly), builderLane(age, budgets.builder)];
}

/** The cumulative snippet for `lane` up to (and including) `index`. **/
export function laneSnippetUpTo(lane: Lane, index: number): string {
  return lane.steps
    .slice(0, index + 1)
    .map((step) => step.body)
    .join('');
}
