package resolver_test

import (
	"os"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/compiler/resolver"
	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// setupUnderDomLib is setupInline with a real tsconfig selecting the dom lib,
// which is the only way to get `URL` and the rest of the web platform into the
// program. The default inferred config has no `lib`, so tsgo picks the latest
// ECMAScript edition alone and none of these types exist.
func setupUnderDomLib(t *testing.T, sources map[string]string) *resolver.Session {
	t.Helper()
	return setupInlineWith(t, sources, func(programOpts *program.Options, resolverOpts *resolver.Options) {
		programOpts.SingleThreaded = true
		resolverOpts.SingleThreaded = true
		tsconfig := `{"compilerOptions":{"target":"esnext","module":"esnext","moduleResolution":"bundler","strict":true,"lib":["esnext","dom"]}}`
		if err := os.WriteFile(tspath.ResolvePath(programOpts.Cwd, "tsconfig.json"), []byte(tsconfig), 0o644); err != nil {
			t.Fatalf("write tsconfig: %v", err)
		}
		config, err := program.ParseInferredConfig(programOpts.Cwd, "tsconfig.json")
		if err != nil {
			t.Fatalf("ParseInferredConfig: %v", err)
		}
		programOpts.Config = config
	})
}

// TestDiag_LibClassPropertyIsAnnouncedNotSilent — the whole reason the
// projection can stop expanding standard-library types without adding a second
// list on the TypeScript side.
//
// `DataOnly<T>` cannot ask "was this declared in the standard library" (there is
// no such predicate in TypeScript), so for a lib class like `URL` the two sides
// disagree: Go strips it, `DataOnly<T>` keeps its data shape. The build says so
// out loud instead. A property whose value has no data form raises the
// per-family …015 drop WARNING naming the property, and the rest of the object
// still validates and still serialises.
//
// Warning, not Error, is the contract: an Error means the generated function
// throws at runtime, and this one does not. Before this, the same `URL` property
// silently compiled a forty-member validator over `href`, `searchParams` and
// friends, which is the failure mode this replaces.
func TestDiag_LibClassPropertyIsAnnouncedNotSilent(t *testing.T) {
	const code = `import {createValidateFn, createJsonEncoderFn} from '@ts-runtypes/core';
interface Bookmark {id: number; title: string; link: URL}
export const isBookmark = createValidateFn<Bookmark>();
export const encode = createJsonEncoderFn<Bookmark>(undefined, {strategy: 'mutate'});
`
	resolverSession := setupUnderDomLib(t, map[string]string{"b.ts": code})
	response := resolverSession.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"b.ts"},
		IncludeEntryModules: true,
	})
	if response.Error != "" {
		t.Fatalf("scanFiles: %s", response.Error)
	}

	seen := map[string]diagnostics.Diagnostic{}
	codes := make([]string, 0, len(response.Diagnostics))
	for _, diagnostic := range runtypeDiagsOf(response.Diagnostics) {
		seen[diagnostic.Code] = diagnostic
		codes = append(codes, diagnostic.Code)
	}
	for _, expected := range []string{
		diagnostics.CodeVLNonSerializablePropDrop,
		diagnostics.CodePJNonSerializablePropDrop,
	} {
		drop, ok := seen[expected]
		if !ok {
			t.Fatalf("expected %s naming the dropped URL property, got %v", expected, codes)
		}
		if drop.Severity != diagnostics.SeverityWarning {
			t.Errorf("%s severity = %v, want Warning (the object still validates without the property)", expected, drop.Severity)
		}
		if len(drop.Args) != 1 || drop.Args[0] != "link" {
			t.Errorf(`%s args = %v, want ["link"] (the dropped property)`, expected, drop.Args)
		}
	}
	// The drop is a PROPERTY-position warning, so no root error may fire: the
	// object serialises fine with `id` and `title`.
	for _, forbidden := range []string{
		diagnostics.CodeVLNonSerializableRoot,
		diagnostics.CodePJNonSerializableRoot,
	} {
		if _, ok := seen[forbidden]; ok {
			t.Errorf("%s must not fire — the property is dropped, not failed", forbidden)
		}
	}
}

// TestDiag_LibClassAtRootThrows — the other half of the contract. A property can
// be dropped because the object survives without it; a lib class AT ROOT leaves
// nothing to validate, so the family renders a throwing factory and the build
// gets an Error.
func TestDiag_LibClassAtRootThrows(t *testing.T) {
	const code = `import {createValidateFn} from '@ts-runtypes/core';
export const isLink = createValidateFn<URL>();
`
	resolverSession := setupUnderDomLib(t, map[string]string{"r.ts": code})
	response := resolverSession.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"r.ts"},
		IncludeEntryModules: true,
	})
	if response.Error != "" {
		t.Fatalf("scanFiles: %s", response.Error)
	}
	var root *diagnostics.Diagnostic
	for _, diagnostic := range runtypeDiagsOf(response.Diagnostics) {
		if diagnostic.Code == diagnostics.CodeVLNonSerializableRoot {
			root = &diagnostic
			break
		}
	}
	if root == nil {
		t.Fatalf("a URL at root must be refused with %s", diagnostics.CodeVLNonSerializableRoot)
	}
	if root.Severity != diagnostics.SeverityError {
		t.Errorf("severity = %v, want Error (the generated guard would always fail)", root.Severity)
	}
}
