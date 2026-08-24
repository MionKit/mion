package resolver_test

import (
	"testing"

	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// runtypesDTSWithPureFn is the ambient `ts-runtypes` module used by the
// PFE9012 tests. It carries just enough surface to (a) demand a verr entry —
// whose live body reaches `utl.getPureFn('rt::newRunTypeErr')` — and (b) let a
// companion .ts file register a pure fn so the extractor recognizes it. Like a
// published-package consumer, it resolves `@ts-runtypes/core` to a declaration:
// the runtime's own `rt::`/`rtFormats::` registrations live in the package's
// `.js` (side-effect-imported at runtime), never in this .d.ts. Those built-in
// namespaces are therefore exempt from PFE9012 (see
// purefunctions.IsBuiltinPureFnNamespace) — validating them would false-positive
// on every consumer. Only user-owned namespaces are cross-checked.
const runtypesDTSWithPureFn = `declare module '@ts-runtypes/core' {
  export type CompTimeArgs<T> = T & {readonly __rtCompTimeArgsBrand?: never};
  export type CompTimeFnArgs<T> = T & {readonly __rtCompTimeFnArgsBrand?: never};
  export type InjectTypeFnArgs<T, F1 extends string, F2 extends string = never, F3 extends string = never> = string & {readonly __rtInjectTypeFnArgsBrand?: T; readonly __rtInjectTypeFnArgsFns?: [F1, F2, F3]};
  export interface ValidateOptions {noLiterals?: boolean; noIsArrayCheck?: boolean; rejectCircularRefs?: boolean}
  export function createGetValidationErrorsFn<T>(val?: T, options?: CompTimeFnArgs<ValidateOptions>, id?: InjectTypeFnArgs<T, 'verr'>): (v: unknown, p?: unknown[], e?: unknown[]) => unknown[];
  export type PureFunction<F> = F & {readonly __rtPureFunctionBrand?: never};
  export type PureFunctionFactory<F> = F & {readonly __rtPureFunctionFactoryBrand?: never};
  export type PureFnId = string & {readonly __rtPureFnIdBrand?: never};
  export interface RTUtils {
    usePureFn(key: CompTimeArgs<string>): any;
    getPureFn(key: CompTimeArgs<string>): any;
  }
  export function registerPureFnFactory(
    pureFnId: CompTimeArgs<PureFnId>,
    createPureFn: PureFunctionFactory<(utl: RTUtils) => any> | null
  ): any;
}
`

// pureFnDepDiags filters a response's diagnostics down to the pure-fn family
// (PFE*) so the assertions ignore any marker/runtype diagnostics the fixture
// also produces.
func pureFnDepDiags(diags []diagnostics.Diagnostic) []diagnostics.Diagnostic {
	return filterDiagsByFamily(diags, diagnostics.FamilyPureFn)
}

// assertNoPFE9012 fails if any PFE9012 (missing pure-fn dep) diagnostic appears.
func assertNoPFE9012(t *testing.T, diags []diagnostics.Diagnostic) {
	t.Helper()
	for _, diag := range pureFnDepDiags(diags) {
		if diag.Code == diagnostics.CodeMissingPureFnDep {
			t.Fatalf("unexpected %s (built-in refs must never false-positive): %+v", diagnostics.CodeMissingPureFnDep, diag)
		}
	}
}

// TestPureFnDepValidation_ConsumerOwnPureFnNoFalsePositive is the regression
// test for the PFE9012 false positive: a published-package consumer resolves
// `@ts-runtypes/core` to its .d.ts (so the runtime's `rt::` registration source
// is NOT in the program), uses a feature whose emitted body reaches a built-in
// (createGetValidationErrorsFn -> `rt::newRunTypeErr`), AND registers its OWN pure
// fn. The consumer's registration used to make the program's registration count
// non-zero, defeating the "any registration present?" guard and turning every
// built-in reference into a PFE9012 wall that halted the build. Built-in
// namespaces are now exempt, so no PFE9012 must appear on any path.
func TestPureFnDepValidation_ConsumerOwnPureFnNoFalsePositive(t *testing.T) {
	sources := map[string]string{
		"runtypes.d.ts": runtypesDTSWithPureFn,
		"a.ts": `import {createGetValidationErrorsFn} from '@ts-runtypes/core';
export const errorsOf = createGetValidationErrorsFn<{a: string; b: number}>();
`,
		// The consumer's OWN pure fn, in a user namespace. This is what defeated
		// the old whole-program count guard and unleashed the built-in wall.
		"reg.ts": `import {registerPureFnFactory} from '@ts-runtypes/core';
export const _reg = registerPureFnFactory('myapp::slugify', function () { return function () { return ''; }; });
`,
	}

	t.Run("scanFiles", func(t *testing.T) {
		r := setupInline(t, sources)
		resp := r.Dispatch(protocol.Request{
			Op:                  protocol.OpScanFiles,
			Files:               []string{"a.ts"},
			IncludeEntryModules: true,
		})
		if resp.Error != "" {
			t.Fatalf("scanFiles: %s", resp.Error)
		}
		assertNoPFE9012(t, resp.Diagnostics)
	})

	// IncludeRtDiagnostics (the lint flag) is the linter-plugin path — the wall
	// surfaced there too, so pin it stays clean.
	t.Run("scanFiles_lintOnly", func(t *testing.T) {
		r := setupInline(t, sources)
		resp := r.Dispatch(protocol.Request{
			Op:                   protocol.OpScanFiles,
			Files:                []string{"a.ts"},
			IncludeRtDiagnostics: true,
		})
		if resp.Error != "" {
			t.Fatalf("scanFiles: %s", resp.Error)
		}
		assertNoPFE9012(t, resp.Diagnostics)
	})

	t.Run("dump", func(t *testing.T) {
		r := setupInline(t, sources)
		resp := r.Dispatch(protocol.Request{Op: protocol.OpDump})
		if resp.Error != "" {
			t.Fatalf("dump: %s", resp.Error)
		}
		assertNoPFE9012(t, resp.Diagnostics)
	})
}

// TestPureFnDepValidation_RegistrationPresent_NoDiagnostic — the built-in the
// verr body reaches (rt::newRunTypeErr) is also hand-registered here in a file
// OUTSIDE the scanned set. No PFE9012 must appear: the reference is a built-in
// (exempt) AND the whole-program index finds the registration — either alone
// suffices. Pins that a present registration in a non-scanned file is honoured
// (a per-file scan set would false-positive).
func TestPureFnDepValidation_RegistrationPresent_NoDiagnostic(t *testing.T) {
	sources := map[string]string{
		"runtypes.d.ts": runtypesDTSWithPureFn,
		"a.ts": `import {createGetValidationErrorsFn} from '@ts-runtypes/core';
export const errorsOf = createGetValidationErrorsFn<{a: string; b: number}>();
`,
		"reg.ts": `import {registerPureFnFactory} from '@ts-runtypes/core';
export const _reg = registerPureFnFactory('rt::newRunTypeErr', function () { return function () { return []; }; });
`,
	}

	t.Run("scanFiles", func(t *testing.T) {
		r := setupInline(t, sources)
		resp := r.Dispatch(protocol.Request{
			Op:                  protocol.OpScanFiles,
			Files:               []string{"a.ts"},
			IncludeEntryModules: true,
		})
		if resp.Error != "" {
			t.Fatalf("scanFiles: %s", resp.Error)
		}
		assertNoPFE9012(t, resp.Diagnostics)
	})

	t.Run("dump", func(t *testing.T) {
		r := setupInline(t, sources)
		resp := r.Dispatch(protocol.Request{Op: protocol.OpDump})
		if resp.Error != "" {
			t.Fatalf("dump: %s", resp.Error)
		}
		assertNoPFE9012(t, resp.Diagnostics)
	})
}

// TestPureFnDepValidation_StubProgramNoDiagnostic — a program with ZERO
// registerPureFnFactory calls (the default ambient stub the test harnesses use).
// The verr body still reaches a built-in (rt::newRunTypeErr), but built-in
// namespaces are exempt, so no PFE9012 fires. This is the common consumer shape
// (nothing user-registered) and must stay clean.
func TestPureFnDepValidation_StubProgramNoDiagnostic(t *testing.T) {
	r := setupInline(t, map[string]string{
		"a.ts": `import {createGetValidationErrorsFn} from '@ts-runtypes/core';
export const errorsOf = createGetValidationErrorsFn<{a: string; b: number}>();
`,
	})
	resp := r.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"a.ts"},
		IncludeEntryModules: true,
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	assertNoPFE9012(t, resp.Diagnostics)
}
