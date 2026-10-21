package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// expecterror_test.go covers the `@mion-expect-error` directive end to end,
// through the real scan.
//
// The whole-program op is what these dispatch, because that is where a wrong
// directive is reported: "this comment silenced nothing" is only answerable
// against every finding the program has, and a single-file op holds a slice of
// them. Silencing itself works on any op and is covered by the first cases.
//
// Marker coverage rule: every fixture carries BOTH getRunTypeId call shapes,
// the static `getRunTypeId<T>()` and the value-inferred `getRunTypeId(value)`,
// and TestExpectError_FormEquivalence asserts the pair resolves to one entry
// while a directive is in the file.

// validateSymbolRootSource is a root-position `symbol`, which can never be validated (validate-symbol-root,
// Error). The two healthy marker sites prove a directive changes only the
// finding it names, not the file's rewrites.
const validateSymbolRootSource = `import {createValidateFn, getRunTypeId} from '@mionjs/run-types';
export const bad = createValidateFn<symbol>();
export const idStatic = getRunTypeId<{name: string}>();
const sample = {name: 'Ada'};
export const idReflected = getRunTypeId(sample);
`

// withDirective inserts a comment line directly above the createValidateFn call
// in validateSymbolRootSource, which is the position the directive contract defines.
func withDirective(comment string) string {
	return strings.Replace(validateSymbolRootSource,
		"export const bad = createValidateFn<symbol>();",
		comment+"\nexport const bad = createValidateFn<symbol>();", 1)
}

// generateDiagnostics runs the whole-program op over one file and returns the
// codes it reported.
func generateDiagnostics(t *testing.T, source string) []string {
	t.Helper()
	session := setupInline(t, map[string]string{"entry.ts": source})
	response := session.Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if response.Error != "" {
		t.Fatalf("generate: %s", response.Error)
	}
	return codesOf(response)
}

func TestExpectError_SilencesTheNamedCode(t *testing.T) {
	codes := generateDiagnostics(t, withDirective("// @mion-expect-error validate-symbol-root"))
	if contains(codes, diagnostics.CodeVLSymbolRoot) {
		t.Fatalf("validate-symbol-root should be silenced by the directive; got %v", codes)
	}
	if contains(codes, diagnostics.CodeExpectErrorUnused) {
		t.Fatalf("the directive silenced validate-symbol-root, so it is used; got %v", codes)
	}
}

func TestExpectError_BareFormSilencesAnything(t *testing.T) {
	codes := generateDiagnostics(t, withDirective("// @mion-expect-error"))
	if contains(codes, diagnostics.CodeVLSymbolRoot) {
		t.Fatalf("the bare form covers any suppressible code; got %v", codes)
	}
}

func TestExpectError_SeveralCodesOnOneComment(t *testing.T) {
	for _, comment := range []string{
		"// @mion-expect-error validate-symbol-root json-prepare-never-root",
		"// @mion-expect-error validate-symbol-root, json-prepare-never-root",
	} {
		t.Run(comment, func(t *testing.T) {
			codes := generateDiagnostics(t, withDirective(comment))
			if contains(codes, diagnostics.CodeVLSymbolRoot) {
				t.Fatalf("validate-symbol-root is named, so it is silenced; got %v", codes)
			}
		})
	}
}

func TestExpectError_DoesNotSilenceAnUnnamedCode(t *testing.T) {
	// The directive names a real but different code, so validate-symbol-root still fires and
	// the directive itself is unused.
	codes := generateDiagnostics(t, withDirective("// @mion-expect-error json-prepare-never-root"))
	if !contains(codes, diagnostics.CodeVLSymbolRoot) {
		t.Fatalf("validate-symbol-root is not named, so it must still fire; got %v", codes)
	}
	if !contains(codes, diagnostics.CodeExpectErrorUnused) {
		t.Fatalf("a directive that silenced nothing must report comment-expect-error-unused; got %v", codes)
	}
}

func TestExpectError_OnlyTheLineDirectlyAboveCounts(t *testing.T) {
	// A blank line between the comment and the call moves the directive off the
	// finding, exactly as `@ts-expect-error` behaves.
	source := strings.Replace(validateSymbolRootSource,
		"export const bad = createValidateFn<symbol>();",
		"// @mion-expect-error validate-symbol-root\n\nexport const bad = createValidateFn<symbol>();", 1)
	codes := generateDiagnostics(t, source)
	if !contains(codes, diagnostics.CodeVLSymbolRoot) {
		t.Fatalf("the directive is two lines up, so validate-symbol-root still fires; got %v", codes)
	}
	if !contains(codes, diagnostics.CodeExpectErrorUnused) {
		t.Fatalf("that directive silenced nothing, so comment-expect-error-unused; got %v", codes)
	}
}

