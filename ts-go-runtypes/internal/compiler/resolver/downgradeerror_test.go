package resolver_test

// downgradeerror_test.go covers the `@mion-downgrade-error` directive: the
// sibling of `@mion-expect-error` that KEEPS the finding and stops it halting.
//
// It dispatches the whole-program op, like expecterror_test.go does, because the
// self-check codes answer "did this comment do anything", which is only true or
// false against a whole program.
//
// The difference from expect-error is the whole point and is what these tests
// pin: the finding must still be in the response, marked Downgraded, rather than
// gone. Suppressing it instead would hide a correct statement about the code.

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// withDowngrade inserts a comment line directly above the createValidateFn call
// in validateSymbolRootSource (a root-position `symbol`), the position the directive
// contract defines.
func withDowngrade(comment string) string {
	return strings.Replace(validateSymbolRootSource,
		"export const bad = createValidateFn<symbol>();",
		comment+"\nexport const bad = createValidateFn<symbol>();", 1)
}

// generateDiags runs the whole-program op over one file and returns the
// diagnostics themselves, so a test can read the Downgraded flag rather than
// only the codes.
func generateDiags(t *testing.T, source string) []diagnostics.Diagnostic {
	t.Helper()
	response := setupInline(t, map[string]string{"entry.ts": source}).Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if response.Error != "" {
		t.Fatalf("generate: %s", response.Error)
	}
	return response.Diagnostics
}

// findDowngradable returns the validate-symbol-root finding, and whether it was reported.
func findValidateSymbolRoot(list []diagnostics.Diagnostic) (diagnostics.Diagnostic, bool) {
	for _, diagnostic := range list {
		if diagnostic.Code == diagnostics.CodeVLSymbolRoot {
			return diagnostic, true
		}
	}
	return diagnostics.Diagnostic{}, false
}

func codesIn(list []diagnostics.Diagnostic) []string {
	codes := make([]string, 0, len(list))
	for _, diagnostic := range list {
		codes = append(codes, diagnostic.Code)
	}
	return codes
}

func TestDowngradeError_KeepsTheFindingAndMarksIt(t *testing.T) {
	list := generateDiags(t, withDowngrade("// @mion-downgrade-error validate-symbol-root"))
	found, ok := findValidateSymbolRoot(list)
	if !ok {
		t.Fatalf("a downgrade keeps the finding, it never removes it; got %v", codesIn(list))
	}
	if !found.Downgraded {
		t.Errorf("validate-symbol-root must be marked downgraded so the consumers that halt can stand it down; got %+v", found)
	}
	// The level stays what the catalog says: it is the label form, and what acts
	// on a finding is the consumer.
	if found.Level != diagnostics.LevelRuntimeError {
		t.Errorf("level must stay LevelRuntimeError, got %v", found.Level)
	}
	if contains(codesIn(list), diagnostics.CodeDowngradeErrorUnused) {
		t.Errorf("the directive lowered validate-symbol-root, so it is used; got %v", codesIn(list))
	}
}

func TestDowngradeError_BareFormCoversAnyRuntimeError(t *testing.T) {
	list := generateDiags(t, withDowngrade("// @mion-downgrade-error"))
	found, ok := findValidateSymbolRoot(list)
	if !ok || !found.Downgraded {
		t.Fatalf("the bare form covers any downgradeable code; got %v", codesIn(list))
	}
}

func TestDowngradeError_SeveralCodesOnOneComment(t *testing.T) {
	for _, comment := range []string{
		"// @mion-downgrade-error validate-symbol-root json-prepare-never-root",
		"// @mion-downgrade-error validate-symbol-root, json-prepare-never-root",
	} {
		t.Run(comment, func(t *testing.T) {
			list := generateDiags(t, withDowngrade(comment))
			found, ok := findValidateSymbolRoot(list)
			if !ok || !found.Downgraded {
				t.Fatalf("validate-symbol-root must be lowered whichever separator is used; got %v", codesIn(list))
			}
		})
	}
}

