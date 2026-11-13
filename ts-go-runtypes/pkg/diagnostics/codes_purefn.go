package diagnostics

// Pure-function extractor codes (purefn-*).
//
// The family is NOT fatal as a block: the levels below are what the emitter actually does. A purity
// violation compiles the offending body and ships it (walker.go emits the purity codes without
// withholding the entry), and a missing dep ships a file that throws on the call. Broken OUTPUT
// rather than absent output is LevelRuntimeError: it still fails a build by default, but a consumer
// may stand it down, because the body was going to ship either way.
const (
	// CodeDestructuredParam: buildPureFnEntry returns no entry, so no module is written and the call
	// site keeps its un-rewritten `registerPureFn(...)`. LevelError: there is nothing to accept.
	CodeDestructuredParam = "purefn-destructured-param"

	CodePurityThis          = "purefn-uses-this"
	CodePurityAwait         = "purefn-uses-await"
	CodePurityYield         = "purefn-uses-yield"
	CodePurityDynamicImport = "purefn-uses-dynamic-import"
	CodePurityForbidden     = "purefn-forbidden-construct"
	CodePurityClosure       = "purefn-reads-outer-variable"

	CodeMissingPureFnDep    = "purefn-not-registered"
	CodePurityDepNotLiteral = "purefn-dependency-not-id"
	// CodePureFnIdMismatch: the registration passes an explicit id that is not the one its body
	// hashes to. No entry is built and the call site keeps its own text. LevelError: accepting it
	// would split one function across two keys.
	CodePureFnIdMismatch = "purefn-id-mismatch"
	// CodePureFnDependencyCycle: two pure functions reach each other through `utl.getPureFn`. An id
	// hashes the shipped body and that body carries its dependencies' ids, so each id would have to
	// contain the other. LevelError: no id, so no entry and no emitted module; it also replaces a
	// runtime hang with a build error.
	CodePureFnDependencyCycle = "purefn-dependency-cycle"
	// CodePureFnDepUnbuilt: an installed package ships neither `mion-pure-fns/` nor its sources, so
	// the body cannot be served. LevelError: the consumer's pure fn stays unbuilt until the package
	// is built with mion.
	CodePureFnDepUnbuilt = "purefn-package-not-built"
	// CodePureFnArtifactUnreadable: an installed package's `mion-pure-fns/` file was skipped (an
	// index of a newer format or not one, a listed module missing or without its tuple).
	// LevelWarning: the package may then look unbuilt (purefn-package-not-built) or lack an id (purefn-not-registered); this names
	// the cause.
	CodePureFnArtifactUnreadable = "purefn-artifact-unreadable"
	// CodePureFnArtifactConflict: two `mion-pure-fns/` of one installed package give an id a
	// different body or name. LevelError: an id is one body, so serving either would silently pick
	// one build over the other.
	CodePureFnArtifactConflict = "purefn-artifact-conflict"
)