func TestExpectError_TrailingCommentIsNotADirective(t *testing.T) {
	source := strings.Replace(validateSymbolRootSource,
		"export const bad = createValidateFn<symbol>();",
		"export const bad = createValidateFn<symbol>(); // @mion-expect-error validate-symbol-root", 1)
	codes := generateDiagnostics(t, source)
	if !contains(codes, diagnostics.CodeVLSymbolRoot) {
		t.Fatalf("a trailing comment is not a directive, so validate-symbol-root fires; got %v", codes)
	}
}

func TestExpectError_InsideAStringIsNotADirective(t *testing.T) {
	// The marker sits in string data, which the parse-guided comment lexer
	// refuses to read as a comment.
	source := strings.Replace(validateSymbolRootSource,
		"export const bad = createValidateFn<symbol>();",
		"export const note = '// @mion-expect-error validate-symbol-root';\nexport const bad = createValidateFn<symbol>();", 1)
	codes := generateDiagnostics(t, source)
	if !contains(codes, diagnostics.CodeVLSymbolRoot) {
		t.Fatalf("a marker inside a string is data, so validate-symbol-root fires; got %v", codes)
	}
	if contains(codes, diagnostics.CodeExpectErrorUnused) {
		t.Fatalf("no directive exists, so nothing can be unused; got %v", codes)
	}
}

func TestExpectError_UnusedOnAHealthyLine(t *testing.T) {
	source := `import {createValidateFn, getRunTypeId} from '@mionjs/run-types';
// @mion-expect-error validate-symbol-root
export const good = createValidateFn<{name: string}>();
export const idStatic = getRunTypeId<{name: string}>();
const sample = {name: 'Ada'};
export const idReflected = getRunTypeId(sample);
`
	codes := generateDiagnostics(t, source)
	if !contains(codes, diagnostics.CodeExpectErrorUnused) {
		t.Fatalf("nothing was reported there, so the comment is stale; got %v", codes)
	}
}

// A fatal Error is never suppressible: the build produced no code for the thing,
// so silencing the finding buys a call that throws either way. The rule is the
// LEVEL, not the pure-fn family — a purity violation ships the compiled body, so
// purefn-uses-this IS suppressible now.
func TestExpectError_FatalCodeCannotBeSuppressed(t *testing.T) {
	codes := generateDiagnostics(t, withDirective("// @mion-expect-error marker-type-id-collision"))
	if !contains(codes, diagnostics.CodeExpectErrorNotSuppressible) {
		t.Fatalf("marker-type-id-collision emits no site, so it is never suppressible: expected comment-expect-error-not-allowed; got %v", codes)
	}
	if contains(codes, diagnostics.CodeExpectErrorUnused) {
		t.Fatalf("a malformed directive reports one problem, not two; got %v", codes)
	}
}

func TestExpectError_ExpCodeCannotBeSuppressed(t *testing.T) {
	// A directive cannot silence the check that keeps directives honest.
	codes := generateDiagnostics(t, withDirective("// @mion-expect-error comment-expect-error-unused"))
	if !contains(codes, diagnostics.CodeExpectErrorNotSuppressible) {
		t.Fatalf("comment-expect-error-* codes are never suppressible, so comment-expect-error-not-allowed; got %v", codes)
	}
}

func TestExpectError_UnknownCodeIsATypo(t *testing.T) {
	codes := generateDiagnostics(t, withDirective("// @mion-expect-error VL2"))
	if !contains(codes, diagnostics.CodeExpectErrorUnknownCode) {
		t.Fatalf("VL2 is not in the catalog, so comment-expect-error-unknown-name; got %v", codes)
	}
	if !contains(codes, diagnostics.CodeVLSymbolRoot) {
		t.Fatalf("a directive naming nothing real silences nothing; got %v", codes)
	}
}

