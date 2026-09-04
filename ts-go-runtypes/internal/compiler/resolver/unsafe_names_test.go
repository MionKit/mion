package resolver_test

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
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

// A prototype-named member nested inside another object fails the build the
// same way: the nested object literal is its own entry, so UPN001 reaches the
// marker site that compiles the outer type.
func TestDiag_NestedUnsafePropertyNameFailsTheBuild(t *testing.T) {
	const code = `import {createValidateFn} from '@mionjs/run-types';
interface Outer {inner: {ok: number; constructor: string}}
export const isOuter = createValidateFn<Outer>();
`
	resolverSession := setupInline(t, map[string]string{"n.ts": code})
	response := resolverSession.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"n.ts"}, IncludeEntryModules: true})
	if response.Error != "" {
		t.Fatalf("scanFiles: %s", response.Error)
	}
	var hits int
	for _, diagnostic := range runtypeDiagsOf(response.Diagnostics) {
		if diagnostic.Code == diagnostics.CodeUnsafePropertyName {
			hits++
		}
	}
	if hits == 0 {
		t.Errorf("expected UPN001 for the nested `constructor` member, got none; diags=%+v", response.Diagnostics)
	}
}

// The three names live on every object through the global `Object` interface
// (`constructor`), on every class through its prototype, and on `Error`. None
// of that is a DECLARED member of a user type: the scan must never copy an
// inherited prototype slot into the RunType, or every type would fail UPN001
// and every decoder would read `v.constructor` through the prototype chain.
// Pinned here so a change in how the globals are resolved cannot bring them in.
func TestScan_InheritedPrototypeSlotsAreNeverDeclaredMembers(t *testing.T) {
	const code = `import {createValidateFn, createJsonDecoderFn} from '@mionjs/run-types';
export interface User {name: string}
export class Box {value = 0; grow(): void {this.value++}}
export interface HttpError extends Error {status: number}
export type Bag = {} & {tag: string};
export const isUser = createValidateFn<User>();
export const isBox = createValidateFn<Box>();
export const isHttpError = createValidateFn<HttpError>();
export const isBag = createValidateFn<Bag>();
export const decodeBox = createJsonDecoderFn<Box>();
export const decodeError = createJsonDecoderFn<HttpError>();
`
	resolverSession := setupInline(t, map[string]string{"g.ts": code})
	response := resolverSession.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"g.ts"}, IncludeEntryModules: true})
	if response.Error != "" {
		t.Fatalf("scanFiles: %s", response.Error)
	}
	for _, diagnostic := range runtypeDiagsOf(response.Diagnostics) {
		if diagnostic.Code == diagnostics.CodeUnsafePropertyName {
			t.Errorf("UPN001 raised for a type that declares no prototype-named member: %+v", diagnostic)
		}
	}
	for _, runType := range dump(resolverSession) {
		switch runType.Kind {
		case reflection.KindProperty, reflection.KindPropertySignature, reflection.KindMethod, reflection.KindMethodSignature:
			if reflection.IsUnsafePropertyName(runType.Name) {
				t.Errorf("inherited prototype slot %q surfaced as a declared member (id %s)", runType.Name, runType.ID)
			}
		}
	}
}

// The same rule one container deeper through the real scan: an anonymous
// object literal inside a Map value inlines into the outer entry (it never
// gets a root render of its own), so only a whole-graph walk reaches it.
func TestDiag_MapValueUnsafePropertyNameFailsTheBuild(t *testing.T) {
	const code = `import {createJsonDecoderFn} from '@mionjs/run-types';
interface Outer {inner: Map<string, {ok: number; constructor: string}>}
export const decodeOuter = createJsonDecoderFn<Outer>();
`
	resolverSession := setupInline(t, map[string]string{"m.ts": code})
	response := resolverSession.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"m.ts"}, IncludeEntryModules: true})
	if response.Error != "" {
		t.Fatalf("scanFiles: %s", response.Error)
	}
	var hits int
	for _, diagnostic := range runtypeDiagsOf(response.Diagnostics) {
		if diagnostic.Code == diagnostics.CodeUnsafePropertyName {
			hits++
		}
	}
	if hits == 0 {
		t.Errorf("expected UPN001 for the `constructor` member inside the Map value, got none; diags=%+v", response.Diagnostics)
	}
}
