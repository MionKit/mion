// Measurement core for the model-pipeline budgets over the REAL slim packages. Reuses `makeMeasurer` from
// packages/run-types/test/types/compileHarness.ts so counting matches every budget suite, but with REAL module
// resolution: the snippet is a virtual file inside THIS package, so bare imports resolve as a consumer's would.
// The import header is the PREAMBLE, in the baseline too, so no delta ever includes module resolution.

import * as ts from 'typescript';
import {fileURLToPath} from 'node:url';
import {makeMeasurer, type MeasureResult} from '../../run-types/test/types/compileHarness.ts';

export type {MeasureResult};

/** Virtual snippet file. Never written to disk (the measurer's host serves it
 *  from memory) but the PATH is real, which is what makes the workspace
 *  packages and `drizzle-orm` resolve from this package's node_modules. **/
const SNIPPET_FILE = fileURLToPath(new URL('./__modelPipelineCase__.ts', import.meta.url));

// skipLibCheck keeps drizzle's .d.ts errors out without hiding any of its instantiation cost.
/** Like a mion consumer: the client's libs, bundler resolution, and the `source` condition, never a stale build. **/
export const RESOLVING_OPTIONS: ts.CompilerOptions = {
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  customConditions: ['source'],
  lib: ['lib.es2023.d.ts', 'lib.dom.d.ts'],
  types: [],
  allowImportingTsExtensions: true,
  esModuleInterop: true,
  skipLibCheck: true,
  noImplicitAny: false,
};

export type DialectName = 'pg' | 'mysql' | 'sqlite';

export interface PipelineStep {
  /** Printed on failure, names the layer that regressed. **/
  label: string;
  /** Appended to every previous body: the snippets are CUMULATIVE, and the
   *  metric is this step's delta over the one before it. **/
  body: string;
  /** Net instantiations this step may add. ONE-WAY DOWNWARD (see the test). **/
  budget: number;
}

/** What a dialect spells differently; steps 2 to 5 are the same text for all three. **/
interface DialectSource {
  dialect: DialectName;
  /** The table function and the column builders the users table calls. **/
  builders: string;
  tableFn: string;
  /** The users table's three columns, shared by step 1 and the consumer lane's models. **/
  columns: string;
  /** The db handle's type, the one step 6 queries through. **/
  db: string;
  dbImport: string;
  /** The refined age format, which follows the dialect's integer range. **/
  refinedAge: string;
}

const PG: DialectSource = {
  dialect: 'pg',
  builders: 'pgTable, varchar, integer, timestamp',
  tableFn: 'pgTable',
  columns: `
  name: varchar({length: 100, notNull: true}),
  age: integer({notNull: true}),
  createdAt: timestamp('created_at', {mode: 'date', notNull: true, defaultNow: true}),`,
  db: 'PgDatabase<PgQueryResultHKT>',
  dbImport: `import type {PgDatabase, PgQueryResultHKT} from 'drizzle-orm/pg-core';`,
  refinedAge: 'RTNumber<{integer: true; min: 18; max: 2147483647}>',
};
const MYSQL: DialectSource = {
  dialect: 'mysql',
  builders: 'mysqlTable, varchar, int, timestamp',
  tableFn: 'mysqlTable',
  columns: `
  name: varchar({length: 100, notNull: true}),
  age: int({notNull: true}),
  createdAt: timestamp('created_at', {mode: 'date', notNull: true, defaultNow: true}),`,
  db: 'MySqlDatabase<MySqlQueryResultHKT, PreparedQueryHKTBase>',
  dbImport: `import type {MySqlDatabase, MySqlQueryResultHKT, PreparedQueryHKTBase} from 'drizzle-orm/mysql-core';`,
  refinedAge: 'RTNumber<{integer: true; min: 18; max: 2147483647}>',
};
// sqlite has no timestamp type or defaultNow: an integer in timestamp mode, defaulted at runtime.
const SQLITE: DialectSource = {
  dialect: 'sqlite',
  builders: 'sqliteTable, text, integer',
  tableFn: 'sqliteTable',
  columns: `
  name: text({length: 100, notNull: true}),
  age: integer({notNull: true}),
  createdAt: integer('created_at', {mode: 'timestamp', notNull: true, $defaultFn: [() => new Date()]}),`,
  db: `BaseSQLiteDatabase<'sync', unknown>`,
  dbImport: `import type {BaseSQLiteDatabase} from 'drizzle-orm/sqlite-core';`,
  refinedAge: 'RTNumber<{integer: true; min: 18}>',
};

