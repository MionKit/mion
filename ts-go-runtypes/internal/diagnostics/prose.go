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
// a complete file: the `ts-runtypes` import, the type, and the marker call.
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
		Example: `import {createValidateFn} from '@ts-runtypes/core';
export const isData = createValidateFn<Uint8Array>();`,
	},
	CodeVLSymbolRoot: {
		Summary: "The type is a bare `symbol`. Every symbol has its own runtime identity, so it cannot round trip across a network or a process boundary. Use a stable string union instead.",
		Fix:     `type Status = 'pending' | 'active' | 'done';`,
		Example: `import {createValidateFn} from '@ts-runtypes/core';
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
		Example: `import {createValidateFn} from '@ts-runtypes/core';
interface User { name: string; greet(): string; }
export const isUser = createValidateFn<User>();`,
	},
	CodeVLStaticDropped: {
		Summary: "Static members live on the class, not on an instance. Validation works on instance shape, so statics are left out.",
		Example: `import {createValidateFn} from '@ts-runtypes/core';
class Config { static version = 1; name = ''; }
export const isConfig = createValidateFn<Config>();`,
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
		Example: `import {createValidateFn} from '@ts-runtypes/core';
export const isData = createValidateFn<Date | symbol>();`,
	},
	CodeVLNonSerializablePropDrop: {
		Summary: "A property whose value is a symbol, a Promise, or a non-serializable built-in has no data form, so `{ id: symbol }` validates as `{}`. A value that is only structurally unserializable, like `symbol[]` or `Map<string, symbol>`, cannot be dropped without changing the shape, so that case throws at build time instead.",
		Example: `import {createValidateFn} from '@ts-runtypes/core';
interface Box { id: symbol; name: string; }
export const isBox = createValidateFn<Box>();`,
	},
	CodeVLRootAnyUnknown: {
		Summary: "`any` and `unknown` describe anything, so a structural check has nothing to compare against. The guard is always true. Narrow the type to the shape you expect.",
		Fix:     `const isUser = createValidateFn<User>(); // instead of <unknown>`,
		Example: `import {createValidateFn} from '@ts-runtypes/core';
export const isAnything = createValidateFn<unknown>();`,
	},

	// ──────────────────── validationErrors (VE) ────────────────────

	CodeVENonSerializableRoot: {
		Summary: "Same case as `VL001`, from `createGetValidationErrorsFn`. The type is a built-in that carries runtime state and cannot survive a JSON round trip. Report errors against a plain shape, or convert the value first.",
		Example: `import {createGetValidationErrorsFn} from '@ts-runtypes/core';
export const errorsOf = createGetValidationErrorsFn<Uint8Array>();`,
	},
	CodeVESymbolRoot: {
		Summary: "Same case as `VL002`, from `createGetValidationErrorsFn`. The type is a bare `symbol`, which cannot round trip. Use a string union instead.",
		Example: `import {createGetValidationErrorsFn} from '@ts-runtypes/core';
export const errorsOf = createGetValidationErrorsFn<symbol>();`,
	},
	CodeVEFunctionPropDropped: {
		// No Example, same reason as VL010: a function-valued property on a plain
		// object surfaces as VE011, not VE010.
		Summary: "Same case as `VL010`, from `createGetValidationErrorsFn`. A function-valued property carries no data and is left out of the report.",
	},
	CodeVEMethodDropped: {
		Summary: "Same case as `VL011`, from `createGetValidationErrorsFn`. A method or function-typed property is behavior, not data, so it is left out of the report.",
		Example: `import {createGetValidationErrorsFn} from '@ts-runtypes/core';
interface User { name: string; greet(): string; }
export const errorsOf = createGetValidationErrorsFn<User>();`,
	},
	CodeVEStaticDropped: {
		Summary: "Same case as `VL012`, from `createGetValidationErrorsFn`. Static members are not part of instance data, so they are left out.",
		Example: `import {createGetValidationErrorsFn} from '@ts-runtypes/core';
class Config { static version = 1; name = ''; }
export const errorsOf = createGetValidationErrorsFn<Config>();`,
	},
	CodeVESymbolKeyedDropped: {
		// No Example, same reason as VL013: the symbol-keyed drop slot is not
		// currently emitted by the compiler.
		Summary: "Same case as `VL013`, from `createGetValidationErrorsFn`. Symbol keys are not JSON-representable, so the property is left out.",
	},
	CodeVENonSerializablePropDrop: {
		Summary: "Same case as `VL015`, from `createGetValidationErrorsFn`. A property whose value has no data form is left out of the report.",
		Example: `import {createGetValidationErrorsFn} from '@ts-runtypes/core';
interface Box { id: symbol; name: string; }
export const errorsOf = createGetValidationErrorsFn<Box>();`,
	},
	CodeVERootAnyUnknown: {
		Summary: "Same idea as `VL021`, from `createGetValidationErrorsFn`. On `any` or `unknown` there is nothing to compare against, so the report is always empty. Narrow the type to the shape you expect.",
		Example: `import {createGetValidationErrorsFn} from '@ts-runtypes/core';
export const errorsOf = createGetValidationErrorsFn<unknown>();`,
	},

	// ─────────────────────── pure functions (PFE) ───────────────────────

	// No Example: PFE9012 needs a compiled function to reach a pure fn whose
	// registration is absent from the program. The built-in helpers register
	// through the `ts-runtypes` package itself, so no small type-only snippet
	// reproduces the miss (the diag-example harness always has them present).
	CodeMissingPureFnDep: {
		Summary: "A generated validator or encoder calls a helper (a pure function) that was never registered, so the built output would fail the moment it runs. This almost always means a source file that registers the helper with `registerPureFnFactory` is not part of the compile. Import the `ts-runtypes` entry that provides it, or include the file that registers it, so the build can see the definition.",
		Fix: `import {registerPureFnFactory} from '@ts-runtypes/core';
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
		Example: `import type {InjectTypeFnArgs} from '@ts-runtypes/core';
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
		Example: `import {getRunTypeId} from '@ts-runtypes/core';
export const id = getRunTypeId<{value: Missing}>();`,
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
		Definitions[code] = definition
	}
}
