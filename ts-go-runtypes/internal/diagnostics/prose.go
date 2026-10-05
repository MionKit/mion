package diagnostics

// Website text for the All Diagnostics page: every code needs a Summary (what triggers it, what it means,
// the fix); an entry for an unregistered code panics at init. internal/compiler/resolver/diag_examples_test.go
// asserts each Example fires its code, so write it as a complete file: `mion` import, type, marker call.
// Voice: plain language, no internals, no dashes chaining clauses; backticks render as code, wider examples go in Fix.

type prose struct {
	Summary string
	Fix     string
	Example string
	// NestedExample is Example with the trigger one object deeper; required for a ScopeGraph code
	// that has an Example (see Definition).
	NestedExample string
}

var proseByCode = map[string]prose{
	// ─────────────────── expect-error directives (comment-expect-error-*) ───────────────────

	// No Examples: the harness scans a single FILE, but "did this comment silence anything" is only
	// answerable against a whole program, so these are raised on the whole-program pass and covered
	// by expecterror_test.go.

	CodeExpectErrorUnused: {
		Summary: "A `@mion-expect-error` comment hid nothing: the code it names was not reported on the line below. Like `@ts-expect-error`, a comment left behind after a fix is reported. Delete the comment, or correct the code it names.",
		Fix:     "// @mion-expect-error validate-symbol-root\nexport const report = createValidateFn<symbol>();",
	},

	CodeExpectErrorNotSuppressible: {
		Summary: "A `@mion-expect-error` comment named a code that is always reported. An Error code means the build produced no code for that call, so hiding it would ship missing output. The `comment-*` names check these comments, so they cannot be hidden either. Fix the reported call instead.",
	},

	CodeExpectErrorUnknownCode: {
		Summary: "A `@mion-expect-error` comment names a code mion does not have, usually a typo, so it hides nothing. Copy the code from the message you are hiding, for example `validate-symbol-root` in `error validate-symbol-root: Type ... can never be validated`.",
		Fix:     "// @mion-expect-error validate-symbol-root",
	},

	// ────────────────── downgrade-error directives (comment-downgrade-error-*) ──────────────────

	// No Examples, same reason as the comment-expect-error-* family: only a whole program answers "did this comment do
	// anything", so these are raised on that pass and covered by downgradeerror_test.go.

	CodeDowngradeErrorUnused: {
		Summary: "A `@mion-downgrade-error` comment lowered nothing: the code it names was not reported on the line below. Like `@mion-expect-error`, a comment left behind after a fix is reported. Delete the comment, or correct the code it names.",
		Fix:     "// @mion-downgrade-error validate-symbol-root\nexport const report = createValidateFn<symbol>();",
	},

	CodeDowngradeErrorNotDowngradeable: {
		Summary: "A `@mion-downgrade-error` comment named an Error code, which always stops the build. The build produced no code for that call, so going on would ship a call that throws. Only a RuntimeError can be downgraded, by comment or by the `downgradeErrors` setting. Fix the reported call instead.",
	},

	CodeDowngradeErrorUnknownCode: {
		Summary: "A `@mion-downgrade-error` comment names a code mion does not have, usually a typo, so it lowers nothing. Copy the code from the message you are lowering, for example `validate-symbol-root` in `error validate-symbol-root: Type ... can never be validated`.",
		Fix:     "// @mion-downgrade-error validate-symbol-root",
	},

	CodeDowngradeErrorAlreadyWarning: {
		Summary: "A `@mion-downgrade-error` comment named a warning or info code, which never stops the build. Delete it, or use `@mion-expect-error` to hide the code completely.",
		Fix:     "// @mion-expect-error validate-non-data-property-dropped",
	},

	// ──────────────────────── project config (config-*) ────────────────────────

	CodeTsconfigLoadFailed: {
		// No Example: the harness scans source through a healthy config, and this is raised by a
		// broken tsconfig.json.
		Summary: "Your tsconfig (the one you named, or the one found next to your project) is missing or cannot be parsed. mion reads your types through it, so it stops rather than guess with defaults. Fix the tsconfig (the message names the first problem), or point to the right file with the `tsconfig` setting of the build plugin or linter, or the `--tsconfig` flag.",
	},

	CodeUnsupportedLibSelection: {
		// No Example: the harness scans source through a healthy config, and this is raised by the
		// project's `lib` setting.
		Summary: "Your tsconfig `lib` names no base ECMAScript edition, so `Array`, `Object`, `String` and the other core globals are never declared. Then `number[]` becomes an empty object and its validator would accept any value, so mion stops. Name a base edition in `lib` (`[\"ES2022\"]`, or `[\"ES2022\", \"DOM\"]` for browser code), or remove `lib` and let `target` pick it. A feature entry such as `\"esnext.disposable\"` cannot replace a base edition.",
		Fix:     `{"compilerOptions": {"lib": ["ES2022"]}}`,
	},
	CodeEmitOutsideRootDir: {
		Summary: "Like `tsc`, `mion compile` writes each file under `outDir`, in the same folders it has under `rootDir`. A file imported from outside `rootDir` (a `paths` entry into a sibling package, or a relative import above the source folder) has no place there, so it is not written and the compile fails. Set `rootDir` to a folder that holds every file of the program, or import that module by its package name. `tsc` reports it as TS6059.",
	},

	// ───────────────────────── validate (validate-*) ─────────────────────────

	CodeVLNonSerializableRoot: {
		Summary: "Your type is a built-in class with no JSON form, such as `URLSearchParams`, `Intl.DateTimeFormat`, `WeakMap`, `Promise`, `RegExp`, `Buffer` or a typed array like `Uint8Array`. Only `Date`, `Map`, `Set`, `URL` and the Temporal types are supported. Validate plain data instead, or convert the value first (`params.toString()`, `Array.from(bytes)`).",
		Fix: `const bytes = Array.from(myUint8Array);
const isData = createValidateFn<number[]>();`,
		Example: `import {createValidateFn} from '@mionjs/run-types';
export const isData = createValidateFn<Uint8Array>();`,
	},
	CodeVLSymbolRoot: {
		Summary: "Your type is a `symbol`, or one named symbol such as `typeof mySymbol`. A symbol's identity is lost when it crosses a network, a worker or a process. Use a string union instead.",
		Fix:     `type Status = 'pending' | 'active' | 'done';`,
		Example: `import {createValidateFn} from '@mionjs/run-types';
export const isData = createValidateFn<symbol>();`,
	},
	CodeVLFunctionRoot: {
		Summary: "Your type is a function, a method, or an interface with a call signature. A function is code, not data. Validate what it takes or returns instead.",
		Fix: `const isArgs = createValidateFn<Parameters<typeof handler>>();
const isResult = createValidateFn<Awaited<ReturnType<typeof handler>>>();`,
		Example: `import {createValidateFn} from '@mionjs/run-types';
export const isData = createValidateFn<() => void>();`,
	},
	CodeVLFunctionPropDropped: {
		Summary: "A function holds no data, so validation skips the property and still checks the others. You see this for an optional function property or one in a union member. A required one reports `validate-method-dropped`. Remove the property, or replace it with the data it would produce.",
		Example: `import {createValidateFn} from '@mionjs/run-types';
interface Button { label: string; onClick?: () => void }
export const isButton = createValidateFn<Button>();`,
		NestedExample: `import {createValidateFn} from '@mionjs/run-types';
interface Toolbar { button: { label: string; onClick?: () => void } }
export const isToolbar = createValidateFn<Toolbar>();`,
	},
	CodeVLMethodDropped: {
		Summary: "A method like `greet(): string`, or a function property like `onClick: () => void`, is not data. Validation skips it and still checks the rest of the type. To check its result, store that result in a data property.",
		Example: `import {createValidateFn} from '@mionjs/run-types';
interface User { name: string; greet(): string; }
export const isUser = createValidateFn<User>();`,
		NestedExample: `import {createValidateFn} from '@mionjs/run-types';
interface Account { user: { name: string; greet(): string } }
export const isAccount = createValidateFn<Account>();`,
	},
	CodeVLStaticDropped: {
		Summary: "Static members belong to the class, not its instances, and validation checks instance data only. The rest of the class is still checked.",
		Example: `import {createValidateFn} from '@mionjs/run-types';
class Config { static version = 1; name = ''; }
export const isConfig = createValidateFn<Config>();`,
		NestedExample: `import {createValidateFn} from '@mionjs/run-types';
class Config { static version = 1; name = ''; }
interface App { config: Config }
export const isApp = createValidateFn<App>();`,
	},
	CodeVLSymbolKeyedDropped: {
		Example: `import {createValidateFn} from '@mionjs/run-types';
const tag = Symbol('tag');
interface Item { id: string; [tag]: string }
export const isItem = createValidateFn<Item>();`,
		NestedExample: `import {createValidateFn} from '@mionjs/run-types';
const tag = Symbol('tag');
interface Item { id: string; [tag]: string }
interface Order { item: Item }
export const isOrder = createValidateFn<Order>();`,
		Summary: "JSON has string keys only, so validation skips a symbol-keyed property. Use a string key if the property holds real data.",
		Fix: `interface Item {
  id: string; // instead of [Symbol.for('id')]: string
}`,
	},
	CodeVLUnionMemberDropped: {
		Summary: "Validation drops union members with no data form (a symbol, a function, a `Promise`, or a built-in class that is not data), so `Date | symbol` validates as `Date`. If no member has a data form, the whole type fails with `validate-non-data-root`, `validate-symbol-root` or `validate-function-root`.",
		Example: `import {createValidateFn} from '@mionjs/run-types';
export const isData = createValidateFn<Date | symbol>();`,
		NestedExample: `import {createValidateFn} from '@mionjs/run-types';
interface Event { at: Date | symbol }
export const isEvent = createValidateFn<Event>();`,
	},
	CodeVLNonSerializablePropDrop: {
		Summary: "A property holding a symbol, a `Promise` or a built-in class with no data form (a typed array, `ArrayBuffer`, `URLSearchParams` and similar) is skipped, so `{ id: symbol }` validates as `{}`. The other properties are still checked. A value that holds one inside, like `symbol[]` or `Map<string, symbol>`, cannot be dropped, so the whole type fails with the matching error, such as `validate-symbol-root`.",
		Example: `import {createValidateFn} from '@mionjs/run-types';
interface Box { id: symbol; name: string; }
export const isBox = createValidateFn<Box>();`,
		NestedExample: `import {createValidateFn} from '@mionjs/run-types';
interface Shelf { box: { id: symbol; name: string } }
export const isShelf = createValidateFn<Shelf>();`,
	},
	CodeVLRootAnyUnknown: {
		Summary: "`any` and `unknown` have no shape to check, so the validator accepts every value, including ones you meant to reject. Narrow the type to the shape you expect.",
		Fix:     `const isUser = createValidateFn<User>(); // instead of <unknown>`,
		Example: `import {createValidateFn} from '@mionjs/run-types';
export const isAnything = createValidateFn<unknown>();`,
	},

	// ──────────────────── validationErrors (validation-errors-*) ────────────────────

	CodeVENonSerializableRoot: {
		Summary: "Same as `validate-non-data-root`, for `createGetValidationErrorsFn`. Your type is a built-in class with no JSON form, such as `URLSearchParams`, `Intl.DateTimeFormat`, `WeakMap`, `Promise`, `RegExp`, `Buffer` or a typed array like `Uint8Array`. Only `Date`, `Map`, `Set`, `URL` and the Temporal types are supported. Check plain data instead, or convert the value first (`params.toString()`, `Array.from(bytes)`).",
		Fix: `const bytes = Array.from(myUint8Array);
const errorsOf = createGetValidationErrorsFn<number[]>();`,
		Example: `import {createGetValidationErrorsFn} from '@mionjs/run-types';
export const errorsOf = createGetValidationErrorsFn<Uint8Array>();`,
	},
	CodeVESymbolRoot: {
		Summary: "Same as `validate-symbol-root`, for `createGetValidationErrorsFn`. Your type is a `symbol`, or one named symbol such as `typeof mySymbol`, and each symbol's identity is lost when it crosses a network, a worker or a process. Use a string union instead.",
		Fix:     "type Status = 'pending' | 'active' | 'done';",
		Example: `import {createGetValidationErrorsFn} from '@mionjs/run-types';
export const errorsOf = createGetValidationErrorsFn<symbol>();`,
	},
	CodeVEFunctionRoot: {
		Summary: "Same as `validate-function-root`, for `createGetValidationErrorsFn`. Your type is a function, a method, or an interface with a call signature, which is code, not data. Check what it takes or returns instead.",
		Fix: `const argsErrors = createGetValidationErrorsFn<Parameters<typeof handler>>();
const resultErrors = createGetValidationErrorsFn<Awaited<ReturnType<typeof handler>>>();`,
		Example: `import {createGetValidationErrorsFn} from '@mionjs/run-types';
export const errorsOf = createGetValidationErrorsFn<() => void>();`,
	},
	CodeVEFunctionPropDropped: {
		Summary: "Same as `validate-function-property-dropped`, for `createGetValidationErrorsFn`. A function holds no data, so the property is left out of the error report and the others are still checked. You see this for an optional function property or one in a union member. A required one reports `validation-errors-method-dropped`. Remove the property, or replace it with the data it would produce.",
		Example: `import {createGetValidationErrorsFn} from '@mionjs/run-types';
interface Button { label: string; onClick?: () => void }
export const getButtonErrors = createGetValidationErrorsFn<Button>();`,
		NestedExample: `import {createGetValidationErrorsFn} from '@mionjs/run-types';
interface Toolbar { button: { label: string; onClick?: () => void } }
export const getToolbarErrors = createGetValidationErrorsFn<Toolbar>();`,
	},
	CodeVEMethodDropped: {
		Summary: "Same as `validate-method-dropped`, for `createGetValidationErrorsFn`. A method like `greet(): string`, or a function property like `onClick: () => void`, is not data, so it is left out of the error report. To check its result, store that result in a data property.",
		Example: `import {createGetValidationErrorsFn} from '@mionjs/run-types';
interface User { name: string; greet(): string; }
export const errorsOf = createGetValidationErrorsFn<User>();`,
		NestedExample: `import {createGetValidationErrorsFn} from '@mionjs/run-types';
interface Account { user: { name: string; greet(): string } }
export const errorsOf = createGetValidationErrorsFn<Account>();`,
	},
	CodeVEStaticDropped: {
		Summary: "Same as `validate-static-dropped`, for `createGetValidationErrorsFn`. Static members belong to the class, not its instances, so they are left out of the error report.",
		Example: `import {createGetValidationErrorsFn} from '@mionjs/run-types';
class Config { static version = 1; name = ''; }
export const errorsOf = createGetValidationErrorsFn<Config>();`,
		NestedExample: `import {createGetValidationErrorsFn} from '@mionjs/run-types';
class Config { static version = 1; name = ''; }
interface App { config: Config }
export const errorsOf = createGetValidationErrorsFn<App>();`,
	},
	CodeVESymbolKeyedDropped: {
		// No Example, same reason as validate-symbol-key-dropped: the slot is not emitted today.
		Summary: "Same as `validate-symbol-key-dropped`, for `createGetValidationErrorsFn`. JSON has string keys only, so a symbol-keyed property is left out of the error report. Use a string key if the property holds real data.",
		Fix: `interface Item {
  id: string; // instead of [Symbol.for('id')]: string
}`,
	},
	CodeVENonSerializablePropDrop: {
		Summary: "Same as `validate-non-data-property-dropped`, for `createGetValidationErrorsFn`. A property holding a symbol, a `Promise` or a built-in class with no data form (a typed array, `ArrayBuffer`, `URLSearchParams` and similar) is left out of the error report, and the other properties are still checked. A value that holds one inside, like `symbol[]` or `Map<string, symbol>`, cannot be dropped, so the whole type fails with the matching error, such as `validation-errors-symbol-root`.",
		Example: `import {createGetValidationErrorsFn} from '@mionjs/run-types';
interface Box { id: symbol; name: string; }
export const errorsOf = createGetValidationErrorsFn<Box>();`,
		NestedExample: `import {createGetValidationErrorsFn} from '@mionjs/run-types';
interface Shelf { box: { id: symbol; name: string } }
export const errorsOf = createGetValidationErrorsFn<Shelf>();`,
	},
	CodeVERootAnyUnknown: {
		Summary: "Same as `validate-any-accepts-all`, for `createGetValidationErrorsFn`. `any` and `unknown` have nothing to check, so the error list is always empty. Narrow the type to the shape you expect.",
		Fix:     "const errorsOf = createGetValidationErrorsFn<User>(); // instead of <unknown>",
		Example: `import {createGetValidationErrorsFn} from '@mionjs/run-types';
export const errorsOf = createGetValidationErrorsFn<unknown>();`,
	},

	// ─────────────────────── pure functions (purefn-*) ───────────────────────

	// No Example: purefn-not-registered needs a pure fn whose registration is absent from the program, and the
	// built-ins register through the `mion` package itself, which the harness always has present.
	CodeMissingPureFnDep: {
		Summary: "A generated validator or encoder calls a pure function through `utl.usePureFn`, but no file in the build registers that id, so the code would fail when it runs. Either the file that registers it is outside the build, or its body changed after the id was copied by hand (the id is the package plus a hash of the body). Import the id from the file that registers it with `registerPureFnFactory`, and make sure that file is part of the build.",
		Fix: `import {registerPureFnFactory} from '@mionjs/run-types/runtime';
export const newRunTypeErr = registerPureFnFactory((utl) => (message) => new Error(message));`,
	},
	// No Example: purefn-package-not-built needs an installed package with no compiled pure fn, which the harness
	// cannot stage.
	CodePureFnDepUnbuilt: {
		Summary: "A pure function imported from another package is built from that package's compiled pure functions (the `mion-pure-fns/` directory its mion build writes next to its output) or from its TypeScript sources. This package ships neither. Build it with mion (a bundler plugin or `mion compile`) and publish its output directory, or publish its sources.",
	},
	// No Example: purefn-artifact-unreadable and purefn-artifact-conflict need an installed package with a `mion-pure-fns/`, which the
	// harness cannot stage.
	CodePureFnArtifactUnreadable: {
		Summary: "A mion build writes a package's compiled pure functions to `mion-pure-fns/` next to its output: an `index.json` plus one module per function. This file was skipped: the index is not an index or has a format this compiler does not know, or a module it lists is missing or holds nothing for its id. The package may then seem to ship no pure functions, or miss one. Update mion to the version that wrote the directory, or rebuild the package with your version.",
	},
	CodePureFnArtifactConflict: {
		Summary: "Two `mion-pure-fns/` directories of the same installed package give this id a different body or name, so one is stale or comes from another build. One id must mean one body under one name, so the build stops rather than pick one. Rebuild the package so every output directory has the same `mion-pure-fns/`, or delete the stale copy.",
	},
	CodeDestructuredParam: {
		Summary: "A destructured parameter like `({a, b})` or `([x, y])` has no single name the build can refer to. Take one plain parameter and destructure it inside the body.",
		Fix: `const myFn = registerPureFnFactory((utl) => (params) => {
  const {a, b} = params;
  return ...;
});`,
	},
	CodePurityThis: {
		Summary: "A pure function is built on its own at build time, so there is no `this` to bind. Pass the value in as a parameter, or move the function out of the class or object method that owns `this`.",
		Fix: `const myFn = registerPureFnFactory((utl) => (self, input) => {
  return self.field + input;
});`,
	},
	CodePurityAwait: {
		Summary: "A pure function must run synchronously so the build can call it at compile time, and `async` returns a Promise that only resolves at runtime. Make the factory synchronous and do the async work in the caller.",
		Fix: `const myFn = registerPureFnFactory((utl) => {
  return (resolvedValue) => transform(resolvedValue);
});`,
	},
	CodePurityYield: {
		Summary: "A generator keeps state between steps, and the build cannot write that out as standalone code. Return an array or a plain iterable instead.",
		Fix: `const myFn = registerPureFnFactory((utl) => (input) => {
  return [...computeAll(input)];
});`,
	},
	CodePurityDynamicImport: {
		Summary: "`import()` loads a module at runtime, and the build needs every dependency up front. Use a top-level `import`, or pass the module in as a parameter.",
	},
	CodePurityForbidden: {
		Summary: "Globals such as `eval`, `Function`, `fetch`, `XMLHttpRequest`, `require`, `process`, `globalThis`, `window` and `document` are blocked in a pure function. They run arbitrary code or depend on an environment the build cannot reproduce. Remove the reference, or pass the value you need in as a parameter.",
	},
	CodePurityClosure: {
		Summary: "The build copies a factory's body without the scope around it, so a variable from outside becomes `undefined` at runtime. Pass it in as a parameter, write its value inside the body if it is a constant, or call another pure function through `utl.getPureFn` and its id.",
		Fix: `import {slugify} from './slug';
// pass the value in
const withRate = registerPureFnFactory((utl) => (rate, value) => value * rate);
// or reach another pure function by its id
const toSlug = registerPureFnFactory((utl) => (value) => utl.getPureFn(slugify)(value));`,
	},
	CodePurityDepNotLiteral: {
		Summary: "`utl.usePureFn` and `utl.getPureFn` need a fixed id, so the build can check that the pure function is registered and write the id into the output. Pass the value a registration returned, imported from a file in this build, or a string literal.",
		Fix: `import {slugify} from './slug';
const myFn = registerPureFnFactory((utl) => (input) => utl.usePureFn(slugify)(input));`,
	},
	CodePureFnIdMismatch: {
		Summary: "The build adds a pure function's id itself, so your source normally passes none. Editing the body changes the id (renaming or moving the function does not), so a hand-written or outdated id registers the body under one id while every reference uses another. Delete the id argument and let the build add it, or regenerate the file the id is imported from.",
	},
	CodePureFnDependencyCycle: {
		Summary: "A pure function's id depends on the ids of the pure functions it calls, so two that call each other can never get an id, and at runtime they would call each other forever. Break the cycle: copy the shared part into both, or move it into a third pure function that calls neither.",
	},
	CodeMarkerDuplicateFnKey: {
		Summary: "An `InjectTypeFnArgs` marker lists each function family once. A repeat adds nothing and is usually a copy and paste slip. The build ignores it, so remove it from the list.",
		Fix: `function route<H extends Handler>(
  handler: H,
  fns?: InjectTypeFnArgs<Parameters<H>, 'validationErrors', 'jsonDecoder', 'jsonEncoder'>,
) {
  return {handler, fns};
}`,
		Example: `import type {InjectTypeFnArgs} from '@mionjs/run-types';
type Handler = (ctx: unknown, ...rest: any[]) => unknown;
function route<H extends Handler>(handler: H, fns?: InjectTypeFnArgs<Parameters<H>, 'validationErrors', 'jsonDecoder', 'validationErrors'>) {
  return {handler, fns};
}
export const lenRoute = route((ctx: unknown, name: string) => name.length);`,
	},

	CodeMarkerUnresolvedFnName: {
		Summary: "Each name in an `InjectTypeFnArgs` marker must be a function family, like `validationErrors`. An unknown name compiles nothing, so at runtime the call falls back to its no-plugin behaviour. The old short tags (`val`, `verr`, `pjs`) are not accepted; use the full name. The message suggests the closest name when there is one.",
		Fix: `function route<H extends Handler>(
  handler: H,
  fns?: InjectTypeFnArgs<Parameters<H>, 'validationErrors'>,
) {
  return {handler, fns};
}`,
		Example: `import type {InjectTypeFnArgs} from '@mionjs/run-types';
type Handler = (ctx: unknown, ...rest: any[]) => unknown;
function route<H extends Handler>(handler: H, fns?: InjectTypeFnArgs<Parameters<H>, 'verr'>) {
  return {handler, fns};
}
export const lenRoute = route((ctx: unknown, name: string) => name.length);`,
	},

	// ──────────────────── unresolved type name (marker-any-from-unresolved-name) ────────────────────

	CodeMarkerUnresolvedTypeName: {
		Summary: "A type name at this marker did not resolve, so TypeScript read it as `any` and the generated functions would accept every value. A real `any`, written as `any` or through an alias like `type Loose = any`, is always allowed. Usual causes: a typo, a dependency whose types are not installed, or a `.d.ts` file the tsconfig `include` or `files` does not cover. After adding a `.d.ts`, restart the dev server or your editor's linter.",
		Fix: `// src/ambient.d.ts, matched by the tsconfig include set
declare interface Ambient { a: string; b: number }`,
		Example: `import {getRunTypeId} from '@mionjs/run-types';
export const id = getRunTypeId<{value: Missing}>();`,
		NestedExample: `import {getRunTypeId} from '@mionjs/run-types';
interface Payload { id: string; user: Missing }
export const id = getRunTypeId<{payload: Payload}>();`,
	},

	// ──────────────────── typeless private member (marker-untyped-private-member) ────────────────────
	CodeMarkerTypelessPrivateMember: {
		Summary: "A class read from a `.d.ts` file has a `private` member with no type. Plain `tsc` writes every private field and method this way, so RunTypes cannot check it and the build fails. Build the package with `mion compile`, which keeps the type by writing the member as `protected` (outside code still cannot read it), or point its `types` at its TypeScript sources.",
		Fix: `// package.json of the class's package
{"scripts": {"build": "mion compile --tsconfig tsconfig.build.json"}}`,
		Example: `import {getRunTypeId} from '@mionjs/run-types';
declare class Account { id: string; private balance; }
export const id = getRunTypeId<Account>();`,
		NestedExample: `import {getRunTypeId} from '@mionjs/run-types';
declare class Account { id: string; private balance; }
export const id = getRunTypeId<{account: Account}>();`,
	},

	CodeTypeIdCollision: {
		// No Example: the trigger is two shapes hashing to the same seven characters, which no short
		// snippet can arrange.
		Summary: "Two types got the same short id, so the build cannot tell them apart and stops. Raise `hashLength` (the exact id length) by one in your tsconfig plugin entry or on the build plugin; each extra character gives 62 times more ids. The error names both types, the length to use, and the call that took the id first.",
		Fix:     `{"compilerOptions": {"plugins": [{"name": "mion", "hashLength": 8}]}}`,
	},
	CodeMarkerFunctionCallArg: {
		Summary: "A marker given a function call, like `createValidateFn(getUser())` or `getRunTypeId(getUser())`, runs that call at runtime only to read its type. Use the type form with `ReturnType`, or pass a value you already have.",
		Fix: `const isUser = createValidateFn<ReturnType<typeof getUser>>();

// or pass an existing value of that type
const userTypeId = getRunTypeId(existingUser);`,
	},
	CodeMarkerFreeTypeParameter: {
		Summary: "Inside a generic function the marker sees `T`, not a real type, and `T` changes with each caller, so no single id fits. Call the marker where the type is known, like `createValidateFn<User>()`, or let the caller pass the id in with `InjectRunTypeId<T>`.",
		Fix: `function makeChecker<T>(id: InjectRunTypeId<T>) {
  return createValidateFn<T>(id);
}
const isUser = makeChecker<User>(getRunTypeId<User>());`,
	},
	CodeMarkerAnyFromUnresolvedImport: {
		Summary: "An import in this file did not resolve, so its type became `any` at this marker. A validator over `any` accepts everything, a mock returns `undefined`, and encoders pass values through unchanged. Usual causes: an import without a file extension under `moduleResolution: NodeNext`, a missing dependency, or a `paths` alias missing from the tsconfig mion reads. Fix the import, or give mion the same tsconfig as your bundler. For a real `any`, use an alias like `type Loose = any` declared in a file whose imports all resolve.",
		Fix:     "import {User} from './user.runtype.ts';",
	},
	CodeStructuralIdDepthExceeded: {
		Summary: "The type is nested hundreds of levels deep, written out or generated, with no named type that repeats, and mion stops at a depth far past any real shape. Use a smaller part of the type (such as the item or data you actually send), or recurse through a named type that refers to itself, like a plain recursive interface.",
	},
	CodeMarkerSelfInstantiatingGeneric: {
		Summary: "A generic method that returns its own type with new type arguments, like `map<U>(fn: (x: T) => U): Iter<U>`, makes the type grow forever, and renaming the arguments does not help. Write a fully resolved recursive type instead, or reflect only the data, since validators skip methods. Normal generics like `Map<string, User>`, and generic methods that do not return their own type, work fine.",
		Fix:     "interface NumberIter { map(fn: (x: string) => number): NumberIter }",
	},
	CodeMarkerUnresolvedTypeParameter: {
		Summary: "A type parameter of the surrounding generic changes with each call, so no single id fits, and a default on the parameter does not help inside the generic's body. Resolve the generic first, like `type BoxString = Box<string>`, or let the caller pass the id in (see marker-in-generic-function). Generic methods on a concrete type, like `find<T>(query: string): T[]`, are fine.",
		Fix: `interface Box<T> { value: T }
type BoxString = Box<string>;
const isBoxString = createValidateFn<BoxString>();`,
	},
	CodeMarkerUnresolvedGenericType: {
		Summary: "TypeScript rejects this too (TS2314), but dev server builds skip the type check, and the type would become `any` with a validator that accepts everything. Pass the missing type argument, or give the parameter a default, used wherever the type is written without arguments.",
		Fix: `const isA = createValidateFn<A<string>>();

// or give the parameter a default
interface A<S extends string = string> { a: S }`,
	},
	CodeMarkerUntrustedPackage: {
		Summary: "A marker type counts only when a trusted package declares it, so a same-named type of your own is ignored. This one comes from an untrusted package, so the call builds for `unknown` and its validator accepts everything. Add the package to `markers.packages` in your tsconfig plugin entry, `markers` on the build plugin, or `--marker-packages` on the command line (`@mionjs/run-types` stays trusted). A package that re-exports the markers from `@mionjs/run-types` needs no setting, so check whether it meant to.",
		Fix:     "{\"compilerOptions\": {\"plugins\": [{\"name\": \"mion\", \"markers\": {\"packages\": [\"@my-org/runtypes-markers\"]}}]}}",
	},

	// ──────────────────── unsafe property name (data-proto-property-dropped) ────────────────────

	CodeUnsafePropertyName: {
		Summary: "A property named `__proto__` is left out of every generated function, anywhere in the type (nested objects, array items and Map values too). Setting that key changes the object's prototype instead of storing a value, so it never exists at runtime even though TypeScript accepts it. `prototype` and `constructor` are normal names and are kept. Rename the property to keep the data.",
		Fix:     `interface Settings { ok: number; parent: string }`,
		Example: `import {createValidateFn} from '@mionjs/run-types';
interface Settings { ok: number; __proto__: string }
export const isSettings = createValidateFn<Settings>();`,
		NestedExample: `import {createValidateFn} from '@mionjs/run-types';
interface Outer { inner: Map<string, { ok: number; __proto__: string }> }
export const isOuter = createValidateFn<Outer>();`,
	},

	// ──────────── mion route rules: unsafe property name (rpc-handler-non-data-property) ────────────

	// Resolved router and Drizzle packages are required; frontend fixtures cover nested public types.
	CodeRouteDrizzleType: {
		Summary: "A written public parameter or return type depends on drizzle-orm, including nested models and model projections. Client type checking must expand those database types. Use a slim model from @mionjs/drizzle-orm or a plain public type. Drizzle queries and internal types inside the handler are allowed.",
		Fix:     "import type {User} from './schema.ts';\nconst list = mion.query(async (_ctx): Promise<User[]> => db.select().from(usersDb));",
	},
	CodeDrizzleSchemaDependency: {
		Summary: "A file that defines slim schemas or models also imports Drizzle types or the toDrizzle bridge. Clients may import these models directly, loading heavy database declarations or server dependencies. Keep schemas and models in their own file. Import them into a companion file for toDrizzle, database setup, relations and queries. A query or router file may import both kinds of types when it does not define slim schemas or models.",
		Fix:     "// schema.ts: define slim tables and models\n// db.ts: import the slim tables, then call toDrizzle",
	},
	CodeRouteUnsafePropertyName: {
		Summary: "Writing `__proto__` on a plain object changes its prototype instead of adding a key, so the value never round trips, even though TypeScript accepts the type. It is reported on the declaration in any interface, type literal or class, even before a route uses it. Rename the property to keep the data (`prototype` and `constructor` are fine).",
		Fix:     `interface Settings { ok: number; parent: string }`,
		Example: `export interface Settings { ok: number; __proto__: string }
export const settings: Settings = {ok: 1, __proto__: 'x'};`,
		NestedExample: `export interface Outer { inner: { ok: number; __proto__: string } }
export const outer: Outer = {inner: {ok: 1, __proto__: 'x'}};`,
	},

	// ──────────── server imports (rpc-client-imports-server-value) ────────────

	CodeServerImportInClient: {
		Summary: "The API type you pass to `initClient` comes from your server code. Imported without `type`, your bundler can ship that server module, the mion router and everything they import to the browser. It is an error even when your build would drop the import, because a client never imports server code. `import type` is always removed at build time.",
		Fix:     `import type {MyApi} from '../server/api';`,
	},

	// ───────────────────────── batch routes (rpc-batch-*) ─────────────────────────

	CodeBatchElementNotReadable: {
		Summary: "Each item in `batch([...])` must be a call on the client routes, like `routes.users.getById(1)`, written inline or saved in a `const` or `let` in the same file. The build reads them to know which routes run, in what order. A spread, a function parameter, a call on anything other than the routes, or a variable not set to a route call cannot be read.",
		Fix: `const user = routes.users.getById(id);
batch([user, routes.orders.list()]);`,
	},
	CodeBatchSourceNotInBatch: {
		Summary: "Routes in a batch run in the order you list them, and `inputFrom()` can only read a route that already ran. Put the source route in the same `batch([...])` call, before the route it feeds.",
		Fix:     "batch([user, routes.orders.list(inputFrom(user, 'toUserId'))]);",
	},
	CodeBatchIdCollision: {
		Summary: "Two different batches got the same id, so the server cannot tell them apart. The id is built from the route order and the input mappings, and this almost never happens. Change the route order of one batch, or split it into two batches.",
	},
	CodeBatchMapperNotReadable: {
		Summary: "The mapper you pass to `inputFrom()` must be an inline function, or a string with the name of a mapper registered on the server. A function reference, a computed string or a value from a parameter cannot be read at build time.",
		Fix: `inputFrom(user, (u) => u.id);
// or the name of a mapper registered on the server
inputFrom(user, 'toUserId');`,
	},
	CodeBatchDuplicateRoute: {
		Summary: "One batch cannot call the same route twice. Results come back by route, so the second call would replace the first. Keep one call per route, or split the calls into two batches.",
		Fix: `batch([routes.users.getById(1)]);
batch([routes.users.getById(2)]);`,
	},
	CodeBatchMappingParamOutOfRange: {
		Summary: "The server passes a mapped input at the argument position where you wrote `inputFrom()`, so that position (counted from zero) must be one of the route handler's parameters. Otherwise the server would reject the request at runtime.",
		Fix: `// getById(id) takes 1 argument
routes.orders.getById(inputFrom(user, 'toUserId'));`,
	},
	CodeBatchMapperMissing: {
		Summary: "Each inline `inputFrom(source, (value) => ...)` mapper becomes a pure function the server build copies next to the batch table. This one produced nothing, so the server would answer the batch with a missing mapper error. Fix the pure function errors (`purefn-*`) at its `inputFrom()` call, or use the name of a mapper registered on the server.",
		Fix:     "inputFrom(user, 'toOrgId')",
	},
	CodeBatchNoRouterInit: {
		Summary: "The build adds the batch table import to every module that calls `createMionRouter` from `@mionjs/router`, following aliases, namespace imports and local re-export files. It found none, for example because a wrapper from another package creates the router, so the server never loads the table. Import the table yourself in the module that creates the router (path relative to that module), or call `createMionRouter` from a source file of this project.",
		Fix:     "import './<genDir>/rpc/batches.generated.js';",
	},

	// ───────────────────── build-time arguments (marker-comptime-arg-*) ─────────────────────

	CodeCompTimeArgsNonLiteral: {
		Summary: "The build reads a `CompTimeArgs<T>` argument from your source, so it must be a literal or a `const` whose value is all literals, declared in the same file or imported. Function calls, property access, ternaries and `let` or `var` variables cannot be read, and an object `const` needs `as const` (marker-comptime-arg-widened-const). If the value is only known at runtime, use the untracked version of the function: `getPureFnByKey`, `hasPureFnByKey` and `getCompiledPureFnByKey` instead of `getPureFn`, `hasPureFn` and `getCompiledPureFn`.",
		Fix: `const isUser = createValidateFn<User>(undefined, {mode: 'unsafe'});

// or a const of literals, here or in another module
const opts = {mode: 'unsafe'} as const;
const isUserToo = createValidateFn<User>(undefined, opts);`,
	},
	CodeCompTimeArgsDepthExceeded: {
		Summary: "A `CompTimeArgs<T>` literal can nest at most 16 levels deep. Flatten it, or split it into several smaller `CompTimeArgs<T>` arguments.",
	},
	CodeCompTimeArgsForbiddenConstruct: {
		Summary: "Every part of a `CompTimeArgs<T>` literal must be a string, number, bigint, boolean, `null`, `undefined`, regex, arrow function, object or array literal, or a `const` that points to one. Computed property names, function calls, ternaries and template strings with `${}` are rejected. A spread works only on a `const` (or imported) object literal inside an object, or an array literal inside an array. If the value is only known at runtime, use the untracked version of the function: `getPureFnByKey`, `hasPureFnByKey` and `getCompiledPureFnByKey` instead of `getPureFn`, `hasPureFn` and `getCompiledPureFn`.",
		Fix: `const base = {strict: true} as const;
const options = {...base, mode: 'unsafe'} as const;`,
	},
	CodeCompTimeArgsWidenedConst: {
		Summary: "A `const` passed as a `CompTimeArgs` or `CompTimeFnArgs` argument (a whole options object, or a builder child) must keep literal types. Without `as const`, `{strategy: 'mutate'}` widens to `{strategy: string}`, and TypeScript can pick one function variant while the build injects another. Add `as const` to the declaration.",
		Fix: `const preset = {strategy: 'mutate'} as const;
createJsonEncoderFn(undefined, preset);`,
	},

	// ───────────────────────── type formats (format-*) ─────────────────────────

	CodeFMTSampleMismatch: {
		Summary: "A `mockSample` does not match its `pattern` (checked with the same regex your validator uses), so mock data built from it would fail validation. Change the sample or the pattern so they agree.",
		Fix:     "type Slug = String<{pattern: {source: '^[a-z]+$'; mockSamples: ['abc', 'xyz']}}>;",
	},
	CodeFMTInvalidParams: {
		Summary: "A format's settings break one of its rules, so its validator would be wrong or would throw. The message names the rule, for example `length` used with `minLength` or `maxLength`, `maxLength` below `minLength`, more than 100 `allowedValues`, or a `pattern` that is not a valid JavaScript regex. A string format takes only one of `pattern`, `allowedChars`, `disallowedChars`, `allowedValues` or `disallowedValues`, and `disallowedChars` or `disallowedValues` need `mockSamples`. Change the settings the message names.",
	},
	CodeFMTSampleBounds: {
		Summary: "A `mockSample` breaks another setting of the same format: `length`, `minLength`, `maxLength`, `allowedChars`, `disallowedChars` or `disallowedValues`. Mock data would then be invalid, or `createMockDataFn` would drop every sample and throw. Lengths count UTF-16 code units, the same as the validator's `.length` check. Change the sample or relax the setting.",
		Fix:     "type B = String<{minLength: 1; pattern: {source: '^b+$'; mockSamples: ['b', 'bb']}}>;",
	},
	CodeFMTMissingJsRuntime: {
		Summary: "mion checks each `pattern` on a real JavaScript engine (that it compiles and that its `mockSamples` match), and no JavaScript runtime could be started. Install node or bun (both found on your PATH), or point `--js-runtime` or `MION_JS_RUNTIME` at another runtime such as deno. Projects with no patterns never need this.",
	},
	CodeFMTSampleGenFailed: {
		Summary: "A `pattern` with no `mockSamples` gets samples generated at build time, and none came out. Either generation is off (`patternSampleCount` is 0), the pattern uses something the generator cannot handle (usually a lookaround), or all `patternSampleCount` times `patternSampleRetries` tries failed the pattern or its length limits. Declare `mockSamples` yourself (they are still checked against the pattern), or set `patternSampleCount` above 0 and raise `patternSampleRetries` for a heavily constrained pattern.",
		Fix:     "type Y = String<{pattern: {source: '(?<=x)y'; mockSamples: ['xy']}}>;",
	},
	CodeFMTSampleConflict: {
		Summary: "Two formats that differ only in their `mockSamples` share one validator entry, which keeps only one sample list. Which list wins would depend on the order your code is read, so the build stops. Use the same `mockSamples` in both, or declare them in one and leave them out of the other. If the two types really differ, give them a different pattern, bound or brand.",
		Fix: `type A = String<{maxLength: 5; mockSamples: ['aaa']}>;
type B = String<{maxLength: 5; mockSamples: ['aaa']}>; // same samples
// or leave them out: type B = String<{maxLength: 5}>;`,
	},
	CodeFMTPatternTimeout: {
		Summary: "Each `mockSample` runs through your pattern with a time limit, and this one ran out of time even on a longer retry. Either the pattern backtracks without end (nested repeats such as `(a+)+` on a long input are the usual cause), or the machine was too busy. The next build checks again, so a one-off slowdown clears by itself. If it keeps failing on an idle machine, rewrite the pattern without nested repeats, or shorten the sample it times out on.",
	},
	CodeFMTPatternUnsafe: {
		Summary: "The `pattern` can match the same text in more than one way, and JavaScript tries every way before it gives up, so a few dozen almost-matching characters can hang your validator. Make each repeat match one way only, usually by giving the repeated part a boundary the rest cannot match. If the pattern is safe and the check is wrong, add `unsafePattern: true` to the pattern.",
		Fix: `type Words = String<{pattern: {source: '^\\w+(?:\\s\\w+)*$'}}>;
// only if the check is wrong:
type Safe = String<{pattern: {source: '...'; unsafePattern: true}}>;`,
	},
	CodeFMTPatternUnreadable: {
		Summary: "The build reads a `pattern` from its type. A RegExp value, or a const typed as plain `FormatPattern`, keeps no source in its type, and a `.d.ts` keeps only the type. The validator would then not check the pattern at all. Use a `registerFormatPattern` const without a type annotation, or write the source as a literal.",
		Fix: `const sku = registerFormatPattern({source: '^[A-Z]{3}-[0-9]{4}$'});
type Sku = String<{pattern: typeof sku}>;
// or
type Sku = String<{pattern: {source: '^[A-Z]{3}-[0-9]{4}$'}}>;`,
		Example: `import {createValidateFn} from '@mionjs/run-types';
import * as TF from '@mionjs/run-types/formats';
declare const sku: {readonly source: string};
export const isSku = createValidateFn<TF.String<{pattern: typeof sku}>>();`,
		NestedExample: `import {createValidateFn} from '@mionjs/run-types';
import * as TF from '@mionjs/run-types/formats';
declare const sku: {readonly source: string};
export const isOrder = createValidateFn<{item: {sku: TF.String<{pattern: typeof sku}>}}>();`,
	},

	// ────────────────────── FriendlyText files (enrich-text-*) ───────────────────────

	CodeFriendlyUnknownField: {
		Summary: "This FriendlyText entry names a field your type does not have: it was removed, renamed or misspelled. Its labels and messages are never used. Remove the entry, or run `mion enrich <source.ts> <Type> --update` so the file follows the type (a renamed field keeps its values).",
		Fix:     "mion enrich <source.ts> <Type> --update",
	},
	CodeFriendlyUnknownConstraint: {
		Summary: "An `rt$errors` key must name a failure the field can produce: `type`, `rt$default`, or one of the field's format constraints (`minLength`, `pattern`, `min`, and so on). Any other key is never used. Remove the key, or add the matching constraint to the field's type format.",
		Fix: `interface User { name: string & FormatString<{minLength: 2}> }
export const friendlyUser: FriendlyText<User> = {
  name: {
    rt$errors: {
      minLength: 'Name needs at least 2 characters',
    },
  },
};`,
	},
	CodeFriendlyMissingConstraint: {
		Summary: "Each failure a field can produce needs its own `rt$errors` key, unless the record uses `rt$default`. A missing key shows a generic message for that failure. Add the key, or run `mion enrich <source.ts> <Type> --update` to add it as a blank to fill in.",
		Fix:     "mion enrich <source.ts> <Type> --update",
	},
	CodeFriendlyBadPlaceholder: {
		Summary: "Error messages fill in only the four placeholders listed above; any other `$[name]` shows as plain text. A format suffix such as `$[val:currency]` is not supported either, since plain `$[val]` already formats by the field's type. Use a supported placeholder, or drop the `$[...]` wrapper.",
		Fix:     "rt$errors: {minLength: '$[label] is too short'}",
	},
	CodeFriendlyPluralNoOther: {
		Summary: "A plural message shows the arm that matches the count, and every language falls back to `other`. Without `other`, some counts get no message at all. Add an `other` arm to the plural object.",
		Fix: `rt$errors: {
  minLength: {
    one: 'Needs one more character',
    other: 'Needs $[val] more characters',
  },
}`,
	},
	CodeFriendlyPluralBadArm: {
		Summary: "Plural arm names must be CLDR plural categories. Any other name is never picked, in any language. Rename the arm to one of the six categories, or remove it.",
		Fix: `rt$errors: {
  minLength: {
    one: 'Needs one more character',
    other: 'Needs $[val] more characters',
  },
}`,
	},
	CodeFriendlyPluralNoCount: {
		Summary: "Only constraints with a count (`minLength`, `maxLength`, `min`, `max`, and so on) can pick a plural arm. On any other constraint, such as `pattern`, only the `other` arm is ever shown. Replace the plural object with a plain string.",
		Fix: `rt$errors: {
  pattern: 'Only letters and numbers are allowed',
}`,
	},
	CodeFriendlyDefaultNotAlone: {
		Summary: "An `rt$errors` object holds either one `rt$default` message for every failure, or one message per constraint. Mixing both leaves it unclear which message is shown. Keep `rt$default` alone, or keep the per-constraint keys and remove `rt$default`.",
		Fix: `rt$errors: {
  minLength: 'Name is too short',
}`,
	},
	CodeFriendlyReservedProp: {
		Summary: "Keys starting with `rt$` (`rt$label`, `rt$errors`, `rt$items`, and so on) are reserved for enrichment settings, so `mion enrich` refuses a type with such a property and writes no FriendlyText file. Rename the property; a plain `$` prefix is fine.",
		Fix: `interface Config {
  $mode: string;
}`,
	},
	CodeFriendlyTodo: {
		Summary: "`mion enrich` adds a `@todo` line to every new FriendlyText const it generates, and the const still holds empty values. Fill in the real labels and error messages, then delete the `@todo` line yourself (mion never removes it). `mion enrich --no-emit` reports it without failing, while `--require-complete` and production builds fail on it.",
		Fix: `/** @rtType User#a1b2c3 @rtIds {name: d4e5f6} */
export const friendlyUser: FriendlyText<User> = {
  name: {rt$label: 'Name'},
};`,
	},
	CodeFriendlyOrphanConst: {
		Summary: "`mion enrich --update` (or the build plugin in dev) commented out this FriendlyText const because its type was deleted or renamed. The comment keeps your labels and messages. If the type is gone, run `mion enrich --prune` to remove it. If it was renamed, run `mion enrich <source.ts> <NewName> --update` to get your values back.",
		Fix: `# the type is gone
mion enrich --prune
# the type was renamed
mion enrich <source.ts> <NewName> --update`,
	},
	CodeFriendlyOrphanField: {
		Summary: "`mion enrich --update` (or the build plugin in dev) commented out this field because your type no longer has it. The comment keeps your value. If the field is gone, run `mion enrich --prune`. If it was renamed, run `mion enrich <source.ts> <Type> --update`, and the value moves to the new field when the field's type did not change.",
		Fix: `# the field is gone
mion enrich --prune
# the field was renamed
mion enrich <source.ts> <Type> --update`,
	},
	CodeFriendlyBlankValue: {
		Summary: "An empty string (`''`) in an `rt$label` or `rt$errors` slot is a generated blank, and it shows up empty in your UI. Deleting the `@todo` line alone is not enough: write the real label or message. `mion enrich --no-emit` reports it without failing, while `--require-complete` and production builds fail on it.",
		Fix: `export const friendlyUser: FriendlyText<User> = {
  name: {rt$label: 'Name'},
};`,
	},

	// ───────────────────── enrichment file links (enrich-mirror-*) ─────────────────────

	CodeGenMirrorUnreadable: {
		Summary: "mion could not read this FriendlyText or MockData file, for example because of file permissions, a broken symlink, or another program writing to it at the same moment. Make the file readable, then run `mion enrich --no-emit` again.",
		Fix:     "mion enrich --no-emit",
	},
	CodeGenMirrorDrift: {
		Summary: "Each source file has one expected path per file kind under the enrich folder (`friendly/`, `mock/`, and one per translation locale). This file sits somewhere else, usually because you moved the source or changed `genDir`. Run `mion enrich <source.ts> <Type> --update` to write the files at the right paths.",
		Fix:     "mion enrich <source.ts> <Type> --update",
	},
	CodeGenSourceMissing: {
		Summary: "The `import type` line at the top of this file points to a source file that no longer exists, so its consts describe types that are gone. If you deleted the source, delete this file, its FriendlyText or MockData sibling, and any translation files. If you moved the source, run `mion enrich` on it at the new location, then delete the old files.",
	},
	CodeGenTypeMissing: {
		Summary: "This file imports a type your source file no longer declares (renamed or removed). Run `mion enrich <source.ts> <Type> --update`: it comments out the old consts as `@rtOrphan`, so your values stay. Then run `mion enrich --prune` to remove the ones that should not come back.",
		Fix: `mion enrich <source.ts> <Type> --update
mion enrich --prune`,
	},

	// ─────────────────── JSON composite functions (internal-*) ───────────────────

	CodeCompositeMissingPrimitive: {
		Summary: "The JSON code mion generated for your type points to a piece that was never built, so it would crash when called and a production build stops. This is a bug in mion, not in your code: report it with the type and the call site named in the error.",
	},

	CodeUnsupportedLeafNoCode: {
		Summary: "The code mion generated for your type meets a kind of value it cannot handle and has no message for, so the function always throws. This is a bug in mion, not in your code: report it with the type and the call site named in the error.",
	},

	// ──────────────────────── MockData files (enrich-mock-*) ─────────────────────────

	CodeMockUnknownField: {
		Summary: "This MockData entry names a field your type does not have: it was removed, renamed or misspelled. Its pool or range never feeds a mock. Remove the entry, or run `mion enrich <source.ts> <Type> --update` so the file follows the type.",
		Fix:     "mion enrich <source.ts> <Type> --update",
	},
	CodeMockReservedProp: {
		Summary: "Keys starting with `rt$` (`rt$items`, `rt$length`, `rt$optional`, and so on) are reserved for enrichment settings, so `mion enrich` refuses a type with such a property and writes no MockData file. Rename the property; a plain `$` prefix is fine.",
		Fix: `interface Config {
  $size: number;
}`,
	},
	CodeMockTodo: {
		Summary: "`mion enrich` adds a `@todo` line to every new MockData const it generates, and the const still holds empty pools. Fill in realistic sample pools and ranges, then delete the `@todo` line yourself (mion never removes it). `mion enrich --no-emit` reports it without failing, while `--require-complete` and production builds fail on it.",
		Fix: `/** @rtType User#a1b2c3 @rtIds {name: d4e5f6} */
export const mockUser: MockData<User> = {
  name: {pool: ['Ada Lovelace', 'Linus Torvalds']},
};`,
	},
	CodeMockOrphanConst: {
		Summary: "`mion enrich --update` (or the build plugin in dev) commented out this MockData const because its type was deleted or renamed. The comment keeps your pools and ranges. If the type is gone, run `mion enrich --prune` to remove it. If it was renamed, run `mion enrich <source.ts> <NewName> --update` to get your values back.",
		Fix: `# the type is gone
mion enrich --prune
# the type was renamed
mion enrich <source.ts> <NewName> --update`,
	},
	CodeMockOrphanField: {
		Summary: "`mion enrich --update` (or the build plugin in dev) commented out this field because your type no longer has it. The comment keeps your value. If the field is gone, run `mion enrich --prune`. If it was renamed, run `mion enrich <source.ts> <Type> --update`, and the value moves to the new field when the field's type did not change.",
		Fix: `# the field is gone
mion enrich --prune
# the field was renamed
mion enrich <source.ts> <Type> --update`,
	},
	CodeMockBlankValue: {
		Summary: "An empty pool (`pool: []`) is a generated blank, so it mocks nothing. Deleting the `@todo` line alone is not enough: add realistic sample data. `mion enrich --no-emit` reports it without failing, while `--require-complete` and production builds fail on it.",
		Fix: `export const mockUser: MockData<User> = {
  name: {pool: ['Ada Lovelace', 'Linus Torvalds']},
};`,
	},

	// ───────────────────────── bundled API (rpc-client-*) ──────────────────────────

	CodeApiMetaUnreadable: {
		Summary: "When routes are bundled (`client.routes: 'bundle'`, the default), the build reads each called route's handler types, options and middlewares from the client's API type. Only `PublicApi<typeof routes>`, the type the router exports, has them; a loose `RemoteApi`, an `any`, or a member without its compiled types does not. Type the client with `PublicApi<typeof routes>`.",
		Fix:     "initClient<PublicApi<typeof routes>>({baseURL});",
	},
	CodeApiMetaRouteNotDeclared: {
		Summary: "The API type has no route with this id, usually because of a route id written by hand or a stale declaration file. Fix the route id, or rebuild the API's declarations.",
	},
	CodeApiMetaRouteWidened: {
		Summary: "A helper typed with `RouteSubRequest<any>` widens the route id to `string`, so the build cannot bundle the call inside it, and with no `useFetchMetadata` set up that call fails. Keep the route id through a generic helper, or move the call out of it. Or set up `useFetchMetadata` so the call asks the server for the route. That builds functions at runtime, which a strict Content Security Policy blocks.",
		Fix: `function run<S extends RouteSubRequest<any>>(sub: S) { return sub.call() }
// or fetch the route from the server
useFetchMetadata(middlewares.mionFetchMetadata);`,
	},
	CodeApiMetaRouteWidenedFetched: {
		Summary: "A helper typed with `RouteSubRequest<any>` widens the route id to `string`, so the build cannot bundle the call inside it. The call still works because the client sets up `useFetchMetadata`: it fetches the route's metadata on first use and builds its functions at runtime. To bundle it too, keep the route id through a generic helper.",
		Fix:     "function run<S extends RouteSubRequest<any>>(sub: S) { return sub.call() }",
	},
	CodeApiMetaOptionWidened: {
		Summary: "The bundled metadata copies each route's options from the API type, which holds only literal values. A value computed at runtime, like a variable or a call, is left unset on the client, while the server may set it. Write the option as a literal on the route or the router.",
		Fix:     "mion.route(handler, {sanitizeParams: true})",
	},
	CodeApiMetaVersionMismatch: {
		Summary: "`initClient` and `initRoutes` each get a build version from the routes they are typed with. In one program they must match, so a difference means the client was typed with another API than the one the router registered. Type the client with `PublicApi<typeof routes>` from that router.",
		Fix:     "initClient<PublicApi<typeof routes>>({baseURL});",
	},
	CodeApiMetaMiddlewareNotSetUp: {
		Summary: "A middleware gets its params on the client from its `onRequest` hook. The build found no use of this middleware in the client program, neither a hook nor an installer, so every call sends nothing and the middleware rejects it. Set it up once next to `initClient` with `middlewares.<name>.onRequest(...)`, or pass it to the installer it ships with.",
		Fix:     "middlewares.trace.onRequest((trace) => trace({headers: {'X-Trace-Id': crypto.randomUUID()}}));",
	},
	CodeApiMetaOptionalMiddlewareNotSetUp: {
		Summary: "All of this middleware's params are optional, so calls still go out, but the middleware never gets anything from this client. The build found no use of it in the client program, neither an `onRequest` hook nor an installer. Set it up with `middlewares.<name>.onRequest(...)` or its installer. A middleware with no params at all needs no setup. If sending nothing is on purpose, add `// @mion-expect-error rpc-client-optional-middleware-not-set-up` above the call.",
		Fix:     "middlewares.trace.onRequest((trace) => trace({headers: {'X-Trace-Id': crypto.randomUUID()}}));",
	},
	CodeApiMetaNoMetadataToFetch: {
		Summary: "A call fetches its metadata when the build could not bundle it, or for every route when `client.routes` is `'fetch'`. The server answers those fetches only through the `mionFetchMetadata` middleware from `@mionjs/router/middlewares`, and this API does not add it. Add it first in the server's routes and set up its client half with `useFetchMetadata`. Or, with bundling on, remove `useFetchMetadata` and keep every route id a literal so every call is bundled.",
		Fix: `// server
mion.initRoutes({mionFetchMetadata, ...routes});
// client
useFetchMetadata(middlewares.mionFetchMetadata);`,
	},
	CodeApiMetaServerVersionMismatch: {
		Summary: "A server built with `mion compile` writes its build version into the API type of its `.d.ts`. This client computed different ids from those types, usually because its tsconfig or a library version differs from the server's, so the server would answer every call with a version mismatch. Build the client with the server's tsconfig and library versions, or use `client: {routes: 'fetch'}` to read the routes from the server at runtime.",
		Fix:     "mionVitePlugin({client: {routes: 'fetch'}})",
	},
	CodeApiMetaNoServerVersion: {
		Summary: "The API types this client reads come from a `.d.ts` without a server build version, for example one written by plain `tsc`. The client still builds, but if its ids differ from the server's, you only find out at runtime. Build the API package with `mion compile` so its types carry the version and the client build checks it.",
		Fix:     "mion compile --tsconfig tsconfig.build.json",
	},
	// No Example: rpc-client-types-not-built-by-mion and rpc-client-types-other-mion-version need an installed types-only package, which the one-file example harness cannot stage.
	CodeApiMetaTypesNotBuiltByMion: {
		Summary: "A package with types and no JavaScript entry is read as a types-only API package. `mion api-types` writes one with a `mion.apiTypes` field in its package.json and the `mion-api.json` marker it names. This package lacks them, so its `.d.ts` may come from another tool, and the client cannot trust its ids, its private fields or its pure functions. Rebuild the package with `mion api-types` and publish its output folder.",
		Fix:     "mion api-types --tsconfig tsconfig.json --out api-types",
	},
	CodeApiMetaTypesOtherCompiler: {
		Summary: "Type ids include the mion version that computed them, so different versions can produce incompatible ids. The client reports a mismatch after reading the server response; fetched route metadata can restore compatible route types. Build the client with the mion version the types package names, or rebuild the package with yours.",
		Fix:     "npm install -D @mionjs/bin-compiler@<the version in mion-api.json>",
	},
	CodeApiMetaSharedModules: {
		Summary: "In `default` mode each source file gets its own module of compiled types, so a client bundle only holds the types of the files it imports. `allSingle` puts every type of the program in one module per family, server types included, and the client bundle loads all of them. Use the `default` mode for an app with a client and a server.",
		Fix:     "runTypes: {moduleMode: 'default'}",
	},
	CodeApiMetaFetchNotSetUp: {
		Summary: "With `client.routes: 'fetch'`, each call asks the server how its route works on first use, through the client half of the metadata middleware. Nothing in this program sets that up. Set it up once next to `initClient`, or build with `client.routes: 'bundle'` (the default) so every call is bundled.",
		Fix:     "useFetchMetadata(middlewares.mionFetchMetadata);",
	},

	// ──────────────────── non-enumerable members (data-*) ─────────────────────

	CodeNonEnumerableRequiresOptional: {
		Summary: "The `@nonEnumerable` tag skips a property that is not an enumerable own property of the value, but only when the property is optional. On a required property the tag is ignored and the property is always sent. Add `?` to the property, or remove the tag.",
		Fix: `interface Session {
  /** @nonEnumerable */ token?: string;
}`,
	},

	// ────────────────────────── overrides (override-*) ───────────────────────────

	CodeDuplicateOverride: {
		Summary: "Two `overrideX<T>()` calls target the same type and the same function, for example two `overrideValidate<User>()`. Which one wins would depend on the order your code is read, so the second one is rejected whatever its body. The Related line points at the first one. Keep one override and merge the logic into it.",
		Fix:     "overrideValidate<User>((utl) => (value) => checkA(value) && checkB(value));",
	},
	CodeOverrideMissingCfn: {
		Summary: "An override points at a generated function that was never written, so calling the override would throw at runtime. This is a mion bug. Delete the cache (`node_modules/.cache/mion`) or restart the dev server. If it keeps failing, open an issue with the type and the override that trigger it.",
	},
	CodeOverrideValidateCrossFamily: {
		Summary: "`overrideValidate<T>()` also changes JSON decoders of any union that contains `T`, because they call each member's validator to pick the matching branch. If the override should only affect `createValidateFn<T>()`, give the union members a discriminant so decoders never fall back to member validators.",
		Fix:     "type Event = {kind: 'click'; x: number} | {kind: 'key'; code: string};",
	},

	// ─────────────────── pure function arguments (purefn-*) ────────────────────

	CodePureFunctionNotLiteral: {
		Summary: "Write the `PureFunction<F>` function inline at the call, as an arrow or function expression. A named function, even a private `const f = ...` or `function f() {}`, is rejected: the build compiles the body ahead of time, and the compiled copy must be the only one that can run. An imported or exported function is reported as purefn-imported-or-exported.",
		Fix:     "registerValidator((v: unknown) => typeof v === 'string');",
	},
	CodePureFunctionExternalHandle: {
		Summary: "A `PureFunction<F>` function cannot be imported from or exported to another module. The build compiles the body, and if the original stayed reachable, a caller could run it and get different behaviour from the compiled copy. Write the function inline at the call (a named function is not allowed either, see purefn-not-inline).",
		Fix:     "registerValidator((v: unknown) => typeof v === 'string');",
	},

	// ──────────────────────── prepareForJson (json-prepare-*) ─────────────────────────

	CodePJNeverRoot: {
		Summary: "Your type resolves to `never`, so no value can ever match it and there is nothing to encode. Use a concrete type that matches your data, or `unknown` if you accept any value and check it before use. A `never` property inside an object is dropped instead (json-prepare-non-data-property-dropped).",
		Fix: `type Tag = 'pending' | 'active' | 'done';
// or, to accept any value:
type AnyTag = unknown; // check it before use`,
	},
	CodePJNonSerializableRoot: {
		Summary: "Standard library classes have no JSON form, except `Date`, `Map`, `Set`, `URL` and the Temporal types. When your type is `URLSearchParams`, `Intl.DateTimeFormat`, `WeakMap`, `Promise`, `RegExp`, a typed array or `Buffer` (or an array of them), there is nothing to encode. Convert the value to plain data, like a string for a `URLSearchParams` or a number array for a typed array. Inside an object, such a property is dropped instead (json-prepare-non-data-property-dropped).",
		Fix: `const query: string = yourParams.toString(); // not a URLSearchParams
const bytes: number[] = Array.from(yourBuffer); // not a typed array`,
	},
	CodePJFunctionRoot: {
		Summary: "A function has no JSON form, so there is nothing to encode. Use the data the function returns. A method or function property inside an object is dropped instead (json-prepare-method-dropped, or json-prepare-function-property-dropped when optional or in a union member).",
		Fix: `interface User {
  name: string; // not getName: () => string
}`,
	},
	CodePJSymbolRoot: {
		Summary: "A `symbol`'s identity is lost in JSON, so it cannot be encoded. Use a string instead, often a union of string literals. A symbol property inside an object is dropped instead (json-prepare-non-data-property-dropped).",
		Fix:     "type Status = 'pending' | 'active' | 'done'; // not symbol",
	},
	CodePJFunctionPropDropped: {
		Summary: "A function has no JSON form, so the encoder leaves this property out and encodes the rest as usual. This is expected: only data is encoded.",
	},
	CodePJMethodDropped: {
		Summary: "Methods are not data, so the encoder leaves them out and still encodes the rest of the type. To encode a method's result, store it in a data property.",
	},
	CodePJStaticDropped: {
		Summary: "Static members belong to the class, not its instances, so the encoder leaves them out.",
	},
	CodePJSymbolKeyedDropped: {
		Summary: "JSON only has string keys, so the encoder leaves out properties keyed by a symbol. Use a string key if you need the value encoded.",
		Fix: `interface Item {
  id: string; // not [Symbol.for('id')]: string
}`,
	},
	CodePJUnionMemberDropped: {
		Summary: "Symbols, functions, `never`, `Promise`, `RegExp` and standard library classes such as `URLSearchParams` or typed arrays have no JSON form, so the encoder drops them from the union: `Date | symbol` encodes as `Date`. If every member is dropped, you get the error for the whole type instead (such as json-prepare-symbol-root), and the encoder always fails.",
	},
	CodePJNonSerializablePropDrop: {
		Summary: "A property holding a symbol, `never`, a `Promise`, a `RegExp` or a standard library class such as a typed array, `ArrayBuffer`, `URLSearchParams` or `Intl.DateTimeFormat` has no JSON form, so the encoder drops it and leaves the rest of the object alone: `{a: symbol}` encodes as `{}`. A property holding such a value inside an array or a Map, like `symbol[]` or `Map<string, symbol>`, cannot be dropped: you get an error instead (such as json-prepare-symbol-root), and the encoder always fails.",
	},

	// ───────────────────── prepareForJson clone (json-prepare-clone-*) ─────────────────────

	CodePJSNeverRoot: {
		Summary: "Your type resolves to `never`, so no value can ever match it and there is nothing to encode. Use a concrete type that matches your data, or `unknown` if you accept any value and check it before use. A `never` property inside an object is dropped instead (json-prepare-clone-non-data-property-dropped).",
		Fix: `type Tag = 'pending' | 'active' | 'done';
// or, to accept any value:
type AnyTag = unknown; // check it before use`,
	},
	CodePJSNonSerializableRoot: {
		Summary: "Standard library classes have no JSON form, except `Date`, `Map`, `Set`, `URL` and the Temporal types. When your type is `URLSearchParams`, `Intl.DateTimeFormat`, `WeakMap`, `Promise`, `RegExp`, a typed array or `Buffer` (or an array of them), there is nothing to encode. Convert the value to plain data, like a string for a `URLSearchParams` or a number array for a typed array. Inside an object, such a property is dropped instead (json-prepare-clone-non-data-property-dropped).",
		Fix: `const query: string = yourParams.toString(); // not a URLSearchParams
const bytes: number[] = Array.from(yourBuffer); // not a typed array`,
	},
	CodePJSFunctionRoot: {
		Summary: "A function has no JSON form, so there is nothing to encode. Use the data the function returns. A method or function property inside an object is dropped instead (json-prepare-clone-method-dropped, or json-prepare-clone-function-property-dropped when optional or in a union member).",
		Fix: `interface User {
  name: string; // not getName: () => string
}`,
	},
	CodePJSSymbolRoot: {
		Summary: "A `symbol`'s identity is lost in JSON, so it cannot be encoded. Use a string instead, often a union of string literals. A symbol property inside an object is dropped instead (json-prepare-clone-non-data-property-dropped).",
		Fix:     "type Status = 'pending' | 'active' | 'done'; // not symbol",
	},
	CodePJSFunctionPropDropped: {
		Summary: "A function has no JSON form, so the encoder leaves this property out and encodes the rest as usual. This is expected: only data is encoded.",
	},
	CodePJSMethodDropped: {
		Summary: "Methods are not data, so the encoder leaves them out and still encodes the rest of the type. To encode a method's result, store it in a data property.",
	},
	CodePJSStaticDropped: {
		Summary: "Static members belong to the class, not its instances, so the encoder leaves them out.",
	},
	CodePJSSymbolKeyedDropped: {
		Summary: "JSON only has string keys, so the encoder leaves out properties keyed by a symbol. Use a string key if you need the value encoded.",
		Fix: `interface Item {
  id: string; // not [Symbol.for('id')]: string
}`,
	},
	CodePJSUnionMemberDropped: {
		Summary: "Symbols, functions, `never`, `Promise`, `RegExp` and standard library classes such as `URLSearchParams` or typed arrays have no JSON form, so the encoder drops them from the union: `Date | symbol` encodes as `Date`. If every member is dropped, you get the error for the whole type instead (such as json-prepare-clone-symbol-root), and the encoder always fails.",
	},
	CodePJSNonSerializablePropDrop: {
		Summary: "A property holding a symbol, `never`, a `Promise`, a `RegExp` or a standard library class such as a typed array, `ArrayBuffer`, `URLSearchParams` or `Intl.DateTimeFormat` has no JSON form, so the encoder drops it and leaves the rest of the object alone: `{a: symbol}` encodes as `{}`. A property holding such a value inside an array or a Map, like `symbol[]` or `Map<string, symbol>`, cannot be dropped: you get an error instead (such as json-prepare-clone-symbol-root), and the encoder always fails.",
	},

	// ──────────────────────── restoreFromJson (json-restore-*) ────────────────────────

	CodeRJNeverRoot: {
		Summary: "Your type resolves to `never`, so no value can ever match it and there is nothing to decode. Use a concrete type that matches your data, or `unknown` if you accept any value and check it before use. A `never` property inside an object is dropped instead (json-restore-non-data-property-dropped).",
		Fix: `type Tag = 'pending' | 'active' | 'done';
// or, to accept any value:
type AnyTag = unknown; // check it before use`,
	},
	CodeRJNonSerializableRoot: {
		Summary: "Standard library classes have no JSON form, except `Date`, `Map`, `Set`, `URL` and the Temporal types. When your type is `URLSearchParams`, `Intl.DateTimeFormat`, `WeakMap`, `Promise`, `RegExp`, a typed array or `Buffer` (or an array of them), there is nothing to decode. Convert the value to plain data, like a string for a `URLSearchParams` or a number array for a typed array. Inside an object, such a property is dropped instead (json-restore-non-data-property-dropped).",
		Fix: `const query: string = yourParams.toString(); // not a URLSearchParams
const bytes: number[] = Array.from(yourBuffer); // not a typed array`,
	},
	CodeRJFunctionRoot: {
		Summary: "A function has no JSON form, so there is nothing to decode. Use the data the function returns. A method or function property inside an object is dropped instead (json-restore-method-dropped, or json-restore-function-property-dropped when optional or in a union member).",
		Fix: `interface User {
  name: string; // not getName: () => string
}`,
	},
	CodeRJSymbolRoot: {
		Summary: "A `symbol`'s identity is lost in JSON, so it cannot be decoded. Use a string instead, often a union of string literals. A symbol property inside an object is dropped instead (json-restore-non-data-property-dropped).",
		Fix:     "type Status = 'pending' | 'active' | 'done'; // not symbol",
	},
	CodeRJFunctionPropDropped: {
		Summary: "A function has no JSON form, so the decoder leaves this property out and decodes the rest as usual. This is expected: only data is decoded.",
	},
	CodeRJMethodDropped: {
		Summary: "Methods are not data, so the decoder leaves them out and still decodes the rest of the type. To decode a method's result, store it in a data property.",
	},
	CodeRJStaticDropped: {
		Summary: "Static members belong to the class, not its instances, so the decoder leaves them out.",
	},
	CodeRJSymbolKeyedDropped: {
		Summary: "JSON only has string keys, so the decoder leaves out properties keyed by a symbol. Use a string key if you need the value decoded.",
		Fix: `interface Item {
  id: string; // not [Symbol.for('id')]: string
}`,
	},
	CodeRJUnionMemberDropped: {
		Summary: "Symbols, functions, `never`, `Promise`, `RegExp` and standard library classes such as `URLSearchParams` or typed arrays have no JSON form, so the decoder drops them from the union: `Date | symbol` decodes as `Date`. If every member is dropped, you get the error for the whole type instead (such as json-restore-symbol-root), and the decoder always fails.",
	},
	CodeRJNonSerializablePropDrop: {
		Summary: "A property holding a symbol, `never`, a `Promise`, a `RegExp` or a standard library class such as a typed array, `ArrayBuffer`, `URLSearchParams` or `Intl.DateTimeFormat` has no JSON form, so the decoder drops it and leaves the rest of the object alone: `{a: symbol}` decodes as `{}`. A property holding such a value inside an array or a Map, like `symbol[]` or `Map<string, symbol>`, cannot be dropped: you get an error instead (such as json-restore-symbol-root), and the decoder always fails.",
	},

	// ────────────────────── removeUnknownKeys (unknown-keys-*) ───────────────────────

	CodeRUKUnionRoot: {
		Summary: "`removeUnknownKeys` rebuilds a value from its declared shape, and for a union of objects it cannot tell which member the value matches, so the function throws rather than keep unknown keys. Narrow the value first and use one `createRemoveUnknownKeysFn<Member>()` per member, or turn the union into one object with optional properties.",
		Fix: `const removeCatKeys = createRemoveUnknownKeysFn<Cat>();
const removeDogKeys = createRemoveUnknownKeysFn<Dog>();`,
		Example: `import {createRemoveUnknownKeysFn} from '@mionjs/run-types';
type Pet = {kind: 'cat'; meows: boolean} | {kind: 'dog'; barks: boolean};
export const removePetKeys = createRemoveUnknownKeysFn<Pet>();`,
	},
	CodeRUKSymbolKeyedMember: {
		Summary: "The copy is typed as your type, so it must have the symbol-keyed property too. The generated code cannot name a symbol from your code, and copying every symbol on the input would keep undeclared ones, so the function always throws. Use a string key, or a `[key: symbol]: V` index signature, whose keys are all copied. Symbol-keyed class methods are fine: they stay on the prototype.",
		Fix:     "interface Item { id: string; tag: string }",
		Example: `import {createRemoveUnknownKeysFn} from '@mionjs/run-types';
const tag = Symbol('tag');
interface Item { id: string; [tag]: string }
export const removeItemKeys = createRemoveUnknownKeysFn<Item>();`,
		NestedExample: `import {createRemoveUnknownKeysFn} from '@mionjs/run-types';
const tag = Symbol('tag');
interface Order { item: { id: string; [tag]: string } }
export const removeOrderKeys = createRemoveUnknownKeysFn<Order>();`,
	},
	CodeRUKPrivateFields: {
		Summary: "A class copy keeps the input's prototype but never runs the constructor, and only the constructor can create `#private` fields. A method reading one would throw on the copy, so the function always throws instead. Use TypeScript `private` instead of `#`, or register `overrideRemoveUnknownKeys<T>()` to build the copy yourself.",
		Fix:     `class Counter { private count = 0; }`,
		Example: `import {createRemoveUnknownKeysFn} from '@mionjs/run-types';
export class Counter { #count = 0; label = ''; }
export const removeCounterKeys = createRemoveUnknownKeysFn<Counter>();`,
		NestedExample: `import {createRemoveUnknownKeysFn} from '@mionjs/run-types';
export class Counter { #count = 0; label = ''; }
export const removePageKeys = createRemoveUnknownKeysFn<{counter: Counter}>();`,
	},
	CodeRUKSharedRefused: {
		Summary: "With `sharedValues: 'refuse'`, a value the copy cannot rebuild (a function, a `Promise`, a `RegExp` or a built-in like `URLSearchParams`) makes the function always throw instead of sharing it with the input. Remove the option to share it with a warning, or change the type.",
		Example: `import {createRemoveUnknownKeysFn} from '@mionjs/run-types';
interface Button { label: string; onClick: () => void }
export const removeButtonKeys = createRemoveUnknownKeysFn<Button>(undefined, {sharedValues: 'refuse'});`,
		NestedExample: `import {createRemoveUnknownKeysFn} from '@mionjs/run-types';
interface Toolbar { button: { label: string; onClick: () => void } }
export const removeToolbarKeys = createRemoveUnknownKeysFn<Toolbar>(undefined, {sharedValues: 'refuse'});`,
	},
	CodeRUKFunctionPropDropped: {
		Summary: "`removeUnknownKeys` never removes a declared key. A function cannot be copied, so the copy points to the same function as the input. Class methods stay on the prototype instead (unknown-keys-method-not-copied). A function type itself is shared the same way. Pass `sharedValues: 'share'` to say this is fine, or `'refuse'` to make it an error.",
		Example: `import {createRemoveUnknownKeysFn} from '@mionjs/run-types';
interface Button { label: string; onClick: () => void }
export const removeButtonKeys = createRemoveUnknownKeysFn<Button>();`,
		NestedExample: `import {createRemoveUnknownKeysFn} from '@mionjs/run-types';
interface Toolbar { button: { label: string; onClick: () => void } }
export const removeToolbarKeys = createRemoveUnknownKeysFn<Toolbar>();`,
	},
	CodeRUKMethodDropped: {
		Summary: "A class copy keeps the input's prototype, so methods and get / set accessors still work without being copied. A function stored in a field (`onChange = () => ...`) is its own value and is shared instead (unknown-keys-function-shared). The constructor does not run on the copy.",
		Example: `import {createRemoveUnknownKeysFn} from '@mionjs/run-types';
export class User { name = ''; greet(): string { return this.name; } }
export const removeUserKeys = createRemoveUnknownKeysFn<User>();`,
		NestedExample: `import {createRemoveUnknownKeysFn} from '@mionjs/run-types';
export class User { name = ''; greet(): string { return this.name; } }
export const removeAccountKeys = createRemoveUnknownKeysFn<{user: User}>();`,
	},
	CodeRUKStaticDropped: {
		Summary: "Static members belong to the class, not its instances, so the copy leaves them out.",
		Example: `import {createRemoveUnknownKeysFn} from '@mionjs/run-types';
export class Config { static version = 1; name = ''; }
export const removeConfigKeys = createRemoveUnknownKeysFn<Config>();`,
		NestedExample: `import {createRemoveUnknownKeysFn} from '@mionjs/run-types';
export class Config { static version = 1; name = ''; }
export const removeAppKeys = createRemoveUnknownKeysFn<{config: Config}>();`,
	},
	CodeRUKNonSerializablePropDrop: {
		Summary: "`removeUnknownKeys` never removes a declared property. A value it cannot copy, like a `Promise`, a `RegExp` or a built-in like `URLSearchParams`, is shared with the input, so a change through it shows on both. Pass `sharedValues: 'share'` to say this is fine, `'refuse'` to make it an error, or register `overrideRemoveUnknownKeys<T>()` to copy it yourself.",
		Example: `import {createRemoveUnknownKeysFn} from '@mionjs/run-types';
interface Link { title: string; pattern: RegExp }
export const removeLinkKeys = createRemoveUnknownKeysFn<Link>();`,
		NestedExample: `import {createRemoveUnknownKeysFn} from '@mionjs/run-types';
interface Page { link: { title: string; pattern: RegExp } }
export const removePageKeys = createRemoveUnknownKeysFn<Page>();`,
	},
	CodeRUKSharedAsAsked: {
		Summary: "You passed `sharedValues: 'share'`, so a function or a value the copy cannot rebuild is shared with the input, as asked. This note is hidden unless you show all levels.",
		Example: `import {createRemoveUnknownKeysFn} from '@mionjs/run-types';
interface Button { label: string; onClick: () => void }
export const removeButtonKeys = createRemoveUnknownKeysFn<Button>(undefined, {sharedValues: 'share'});`,
		NestedExample: `import {createRemoveUnknownKeysFn} from '@mionjs/run-types';
interface Toolbar { button: { label: string; onClick: () => void } }
export const removeToolbarKeys = createRemoveUnknownKeysFn<Toolbar>(undefined, {sharedValues: 'share'});`,
	},

	// ──────────────────────── Temporal types (marker-temporal-*) ────────────────────────

	CodeTemporalNotLoaded: {
		Summary: "`Temporal.*` types only work when the Temporal lib is loaded. Without it the type becomes `any` and the validator accepts everything. Add `\"ESNext.Temporal\"` to `lib` in your tsconfig.",
		Fix:     "{\"compilerOptions\": {\"lib\": [\"ES2023\", \"ESNext.Temporal\"]}}",
	},
	CodeRouteMissingReturnType: {
		Summary: "mion builds the route's validation and serialization from the handler's declared types, and the client types its call from the same declaration. An inferred return type gives the build nothing to work from. Write the return type on the handler.",
		Fix:     "mion.route((ctx, name: string): string => `hello ${name}`);",
	},
	CodeRouteMissingParamType: {
		Summary: "Every handler parameter after the call context is part of the route's public input, so mion builds a validator and a decoder from its declared type. The call context (the first parameter, the first two for `headersMiddleware`) never goes over the network. Add a type to the parameter.",
		Fix:     "mion.route((ctx, name: string): string => `hello ${name}`);",
	},
	CodeRouteThrowInHandler: {
		Summary: "A returned error stays in the handler's signature, so the client gets it typed at the call site. A thrown one goes to the undeclared `@thrownErrors` slot, and the client sees only its public message. A `throw` caught by `try` and `catch` in the same handler is not reported. If a throw is on purpose, add `// @mion-expect-error rpc-handler-throws` above it and say why.",
		Fix:     "return new RpcError({statusCode: 404, name: 'not-found', publicMessage: 'no pet'});",
	},
	CodeRouteReturnedErrorType: {
		Summary: "A returned `RpcError` (or any subclass) goes to its own typed slot, and the client gets it typed. A plain `Error`, a class extending it, or a bare `TypedError` fails the request and goes to the undeclared `@thrownErrors` slot, so your declared return type is no longer true. Answer with an `RpcError` or a `FatalError`.",
		Fix: `mion.route((ctx, id: string): Pet | RpcError<'pet-not-found'> =>
  new RpcError({statusCode: 404, name: 'pet-not-found', publicMessage: 'no pet'}));`,
	},
}

// init folds the prose onto the registered Definitions, and runs after the codes_*.go init
// functions because Go runs them in lexical file-name order and "prose.go" sorts after "codes_*.go".
func init() {
	for code, text := range proseByCode {
		definition, ok := Definitions[code]
		if !ok {
			panic("diag: prose for unregistered code " + code)
		}
		definition.Summary = text.Summary
		definition.Fix = text.Fix
		definition.Example = text.Example
		definition.NestedExample = text.NestedExample
		Definitions[code] = definition
	}
}