/** Every module the chain needs; as the preamble it is the baseline, so a step's net is its own body's type work. **/
const importHeader = (source: DialectSource) => `
import {${source.builders}, index} from '@mionjs/drizzle-orm-${source.dialect}-core';
import {refineTableType} from '@mionjs/drizzle-orm';
import type {InferSelectModel, InferInsertModel, InferUpdateModel} from '@mionjs/drizzle-orm';
import {toDrizzle} from '@mionjs/drizzle-orm-${source.dialect}-core/drizzle';
${source.dbImport}
import type {Date as RTDate, Number as RTNumber, String as RTString} from '@mionjs/run-types/formats';
import {RpcError} from '@mionjs/core';
import {createMionRouter} from '@mionjs/router';
import {initClient} from '@mionjs/client';
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
export {};
`;

/** Compiles one dialect's `importHeader + snippet` against the real module graph. **/
const measurerFor = (source: DialectSource) =>
  makeMeasurer(importHeader(source), {options: RESOLVING_OPTIONS, snippetFile: SNIPPET_FILE, diagnosticsScope: 'snippet'});

// Each body USES what it builds. Declaring a type measures nothing: the checker
// is lazy, so an unused `type User = InferSelectModel<…>` costs close to zero and the
// step looks free. Reading fields into annotated consts, building real payload
// literals, returning a real row from a handler and destructuring the client's
// Result tuple are what force the instantiations a consumer actually pays for.
//
// Step 6 is the db lane: the ONLY place drizzle's generics are paid, through
// toDrizzle's synthesized table typing. Steps 1-5 never touch a drizzle type.
const stepBodies = (source: DialectSource): Array<Omit<PipelineStep, 'budget'>> => [
  {
    label: '1 slim table + row',
    body: `
const users = ${source.tableFn}('users', {${source.columns}
}, (t) => [index('users_name_idx').on(t.name)]);
type SlimUser = InferSelectModel<typeof users>;
declare const slimRow: SlimUser;
export const plainName: string = slimRow.name;
export const plainAge: number = slimRow.age;
export const plainWhen: Date = slimRow.createdAt;
`,
  },
  {
    label: '2 + refineTableType',
    body: `
const apiUsers = refineTableType(users, {name: {minLength: 10}, age: {min: 18}});
type RefinedUser = InferSelectModel<typeof apiUsers>;
declare const refinedRow: RefinedUser;
export const refinedName: string = refinedRow.name;
export const refinedAge: number = refinedRow.age;
`,
  },
  {
    label: '3 + Infer* models',
    body: `
type User = InferSelectModel<typeof apiUsers>;
type NewUser = InferInsertModel<typeof apiUsers>;
type UserPatch = InferUpdateModel<typeof apiUsers>;
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
  {
    label: '6 + db query (toDrizzle)',
    body: `
declare const db: ${source.db};
const dzUsers = toDrizzle(apiUsers);
const selectQuery = db.select().from(dzUsers);
type SelectedRows = Awaited<typeof selectQuery>;
declare const dbRows: SelectedRows;
export const dbName: string = dbRows[0].name;
export const dbWhen: Date = dbRows[0].createdAt;
export const insertQuery = db.insert(dzUsers).values({name: 'a-long-name', age: 21});
export const updateQuery = db.update(dzUsers).set({age: 31});
`,
  },
];

/** Compiled after the six steps: pins the SHAPES the chain resolves to.
 *
 *  Load-bearing, not decoration. If module resolution breaks (a stale workspace
 *  install is the way it happens in practice) the whole chain silently collapses
 *  to `any`, every step gets cheaper, and a downward-only ratchet goes green on a
 *  measurement of nothing. These assertions fail to compile in that world. The
 *  db pins also prove toDrizzle's SYNTHESIZED typing carries the refined formats
 *  into the query rows and enforces insert optionality. **/
const shapePins = (source: DialectSource) => `
type _refinedName = Expect<Equal<User['name'], RTString<{maxLength: 100; minLength: 10}>>>;
type _refinedAge = Expect<Equal<User['age'], ${source.refinedAge}>>;
type _selectDate = Expect<Equal<User['createdAt'], RTDate>>;
type _insertOptionalDefault = Expect<Equal<NewUser['createdAt'], RTDate | undefined>>;
type _patchIsPartial = Expect<Equal<UserPatch['name'], RTString<{maxLength: 100; minLength: 10}> | undefined>>;
type _clientValueSlot = Expect<Equal<typeof inserted, User | undefined>>;
type _clientErrorSlot = Expect<RpcError<'bad-insert'> extends NonNullable<typeof insertError> ? true : false>;
// A query returns exactly what drizzle's own table would, so a migrated schema is a drop-in.
// A queried row still goes back into the slim model, which keeps the refined formats.
type _dbRowName = Expect<Equal<SelectedRows[number]['name'], string>>;
type _dbRowDate = Expect<Equal<SelectedRows[number]['createdAt'], Date>>;
type _dbRowIntoModel = Expect<SelectedRows[number] extends User ? true : false>;
export type _Pins = [
  _refinedName,
  _refinedAge,
  _selectDate,
  _insertOptionalDefault,
  _patchIsPartial,
  _clientValueSlot,
  _clientErrorSlot,
  _dbRowName,
  _dbRowDate,
  _dbRowIntoModel,
];
`;

/** The library the consumer lane emits: a refined table plus the three model aliases it exports. **/
const modelsSource = (source: DialectSource) => `
import {${source.builders}} from '@mionjs/drizzle-orm-${source.dialect}-core';
import {refineTableType} from '@mionjs/drizzle-orm';
import type {InferSelectModel, InferInsertModel, InferUpdateModel} from '@mionjs/drizzle-orm';
const users = ${source.tableFn}('users', {${source.columns}
});
const api = refineTableType(users, {name: {minLength: 10}, age: {min: 18}});
export type User = InferSelectModel<typeof api>;
export type NewUser = InferInsertModel<typeof api>;
export type UserPatch = InferUpdateModel<typeof api>;
`;

/** One dialect's budgets. All ONE-WAY DOWNWARD. **/
interface PipelineBudgets {
  /** Net instantiations each of the six steps may add. **/
  steps: [number, number, number, number, number, number];
  /** The cumulative total after the last step: per-step deltas cannot see work moving BETWEEN layers. **/
  total: number;
  /** What a downstream consumer may pay to read the model types out of the emitted `.d.ts`. **/
  consumer: number;
}

export interface PipelineDialect {
  dialect: DialectName;
  measure: (snippet: string) => MeasureResult;
  steps: PipelineStep[];
  totalBudget: number;
  consumerBudget: number;
  shapePins: string;
  modelsSource: string;
}

function pipelineDialect(source: DialectSource, budgets: PipelineBudgets): PipelineDialect {
  return {
    dialect: source.dialect,
    measure: measurerFor(source),
    steps: stepBodies(source).map((step, i) => ({...step, budget: budgets.steps[i]})),
    totalBudget: budgets.total,
    consumerBudget: budgets.consumer,
    shapePins: shapePins(source),
    modelsSource: modelsSource(source),
  };
}

// Steps 4 and 5 moved with the slim models alone: the type-only and builder lanes (laneComparison) did not move.
export const PIPELINE_DIALECTS: PipelineDialect[] = [
  pipelineDialect(PG, {
    steps: [
      // 434 -> 876: a REVIEWED EXCEPTION, single-call builders pay overloads, stray keys, name lifting (see typeRoad).
      876, 1076,
      // 578 -> 591: a REVIEWED EXCEPTION, the models derive flags from props.
      591,
      // 523 -> 525: a REVIEWED EXCEPTION, the route api reads the models derived from props.
      525,
      // 3052 -> 3179: a REVIEWED EXCEPTION, the client maps the models derived from props.
      3179,
      // 7857 -> 8571: a REVIEWED EXCEPTION, toDrizzle derives each column's flags from props.
      8571,
    ],
    // 13580 -> 14818: a REVIEWED EXCEPTION, the single-call steps above.
    total: 14818,
    // 1784 -> 1605: lowered to the measurement, which rose from 1495 because the consumer derives the flags from props.
    consumer: 1605,
  }),
  pipelineDialect(MYSQL, {steps: [895, 1073, 591, 525, 3179, 7245], total: 13508, consumer: 1602}),
  pipelineDialect(SQLITE, {steps: [900, 1068, 591, 524, 3179, 7426], total: 13688, consumer: 1574}),
];

/** The cumulative snippet of `pipeline` up to (and including) `index`. **/
export function snippetUpTo(pipeline: PipelineDialect, index: number): string {
  return pipeline.steps
    .slice(0, index + 1)
    .map((step) => step.body)
    .join('');
}

// ── Consumer lane ────────────────────────────────────────────────────────────
// An npm consumer reads the `.d.ts`, where declaration emit prints the ALIAS, so every consumer re-evaluates the models.
// Not `makeMeasurer`: that serves ONE virtual file, this needs the emitted d.ts plus the consumer importing it.

const MODELS_TS = fileURLToPath(new URL('./__models__.ts', import.meta.url));
const MODELS_DTS = fileURLToPath(new URL('./__models__.d.ts', import.meta.url));
const CONSUMER_TS = fileURLToPath(new URL('./__consumer__.ts', import.meta.url));

/** The downstream app: imports the models and uses them, same as step 3 does. **/
const CONSUMER_SOURCE = `
import type {User, NewUser, UserPatch} from './__models__.ts';
declare const row: User;
export const consumerName: string = row.name;
export const consumerAge: number = row.age;
export const consumerWhen: Date = row.createdAt;
export const consumerInsert: NewUser = {name: 'a-long-name', age: 21};
export const consumerPatch: UserPatch = {age: 30};
`;

export function makeHost(
  options: ts.CompilerOptions,
  files: Map<string, string>,
  onWrite?: (file: string, text: string) => void
) {
  const cached = new Map<string, ts.SourceFile | undefined>();
  const base = ts.createCompilerHost(options, true);
  return {
    ...base,
    getSourceFile(fileName: string, languageVersionOrOptions: any, onError: any, shouldCreate: any) {
      const own = files.get(fileName);
      if (own !== undefined) return ts.createSourceFile(fileName, own, languageVersionOrOptions, true);
      if (cached.has(fileName)) return cached.get(fileName);
      const sf = base.getSourceFile(fileName, languageVersionOrOptions, onError, shouldCreate);
      cached.set(fileName, sf);
      return sf;
    },
    writeFile: (fileName: string, text: string) => onWrite?.(fileName, text),
    fileExists: (fileName: string) => files.has(fileName) || base.fileExists(fileName),
    readFile: (fileName: string) => files.get(fileName) ?? base.readFile(fileName),
  } satisfies ts.CompilerHost;
}

export interface ConsumerLaneResult {
  /** The emitted declaration text. **/
  dts: string;
  /** True while the emitted d.ts hands the consumer an UNRESOLVED generic to
   *  evaluate. Pinned by the test: it is why the consumer pays at all. **/
  keepsGenericAlias: boolean;
  /** Declaration diagnostics; must be empty or the lane measured nothing. **/
  errors: string[];
  /** What the consumer's checker spends on the imported models. **/
  netInstantiations: number;
}

/** Emit the models declaration of `pipeline`, then measure a consumer compiled against it. **/
export function measureConsumerLane(pipeline: PipelineDialect): ConsumerLaneResult {
  const emitOptions: ts.CompilerOptions = {
    ...RESOLVING_OPTIONS,
    strict: true,
    target: ts.ScriptTarget.ES2023,
    moduleDetection: ts.ModuleDetectionKind.Force,
    allowImportingTsExtensions: false,
    declaration: true,
    emitDeclarationOnly: true,
    outDir: '/__type_budget_emit__',
    rootDir: fileURLToPath(new URL('../../..', import.meta.url)),
  };
  const emitted: string[] = [];
  const emitProgram = ts.createProgram(
    [MODELS_TS],
    emitOptions,
    makeHost(emitOptions, new Map([[MODELS_TS, pipeline.modelsSource]]), (_file, text) => emitted.push(text))
  );
  const emitResult = emitProgram.emit(undefined, undefined, undefined, true);
  const errors = [...emitProgram.getSemanticDiagnostics(emitProgram.getSourceFile(MODELS_TS)), ...emitResult.diagnostics].map(
    (d) => `TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`
  );
  if (emitResult.emitSkipped || emitted.length === 0) {
    return {dts: '', keepsGenericAlias: false, errors: [...errors, 'declaration emit was skipped'], netInstantiations: -1};
  }
  const dts = emitted[0];

  const measureOptions: ts.CompilerOptions = {
    ...RESOLVING_OPTIONS,
    strict: true,
    target: ts.ScriptTarget.ES2023,
    noEmit: true,
    moduleDetection: ts.ModuleDetectionKind.Force,
  };
  const files = new Map([
    [MODELS_DTS, dts],
    [CONSUMER_TS, CONSUMER_SOURCE],
  ]);
  const host = makeHost(measureOptions, files);
  // Baseline: the same program with the consumer body removed, so the figure is
  // the models' cost and not the file's own scaffolding.
  files.set(CONSUMER_TS, `import type {User, NewUser, UserPatch} from './__models__.ts';\nexport {};\n`);
  const baseline = ts.createProgram([CONSUMER_TS], measureOptions, host);
  baseline.getSemanticDiagnostics(baseline.getSourceFile(CONSUMER_TS));
  const baselineCount = baseline.getInstantiationCount();

  files.set(CONSUMER_TS, CONSUMER_SOURCE);
  const program = ts.createProgram([CONSUMER_TS], measureOptions, host);
  const consumerFile = program.getSourceFile(CONSUMER_TS);
  const consumerErrors = [...program.getSyntacticDiagnostics(consumerFile), ...program.getSemanticDiagnostics(consumerFile)].map(
    (d) => `TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`
  );
  // The import(...) references inside the emitted d.ts must actually resolve:
  // skipLibCheck swallows an unresolved module there and the models collapse
  // to any, which once seeded this lane's budget 11x too low.
  if (!program.getSourceFiles().some((file) => file.fileName.includes('packages/drizzle-orm/src/'))) {
    consumerErrors.push('the d.ts references to @mionjs/drizzle-orm did not resolve, the lane measured any, not the models');
  }
  return {
    dts,
    keepsGenericAlias: /InferSelectModel</.test(dts),
    errors: [...errors, ...consumerErrors],
    netInstantiations: program.getInstantiationCount() - baselineCount,
  };
}
