package diagnostics

// Docs prose for the website diagnostics page, keyed by code. This is the
// single Go-side source for the human-written explanation of each
// diagnostic: a plain-language Summary of what triggers it and how to fix
// it, an optional Fix snippet (the corrected code), and an Example (the
// TypeScript source that actually triggers the code). The gen-diag-catalog
// dump exports all three, so scripts/core/gen-diagnostics-catalog.mjs renders the page
// without a second prose source.
//
// Example is not just docs. The standardized suite in
// internal/compiler/resolver/diag_examples_test.go feeds every non-empty Example
// through the real scan pipeline and asserts this code fires, so an example
// can never drift from the diagnostic it demonstrates. Author an Example as
// a complete file: the `mion` import, the type, and the marker call.
//
// Voice rules (these render on the website): plain language, no compiler
// internals, no dashes chaining clauses. Backtick spans in Summary become
// inline code; keep wider examples in Fix.
//
// Codes are filled as they are documented. A prose entry for a code that is
// not registered panics at init (so prose can never reference a code that
// does not exist); a registered code with no prose entry is fine, and the
// generator reports the remaining gaps.

type prose struct {
	Summary string
	Fix     string
	Example string
	// NestedExample is Example with the trigger moved one object deeper. A
	// ScopeGraph code that has an Example must have one (see Definition).
	NestedExample string
}

