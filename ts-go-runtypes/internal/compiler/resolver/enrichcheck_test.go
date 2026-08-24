package resolver_test

import (
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/compiler/resolver"
	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/enrichment/mirror"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// enrichFixture is the overlay project every test in this file scans: a fake
// ts-runtypes package (so the FriendlyType/MockData module gate passes), a
// source type, and a DIRTY pre-split COMBINED mirror file — an unfilled @todo,
// an unknown field in each map form, and two orphan carcasses. Combined files
// exercise every hygiene-attribution path at once: the @todo sits above the
// FriendlyType const (nearest-after → FT020); the first carcass preserves its
// const's FriendlyType annotation (carcass-interior wins over the MockData
// const below it → FT021); the trailing carcass has no annotation and nothing
// after it (nearest-before = the MockData const → MD021).
const enrichIdx = `
export type FriendlyType<T> = Record<string, unknown> & {readonly __rtFriendly?: T};
export type MockData<T> = Record<string, unknown> & {readonly __rtMock?: T};
`

const enrichSource = `export interface User {
  name: string;
  age: number;
}
`

var enrichMirror = "import type { User } from './user';\n" +
	"import type { FriendlyType, MockData } from '@ts-runtypes/core';\n" +
	"\n" +
	"/** " + mirror.RtTypeTag + " User#u1 " + mirror.RtIdsTag + " {age: a1, name: n1} */\n" +
	mirror.TodoLine + "\n" +
	"export const friendlyUser: FriendlyType<User> = {\n" +
	"  name: {rt$label: 'Name'},\n" +
	"  nope: {rt$label: 'Gone'},\n" +
	"};\n" +
	"\n" +
	"/* " + mirror.OrphanTag + " export const friendlyOld: FriendlyType<User> = {}; */\n" +
	"\n" +
	"/** " + mirror.RtTypeTag + " User#u1 */\n" +
	"export const mockUser: MockData<User> = {\n" +
	"  age: {min: 1, max: 9},\n" +
	"  vanished: {pool: ['x']},\n" +
	"};\n" +
	"\n" +
	"/* " + mirror.OrphanTag + " export const gone = {}; */\n"

// setupEnrichFixture builds the overlay program + resolver. The extra map
// lets tests add or replace files (e.g. a mirror with a dead breadcrumb).
func setupEnrichFixture(t *testing.T, extra map[string]string) *resolver.Session {
	t.Helper()
	cwd := tspath.NormalizePath(t.TempDir())
	overlay := map[string]string{
		tspath.ResolvePath(cwd, "runtypes.d.ts"):                               ``, // suppress the fake ambient
		tspath.ResolvePath(cwd, "node_modules/@ts-runtypes/core/package.json"): `{"name":"@ts-runtypes/core","exports":{".":"./index.d.ts"}}`,
		tspath.ResolvePath(cwd, "node_modules/@ts-runtypes/core/index.d.ts"):   enrichIdx,
		tspath.ResolvePath(cwd, "user.ts"):                                     enrichSource,
		tspath.ResolvePath(cwd, "mirror.ts"):                                   enrichMirror,
	}
	for rel, content := range extra {
		overlay[tspath.ResolvePath(cwd, rel)] = content
	}
	fileNames := make([]string, 0, len(overlay))
	for path := range overlay {
		fileNames = append(fileNames, path)
	}
	prog, err := program.NewInferred(program.Options{Cwd: cwd, Overlay: overlay, SingleThreaded: true}, fileNames)
	if err != nil {
		t.Fatalf("NewInferred: %v", err)
	}
	res, err := resolver.New(prog, resolver.Options{Cwd: cwd, SingleThreaded: true})
	if err != nil {
		t.Fatalf("resolver.New: %v", err)
	}
	t.Cleanup(res.Close)
	return res
}

// enrichDiagnostics filters a response down to the FamilyEnrich entries.
func enrichDiagnostics(response protocol.Response) []diagnostics.Diagnostic {
	var out []diagnostics.Diagnostic
	for _, diagnostic := range response.Diagnostics {
		if diagnostic.Family == diagnostics.FamilyEnrich {
			out = append(out, diagnostic)
		}
	}
	return out
}

// TestCheckEnrich_SinglePassFindings drives the one-pass contract the lint
// plugin relies on: one scanFiles request with CheckEnrich returns the tag
// hygiene AND content findings for a dirty mirror, each anchored to a real
// 1-based position in the requested file.
func TestCheckEnrich_SinglePassFindings(t *testing.T) {
	res := setupEnrichFixture(t, nil)
	response := res.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"mirror.ts"}, CheckEnrich: true})
	if response.Error != "" {
		t.Fatalf("scan error: %s", response.Error)
	}
	found := enrichDiagnostics(response)

	byCode := map[string][]diagnostics.Diagnostic{}
	for _, diagnostic := range found {
		byCode[diagnostic.Code] = append(byCode[diagnostic.Code], diagnostic)
		if diagnostic.Site.FilePath != "mirror.ts" {
			t.Errorf("%s: FilePath = %q, want the requested path %q", diagnostic.Code, diagnostic.Site.FilePath, "mirror.ts")
		}
		if diagnostic.Site.StartLine < 1 || diagnostic.Site.StartCol < 1 {
			t.Errorf("%s: unanchored site %+v", diagnostic.Code, diagnostic.Site)
		}
	}

	// The dirty mirror carries exactly: one @todo above the FriendlyType const
	// (FT020), one carcass with a preserved FriendlyType annotation (FT021),
	// one trailing annotation-less carcass attributed to the nearest-before
	// MockData const (MD021), and one unknown field per family.
	for code, want := range map[string]int{
		diagnostics.CodeFriendlyTodo:         1,
		diagnostics.CodeFriendlyOrphanConst:  1,
		diagnostics.CodeMockOrphanConst:      1,
		diagnostics.CodeFriendlyUnknownField: 1,
		diagnostics.CodeMockUnknownField:     1,
	} {
		if len(byCode[code]) != want {
			t.Errorf("code %s: got %d findings, want %d (all: %+v)", code, len(byCode[code]), want, found)
		}
	}

	// Positions: cross-check against the fixture text itself.
	lineIndex := mirror.NewLineIndex(enrichMirror)
	todoLine, todoCol := lineIndex.At(strings.Index(enrichMirror, mirror.TodoTag))
	if got := byCode[diagnostics.CodeFriendlyTodo][0].Site; got.StartLine != todoLine || got.StartCol != todoCol {
		t.Errorf("FT020 site = (%d,%d), want (%d,%d)", got.StartLine, got.StartCol, todoLine, todoCol)
	}
	nopeLine, nopeCol := lineIndex.At(strings.Index(enrichMirror, "nope:"))
	if got := byCode[diagnostics.CodeFriendlyUnknownField][0].Site; got.StartLine != nopeLine || got.StartCol != nopeCol {
		t.Errorf("FT002 site = (%d,%d), want (%d,%d) — the `nope` key node", got.StartLine, got.StartCol, nopeLine, nopeCol)
	}
	if args := byCode[diagnostics.CodeFriendlyUnknownField][0].Args; len(args) != 1 || args[0] != "nope" {
		t.Errorf("FT002 args = %v, want [nope]", args)
	}
	if severity := byCode[diagnostics.CodeFriendlyTodo][0].Severity; severity != diagnostics.SeverityError {
		t.Errorf("FT020 severity = %v, want Error", severity)
	}

	// No false positives: the live keys and the @rtType/@rtIds markers never
	// produce a finding.
	for _, diagnostic := range found {
		if len(diagnostic.Args) > 0 && (diagnostic.Args[0] == "name" || diagnostic.Args[0] == "age") {
			t.Errorf("live field %q was flagged: %+v", diagnostic.Args[0], diagnostic)
		}
	}
}