func init() {
	for _, definition := range []Definition{
		{Code: CodeDestructuredParam, Family: FamilyPureFn, Level: LevelError, Scope: ScopeNotSource, Title: "Pure-fn factory uses destructured parameter",
			Headline: "Pure-fn factory `{factory}` uses destructured parameters; only simple identifier params are supported.",
			Summary:  "A destructured parameter like `({a, b})` or `([x, y])` has no single name the build can refer to. Take one plain parameter and destructure it inside the body.",
			Fix: `const myFn = registerPureFnFactory((utl) => (params) => {
  const {a, b} = params;
  return ...;
});`,
		},
		{Code: CodePureFnDependencyCycle, Family: FamilyPureFn, Level: LevelError, Scope: ScopeNotSource, Title: "Pure functions depend on each other in a cycle",
			Headline: "Pure functions circular dependency: `{fn}` (`{id}`) reaches back into `{target}`.",
			Summary:  "A pure function's id depends on the ids of the pure functions it calls, so two that call each other can never get an id, and at runtime they would call each other forever. Break the cycle: copy the shared part into both, or move it into a third pure function that calls neither.",
		},

		{Code: CodePurityThis, Family: FamilyPureFn, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "Pure-fn body references this",
			Headline: "`this` is not allowed inside a pure-fn factory body; pure functions can't depend on a calling context.",
			Summary:  "A pure function is built on its own at build time, so there is no `this` to bind. Pass the value in as a parameter, or move the function out of the class or object method that owns `this`.",
			Fix: `const myFn = registerPureFnFactory((utl) => (self, input) => {
  return self.field + input;
});`,
		},
		{Code: CodePurityAwait, Family: FamilyPureFn, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "Pure-fn body contains await",
			Headline: "`async`/`await` is not allowed inside a pure-fn factory body.",
			Summary:  "A pure function must run synchronously so the build can call it at compile time, and `async` returns a Promise that only resolves at runtime. Make the factory synchronous and do the async work in the caller.",
			Fix: `const myFn = registerPureFnFactory((utl) => {
  return (resolvedValue) => transform(resolvedValue);
});`,
		},
		{Code: CodePurityYield, Family: FamilyPureFn, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "Pure-fn body contains yield",
			Headline: "`yield` / generators are not allowed inside a pure-fn factory body.",
			Summary:  "A generator keeps state between steps, and the build cannot write that out as standalone code. Return an array or a plain iterable instead.",
			Fix: `const myFn = registerPureFnFactory((utl) => (input) => {
  return [...computeAll(input)];
});`,
		},
		{Code: CodePurityDynamicImport, Family: FamilyPureFn, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "Pure-fn body uses dynamic import",
			Headline: "`import()` is not allowed inside a pure-fn factory body.",
			Summary:  "`import()` loads a module at runtime, and the build needs every dependency up front. Use a top-level `import`, or pass the module in as a parameter.",
		},
		{Code: CodePurityForbidden, Family: FamilyPureFn, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "Pure-fn body uses a forbidden global",
			Headline: "`{construct}` is not allowed inside a pure-fn factory body.",
			Summary:  "Globals such as `eval`, `Function`, `fetch`, `XMLHttpRequest`, `require`, `process`, `globalThis`, `window` and `document` are blocked in a pure function. They run arbitrary code or depend on an environment the build cannot reproduce. Remove the reference, or pass the value you need in as a parameter.",
		},
		{Code: CodePurityClosure, Family: FamilyPureFn, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "Pure-fn body closes over outer binding",
			Headline: "`{name}` is captured from outer scope inside a pure-fn factory; pure functions can't reach outside their own body.",
			Summary:  "The build copies a factory's body without the scope around it, so a variable from outside becomes `undefined` at runtime. Pass it in as a parameter, write its value inside the body if it is a constant, or call another pure function through `utl.getPureFn` and its id.",
			Fix: `import {slugify} from './slug';
// pass the value in
const withRate = registerPureFnFactory((utl) => (rate, value) => value * rate);
// or reach another pure function by its id
const toSlug = registerPureFnFactory((utl) => (value) => utl.getPureFn(slugify)(value));`,
		},

		{Code: CodeMissingPureFnDep, Family: FamilyPureFn, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "RT depends on missing pure-fn",
			// No Example: purefn-not-registered needs a pure fn whose registration is absent from the program, and the
			// built-ins register through the `mion` package itself, which the harness always has present.
			Headline: "Pure fn `{fn}` is referenced by a RT function but was never registered.",
			Summary:  "A generated validator or encoder calls a pure function through `utl.usePureFn`, but no file in the build registers that id, so the code would fail when it runs. Either the file that registers it is outside the build, or its body changed after the id was copied by hand (the id is the package plus a hash of the body). Import the id from the file that registers it with `registerPureFnFactory`, and make sure that file is part of the build.",
			Fix: `import {registerPureFnFactory} from '@mionjs/run-types/runtime';
export const newRunTypeErr = registerPureFnFactory((utl) => (message) => new Error(message));`,
		},
		{Code: CodePurityDepNotLiteral, Family: FamilyPureFn, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "Pure-fn dep arg not a literal",
			Headline: "`{namespace}.{fn}` dependency argument must be a pure-fn id.",
			Summary:  "`utl.usePureFn` and `utl.getPureFn` need a fixed id, so the build can check that the pure function is registered and write the id into the output. Pass the value a registration returned, imported from a file in this build, or a string literal.",
			Fix: `import {slugify} from './slug';
const myFn = registerPureFnFactory((utl) => (input) => utl.usePureFn(slugify)(input));`,
		},
		{Code: CodePureFnIdMismatch, Family: FamilyPureFn, Level: LevelError, Scope: ScopeNotSource, Title: "Explicit pure-fn id does not match the body it registers",
			Headline: "Explicit pure-fn id `{id}` does not match this registration's computed id `{computedId}`.",
			Summary:  "The build adds a pure function's id itself, so your source normally passes none. Editing the body changes the id (renaming or moving the function does not), so a hand-written or outdated id registers the body under one id while every reference uses another. Delete the id argument and let the build add it, or regenerate the file the id is imported from.",
		},
		{Code: CodePureFnDepUnbuilt, Family: FamilyPureFn, Level: LevelError, Scope: ScopeNotSource, Title: "Pure-fn dep lives in a package that ships no compiled pure fns",
			// No Example: purefn-package-not-built needs an installed package with no compiled pure fn, which the harness
			// cannot stage.
			Headline: "Pure fn `{fn}` comes from `{package}`, which ships no compiled pure functions.",
			Summary:  "A pure function imported from another package is built from that package's compiled pure functions (the `mion-pure-fns/` directory its mion build writes next to its output) or from its TypeScript sources. This package ships neither. Build it with mion (a bundler plugin or `mion compile`) and publish its output directory, or publish its sources.",
		},
		{Code: CodePureFnArtifactUnreadable, Family: FamilyPureFn, Level: LevelWarning, Scope: ScopeNotSource, Title: "Pure-fn artifact of an installed package could not be read",
			// No Example: purefn-artifact-unreadable and purefn-artifact-conflict need an installed package with a `mion-pure-fns/`, which the
			// harness cannot stage.
			Headline: "`{file}` could not be read as part of a pure-fn artifact: {reason}.",
			Summary:  "A mion build writes a package's compiled pure functions to `mion-pure-fns/` next to its output: an `index.json` plus one module per function. This file was skipped: the index is not an index or has a format this compiler does not know, or a module it lists is missing or holds nothing for its id. The package may then seem to ship no pure functions, or miss one. Update mion to the version that wrote the directory, or rebuild the package with your version.",
		},
		{Code: CodePureFnArtifactConflict, Family: FamilyPureFn, Level: LevelError, Scope: ScopeNotSource, Title: "Two pure-fn artifact directories of one package disagree on an id",
			Headline: "Pure fn `{fn}` differs between `{first}` and `{second}`.",
			Summary:  "Two `mion-pure-fns/` directories of the same installed package give this id a different body or name, so one is stale or comes from another build. One id must mean one body under one name, so the build stops rather than pick one. Rebuild the package so every output directory has the same `mion-pure-fns/`, or delete the stale copy.",
		},
	} {
		Register(definition)
	}
}
