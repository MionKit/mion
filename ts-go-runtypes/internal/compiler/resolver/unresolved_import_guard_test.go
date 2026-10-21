package resolver_test

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// marker-any-from-unresolved-import — a marker site whose T resolved to `any` because the file carries
// an unresolved import must produce an Error-severity diagnostic naming the
// file, the call site, and the unresolved specifier (the silent-degradation
// trap: the emitted validator would accept anything with zero signal). A
// written `any` keyword stays legal even in the same broken file, and fully
// resolved files never diagnose. Fixtures cover BOTH getRunTypeId call shapes
// (marker rule).

func unresolvedImportSession(t *testing.T) *resolver.Session {
	t.Helper()
	abs, err := filepath.Abs("../../testfixtures/unresolvedimport")
	if err != nil {
		t.Fatalf("abs: %v", err)
	}
	p, err := program.New(program.Options{
		Cwd:            abs,
		TsconfigPath:   "tsconfig.json",
		SingleThreaded: true,
	})
	if err != nil {
		t.Fatalf("program.New: %v", err)
	}
	r, err := resolver.New(p, resolver.Options{})
	if err != nil {
		t.Fatalf("resolver.New: %v", err)
	}
	t.Cleanup(r.Close)
	return r
}

func TestUnresolvedImportAny_DiagnosesBothCallShapes(t *testing.T) {
	r := unresolvedImportSession(t)
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"broken.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles broken.ts: %s", resp.Error)
	}
	var markerAnyFromUnresolvedImport []diagnostics.Diagnostic
	for _, diagnostic := range resp.Diagnostics {
		if diagnostic.Code == diagnostics.CodeMarkerAnyFromUnresolvedImport {
			markerAnyFromUnresolvedImport = append(markerAnyFromUnresolvedImport, diagnostic)
		}
	}
	// The static `getRunTypeId<User>()` AND the reflect `getRunTypeId(user)`
	// sites both degrade — one diagnostic each. The explicit `<any>` site is
	// deliberate and silent, so exactly two.
	if len(markerAnyFromUnresolvedImport) != 2 {
		t.Fatalf("want 2 marker-any-from-unresolved-import diagnostics (static + reflect forms), got %d: %+v", len(markerAnyFromUnresolvedImport), resp.Diagnostics)
	}
	for _, diagnostic := range markerAnyFromUnresolvedImport {
		if diagnostic.Severity != diagnostics.SeverityError {
			t.Fatalf("marker-any-from-unresolved-import must be Error severity, got %d", diagnostic.Severity)
		}
		if len(diagnostic.Args) == 0 || diagnostic.Args[0] != "./missing-module" {
			t.Fatalf("marker-any-from-unresolved-import must name the unresolved specifier, got args %v", diagnostic.Args)
		}
		if !strings.HasSuffix(diagnostic.Site.FilePath, "broken.ts") || diagnostic.Site.StartLine <= 0 {
			t.Fatalf("marker-any-from-unresolved-import must carry the call site, got %+v", diagnostic.Site)
		}
	}
}

func TestUnresolvedImportAny_ResolvedFileStaysSilent(t *testing.T) {
	r := unresolvedImportSession(t)
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"resolved.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles resolved.ts: %s", resp.Error)
	}
	if len(resp.Sites) != 2 {
		t.Fatalf("resolved.ts: want 2 sites (static + reflect), got %d", len(resp.Sites))
	}
	for _, diagnostic := range resp.Diagnostics {
		if diagnostic.Code == diagnostics.CodeMarkerAnyFromUnresolvedImport {
			t.Fatalf("resolved file must not diagnose marker-any-from-unresolved-import: %+v", diagnostic)
		}
	}
}

// The same trap one object deeper: the root type is a healthy interface and
// only its `user` member came from the unresolved import. Both call shapes
// diagnose once, pointing at the marker call with the member's declaration as
// a Related entry; the hand-written `any` member in the same file is silent.
func TestUnresolvedImportAny_NestedMemberDiagnosesBothCallShapes(t *testing.T) {
	r := unresolvedImportSession(t)
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"nested.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles nested.ts: %s", resp.Error)
	}
	var markerAnyFromUnresolvedImport []diagnostics.Diagnostic
	for _, diagnostic := range resp.Diagnostics {
		switch diagnostic.Code {
		case diagnostics.CodeMarkerAnyFromUnresolvedImport:
			markerAnyFromUnresolvedImport = append(markerAnyFromUnresolvedImport, diagnostic)
		case diagnostics.CodeMarkerUnresolvedTypeName:
			t.Errorf("marker-any-from-unresolved-name must yield to marker-any-from-unresolved-import for a member the unresolved import explains: %+v", diagnostic)
		}
	}
	if len(markerAnyFromUnresolvedImport) != 2 {
		t.Fatalf("want 2 marker-any-from-unresolved-import diagnostics (static + reflect forms over the nested member), got %d: %+v", len(markerAnyFromUnresolvedImport), resp.Diagnostics)
	}
	for _, diagnostic := range markerAnyFromUnresolvedImport {
		if len(diagnostic.Args) == 0 || diagnostic.Args[0] != "./missing-module" {
			t.Errorf("nested marker-any-from-unresolved-import must name the unresolved specifier, got args %v", diagnostic.Args)
		}
		if !strings.HasSuffix(diagnostic.Site.FilePath, "nested.ts") || diagnostic.Site.StartLine < 13 {
			t.Errorf("nested marker-any-from-unresolved-import must land on the marker call, got %+v", diagnostic.Site)
		}
		if len(diagnostic.Related) != 1 || !strings.Contains(diagnostic.Related[0].Message, "`user`") {
			t.Errorf("nested marker-any-from-unresolved-import must relate the member's declaration, got %+v", diagnostic.Related)
		}
	}
}