// Only the comment directly above the finding counts, so a blank line between
// them leaves the finding halting and reports the comment.
func TestDowngradeError_OnlyTheLineDirectlyAboveCounts(t *testing.T) {
	list := generateDiags(t, withDowngrade("// @mion-downgrade-error validate-symbol-root\n"))
	found, ok := findValidateSymbolRoot(list)
	if !ok {
		t.Fatalf("expected validate-symbol-root to survive; got %v", codesIn(list))
	}
	if found.Downgraded {
		t.Errorf("a comment two lines up claims nothing; got %+v", found)
	}
	if !contains(codesIn(list), diagnostics.CodeDowngradeErrorUnused) {
		t.Errorf("expected comment-downgrade-error-unused for the comment that claimed nothing; got %v", codesIn(list))
	}
}

// A trailing comment after code is deliberately not a directive: it would be
// ambiguous whether it covers its own line or the next one.
func TestDowngradeError_TrailingCommentIsNotADirective(t *testing.T) {
	source := strings.Replace(validateSymbolRootSource,
		"export const bad = createValidateFn<symbol>();",
		"export const bad = createValidateFn<symbol>(); // @mion-downgrade-error validate-symbol-root", 1)
	list := generateDiags(t, source)
	found, ok := findValidateSymbolRoot(list)
	if !ok || found.Downgraded {
		t.Fatalf("a trailing comment is not a directive; got %v", codesIn(list))
	}
	if contains(codesIn(list), diagnostics.CodeDowngradeErrorUnused) {
		t.Errorf("a non-directive comment is not judged either; got %v", codesIn(list))
	}
}

// comment-downgrade-error-unused: the comment sits over a healthy call, so it lowered nothing.
func TestDowngradeError_UnusedOnAHealthyLine(t *testing.T) {
	source := strings.Replace(validateSymbolRootSource,
		"export const idStatic = getRunTypeId<{name: string}>();",
		"// @mion-downgrade-error validate-symbol-root\nexport const idStatic = getRunTypeId<{name: string}>();", 1)
	codes := codesIn(generateDiags(t, source))
	if !contains(codes, diagnostics.CodeDowngradeErrorUnused) {
		t.Fatalf("expected comment-downgrade-error-unused on a healthy line; got %v", codes)
	}
}

// comment-downgrade-error-not-allowed: a LevelError code halts regardless, so the directive must refuse it
// rather than appear to work. marker-type-id-collision is one.
func TestDowngradeError_FatalCodeCannotBeLowered(t *testing.T) {
	codes := codesIn(generateDiags(t, withDowngrade("// @mion-downgrade-error marker-type-id-collision")))
	if !contains(codes, diagnostics.CodeDowngradeErrorNotDowngradeable) {
		t.Fatalf("expected comment-downgrade-error-not-allowed for a LevelError code; got %v", codes)
	}
	// One problem to fix, not two.
	if contains(codes, diagnostics.CodeDowngradeErrorUnused) {
		t.Errorf("a malformed directive reports comment-downgrade-error-not-allowed only, never also comment-downgrade-error-unused; got %v", codes)
	}
}

// comment-downgrade-error-unknown-name: a code the catalog does not define can never match, so the comment
// would lower nothing while looking like it works.
func TestDowngradeError_UnknownCodeIsATypo(t *testing.T) {
	list := generateDiags(t, withDowngrade("// @mion-downgrade-error VL2"))
	codes := codesIn(list)
	if !contains(codes, diagnostics.CodeDowngradeErrorUnknownCode) {
		t.Fatalf("expected comment-downgrade-error-unknown-name for a mistyped code; got %v", codes)
	}
	if found, ok := findValidateSymbolRoot(list); !ok || found.Downgraded {
		t.Errorf("the real finding must survive untouched; got %v", codes)
	}
}

