package diagnostics

// Marker-scanner codes (marker-*), raised when a marker call compiles correctly but uses an
// anti-pattern.
//
// The levels split on whether the scan still emits a SITE for the call. No site means no cache entry
// and no injected id, so the call ships un-rewritten and throws `no id injected`: LevelError.
// A site built from a type read wrongly ships a validator that accepts everything: LevelRuntimeError
// (also marker-temporal-lib-missing and config-lib-missing-base, defined elsewhere).
const (
	CodeMarkerFunctionCallArg   = "marker-calls-function-for-type"
	CodeMarkerFreeTypeParameter = "marker-in-generic-function"
	// CodeMarkerDuplicateFnKey: LevelInfo, since the scan DEDUPES the repeated key and only the source has a slip.
	CodeMarkerDuplicateFnKey          = "marker-duplicate-function-family"
	CodeMarkerAnyFromUnresolvedImport = "marker-any-from-unresolved-import"
	// CodeStructuralIdDepthExceeded fires when the structural-id walk hits its depth cap with no
	// classifiable cause, a deterministic failure in place of a fatal Go stack overflow. Anchors at
	// the reflection call site, like the other marker codes.
	CodeStructuralIdDepthExceeded = "marker-type-too-deep"
	// CodeMarkerSelfInstantiatingGeneric is the cause-classified depth cap: instantiations of ONE
	// named type dominate the overflowing walk (lib.esnext's IteratorObject shape). Its per-level
	// type parameters bind per call site, so no finite structural id exists. Args: [0] the type name.
	CodeMarkerSelfInstantiatingGeneric = "marker-self-instantiating-generic"
	// CodeMarkerUnresolvedTypeParameter is the nested sibling of marker-in-generic-function: the type argument CONTAINS a
	// still-free type parameter in a data position (`A<T>`, `T[]`, `{a: T}`), which without the check
	// collapses to `unknown` so every instantiation context shares one aliased id. Signature
	// interiors (a generic method's own params) are exempt. Args: [0] the parameter name; Related:
	// its declaration + generics-chain hops.
	CodeMarkerUnresolvedTypeParameter = "marker-unresolved-type-parameter"
	// CodeMarkerUnresolvedGenericType is the SYNTACTIC guard: a written generic reference with fewer
	// type arguments than the declaration's default-less parameters. tsc rejects it (TS2314) but the
	// no-typecheck dev lane does not, and the checker yields plain `any`, so the scan reads the
	// WRITTEN argument list instead. A parameter WITH a default never trips it. Args: [0] type name,
	// [1] parameter name; Related: the parameter's declaration + alias hops.
	CodeMarkerUnresolvedGenericType = "marker-generic-missing-type-argument"
	// CodeMarkerUntrustedPackage fires on a type named exactly like a marker but declared by a
	// package the project has not trusted, which the module-of-origin gate rejects. The
	// brand-property fallback still emits a site, so the call reflects `unknown` instead of the
	// user's type: LevelRuntimeError, since `unknown` compiles to the accept-everything noop. A
	// same-named brand declared by the USING file's own package never trips it, the local-brand case
	// the gate keeps inert. Args: [0] the marker name, [1] the declaring package.
	CodeMarkerUntrustedPackage = "marker-untrusted-package"
	// CodeMarkerUnresolvedTypeName: the marker's type checked as the checker's ERROR type, `any` the
	// author never wrote, because a written type name failed to resolve. Third member of the
	// silent-any guard family (marker-temporal-lib-missing the Temporal-lib cause, marker-any-from-unresolved-import the unresolved-import cause,
	// this the bare-name cause). A written `any` and a resolved `type Loose = any` are the true `any`
	// intrinsic, never the error type, so deliberate `any` stays legal. Args: [0] the written type
	// name (or the reflect-form value's identifier).
	CodeMarkerUnresolvedTypeName = "marker-any-from-unresolved-name"
	// CodeMarkerUnresolvedFnName: an `InjectTypeFnArgs<T, Fn>` marker names a function family that
	// does not exist. Nothing is emitted for that slot and the wrapper gets an empty handle, so the
	// call degrades to its no-plugin fallback: LevelError, no code was produced for what the marker
	// asked for. Args: [0] the unknown token, [1] the closest real token ("" when nothing is close).
	CodeMarkerUnresolvedFnName = "marker-unknown-function-family"
	// CodeMarkerTypelessPrivateMember: a .d.ts class has an untyped `private` member, as plain tsc writes it, so it is `any`.
	// LevelRuntimeError like the rest of the silent-any family. Args: [0] the member name, [1] the class name.
	CodeMarkerTypelessPrivateMember = "marker-untyped-private-member"
	// CodeTypeIdCollision: two DIFFERENT types produced the same short type id at the configured
	// `hashLength`. Every generated name, cache key and disk path is that id, so nothing downstream
	// could tell them apart; the build stops instead and the fix is one option away. Args: [0] the
	// shared id, [1] the shape that took it first, [2] the shape that collided, [3] the hashLength to
	// try next, [4] where the first shape came from. Related: the site that took the id first,
	// present only when that was a marker call; an inner node has no site and reads as "another
	// site" in [4].
	CodeTypeIdCollision = "marker-type-id-collision"
)

