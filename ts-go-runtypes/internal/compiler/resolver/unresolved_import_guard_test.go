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

// MKR007 — a marker site whose T resolved to `any` because the file carries
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
	var mkr007 []diagnostics.Diagnostic
	for _, diagnostic := range resp.Diagnostics {
		if diagnostic.Code == diagnostics.CodeMarkerAnyFromUnresolvedImport {
			mkr007 = append(mkr007, diagnostic)
		}
	}
	// The static `getRunTypeId<User>()` AND the reflect `getRunTypeId(user)`
	// sites both degrade — one diagnostic each. The explicit `<any>` site is
	// deliberate and silent, so exactly two.
	if len(mkr007) != 2 {
		t.Fatalf("want 2 MKR007 diagnostics (static + reflect forms), got %d: %+v", len(mkr007), resp.Diagnostics)
	}
	for _, diagnostic := range mkr007 {
		if diagnostic.Severity != diagnostics.SeverityError {
			t.Fatalf("MKR007 must be Error severity, got %d", diagnostic.Severity)
		}
		if len(diagnostic.Args) == 0 || diagnostic.Args[0] != "./missing-module" {
			t.Fatalf("MKR007 must name the unresolved specifier, got args %v", diagnostic.Args)
		}
		if !strings.HasSuffix(diagnostic.Site.FilePath, "broken.ts") || diagnostic.Site.StartLine <= 0 {
			t.Fatalf("MKR007 must carry the call site, got %+v", diagnostic.Site)
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
			t.Fatalf("resolved file must not diagnose MKR007: %+v", diagnostic)
		}
	}
}
