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

// vl002Source is a root-position `symbol`, which can never be validated (VL002,
// Error). The two healthy marker sites prove a directive changes only the
// finding it names, not the file's rewrites.
const vl002Source = `import {createValidateFn, getRunTypeId} from '@mionjs/run-types';
export const bad = createValidateFn<symbol>();
export const idStatic = getRunTypeId<{name: string}>();
const sample = {name: 'Ada'};
export const idReflected = getRunTypeId(sample);
`

// withDirective inserts a comment line directly above the createValidateFn call
// in vl002Source, which is the position the directive contract defines.
func withDirective(comment string) string {
	return strings.Replace(vl002Source,
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
	codes := generateDiagnostics(t, withDirective("// @mion-expect-error VL002"))
	if contains(codes, diagnostics.CodeVLSymbolRoot) {
		t.Fatalf("VL002 should be silenced by the directive; got %v", codes)
	}
	if contains(codes, diagnostics.CodeExpectErrorUnused) {
		t.Fatalf("the directive silenced VL002, so it is used; got %v", codes)
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
		"// @mion-expect-error VL002 PJ001",
		"// @mion-expect-error VL002, PJ001",
	} {
		t.Run(comment, func(t *testing.T) {
			codes := generateDiagnostics(t, withDirective(comment))
			if contains(codes, diagnostics.CodeVLSymbolRoot) {
				t.Fatalf("VL002 is named, so it is silenced; got %v", codes)
			}
		})
	}
}

func TestExpectError_DoesNotSilenceAnUnnamedCode(t *testing.T) {
	// The directive names a real but different code, so VL002 still fires and
	// the directive itself is unused.
	codes := generateDiagnostics(t, withDirective("// @mion-expect-error PJ001"))
	if !contains(codes, diagnostics.CodeVLSymbolRoot) {
		t.Fatalf("VL002 is not named, so it must still fire; got %v", codes)
	}
	if !contains(codes, diagnostics.CodeExpectErrorUnused) {
		t.Fatalf("a directive that silenced nothing must report EXP001; got %v", codes)
	}
}

func TestExpectError_OnlyTheLineDirectlyAboveCounts(t *testing.T) {
	// A blank line between the comment and the call moves the directive off the
	// finding, exactly as `@ts-expect-error` behaves.
	source := strings.Replace(vl002Source,
		"export const bad = createValidateFn<symbol>();",
		"// @mion-expect-error VL002\n\nexport const bad = createValidateFn<symbol>();", 1)
	codes := generateDiagnostics(t, source)
	if !contains(codes, diagnostics.CodeVLSymbolRoot) {
		t.Fatalf("the directive is two lines up, so VL002 still fires; got %v", codes)
	}
	if !contains(codes, diagnostics.CodeExpectErrorUnused) {
		t.Fatalf("that directive silenced nothing, so EXP001; got %v", codes)
	}
}

func TestExpectError_TrailingCommentIsNotADirective(t *testing.T) {
	source := strings.Replace(vl002Source,
		"export const bad = createValidateFn<symbol>();",
		"export const bad = createValidateFn<symbol>(); // @mion-expect-error VL002", 1)
	codes := generateDiagnostics(t, source)
	if !contains(codes, diagnostics.CodeVLSymbolRoot) {
		t.Fatalf("a trailing comment is not a directive, so VL002 fires; got %v", codes)
	}
}

func TestExpectError_InsideAStringIsNotADirective(t *testing.T) {
	// The marker sits in string data, which the parse-guided comment lexer
	// refuses to read as a comment.
	source := strings.Replace(vl002Source,
		"export const bad = createValidateFn<symbol>();",
		"export const note = '// @mion-expect-error VL002';\nexport const bad = createValidateFn<symbol>();", 1)
	codes := generateDiagnostics(t, source)
	if !contains(codes, diagnostics.CodeVLSymbolRoot) {
		t.Fatalf("a marker inside a string is data, so VL002 fires; got %v", codes)
	}
	if contains(codes, diagnostics.CodeExpectErrorUnused) {
		t.Fatalf("no directive exists, so nothing can be unused; got %v", codes)
	}
}

func TestExpectError_UnusedOnAHealthyLine(t *testing.T) {
	source := `import {createValidateFn, getRunTypeId} from '@mionjs/run-types';
// @mion-expect-error VL002
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
// PFE9006 IS suppressible now.
func TestExpectError_FatalCodeCannotBeSuppressed(t *testing.T) {
	codes := generateDiagnostics(t, withDirective("// @mion-expect-error MKR014"))
	if !contains(codes, diagnostics.CodeExpectErrorNotSuppressible) {
		t.Fatalf("MKR014 emits no site, so it is never suppressible: expected EXP002; got %v", codes)
	}
	if contains(codes, diagnostics.CodeExpectErrorUnused) {
		t.Fatalf("a malformed directive reports one problem, not two; got %v", codes)
	}
}

func TestExpectError_ExpCodeCannotBeSuppressed(t *testing.T) {
	// A directive cannot silence the check that keeps directives honest.
	codes := generateDiagnostics(t, withDirective("// @mion-expect-error EXP001"))
	if !contains(codes, diagnostics.CodeExpectErrorNotSuppressible) {
		t.Fatalf("EXP codes are never suppressible, so EXP002; got %v", codes)
	}
}

func TestExpectError_UnknownCodeIsATypo(t *testing.T) {
	codes := generateDiagnostics(t, withDirective("// @mion-expect-error VL2"))
	if !contains(codes, diagnostics.CodeExpectErrorUnknownCode) {
		t.Fatalf("VL2 is not in the catalog, so EXP003; got %v", codes)
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
// @mion-expect-error VL002
export const bad = createValidateFn<symbol>();
getRunTypeId<string>();
`
	const reflectForm = `import {createValidateFn, getRunTypeId} from '@mionjs/run-types';
// @mion-expect-error VL002
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

// optInFamilySource names MRT002, a mion-route code. That family is OPT-IN per
// request: the whole-program build pass never asks for it, so only the lint pass
// can say whether the directive silenced anything.
const optInFamilySource = `import {createMionRouter} from '@mionjs/router';
const mion = createMionRouter();
// @mion-expect-error MRT002
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
	if contains(lintCodes, "MRT002") {
		t.Fatalf("the lint pass raises MRT002 and the directive names it, so it is silenced; got %v", lintCodes)
	}
	if contains(lintCodes, diagnostics.CodeExpectErrorUnused) {
		t.Fatalf("the directive silenced MRT002, so it is used; got %v", lintCodes)
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
		"entry.ts": withDirective("// @mion-expect-error VL002"),
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

// TestExpectError_TypoIsReportedToTheLinter is what makes the
// `invalid-expect-error` lint rule reachable: the lint pass runs scanFiles, and
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