// CompTimeArgs-marker codes (marker-comptime-arg-*), raised when a CompTimeArgs<T>-branded parameter receives an
// argument the scanner cannot evaluate at build time.
//
// All four are LevelRuntimeError: the typeId is injected and the entry ships, but the option readers
// fall back to their DEFAULTS, so what ships is compiled under options the author did not write.
const (
	CodeCompTimeArgsNonLiteral         = "marker-comptime-arg-not-literal"
	CodeCompTimeArgsDepthExceeded      = "marker-comptime-arg-too-deep"
	CodeCompTimeArgsForbiddenConstruct = "marker-comptime-arg-forbidden-construct"
	CodeCompTimeArgsWidenedConst       = "marker-comptime-arg-widened-const"
)

// PureFunction-marker codes (purefn-*), raised when a PureFunction<F>-branded parameter receives
// anything but an inline arrow / function expression; purity violations themselves report as
// the purity codes in codes_purefn.go.
//
// LevelRuntimeError: the typeId entry ships, but the pure-fn walker bails, so the generated
// `utl.getPureFn(key)` names a module that was never written and throws when called.
const (
	CodePureFunctionNotLiteral     = "purefn-not-inline"
	CodePureFunctionExternalHandle = "purefn-imported-or-exported"
)

// Project-configuration codes (config-*), raised when the project tsconfig every lane derives its
// Programs from cannot be loaded. Strict like tsc, never downgraded or swallowed: the daemon fails
// the op with the code tagged in the message (a lint host synthesizes the catalog diagnostic from
// it, args: [detail]) and CLI lanes exit. FamilyMarker because the marker scan is what could not
// run, which keeps the wire enum and its TS mirror untouched.
const (
	CodeTsconfigLoadFailed = "config-tsconfig-not-loaded"
	// CodeUnsupportedLibSelection: the project's `lib` leaves the required globals undeclared
	// (`lib: []`, `noLib`, or a by-feature lib with no base edition). Reflection is then UNSOUND and
	// silently so: with no `Array` global, `number[]` checks as an empty object and the validator
	// accepts anything. The silent-`any` guards cannot see it, since marker-any-from-unresolved-name keys on a written type
	// NAME and array sugar writes none. LevelRuntimeError: the cache tree is written and ships, just
	// built on types that cannot be trusted. Args: [0] the loaded lib files, or "(none)".
	CodeUnsupportedLibSelection = "config-lib-missing-base"
	// CodeEmitOutsideRootDir: `mion compile` would write an emitted file outside the tsconfig
	// `outDir`, because the program reaches a source file outside its `rootDir`. tsc refuses the same
	// program (TS6059). LevelError, never a warning: the offending path is deleted from the write
	// map, so the file the written importer names never lands. Args: [0] the refused output path,
	// [1] the outDir.
	CodeEmitOutsideRootDir = "config-output-outside-out-dir"
)

