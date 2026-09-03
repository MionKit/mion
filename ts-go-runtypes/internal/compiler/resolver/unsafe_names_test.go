package resolver_test

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// A type that declares a property named `__proto__`, `prototype` or
// `constructor` fails the build with UPN001 at the marker site, in every
// family that renders it: such a key is refused on the wire, so no value of
// the type could ever round-trip.
func TestDiag_DeclaredUnsafePropertyNameFailsTheBuild(t *testing.T) {
	for _, name := range []string{"__proto__", "prototype", "constructor"} {
		code := `import {createValidateFn, createJsonEncoderFn, createBinaryDecoderFn} from '@mionjs/run-types';
interface Settings {ok: number; '` + name + `': string}
export const isSettings = createValidateFn<Settings>();
export const encode = createJsonEncoderFn<Settings>(undefined, {strategy: 'clone'});
export const decode = createBinaryDecoderFn<Settings>();
`
		resolverSession := setupInline(t, map[string]string{"u.ts": code})
		response := resolverSession.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"u.ts"}, IncludeEntryModules: true})
		if response.Error != "" {
			t.Fatalf("scanFiles: %s", response.Error)
		}
		var hits int
		for _, diagnostic := range runtypeDiagsOf(response.Diagnostics) {
			if diagnostic.Code != diagnostics.CodeUnsafePropertyName {
				continue
			}
			hits++
			if diagnostic.Severity != diagnostics.SeverityError {
				t.Errorf("[%s] UPN001 severity = %v, want Error", name, diagnostic.Severity)
			}
			if len(diagnostic.Args) != 1 || diagnostic.Args[0] != name {
				t.Errorf("[%s] UPN001 args = %v, want the property name", name, diagnostic.Args)
			}
			if diagnostic.Site.StartLine < 3 {
				t.Errorf("[%s] UPN001 must point at a marker call site, got line %d", name, diagnostic.Site.StartLine)
			}
		}
		if hits < 3 {
			t.Errorf("[%s] expected UPN001 at each of the three marker sites, got %d", name, hits)
		}
	}
}