var proseByCode = map[string]prose{
	// ──────────────────────── project config (CFG) ────────────────────────

	CodeTsconfigLoadFailed: {
		// No Example: this code is raised by a broken tsconfig.json, not by
		// TypeScript source, so the example harness (which scans source through
		// a healthy config) cannot trigger it.
		Summary: "The tsconfig.json your project named, or the one found next to it, is missing or does not parse. RunTypes reads types through that config, the same one your build uses, so the operation stops instead of guessing with defaults that could resolve your types differently. Fix the tsconfig, or point the tooling at the right file with the plugin or lint `tsconfig` setting, or the CLI `--tsconfig` flag.",
	},

	CodeUnsupportedLibSelection: {
		// No Example: this code is raised by the project's `lib` setting, not by
		// TypeScript source, so the example harness (which scans source through a
		// healthy config) cannot trigger it.
		Summary: "Your tsconfig `lib` names no base ECMAScript edition, so TypeScript never declares `Array`, `Object`, `String` and the other core globals. Without them `number[]` resolves to an empty object and the generated validator would accept any value, with nothing to warn you. RunTypes stops instead. Name a base edition in `lib` (`[\"ES2022\"]`, or `[\"ES2022\", \"DOM\"]` for browser code), or remove `lib` and let `target` choose it.",
		Fix:     `{"compilerOptions": {"lib": ["ES2022"]}}`,
	},

	// ───────────────────────── validate (VL) ─────────────────────────

	CodeVLNonSerializableRoot: {
		Summary: "The type you validate is a built-in that carries runtime state, like a `WeakMap`, a `WeakSet`, or a typed array such as `Uint8Array`. None of these survive a JSON round trip, so a guard that passed for one would claim a safety it cannot deliver. Validate a plain shape, or convert the value before you validate it.",
		Fix: `const bytes = Array.from(myUint8Array);
const isData = createValidateFn<number[]>();`,
		Example: `import {createValidateFn} from '@mionjs/run-types';
export const isData = createValidateFn<Uint8Array>();`,
	},
	CodeVLSymbolRoot: {
		Summary: "The type is a bare `symbol`. Every symbol has its own runtime identity, so it cannot round trip across a network or a process boundary. Use a stable string union instead.",
		Fix:     `type Status = 'pending' | 'active' | 'done';`,
		Example: `import {createValidateFn} from '@mionjs/run-types';
export const isData = createValidateFn<symbol>();`,
	},
	CodeVLFunctionPropDropped: {
		// No Example: a function-valued property on a plain object surfaces as
		// VL011 (method drop). VL010 fires only when such a property is dropped
		// inside a DataOnly union projection, which no minimal type reaches today.
		Summary: "A function-valued property carries no data, so it is left out of the validated shape. The surrounding data properties are still checked. Drop the property, or replace it with the data it would produce.",
	},
	CodeVLMethodDropped: {
		Summary: "A function-valued member, written as a method like `greet(): string` or as a function-typed property like `onClick: () => void`, is behavior, not data, so it is left out of the validated shape. Expose the data you need as a plain property instead.",
		Example: `import {createValidateFn} from '@mionjs/run-types';
interface User { name: string; greet(): string; }
export const isUser = createValidateFn<User>();`,
		NestedExample: `import {createValidateFn} from '@mionjs/run-types';
interface Account { user: { name: string; greet(): string } }
export const isAccount = createValidateFn<Account>();`,
	},
	CodeVLStaticDropped: {
		Summary: "Static members live on the class, not on an instance. Validation works on instance shape, so statics are left out.",
		Example: `import {createValidateFn} from '@mionjs/run-types';
class Config { static version = 1; name = ''; }
export const isConfig = createValidateFn<Config>();`,
		NestedExample: `import {createValidateFn} from '@mionjs/run-types';
class Config { static version = 1; name = ''; }
interface App { config: Config }
export const isApp = createValidateFn<App>();`,
	},
	CodeVLSymbolKeyedDropped: {
		// No Example: the symbol-keyed drop slot is registered but not currently
		// emitted by the compiler, so no snippet triggers it today.
		Summary: "JSON has string keys only, so a symbol-keyed property has nowhere to land in the serialized form. Use a string key if the property is real data.",
		Fix: `interface Item {
  id: string; // instead of [Symbol.for('id')]: string
}`,
	},
	CodeVLUnionMemberDropped: {
		Summary: "A union is validated as the members that have a data form. `Date | symbol` validates as `Date`. If every member has no data form the projection is `never`, and validation throws at build time instead.",
		Example: `import {createValidateFn} from '@mionjs/run-types';
export const isData = createValidateFn<Date | symbol>();`,
		NestedExample: `import {createValidateFn} from '@mionjs/run-types';
interface Event { at: Date | symbol }
export const isEvent = createValidateFn<Event>();`,
	},
	CodeVLNonSerializablePropDrop: {
		Summary: "A property whose value is a symbol, a Promise, or a non-serializable built-in has no data form, so `{ id: symbol }` validates as `{}`. A value that is only structurally unserializable, like `symbol[]` or `Map<string, symbol>`, cannot be dropped without changing the shape, so that case throws at build time instead.",
		Example: `import {createValidateFn} from '@mionjs/run-types';
interface Box { id: symbol; name: string; }
export const isBox = createValidateFn<Box>();`,
		NestedExample: `import {createValidateFn} from '@mionjs/run-types';
interface Shelf { box: { id: symbol; name: string } }
export const isShelf = createValidateFn<Shelf>();`,
	},
	CodeVLRootAnyUnknown: {
		Summary: "`any` and `unknown` describe anything, so a structural check has nothing to compare against. The guard is always true. Narrow the type to the shape you expect.",
		Fix:     `const isUser = createValidateFn<User>(); // instead of <unknown>`,
		Example: `import {createValidateFn} from '@mionjs/run-types';
export const isAnything = createValidateFn<unknown>();`,
	},

	// ──────────────────── validationErrors (VE) ────────────────────

	CodeVENonSerializableRoot: {
		Summary: "Same case as `VL001`, from `createGetValidationErrorsFn`. The type is a built-in that carries runtime state and cannot survive a JSON round trip. Report errors against a plain shape, or convert the value first.",
		Example: `import {createGetValidationErrorsFn} from '@mionjs/run-types';
export const errorsOf = createGetValidationErrorsFn<Uint8Array>();`,
	},
	CodeVESymbolRoot: {
		Summary: "Same case as `VL002`, from `createGetValidationErrorsFn`. The type is a bare `symbol`, which cannot round trip. Use a string union instead.",
		Example: `import {createGetValidationErrorsFn} from '@mionjs/run-types';
export const errorsOf = createGetValidationErrorsFn<symbol>();`,
	},
	CodeVEFunctionPropDropped: {
		// No Example, same reason as VL010: a function-valued property on a plain
		// object surfaces as VE011, not VE010.
		Summary: "Same case as `VL010`, from `createGetValidationErrorsFn`. A function-valued property carries no data and is left out of the report.",
	},
	CodeVEMethodDropped: {
		Summary: "Same case as `VL011`, from `createGetValidationErrorsFn`. A method or function-typed property is behavior, not data, so it is left out of the report.",
		Example: `import {createGetValidationErrorsFn} from '@mionjs/run-types';
interface User { name: string; greet(): string; }
export const errorsOf = createGetValidationErrorsFn<User>();`,
		NestedExample: `import {createGetValidationErrorsFn} from '@mionjs/run-types';
interface Account { user: { name: string; greet(): string } }
export const errorsOf = createGetValidationErrorsFn<Account>();`,
	},
	CodeVEStaticDropped: {
		Summary: "Same case as `VL012`, from `createGetValidationErrorsFn`. Static members are not part of instance data, so they are left out.",
		Example: `import {createGetValidationErrorsFn} from '@mionjs/run-types';
class Config { static version = 1; name = ''; }
export const errorsOf = createGetValidationErrorsFn<Config>();`,
		NestedExample: `import {createGetValidationErrorsFn} from '@mionjs/run-types';
class Config { static version = 1; name = ''; }
interface App { config: Config }
export const errorsOf = createGetValidationErrorsFn<App>();`,
	},
	CodeVESymbolKeyedDropped: {
		// No Example, same reason as VL013: the symbol-keyed drop slot is not
		// currently emitted by the compiler.
		Summary: "Same case as `VL013`, from `createGetValidationErrorsFn`. Symbol keys are not JSON-representable, so the property is left out.",
	},
	CodeVENonSerializablePropDrop: {
		Summary: "Same case as `VL015`, from `createGetValidationErrorsFn`. A property whose value has no data form is left out of the report.",
		Example: `import {createGetValidationErrorsFn} from '@mionjs/run-types';
interface Box { id: symbol; name: string; }
export const errorsOf = createGetValidationErrorsFn<Box>();`,
		NestedExample: `import {createGetValidationErrorsFn} from '@mionjs/run-types';
interface Shelf { box: { id: symbol; name: string } }
export const errorsOf = createGetValidationErrorsFn<Shelf>();`,
	},
	CodeVERootAnyUnknown: {
		Summary: "Same idea as `VL021`, from `createGetValidationErrorsFn`. On `any` or `unknown` there is nothing to compare against, so the report is always empty. Narrow the type to the shape you expect.",
		Example: `import {createGetValidationErrorsFn} from '@mionjs/run-types';
export const errorsOf = createGetValidationErrorsFn<unknown>();`,
	},

	// ─────────────────────── pure functions (PFE) ───────────────────────

	// No Example: PFE9012 needs a compiled function to reach a pure fn whose
	// registration is absent from the program. The built-in helpers register
	// through the `mion` package itself, so no small type-only snippet
	// reproduces the miss (the diag-example harness always has them present).
	CodeMissingPureFnDep: {
		Summary: "A generated validator or encoder calls a helper (a pure function) that was never registered, so the built output would fail the moment it runs. This almost always means a source file that registers the helper with `registerPureFnFactory` is not part of the compile. Import the `mion` entry that provides it, or include the file that registers it, so the build can see the definition.",
		Fix: `import {registerPureFnFactory} from '@mionjs/run-types';
registerPureFnFactory('rt::newRunTypeErr', (utl) => (message) => new Error(message));`,
	},
	CodeMarkerDuplicateFnKey: {
		Summary: "An `InjectTypeFnArgs` marker lists each function family it needs once, in order. Naming the same family twice injects a second identical handle that nothing reads, so it is almost always a copy-paste slip and the build stops. List each family at most once.",
		Fix: `function route<H extends Handler>(
  handler: H,
  fns?: InjectTypeFnArgs<Parameters<H>, 'verr', 'jsonDecoder', 'jsonEncoder'>,
) {
  return {handler, fns};
}`,
		Example: `import type {InjectTypeFnArgs} from '@mionjs/run-types';
type Handler = (ctx: unknown, ...rest: any[]) => unknown;
function route<H extends Handler>(handler: H, fns?: InjectTypeFnArgs<Parameters<H>, 'verr', 'jsonDecoder', 'verr'>) {
  return {handler, fns};
}
export const lenRoute = route((ctx: unknown, name: string) => name.length);`,
	},

	// ──────────────────── unresolved type name (MKR013) ────────────────────

	CodeMarkerUnresolvedTypeName: {
		Summary: "A type name written at a marker call did not resolve, so TypeScript treated it as `any`. Generated functions built from that would accept every value with no warning, so the build stops instead. A deliberate `any` (written as `any`, or through an alias like `type Loose = any`) is always allowed. Usual causes: a typo in the name, a dependency whose types are missing, or an ambient declaration file that the tsconfig `include` set does not cover. After adding a new declaration file, restart the dev server so it is picked up.",
		Fix: `// src/ambient.d.ts, matched by the tsconfig include set
declare interface Ambient { a: string; b: number }`,
		Example: `import {getRunTypeId} from '@mionjs/run-types';
export const id = getRunTypeId<{value: Missing}>();`,
		NestedExample: `import {getRunTypeId} from '@mionjs/run-types';
interface Payload { id: string; user: Missing }
export const id = getRunTypeId<{payload: Payload}>();`,
	},

	CodeTypeIdCollision: {
		// No Example: the trigger is two types whose shapes happen to hash to the
		// same seven characters, which no short snippet can arrange.
		Summary: "Every type gets a short id hashed from its shape, and that id names the generated functions, the cache keys and the files on disk. Two types landed on the same id, so nothing after this point could tell them apart, and the build stops. Type ids are always exactly `hashLength` characters, so the fix is to give them more room: raise `hashLength` by one (each extra character is sixty-two times the space). The error names both types and the call site that took the id first.",
		Fix:     `{"compilerOptions": {"plugins": [{"name": "mion", "hashLength": 8}]}}`,
	},

	// ──────────────────── unsafe property name (UPN001) ────────────────────

	CodeUnsafePropertyName: {
		Summary: "A property named `__proto__`, `prototype` or `constructor` can never be data: writing `__proto__` on a plain object swaps its prototype instead of adding a key, and reading a missing `constructor` or `prototype` walks the prototype chain. Every decoder refuses those keys on the wire, so a type that declares one could never round trip, and the build stops. This holds anywhere in the type, a nested object, an array element or a Map value included. Rename the property.",
		Fix:     `interface Settings { ok: number; ctor: string }`,
		Example: `import {createValidateFn} from '@mionjs/run-types';
interface Settings { ok: number; constructor: string }
export const isSettings = createValidateFn<Settings>();`,
		NestedExample: `import {createValidateFn} from '@mionjs/run-types';
interface Outer { inner: Map<string, { ok: number; constructor: string }> }
export const isOuter = createValidateFn<Outer>();`,
	},
}

// init folds the prose onto the registered Definitions. It runs after the
// codes_*.go init functions (Go runs a package's init functions in lexical
// file-name order, and "prose.go" sorts after every "codes_*.go"), so every
// Definition the prose references already exists.
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