func init() {
	for _, definition := range []Definition{
		{Code: CodeMarkerFunctionCallArg, Family: FamilyMarker, Level: LevelWarning, Scope: ScopeNotSource, Title: "Marker invokes a function just to read its return type",
			Headline: "`{function}()` is being called at runtime just so the marker can read its return type: side effects, throws, or async work run for nothing.",
			Summary:  "A marker given a function call, like `createValidateFn(getUser())` or `getRunTypeId(getUser())`, runs that call at runtime only to read its type. Use the type form with `ReturnType`, or pass a value you already have.",
			Fix: `const isUser = createValidateFn<ReturnType<typeof getUser>>();

// or pass an existing value of that type
const userTypeId = getRunTypeId(existingUser);`,
		},
		{Code: CodeMarkerFreeTypeParameter, Family: FamilyMarker, Level: LevelError, Scope: ScopeRoot, Title: "Marker call inside a generic function: type argument is unresolved",
			Headline: "Marker call is inside a generic function: the type argument is unresolved, so no id can be computed at build time.",
			Summary:  "Inside a generic function the marker sees `T`, not a real type, and `T` changes with each caller, so no single id fits. Call the marker where the type is known, like `createValidateFn<User>()`, or let the caller pass the id in with `InjectRunTypeId<T>`.",
			Fix: `function makeChecker<T>(id: InjectRunTypeId<T>) {
  return createValidateFn<T>(id);
}
const isUser = makeChecker<User>(getRunTypeId<User>());`,
		},
		{Code: CodeMarkerDuplicateFnKey, Family: FamilyMarker, Level: LevelInfo, Scope: ScopeNotSource, Title: "`InjectTypeFnArgs` names the same function family more than once",
			Headline: "`InjectTypeFnArgs` names the function family `{family}` more than once; remove the duplicate key.",
			Summary:  "An `InjectTypeFnArgs` marker lists each function family once. A repeat adds nothing and is usually a copy and paste slip. The build ignores it, so remove it from the list.",
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
		{Code: CodeMarkerAnyFromUnresolvedImport, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeGraph, Title: "Marker type resolved to `any`: an import in this file failed to resolve",
			Headline: "Marker type resolved to `any` because this file has an unresolved import (`{import}`): the generated functions would silently accept anything.",
			Summary:  "An import in this file did not resolve, so its type became `any` at this marker. A validator over `any` accepts everything, a mock returns `undefined`, and encoders pass values through unchanged. Usual causes: an import without a file extension under `moduleResolution: NodeNext`, a missing dependency, or a `paths` alias missing from the tsconfig mion reads. Fix the import, or give mion the same tsconfig as your bundler. For a real `any`, use an alias like `type Loose = any` declared in a file whose imports all resolve.",
			Fix:      "import {User} from './user.runtype.ts';",
		},
		{Code: CodeStructuralIdDepthExceeded, Family: FamilyMarker, Level: LevelError, Scope: ScopeGraph, Title: "Type is too deeply nested: structural-id computation hit its depth cap",
			Headline: "This type is too deeply nested to reflect: computing its structural id hit the recursion depth cap, so the build stops here instead of crashing.",
			Summary:  "The type is nested hundreds of levels deep, written out or generated, with no named type that repeats, and mion stops at a depth far past any real shape. Use a smaller part of the type (such as the item or data you actually send), or recurse through a named type that refers to itself, like a plain recursive interface.",
		},
		{Code: CodeMarkerSelfInstantiatingGeneric, Family: FamilyMarker, Level: LevelError, Scope: ScopeGraph, Title: "Type re-instantiates itself with fresh type arguments: a self-instantiating generic cannot resolve to a structural id",
			Headline: "Type `{type}` re-instantiates itself with fresh type arguments at every level (a self-instantiating generic), so its structural id never resolves. Reflect a monomorphic shape instead.",
			Summary:  "A generic method that returns its own type with new type arguments, like `map<U>(fn: (x: T) => U): Iter<U>`, makes the type grow forever, and renaming the arguments does not help. Write a fully resolved recursive type instead, or reflect only the data, since validators skip methods. Normal generics like `Map<string, User>`, and generic methods that do not return their own type, work fine.",
			Fix:      "interface NumberIter { map(fn: (x: string) => number): NumberIter }",
		},
		{Code: CodeMarkerUnresolvedTypeParameter, Family: FamilyMarker, Level: LevelError, Scope: ScopeGraph, Title: "Marker type argument contains an unresolved type parameter: generics must be fully resolved at the call site",
			Headline: "Type argument contains the unresolved type parameter `{typeParam}`: a generic must be fully resolved at the marker call, so no id can be computed. See Related for where `{typeParam}` is declared.",
			Summary:  "A type parameter of the surrounding generic changes with each call, so no single id fits, and a default on the parameter does not help inside the generic's body. Resolve the generic first, like `type BoxString = Box<string>`, or let the caller pass the id in (see marker-in-generic-function). Generic methods on a concrete type, like `find<T>(query: string): T[]`, are fine.",
			Fix: `interface Box<T> { value: T }
type BoxString = Box<string>;
const isBoxString = createValidateFn<BoxString>();`,
		},
		{Code: CodeMarkerUnresolvedGenericType, Family: FamilyMarker, Level: LevelError, Scope: ScopeGraph, Title: "Generic type used without its required type arguments: a default-less parameter cannot be resolved",
			Headline: "Generic type `{type}` is used without its required type argument(s): parameter `{typeParam}` has no default, so the type cannot resolve to an id. See Related for where `{typeParam}` is declared.",
			Summary:  "TypeScript rejects this too (TS2314), but dev server builds skip the type check, and the type would become `any` with a validator that accepts everything. Pass the missing type argument, or give the parameter a default, used wherever the type is written without arguments.",
			Fix: `const isA = createValidateFn<A<string>>();

// or give the parameter a default
interface A<S extends string = string> { a: S }`,
		},
		{Code: CodeMarkerUntrustedPackage, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "Marker-named type declared by an untrusted package: the type argument was dropped, so the call reflects `unknown`",
			Headline: "`{name}` here was declared by `{package}`, which this project does not trust as a marker package, so the type argument was dropped and this call reflects `unknown`.",
			Summary:  "A marker type counts only when a trusted package declares it, so a same-named type of your own is ignored. This one comes from an untrusted package, so the call builds for `unknown` and its validator accepts everything. Add the package to `markers.packages` in your tsconfig plugin entry, `markers` on the build plugin, or `--marker-packages` on the command line (`@mionjs/run-types` stays trusted). A package that re-exports the markers from `@mionjs/run-types` needs no setting, so check whether it meant to.",
			Fix:      "{\"compilerOptions\": {\"plugins\": [{\"name\": \"mion\", \"markers\": {\"packages\": [\"@my-org/runtypes-markers\"]}}]}}",
		},
		{Code: CodeMarkerUnresolvedTypeName, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeGraph, Title: "Marker type resolved to `any` that was never written: a type name failed to resolve",
			Headline: "Marker type resolved to `any` that was never written: `{name}` failed to resolve (or its declaration references a name that does not), so the generated functions would silently accept anything.",
			Summary:  "A type name at this marker did not resolve, so TypeScript read it as `any` and the generated functions would accept every value. A real `any`, written as `any` or through an alias like `type Loose = any`, is always allowed. Usual causes: a typo, a dependency whose types are not installed, or a `.d.ts` file the tsconfig `include` or `files` does not cover. After adding a `.d.ts`, restart the dev server or your editor's linter.",
			Fix: `// src/ambient.d.ts, matched by the tsconfig include set
declare interface Ambient { a: string; b: number }`,
			Example: `import {getRunTypeId} from '@mionjs/run-types';
export const id = getRunTypeId<{value: Missing}>();`,
			NestedExample: `import {getRunTypeId} from '@mionjs/run-types';
interface Payload { id: string; user: Missing }
export const id = getRunTypeId<{payload: Payload}>();`,
		},
		{Code: CodeMarkerTypelessPrivateMember, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeGraph, Title: "Class from a declaration file has a `private` member with no type: build its package with `mion compile`",
			Headline: "Private member `{member}` of class `{class}` has no type in its declaration file, so the generated functions would accept any value for it. Build the class's package with `mion compile`, which keeps private member types, or read it from its TypeScript sources.",
			Summary:  "A class read from a `.d.ts` file has a `private` member with no type. Plain `tsc` writes every private field and method this way, so RunTypes cannot check it and the build fails. Build the package with `mion compile`, which keeps the type by writing the member as `protected` (outside code still cannot read it), or point its `types` at its TypeScript sources.",
			Fix: `// package.json of the class's package
{"scripts": {"build": "mion compile --tsconfig tsconfig.build.json"}}`,
			Example: `import {getRunTypeId} from '@mionjs/run-types';
declare class Account { id: string; private balance; }
export const id = getRunTypeId<Account>();`,
			NestedExample: `import {getRunTypeId} from '@mionjs/run-types';
declare class Account { id: string; private balance; }
export const id = getRunTypeId<{account: Account}>();`,
		},
		{Code: CodeMarkerUnresolvedFnName, Family: FamilyMarker, Level: LevelError, Scope: ScopeNotSource, Title: "`InjectTypeFnArgs` names a function family that does not exist",
			Headline: "`InjectTypeFnArgs` names `{family}`, which is not a function family{hint}",
			Summary:  "Each name in an `InjectTypeFnArgs` marker must be a function family, like `validationErrors`. An unknown name compiles nothing, so at runtime the call falls back to its no-plugin behaviour. The old short tags (`val`, `verr`, `pjs`) are not accepted; use the full name. The message suggests the closest name when there is one.",
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
		{Code: CodeTypeIdCollision, Family: FamilyMarker, Level: LevelError, Scope: ScopeNotSource, Title: "Two different types produced the same short type id: raise `hashLength`",
			// No Example: the trigger is two shapes hashing to the same seven characters, which no short
			// snippet can arrange.
			Headline: "Two different types get the same id `{id}`: `{firstType}` from {firstSite}, and `{secondType}` here. Raise the `hashLength` option to {hashLength} so every type keeps its own id.",
			Summary:  "Two types got the same short id, so the build cannot tell them apart and stops. Raise `hashLength` (the exact id length) by one in your tsconfig plugin entry or on the build plugin; each extra character gives 62 times more ids. The error names both types, the length to use, and the call that took the id first.",
			Fix:      `{"compilerOptions": {"plugins": [{"name": "mion", "hashLength": 8}]}}`,
		},
		{Code: CodeCompTimeArgsNonLiteral, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "CompTimeArgs<T> argument must be a literal at the call site or const-bound to a literal",
			Headline: "`CompTimeArgs<T>` argument must be a literal at the call site, or a `const` whose initializer is itself entirely literal (a same-module or imported `const` both work).",
			Summary:  "The build reads a `CompTimeArgs<T>` argument from your source, so it must be a literal or a `const` whose value is all literals, declared in the same file or imported, or a namespace import's member (`GEN.lastName`). Function calls, other property access, ternaries and `let` or `var` variables cannot be read, and an object `const` needs `as const` (marker-comptime-arg-widened-const). If the value is only known at runtime, use the untracked version of the function: `getPureFnByKey`, `hasPureFnByKey` and `getCompiledPureFnByKey` instead of `getPureFn`, `hasPureFn` and `getCompiledPureFn`.",
			Fix: `const isUser = createValidateFn<User>(undefined, {mode: 'unsafe'});

// or a const of literals, here or in another module
const opts = {mode: 'unsafe'} as const;
const isUserToo = createValidateFn<User>(undefined, opts);`,
		},
		{Code: CodeCompTimeArgsDepthExceeded, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "CompTimeArgs<T> literal nesting exceeds depth cap (16), refactor to flatten",
			Headline: "`CompTimeArgs<T>` literal nesting exceeds the depth cap (16), refactor to flatten.",
			Summary:  "A `CompTimeArgs<T>` literal can nest at most 16 levels deep. Flatten it, or split it into several smaller `CompTimeArgs<T>` arguments.",
		},
		{Code: CodeCompTimeArgsForbiddenConstruct, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "CompTimeArgs<T> literal contains a forbidden construct (computed property, function call, ternary, template substitution, or a non-mergeable spread)",
			Headline: "`CompTimeArgs<T>` literal contains a forbidden construct ({construct}). Only literals and nested literals are allowed.",
			Summary:  "Every part of a `CompTimeArgs<T>` literal must be a string, number, bigint, boolean, `null`, `undefined`, regex, arrow function, object or array literal, a `const` that points to one, or a namespace import's member (`GEN.lastName`, an exported `const`). Computed property names, function calls, ternaries and template strings with `${}` are rejected. A spread works only on a `const` (or imported) object literal inside an object, or an array literal inside an array. If the value is only known at runtime, use the untracked version of the function: `getPureFnByKey`, `hasPureFnByKey` and `getCompiledPureFnByKey` instead of `getPureFn`, `hasPureFn` and `getCompiledPureFn`.",
			Fix: `const base = {strict: true} as const;
const options = {...base, mode: 'unsafe'} as const;`,
		},
		{Code: CodeCompTimeArgsWidenedConst, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "CompTimeArgs<T> const argument has a widened (non-literal) member, declare the const `as const` so its values stay literal",
			Headline: "`CompTimeArgs<T>` value comes from a `const` with a widened (non-literal) member ({member}); declare the const `as const`.",
			Summary:  "A `const` passed as a `CompTimeArgs` or `CompTimeFnArgs` argument (a whole options object, or a builder child) must keep literal types. Without `as const`, `{strategy: 'mutate'}` widens to `{strategy: string}`, and TypeScript can pick one function variant while the build injects another. Add `as const` to the declaration.",
			Fix: `const preset = {strategy: 'mutate'} as const;
createJsonEncoderFn(undefined, preset);`,
		},
		{Code: CodePureFunctionNotLiteral, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "PureFunction<F> argument must be an inline arrow or function expression",
			Headline: "`PureFunction<F>` argument must be an INLINE arrow or function expression.",
			Summary:  "Write the `PureFunction<F>` function inline at the call, as an arrow or function expression. A named function, even a private `const f = ...` or `function f() {}`, is rejected: the build compiles the body ahead of time, and the compiled copy must be the only one that can run. An imported or exported function is reported as purefn-imported-or-exported.",
			Fix:      "registerValidator((v: unknown) => typeof v === 'string');",
		},
		{Code: CodePureFunctionExternalHandle, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "PureFunction<F> literal must not be imported or exported, bind it to an inline or module-private function so only the compiled copy can run",
			Headline: "`PureFunction<F>` literal must not be imported or exported: the compiled copy must be the only one that can run.",
			Summary:  "A `PureFunction<F>` function cannot be imported from or exported to another module. The build compiles the body, and if the original stayed reachable, a caller could run it and get different behaviour from the compiled copy. Write the function inline at the call (a named function is not allowed either, see purefn-not-inline).",
			Fix:      "registerValidator((v: unknown) => typeof v === 'string');",
		},
		{Code: CodeTsconfigLoadFailed, Family: FamilyMarker, Level: LevelError, Scope: ScopeNotSource, Title: "Project tsconfig failed to load: every lane reads this config, so the operation stops",
			// No Example: the harness scans source through a healthy config, and this is raised by a
			// broken tsconfig.json.
			Headline: "Project tsconfig failed to load ({reason}): the build, the linter, and the CLI all read this config, so nothing can run until it loads.",
			Summary:  "Your tsconfig (the one you named, or the one found next to your project) is missing or cannot be parsed. mion reads your types through it, so it stops rather than guess with defaults. Fix the tsconfig (the message names the first problem), or point to the right file with the `tsconfig` setting of the build plugin or linter, or the `--tsconfig` flag.",
		},
		{Code: CodeUnsupportedLibSelection, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "The project's TypeScript `lib` leaves the required globals undeclared, so reflected types cannot be trusted",
			// No Example: the harness scans source through a healthy config, and this is raised by the
			// project's `lib` setting.
			Headline: "The project `lib` declares no base ECMAScript library (loaded: {libs}), so core globals like `Array` are missing and reflected types cannot be trusted.",
			Summary:  "Your tsconfig `lib` names no base ECMAScript edition, so `Array`, `Object`, `String` and the other core globals are never declared. Then `number[]` becomes an empty object and its validator would accept any value, so mion stops. Name a base edition in `lib` (`[\"ES2022\"]`, or `[\"ES2022\", \"DOM\"]` for browser code), or remove `lib` and let `target` pick it. A feature entry such as `\"esnext.disposable\"` cannot replace a base edition.",
			Fix:      `{"compilerOptions": {"lib": ["ES2022"]}}`,
		},
		{Code: CodeEmitOutsideRootDir, Family: FamilyMarker, Level: LevelError, Scope: ScopeNotSource, Title: "An emitted file would land outside `outDir` because its source sits outside `rootDir`; it is not written",
			Headline: "`mion compile` refused to write {file}: it lands outside outDir ({outDir}) because its source sits outside rootDir; move rootDir up so every file of the program is under it, or reach that module through its package name.",
			Summary:  "Like `tsc`, `mion compile` writes each file under `outDir`, in the same folders it has under `rootDir`. A file imported from outside `rootDir` (a `paths` entry into a sibling package, or a relative import above the source folder) has no place there, so it is not written and the compile fails. Set `rootDir` to a folder that holds every file of the program, or import that module by its package name. `tsc` reports it as TS6059.",
		},
	} {
		Register(definition)
	}
}