// TestExpectError_FormEquivalence is the paired marker check: both
// getRunTypeId call shapes must land on ONE cache entry while a directive is
// active in the same file, so silencing a finding never disturbs the rewrites.
func TestExpectError_FormEquivalence(t *testing.T) {
	const staticForm = `import {createValidateFn, getRunTypeId} from '@mionjs/run-types';
// @mion-expect-error validate-symbol-root
export const bad = createValidateFn<symbol>();
getRunTypeId<string>();
`
	const reflectForm = `import {createValidateFn, getRunTypeId} from '@mionjs/run-types';
// @mion-expect-error validate-symbol-root
export const bad = createValidateFn<symbol>();
const v: string = 'hello';
getRunTypeId(v);
`
	session := setupInline(t, map[string]string{
		"static.ts":  staticForm,
		"reflect.ts": reflectForm,
	})
	static := resolveFile(t, session, "static.ts")
	reflected := resolveFile(t, session, "reflect.ts")
	if static.ID != reflected.ID {
		t.Fatalf("both getRunTypeId shapes of `string` must share one id, got %q vs %q", static.ID, reflected.ID)
	}
}

func contains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

// ─── what a pass may judge ────────────────────────────────────────────────

// optInFamilySource names rpc-handler-missing-param-type, a mion-route code. That family is OPT-IN per
// request: the whole-program build pass never asks for it, so only the lint pass
// can say whether the directive silenced anything.
const optInFamilySource = `import {createMionRouter} from '@mionjs/router';
const mion = createMionRouter();
// @mion-expect-error rpc-handler-missing-param-type
export const untyped = mion.route((ctx, name): string => 'x');
`

// TestExpectError_OptInFamilyIsNotJudgedByTheBuild pins the fix for a directive
// that worked in the editor and failed the build. The build pass raises no
// mion-route findings at all, so calling this comment unused there told the user
// to delete a comment the editor still needed.
func TestExpectError_OptInFamilyIsNotJudgedByTheBuild(t *testing.T) {
	session := setupInline(t, map[string]string{"router.d.ts": routerRulesDTS, "routes.ts": optInFamilySource})

	lint := session.Dispatch(protocol.Request{
		Op:               protocol.OpScanFiles,
		Files:            []string{"routes.ts"},
		CheckRouterRules: true,
	})
	lintCodes := codesOf(lint)
	if contains(lintCodes, "rpc-handler-missing-param-type") {
		t.Fatalf("the lint pass raises rpc-handler-missing-param-type and the directive names it, so it is silenced; got %v", lintCodes)
	}
	if contains(lintCodes, diagnostics.CodeExpectErrorUnused) {
		t.Fatalf("the directive silenced rpc-handler-missing-param-type, so it is used; got %v", lintCodes)
	}

	build := session.Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if buildCodes := codesOf(build); contains(buildCodes, diagnostics.CodeExpectErrorUnused) {
		t.Fatalf("the build never raises mion-route findings, so it cannot call this unused; got %v", buildCodes)
	}
}

// TestExpectError_LintPassJudgesOnlyItsOwnFiles: the lint pass holds one file's
// findings, so a directive in another file has not been given a chance to
// silence anything and must not be reported.
func TestExpectError_LintPassJudgesOnlyItsOwnFiles(t *testing.T) {
	session := setupInline(t, map[string]string{
		"entry.ts": withDirective("// @mion-expect-error validate-symbol-root"),
		"other.ts": `export const untouched = 1;\n`,
	})
	response := session.Dispatch(protocol.Request{
		Op:                   protocol.OpScanFiles,
		Files:                []string{"other.ts"},
		IncludeRtDiagnostics: true,
	})
	if codes := codesOf(response); contains(codes, diagnostics.CodeExpectErrorUnused) {
		t.Fatalf("entry.ts was not scanned, so its directive cannot be judged here; got %v", codes)
	}
}

// TestExpectError_TypoIsReportedToTheLinter is what makes comment-expect-error-not-allowed reachable in
// the linter: the lint pass runs scanFiles, and
// a mistyped code is a fact about the comment text that any pass can check.
func TestExpectError_TypoIsReportedToTheLinter(t *testing.T) {
	session := setupInline(t, map[string]string{"entry.ts": withDirective("// @mion-expect-error VL2")})
	response := session.Dispatch(protocol.Request{
		Op:                   protocol.OpScanFiles,
		Files:                []string{"entry.ts"},
		IncludeRtDiagnostics: true,
		CheckEnrich:          true,
		CheckRouterRules:     true,
	})
	if codes := codesOf(response); !contains(codes, diagnostics.CodeExpectErrorUnknownCode) {
		t.Fatalf("a typo must reach the editor, not just the build; got %v", codes)
	}
}

// buildOnlyDirectiveSource takes a code only the build raises: whole-program (rpc-batch-id-collision) or bundled-routes-only (rpc-client-option-widened).
func buildOnlyDirectiveSource(code string) string {
	return `import {getRunTypeId} from '@mionjs/run-types';
// @mion-expect-error ` + code + `
export const idStatic = getRunTypeId<{name: string}>();
const sample = {name: 'Ada'};
export const idReflected = getRunTypeId(sample);
`
}

