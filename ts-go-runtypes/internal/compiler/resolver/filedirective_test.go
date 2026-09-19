package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// filedirective_test.go covers the file scope of both directives through the real scan: a block
// comment before any code, as ESLint reads `/* eslint-disable */`. Every test dispatches the
// whole-program op, since "this comment stood nothing down" is only answerable against every
// finding. Marker coverage rule: every fixture carries both getRunTypeId call shapes, and
// TestFileDirective_FormEquivalence asserts the pair resolves to one entry.

// twoFindingsSource raises VL002 at two sites and PJS005 at a third; the healthy marker calls prove a file directive never disturbs the rewrites.
const twoFindingsSource = `import {createValidateFn, createJsonEncoderFn, getRunTypeId} from '@mionjs/run-types';
export const firstBad = createValidateFn<symbol>();
export const secondBad = createValidateFn<symbol>();
export const encoded = createJsonEncoderFn<symbol>();
export const idStatic = getRunTypeId<{name: string}>();
const sample = {name: 'Ada'};
export const idReflected = getRunTypeId(sample);
`

// atTop puts a comment before any code, the position that makes a block comment a file directive.
func atTop(comment string) string {
	return comment + "\n" + twoFindingsSource
}

// vl002Count counts surviving VL002 findings and how many are downgraded; two sites raise it, so a file form must reach both.
func vl002Count(list []diagnostics.Diagnostic) (found int, downgraded int) {
	for _, diagnostic := range list {
		if diagnostic.Code != diagnostics.CodeVLSymbolRoot {
			continue
		}
		found++
		if diagnostic.Downgraded {
			downgraded++
		}
	}
	return found, downgraded
}

func TestFileDirective_BareBlockCommentStandsDownTheWholeFile(t *testing.T) {
	codes := generateDiagnostics(t, atTop("/* @mion-expect-error */"))
	for _, code := range []string{diagnostics.CodeVLSymbolRoot, diagnostics.CodePJSSymbolRoot} {
		if contains(codes, code) {
			t.Fatalf("a bare file directive covers every code in the file, so %s must be gone; got %v", code, codes)
		}
	}
	if contains(codes, diagnostics.CodeExpectErrorUnused) {
		t.Fatalf("it stood three findings down, so it is used; got %v", codes)
	}
}

func TestFileDirective_NamedCodeStandsDownOnlyWhatItNames(t *testing.T) {
	list := generateDiags(t, atTop("/* @mion-expect-error VL002 */"))
	codes := codesIn(list)
	if found, _ := vl002Count(list); found != 0 {
		t.Fatalf("both VL002 sites are named, so neither survives; got %d in %v", found, codes)
	}
	if !contains(codes, diagnostics.CodePJSSymbolRoot) {
		t.Fatalf("PJS005 is not named, so it must still fire; got %v", codes)
	}
}

func TestFileDirective_DowngradeMarksEverySite(t *testing.T) {
	list := generateDiags(t, atTop("/* @mion-downgrade-error VL002 */"))
	found, downgraded := vl002Count(list)
	if found != 2 || downgraded != 2 {
		t.Fatalf("a file downgrade keeps both findings and marks both; got %d found, %d marked in %v", found, downgraded, codesIn(list))
	}
	for _, diagnostic := range list {
		if diagnostic.Code == diagnostics.CodeVLSymbolRoot && diagnostic.Level != diagnostics.LevelRuntimeError {
			t.Fatalf("the level on the wire is untouched by a downgrade; got %v", diagnostic.Level)
		}
	}
	if contains(codesIn(list), diagnostics.CodeDowngradeErrorUnused) {
		t.Fatalf("it lowered two findings, so it is used; got %v", codesIn(list))
	}
}

// A file directive reaches only its own file.
func TestFileDirective_ASecondFileStillReportsNormally(t *testing.T) {
	session := setupInline(t, map[string]string{
		"quiet.ts": atTop("/* @mion-expect-error */"),
		"loud.ts":  twoFindingsSource,
	})
	response := session.Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if response.Error != "" {
		t.Fatalf("generate: %s", response.Error)
	}
	codes := codesOf(response)
	if !contains(codes, diagnostics.CodeVLSymbolRoot) {
		t.Fatalf("loud.ts carries no directive, so its VL002 must report; got %v", codes)
	}
	for _, diagnostic := range response.Diagnostics {
		if strings.Contains(diagnostic.Site.FilePath, "quiet.ts") {
			t.Fatalf("the blanketed file reports nothing; got %s in %s", diagnostic.Code, diagnostic.Site.FilePath)
		}
	}
}

// LevelError is never silenceable at any scope: no code was emitted, so silencing only buys a call that throws.
func TestFileDirective_FatalCodeIsRefusedAtFileScope(t *testing.T) {
	codes := generateDiagnostics(t, atTop("/* @mion-expect-error MKR014 */"))
	if !contains(codes, diagnostics.CodeExpectErrorNotSuppressible) {
		t.Fatalf("MKR014 emits no site, so a file directive naming it earns EXP002; got %v", codes)
	}
	codes = codesIn(generateDiags(t, atTop("/* @mion-downgrade-error MKR014 */")))
	if !contains(codes, diagnostics.CodeDowngradeErrorNotDowngradeable) {
		t.Fatalf("MKR014 can never be lowered either, so DWN002; got %v", codes)
	}
}

func TestFileDirective_BlockCommentBelowTheTopIsStillALineDirective(t *testing.T) {
	list := generateDiags(t, strings.Replace(twoFindingsSource,
		"export const secondBad = createValidateFn<symbol>();",
		"/* @mion-expect-error VL002 */\nexport const secondBad = createValidateFn<symbol>();", 1))
	if found, _ := vl002Count(list); found != 1 {
		t.Fatalf("it covers the line under it, so one of the two VL002 sites survives; got %d in %v", found, codesIn(list))
	}
}

