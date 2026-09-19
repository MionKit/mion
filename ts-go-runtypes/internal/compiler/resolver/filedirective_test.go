package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// filedirective_test.go covers the FILE scope of both source directives, through
// the real scan. The words are the same two the line tests use; what makes one a
// file directive is its shape and position — a block comment before any code,
// the way ESLint reads `/* eslint-disable */`.
//
// The whole-program op is what these dispatch, for the same reason the line
// tests do: "this comment stood nothing down" is only answerable against every
// finding the program has.
//
// Marker coverage rule: every fixture carries BOTH getRunTypeId call shapes, the
// static `getRunTypeId<T>()` and the value-inferred `getRunTypeId(value)`, and
// TestFileDirective_FormEquivalence asserts the pair resolves to one entry while
// a file directive is in force.

// twoFindingsSource raises VL002 at two sites and PJS005 at a third, which is the
// shape the file form exists for: one comment at the top rather than one comment
// per site. The healthy marker calls prove a file directive changes only the
// findings it names, never the rewrites.
const twoFindingsSource = `import {createValidateFn, createJsonEncoderFn, getRunTypeId} from '@mionjs/run-types';
export const firstBad = createValidateFn<symbol>();
export const secondBad = createValidateFn<symbol>();
export const encoded = createJsonEncoderFn<symbol>();
export const idStatic = getRunTypeId<{name: string}>();
const sample = {name: 'Ada'};
export const idReflected = getRunTypeId(sample);
`

// atTop puts a comment before any code, which is the position that makes a block
// comment a file directive.
func atTop(comment string) string {
	return comment + "\n" + twoFindingsSource
}

// vl002Count is how many VL002 findings survived, and how many of those carry the
// downgrade mark. Two sites raise it, so a file form has to reach both.
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

// A file directive reaches its OWN file. `Files` in the pass scope is what keeps
// that honest, and a second file in the same program proves it.
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

// LevelError is never silenceable at any scope: the build produced no code for
// the thing, so standing the finding down buys a call that throws anyway. The
// file form must not become the one way around that.
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

// The block form below the top keeps meaning what it means today: the line under
// it. Only its position at the top of a file promotes it.
func TestFileDirective_BlockCommentBelowTheTopIsStillALineDirective(t *testing.T) {
	list := generateDiags(t, strings.Replace(twoFindingsSource,
		"export const secondBad = createValidateFn<symbol>();",
		"/* @mion-expect-error VL002 */\nexport const secondBad = createValidateFn<symbol>();", 1))
	if found, _ := vl002Count(list); found != 1 {
		t.Fatalf("it covers the line under it, so one of the two VL002 sites survives; got %d in %v", found, codesIn(list))
	}
}

// A line comment never becomes a file directive, wherever it sits. At the top of
// this file it covers the import line, which raises nothing.
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

// A file directive that stood nothing down reports itself, the same reverse
// check that keeps a line comment from outliving its problem.
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

// The file form is the answer to a file that repeats one comment, so it must not
// then report every one of those comments as redundant.
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

// A file expect leaves nothing for any line comment to act on, so a downgrade
// comment under it is not reported either. The file form wins, whichever word
// the line below it used.
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

// The reverse does not hold: a file downgrade only KEEPS the finding, so a line
// expect below it still removes one and is judged on its own.
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

// A line directive the file form does NOT cover is still judged: quieting the
// covered ones must not quiet the rest of the file.
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

// Removing wins over lowering. A finding cannot be both gone and printed, so a
// file downgrade plus a line expect on the same site leaves nothing to print.
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

// TestFileDirective_FormEquivalence is the paired marker check: both
// getRunTypeId call shapes must land on ONE cache entry while a file directive
// is in force, so standing a whole file down never disturbs the rewrites.
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
