package resolver

import (
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/pkg/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/pkg/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/pkg/reflection"
)

// withTables restores every extension table when the test ends, so a test row never leaks into another test.
func withTables(t *testing.T) {
	t.Helper()
	ops, checks, gen, saved := opTable.Clone(), scanCheckTable.Clone(), genDirTable.Clone(), slices.Clone(extensions)
	t.Cleanup(func() {
		*opTable, *scanCheckTable, *genDirTable, extensions = *ops, *checks, *gen, saved
	})
}

// newOpsSession is a server session with one plain file loaded.
func newOpsSession(t *testing.T) *Session {
	t.Helper()
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "tsconfig.json"), []byte(`{"compilerOptions":{"strict":true}}`), 0o644); err != nil {
		t.Fatal(err)
	}
	session := NewServer(Options{Cwd: dir, SingleThreaded: true})
	t.Cleanup(session.Close)
	if response := session.Dispatch(protocol.Request{Op: protocol.OpSetSources, Sources: map[string]string{"a.ts": "export const a = 1;\n"}}); response.Error != "" {
		t.Fatalf("setSources: %s", response.Error)
	}
	return session
}

func expectRegistryPanic(t *testing.T, call func()) {
	t.Helper()
	defer func() {
		if recover() == nil {
			t.Error("expected a panic")
		}
	}()
	call()
}

func TestExtensionOp_SeesTheSession(t *testing.T) {
	withTables(t)
	RegisterOp(Op{Name: "testExtOp", Owner: "ext", Run: func(sess *Session, request protocol.Request, _ *protocol.Metrics) protocol.Response {
		if sess.Program == nil || sess.Checker() == nil || sess.Cache() == nil {
			return protocol.Response{Error: "session state missing"}
		}
		files := sess.ProgramSourceFiles()
		if _, err := sess.SourceFile("a.ts"); err != nil || len(files) != 1 {
			return protocol.Response{Error: "source file missing"}
		}
		return protocol.Response{Ext: map[string]any{"files": len(files), "echo": request.Ext["in"]}}
	}})
	session := newOpsSession(t)
	response := session.Dispatch(protocol.Request{Op: "testExtOp", Ext: map[string]json.RawMessage{"in": []byte(`"x"`)}})
	if response.Error != "" || response.Ext["files"] != 1 {
		t.Fatalf("extension op response = %+v", response)
	}
}

func TestDispatch_UnknownOpText(t *testing.T) {
	session := NewServer(Options{})
	t.Cleanup(session.Close)
	if got := session.Dispatch(protocol.Request{Op: "noSuchOp"}).Error; got != "unknown op: noSuchOp" {
		t.Fatalf("error = %q", got)
	}
}

func TestRegisterOp_DuplicateAndReplace(t *testing.T) {
	withTables(t)
	expectRegistryPanic(t, func() { RegisterOp(Op{Name: protocol.OpReset, Run: (*Session).opReset}) })
	expectRegistryPanic(t, func() { RegisterOp(Op{Name: "testAbsent", Run: (*Session).opReset, Replace: true}) })
	RegisterOp(Op{Name: protocol.OpReset, Owner: "ext", Replace: true, Run: func(*Session, protocol.Request, *protocol.Metrics) protocol.Response {
		return protocol.Response{Ext: map[string]any{"replaced": true}}
	}})
	session := NewServer(Options{})
	t.Cleanup(session.Close)
	if response := session.Dispatch(protocol.Request{Op: protocol.OpReset}); response.Ext["replaced"] != true {
		t.Fatalf("Replace must swap the built-in: %+v", response)
	}
	if names := opTable.Names(); !slices.Equal(names[:2], []string{protocol.OpScanFiles, protocol.OpDump}) || names[4] != protocol.OpReset {
		t.Fatalf("a replaced row keeps its slot: %v", names)
	}
}

func TestScanCheck_RunsWhenEnabledAfterTheHMRSignals(t *testing.T) {
	withTables(t)
	const family = diagnostics.Family(77)
	calls := 0
	RegisterScanCheck(ScanCheck{Name: "testExtCheck", Family: family, Owner: "ext", Run: func(sess *Session, files []string) []diagnostics.Diagnostic {
		calls++
		// Interning here must not turn the scan's addedRunTypes on.
		sess.Cache().SerializeAtomicKind(reflection.KindString)
		return []diagnostics.Diagnostic{diagnostics.New(diagnostics.CodeExpectErrorUnused, diagnostics.Site{FilePath: files[0], StartLine: 1, StartCol: 1}, "x")}
	}})
	session := newOpsSession(t)
	plain := session.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if plain.Error != "" || calls != 0 {
		t.Fatalf("a check must not run unless enabled: calls=%d %+v", calls, plain)
	}
	enabled := protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}, Ext: map[string]json.RawMessage{"testExtCheck": []byte("true")}}
	sizeBefore := session.Cache().Size()
	response := session.Dispatch(enabled)
	if response.Error != "" || calls != 1 {
		t.Fatalf("enabled check: calls=%d %+v", calls, response)
	}
	if response.AddedRunTypes || session.Cache().Size() == sizeBefore {
		t.Fatalf("the check must run after cache.Added: added=%v size %d -> %d", response.AddedRunTypes, sizeBefore, session.Cache().Size())
	}
	if !slices.ContainsFunc(response.Diagnostics, func(d diagnostics.Diagnostic) bool { return d.Code == diagnostics.CodeExpectErrorUnused }) {
		t.Fatalf("the check's diagnostics must reach the response: %+v", response.Diagnostics)
	}
	if !session.directiveScope(enabled).Families[family] || session.directiveScope(protocol.Request{Op: protocol.OpScanFiles}).Families[family] {
		t.Fatal("an enabled check's family must join directiveScope, a disabled one's must not")
	}
}

func TestCapabilities_ListsExtensionRowsOnly(t *testing.T) {
	withTables(t)
	session := NewServer(Options{})
	t.Cleanup(session.Close)
	plain := session.Dispatch(protocol.Request{Op: protocol.OpCapabilities}).Capabilities
	if plain == nil || len(plain.Extensions)+len(plain.Ops)+len(plain.ScanChecks)+len(plain.Diagnostics) != 0 {
		t.Fatalf("a plain session answers every list empty: %+v", plain)
	}
	RegisterExtension("ext", "1.2.3")
	RegisterOp(Op{Name: "testCapOp", Owner: "ext", Run: (*Session).opReset})
	RegisterScanCheck(ScanCheck{Name: "testCapCheck", Family: diagnostics.FamilyMarker, Probe: "^foo", Owner: "ext", Run: func(*Session, []string) []diagnostics.Diagnostic { return nil }})
	got := session.Dispatch(protocol.Request{Op: protocol.OpCapabilities}).Capabilities
	if !slices.Equal(got.Extensions, []protocol.ExtensionInfo{{Name: "ext", Version: "1.2.3"}}) || !slices.Equal(got.Ops, []string{"testCapOp"}) ||
		!slices.Equal(got.ScanChecks, []protocol.ScanCheckInfo{{Name: "testCapCheck", Family: "marker", Probe: "^foo"}}) {
		t.Fatalf("capabilities = %+v", got)
	}
	expectRegistryPanic(t, func() { RegisterExtension("ext", "again") })
}
