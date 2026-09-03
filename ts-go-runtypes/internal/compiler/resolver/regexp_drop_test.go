package resolver_test

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// A RegExp value is not data. A RegExp-valued property is dropped with the
// per-family …015 Warning (the object still validates and serialises), and no
// root Error fires: the same contract a `URL` property has.
func TestDiag_RegExpPropertyDropsLikeAFunction(t *testing.T) {
	const code = `import {createValidateFn, createJsonEncoderFn, createJsonDecoderFn, createBinaryEncoderFn} from '@mionjs/run-types';
interface Rule {name: string; match: RegExp}
export const isRule = createValidateFn<Rule>();
export const encode = createJsonEncoderFn<Rule>(undefined, {strategy: 'clone'});
export const decode = createJsonDecoderFn<Rule>();
export const toBytes = createBinaryEncoderFn<Rule>();
`
	resolverSession := setupInline(t, map[string]string{"r.ts": code})
	response := resolverSession.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"r.ts"}, IncludeEntryModules: true})
	if response.Error != "" {
		t.Fatalf("scanFiles: %s", response.Error)
	}
	seen := map[string]diagnostics.Diagnostic{}
	codes := make([]string, 0, len(response.Diagnostics))
	for _, diagnostic := range runtypeDiagsOf(response.Diagnostics) {
		seen[diagnostic.Code] = diagnostic
		codes = append(codes, diagnostic.Code+":"+diagnostics.SeverityLabel(diagnostic.Severity))
	}
	for _, expected := range []string{
		diagnostics.CodeVLNonSerializablePropDrop,
		diagnostics.CodePJSNonSerializablePropDrop,
		diagnostics.CodeRJNonSerializablePropDrop,
		diagnostics.CodeTBNonSerializablePropDrop,
	} {
		drop, ok := seen[expected]
		if !ok {
			t.Fatalf("expected %s naming the dropped RegExp property, got %v", expected, codes)
		}
		if drop.Severity != diagnostics.SeverityWarning {
			t.Errorf("%s severity = %v, want Warning", expected, drop.Severity)
		}
		if len(drop.Args) != 1 || drop.Args[0] != "match" {
			t.Errorf(`%s args = %v, want ["match"]`, expected, drop.Args)
		}
	}
	for _, diagnostic := range runtypeDiagsOf(response.Diagnostics) {
		if diagnostic.Severity == diagnostics.SeverityError {
			t.Errorf("no Error may fire for a dropped property, got %s (%v)", diagnostic.Code, diagnostic.Args)
		}
	}
}

// A RegExp at a root position fails the serialization families like a function
// does, while validate keeps its identity check.
func TestDiag_RegExpAtRootFailsSerializationOnly(t *testing.T) {
	const code = `import {createValidateFn, createJsonEncoderFn} from '@mionjs/run-types';
export const isPattern = createValidateFn<RegExp>();
export const encode = createJsonEncoderFn<RegExp>(undefined, {strategy: 'mutate'});
`
	resolverSession := setupInline(t, map[string]string{"r.ts": code})
	response := resolverSession.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"r.ts"}, IncludeEntryModules: true})
	if response.Error != "" {
		t.Fatalf("scanFiles: %s", response.Error)
	}
	var sawRoot bool
	for _, diagnostic := range runtypeDiagsOf(response.Diagnostics) {
		if diagnostic.Code == diagnostics.CodePJNonSerializableRoot {
			sawRoot = true
			if len(diagnostic.Args) == 0 || diagnostic.Args[0] != "RegExp" {
				t.Errorf("PJ002 must name RegExp, got %v", diagnostic.Args)
			}
		}
		if diagnostic.Code == diagnostics.CodeVLNonSerializableRoot {
			t.Errorf("validate must keep the RegExp identity check, got %s", diagnostic.Code)
		}
	}
	if !sawRoot {
		t.Errorf("expected PJ002 for a root RegExp encoder")
	}
}

// Probe: a root validator over the same node another site drops as a property.
func TestDiag_RegExpRootValidatorBesideAPropertyDrop(t *testing.T) {
	for _, leaf := range []string{"RegExp", "symbol"} {
		code := `import {createValidateFn, createJsonEncoderFn, createJsonDecoderFn, createBinaryEncoderFn, createBinaryDecoderFn, createCloneExactShapeFn, createMockDataFn} from '@mionjs/run-types';
interface Rule {name: string; match: ` + leaf + `}
export const isLeaf = createValidateFn<` + leaf + `>();
export const isRule = createValidateFn<Rule>();
export const encodeM = createJsonEncoderFn<Rule>(undefined, {strategy: 'mutate'});
export const encodeC = createJsonEncoderFn<Rule>(undefined, {strategy: 'clone'});
export const encodeD = createJsonEncoderFn<Rule>(undefined, {strategy: 'direct'});
export const encodeK = createJsonEncoderFn<Rule>(undefined, {strategy: 'compact'});
export const decode = createJsonDecoderFn<Rule>();
export const tb = createBinaryEncoderFn<Rule>();
export const fb = createBinaryDecoderFn<Rule>();
export const clone = createCloneExactShapeFn<Rule>();
export const mock = createMockDataFn<Rule>();
`
		resolverSession := setupInline(t, map[string]string{"r.ts": code})
		response := resolverSession.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"r.ts"}, IncludeEntryModules: true})
		if response.Error != "" {
			t.Fatalf("scanFiles: %s", response.Error)
		}
		for _, diagnostic := range runtypeDiagsOf(response.Diagnostics) {
			t.Logf("[%s] %s %s args=%v at %d:%d", leaf, diagnostic.Code, diagnostics.SeverityLabel(diagnostic.Severity), diagnostic.Args, diagnostic.Site.StartLine, diagnostic.Site.StartCol)
		}
	}
}