// comment-downgrade-error-already-warning: lowering an info (validate-non-data-property-dropped) does nothing; `downgradeErrors` accepts that silently, a comment should not.
// The comment-downgrade-error-unused case below covers a warning.
func TestDowngradeError_AlreadyWarningDoesNothing(t *testing.T) {
	codes := codesIn(generateDiags(t, withDowngrade("// @mion-downgrade-error validate-non-data-property-dropped")))
	if !contains(codes, diagnostics.CodeDowngradeErrorAlreadyWarning) {
		t.Fatalf("expected comment-downgrade-error-already-warning for a code that is already info; got %v", codes)
	}
	if contains(codes, diagnostics.CodeDowngradeErrorUnused) {
		t.Errorf("a malformed directive reports comment-downgrade-error-already-warning only, never also comment-downgrade-error-unused; got %v", codes)
	}
}

// A comment-downgrade-error-* code is the check that keeps these comments honest, so no directive may
// stand one down.
func TestDowngradeError_DwnCodeCannotBeStoodDown(t *testing.T) {
	codes := codesIn(generateDiags(t, withDowngrade("// @mion-downgrade-error comment-downgrade-error-unused")))
	if !contains(codes, diagnostics.CodeDowngradeErrorAlreadyWarning) {
		t.Fatalf("a comment-downgrade-error-* code is a warning, so naming it reports comment-downgrade-error-already-warning; got %v", codes)
	}
	codes = codesIn(generateDiags(t, withDowngrade("// @mion-expect-error comment-downgrade-error-unused")))
	if !contains(codes, diagnostics.CodeExpectErrorNotSuppressible) {
		t.Fatalf("expected comment-expect-error-not-allowed: a directive cannot silence the checks that keep directives honest; got %v", codes)
	}
}

// The two directives coexist in one file, each doing its own job, and the
// marker call shapes keep resolving to one id either way (the marker test
// coverage rule: static `getRunTypeId<T>()` and value-inferred
// `getRunTypeId(value)`).
func TestDowngradeError_CoexistsWithExpectError(t *testing.T) {
	source := `import {createValidateFn, createJsonEncoderFn, getRunTypeId} from '@mionjs/run-types';
// @mion-downgrade-error validate-symbol-root
export const kept = createValidateFn<symbol>();
// @mion-expect-error json-prepare-clone-symbol-root
export const removed = createJsonEncoderFn<symbol>();
export const idStatic = getRunTypeId<{name: string}>();
const sample = {name: 'Ada'};
export const idReflected = getRunTypeId(sample);
`
	list := generateDiags(t, source)
	codes := codesIn(list)
	found, ok := findValidateSymbolRoot(list)
	if !ok || !found.Downgraded {
		t.Errorf("the downgraded finding must still be reported and marked; got %v", codes)
	}
	if contains(codes, diagnostics.CodePJSSymbolRoot) {
		t.Errorf("the expected finding must be removed outright; got %v", codes)
	}
	for _, unused := range []string{diagnostics.CodeDowngradeErrorUnused, diagnostics.CodeExpectErrorUnused} {
		if contains(codes, unused) {
			t.Errorf("both directives did their job, so neither is unused; got %v", codes)
		}
	}
}

// TestScanFiles_EchoesTheTsconfigDowngradeErrors: the linter has no generate call to read it from.
func TestScanFiles_EchoesTheTsconfigDowngradeErrors(t *testing.T) {
	session := setupInlineWith(t, map[string]string{"entry.ts": validateSymbolRootSource}, func(programOpts *program.Options, resolverOpts *resolver.Options) {
		programOpts.SingleThreaded = true
		resolverOpts.SingleThreaded = true
		resolverOpts.TsconfigDowngradeErrors = []string{diagnostics.CodeVLSymbolRoot}
	})
	response := session.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"entry.ts"}, IncludeRtDiagnostics: true})
	if response.Error != "" {
		t.Fatalf("scanFiles: %s", response.Error)
	}
	if len(response.DowngradeErrors) != 1 || response.DowngradeErrors[0] != diagnostics.CodeVLSymbolRoot {
		t.Fatalf("scanFiles must echo the tsconfig downgradeErrors, got %v", response.DowngradeErrors)
	}
}