func TestFileDirective_LineCommentAtTheTopIsStillALineDirective(t *testing.T) {
	list := generateDiags(t, atTop("// @mion-expect-error VL002"))
	codes := codesIn(list)
	if found, _ := vl002Count(list); found != 2 {
		t.Fatalf("a line comment covers one line, so both VL002 sites survive; got %d in %v", found, codes)
	}
	if !contains(codes, diagnostics.CodeExpectErrorUnused) {
		t.Fatalf("it covered the import line, which raised nothing, so EXP001; got %v", codes)
	}
}

func TestFileDirective_StoodNothingDownReportsItself(t *testing.T) {
	const healthy = `import {createValidateFn, getRunTypeId} from '@mionjs/run-types';
export const good = createValidateFn<{name: string}>();
export const idStatic = getRunTypeId<{name: string}>();
const sample = {name: 'Ada'};
export const idReflected = getRunTypeId(sample);
`
	codes := generateDiagnostics(t, "/* @mion-expect-error VL002 */\n"+healthy)
	if !contains(codes, diagnostics.CodeExpectErrorUnused) {
		t.Fatalf("nothing in the file raised VL002, so the comment is stale; got %v", codes)
	}
	codes = codesIn(generateDiags(t, "/* @mion-downgrade-error VL002 */\n"+healthy))
	if !contains(codes, diagnostics.CodeDowngradeErrorUnused) {
		t.Fatalf("the downgrade twin reports the same way; got %v", codes)
	}
}

// The file form exists for a file that repeats one comment, so it must not report those comments as redundant.
func TestFileDirective_CoveredLineDirectivesAreNotJudged(t *testing.T) {
	source := atTop("/* @mion-expect-error VL002 */")
	source = strings.Replace(source,
		"export const secondBad = createValidateFn<symbol>();",
		"// @mion-expect-error VL002\nexport const secondBad = createValidateFn<symbol>();", 1)
	codes := generateDiagnostics(t, source)
	if contains(codes, diagnostics.CodeExpectErrorUnused) {
		t.Fatalf("the file directive already covers VL002, so the line comment under it is not reported; got %v", codes)
	}
}

// A file expect leaves nothing for a line downgrade to act on, so it is not reported either.
func TestFileDirective_FileExpectCoversALineDowngrade(t *testing.T) {
	source := atTop("/* @mion-expect-error VL002 */")
	source = strings.Replace(source,
		"export const secondBad = createValidateFn<symbol>();",
		"// @mion-downgrade-error VL002\nexport const secondBad = createValidateFn<symbol>();", 1)
	codes := generateDiagnostics(t, source)
	if contains(codes, diagnostics.CodeDowngradeErrorUnused) {
		t.Fatalf("the file expect removed VL002, so the line comment under it is not reported; got %v", codes)
	}
}

// A file downgrade only keeps the finding, so a line expect below it still removes one and is judged on its own.
func TestFileDirective_FileDowngradeDoesNotCoverAStaleLineExpect(t *testing.T) {
	source := atTop("/* @mion-downgrade-error VL002 */")
	source = strings.Replace(source,
		"export const idStatic = getRunTypeId<{name: string}>();",
		"// @mion-expect-error VL002\nexport const idStatic = getRunTypeId<{name: string}>();", 1)
	codes := generateDiagnostics(t, source)
	if !contains(codes, diagnostics.CodeExpectErrorUnused) {
		t.Fatalf("a line expect can still remove a downgraded finding, so a stale one is reported; got %v", codes)
	}
}

func TestFileDirective_UncoveredLineDirectivesAreStillJudged(t *testing.T) {
	source := atTop("/* @mion-expect-error VL002 */")
	source = strings.Replace(source,
		"export const idStatic = getRunTypeId<{name: string}>();",
		"// @mion-expect-error PJS005\nexport const idStatic = getRunTypeId<{name: string}>();", 1)
	codes := generateDiagnostics(t, source)
	if !contains(codes, diagnostics.CodeExpectErrorUnused) {
		t.Fatalf("PJS005 is not covered by the file directive and was raised nowhere on that line, so EXP001; got %v", codes)
	}
}

// A finding cannot be both gone and printed.
func TestFileDirective_ExpectBeatsDowngrade(t *testing.T) {
	source := atTop("/* @mion-downgrade-error VL002 */")
	source = strings.Replace(source,
		"export const firstBad = createValidateFn<symbol>();",
		"// @mion-expect-error VL002\nexport const firstBad = createValidateFn<symbol>();", 1)
	list := generateDiags(t, source)
	found, downgraded := vl002Count(list)
	if found != 1 || downgraded != 1 {
		t.Fatalf("the expected site is removed and the other stays marked; got %d found, %d marked in %v", found, downgraded, codesIn(list))
	}
	if contains(codesIn(list), diagnostics.CodeExpectErrorUnused) {
		t.Fatalf("the line directive removed a finding, so it is used; got %v", codesIn(list))
	}
}

// TestFileDirective_FormEquivalence is the paired marker check: both getRunTypeId shapes share one entry while a file directive is in force.
func TestFileDirective_FormEquivalence(t *testing.T) {
	const staticForm = `/* @mion-expect-error VL002 */
import {createValidateFn, getRunTypeId} from '@mionjs/run-types';
export const bad = createValidateFn<symbol>();
getRunTypeId<string>();
`
	const reflectForm = `/* @mion-expect-error VL002 */
import {createValidateFn, getRunTypeId} from '@mionjs/run-types';
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