// TestCheckEnrich_OptInAndGuards pins the gates: no CheckEnrich flag → no
// FamilyEnrich diagnostics at all; a NON-enrichment file with a @todo comment
// stays silent (the IsEnrichmentFile guard).
func TestCheckEnrich_OptInAndGuards(t *testing.T) {
	res := setupEnrichFixture(t, map[string]string{
		"notes.ts": "// " + mirror.TodoTag + ": hand-written file, not enrichment\nexport const a = 1;\n",
	})

	response := res.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"mirror.ts"}})
	if response.Error != "" {
		t.Fatalf("scan error: %s", response.Error)
	}
	if found := enrichDiagnostics(response); len(found) != 0 {
		t.Errorf("without CheckEnrich the pass must not run; got %+v", found)
	}

	response = res.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"notes.ts"}, CheckEnrich: true})
	if response.Error != "" {
		t.Fatalf("scan error: %s", response.Error)
	}
	if found := enrichDiagnostics(response); len(found) != 0 {
		t.Errorf("a non-enrichment file must never fire (marker guard); got %+v", found)
	}
}

// TestCheckEnrich_BreadcrumbDrift pins GE002 through the overlay FS: a mirror
// whose breadcrumb source never existed reports the orphaned-mirror error.
func TestCheckEnrich_BreadcrumbDrift(t *testing.T) {
	deadMirror := "import type { Ghost } from './ghost';\n" +
		"import type { FriendlyType } from '@ts-runtypes/core';\n" +
		"/** " + mirror.RtTypeTag + " Ghost#g1 */\n" +
		"export const friendlyGhost: FriendlyType<{name: string}> = {};\n"
	res := setupEnrichFixture(t, map[string]string{"dead-mirror.ts": deadMirror})

	response := res.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"dead-mirror.ts"}, CheckEnrich: true})
	if response.Error != "" {
		t.Fatalf("scan error: %s", response.Error)
	}
	var ge002 []diagnostics.Diagnostic
	for _, diagnostic := range enrichDiagnostics(response) {
		if diagnostic.Code == diagnostics.CodeGenSourceMissing {
			ge002 = append(ge002, diagnostic)
		}
	}
	if len(ge002) != 1 {
		t.Fatalf("want one GE002 for the dead breadcrumb; got %+v", enrichDiagnostics(response))
	}
	if ge002[0].Site.StartLine != 1 {
		t.Errorf("GE002 anchors to the breadcrumb line; got line %d", ge002[0].Site.StartLine)
	}
	if len(ge002[0].Args) != 2 || ge002[0].Args[0] != "./ghost" {
		t.Errorf("GE002 args = %v, want [./ghost <resolved>]", ge002[0].Args)
	}
}