// TestExpectError_LintPassDoesNotJudgeBuildOnlyCodes: else the linter says to delete a comment the build needs.
func TestExpectError_LintPassDoesNotJudgeBuildOnlyCodes(t *testing.T) {
	for _, code := range []string{diagnostics.CodeBatchIdCollision, diagnostics.CodeApiMetaOptionWidened, diagnostics.CodeApiMetaRouteWidened} {
		session := setupInline(t, map[string]string{"entry.ts": buildOnlyDirectiveSource(code)})
		lint := session.Dispatch(protocol.Request{
			Op:                   protocol.OpScanFiles,
			Files:                []string{"entry.ts"},
			IncludeRtDiagnostics: true,
			CheckEnrich:          true,
			CheckRouterRules:     true,
		})
		if codes := codesOf(lint); contains(codes, diagnostics.CodeExpectErrorUnused) {
			t.Fatalf("the lint pass cannot raise %s, so it cannot call the comment unused; got %v", code, codes)
		}
		build := session.Dispatch(protocol.Request{Op: protocol.OpGenerate})
		if codes := codesOf(build); !contains(codes, diagnostics.CodeExpectErrorUnused) {
			t.Fatalf("the build can raise %s and did not, so the comment is stale there; got %v", code, codes)
		}
	}
}

// TestExpectError_LintPassStillJudgesCodesItRaises: a stale comment naming a code the scan does raise is reported.
func TestExpectError_LintPassStillJudgesCodesItRaises(t *testing.T) {
	session := setupInline(t, map[string]string{"entry.ts": buildOnlyDirectiveSource(diagnostics.CodeVLSymbolRoot)})
	lint := session.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"entry.ts"}, IncludeRtDiagnostics: true})
	if codes := codesOf(lint); !contains(codes, diagnostics.CodeExpectErrorUnused) {
		t.Fatalf("the lint pass raises validate-symbol-root and found none there, so the comment is stale; got %v", codes)
	}
}

// TestExpectError_BuildJudgesOverrideFindings: an override-duplicate comment is used in the build and not judged by the lint pass.
func TestExpectError_BuildJudgesOverrideFindings(t *testing.T) {
	sources := map[string]string{
		"runtypes.d.ts": overrideDTS,
		"a.ts": `import {overrideValidate, getRunTypeId} from '@mionjs/run-types';
overrideValidate<string>((v) => typeof v === 'string');
export const idStatic = getRunTypeId<{name: string}>();
const sample = {name: 'Ada'};
export const idReflected = getRunTypeId(sample);
`,
		"b.ts": `import {overrideValidate} from '@mionjs/run-types';
// @mion-expect-error override-duplicate
overrideValidate<string>((v) => v !== null);
`,
	}
	session := setupGen(t, sources, t.TempDir())
	build := session.Dispatch(protocol.Request{Op: protocol.OpGenerate})
	codes := codesOf(build)
	if contains(codes, diagnostics.CodeDuplicateOverride) || contains(codes, diagnostics.CodeExpectErrorUnused) {
		t.Fatalf("the build raises override-duplicate and the comment silences it; got %v", codes)
	}
	lint := session.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"b.ts"}, IncludeRtDiagnostics: true})
	if codes := codesOf(lint); contains(codes, diagnostics.CodeDuplicateOverride) || contains(codes, diagnostics.CodeExpectErrorUnused) {
		t.Fatalf("the lint pass over b.ts raises and silences override-duplicate; got %v", codes)
	}
}

// TestExpectError_LintNeverJudgesABareComment: it may cover a whole-program code no lint scan can raise.
func TestExpectError_LintNeverJudgesABareComment(t *testing.T) {
	source := strings.Replace(validateSymbolRootSource, "export const bad = createValidateFn<symbol>();", "// @mion-expect-error\nexport const good = createValidateFn<string>();", 1)
	session := setupInline(t, map[string]string{"entry.ts": source})
	lint := session.Dispatch(protocol.Request{
		Op:                   protocol.OpScanFiles,
		Files:                []string{"entry.ts"},
		IncludeRtDiagnostics: true,
		CheckEnrich:          true,
		CheckRouterRules:     true,
	})
	if lint.Error != "" {
		t.Fatalf("scanFiles: %s", lint.Error)
	}
	if codes := codesOf(lint); contains(codes, diagnostics.CodeExpectErrorUnused) {
		t.Fatalf("the lint pass must not judge a bare comment; got %v", codes)
	}
}
