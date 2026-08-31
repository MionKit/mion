package resolver_test

import (
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/compiler/resolver"
	"github.com/mionkit/ts-runtypes/internal/protocol"
	"github.com/mionkit/ts-runtypes/internal/reflection"
)

// Regression: the marker module-of-origin gate must read package.json through
// the resolver's OVERLAY / virtual filesystem, not os.ReadFile. A ts-runtypes
// package whose files (incl. package.json) exist ONLY in the overlay — the wasm
// playground and in-memory scans — must still be recognised as module
// "ts-runtypes". Before the fix, os.ReadFile couldn't see the overlay package.json,
// the gate failed, the marker's type argument was lost, and the call's T resolved
// to `unknown` (kind 2). Now it resolves to the real object (kind 30).
func TestMarkerGate_ReadsOverlayPackageJson(t *testing.T) {
	const idx = `
export type InjectTypeFnArgs<T, F1 extends string, F2 extends string = never, F3 extends string = never> = string & {readonly __rtInjectTypeFnArgsBrand?: T; readonly __rtInjectTypeFnArgsFns?: [F1, F2, F3]};
export declare function createValidateFn<T>(val?: T, id?: InjectTypeFnArgs<T, 'val'>): (v: unknown) => boolean;
`
	const callCode = `import {createValidateFn} from '@mionjs/run-types';
createValidateFn<{a: string}>();
`
	// Everything (including package.json) lives ONLY in the in-memory overlay —
	// nothing is written to the real disk.
	cwd := tspath.NormalizePath(t.TempDir())
	overlay := map[string]string{
		tspath.ResolvePath(cwd, "runtypes.d.ts"):                               ``, // suppress the fake ambient
		tspath.ResolvePath(cwd, "node_modules/@mionjs/run-types/package.json"): `{"name":"@mionjs/run-types","exports":{".":"./index.d.ts"}}`,
		tspath.ResolvePath(cwd, "node_modules/@mionjs/run-types/index.d.ts"):   idx,
		tspath.ResolvePath(cwd, "call.ts"):                                     callCode,
	}
	fileNames := make([]string, 0, len(overlay))
	for path := range overlay {
		fileNames = append(fileNames, path)
	}

	p, err := program.NewInferred(program.Options{Cwd: cwd, Overlay: overlay, SingleThreaded: true}, fileNames)
	if err != nil {
		t.Fatalf("NewInferred: %v", err)
	}
	r, err := resolver.New(p, resolver.Options{Cwd: cwd, SingleThreaded: true})
	if err != nil {
		t.Fatalf("resolver.New: %v", err)
	}
	t.Cleanup(r.Close)

	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}, IncludeRunTypes: true})
	if resp.Error != "" {
		t.Fatalf("scan error: %s", resp.Error)
	}
	if len(resp.Sites) == 0 {
		t.Fatalf("no site produced")
	}
	site := resp.Sites[0]
	if site.FnId == "" {
		t.Errorf("createValidateFn site lost its fnId — the InjectTypeFnArgs marker wasn't recognised from the overlay package")
	}
	kind := -1
	for _, rt := range resp.RunTypes {
		if rt.ID == site.ID {
			kind = int(rt.Kind)
		}
	}
	if kind != int(reflection.KindObjectLiteral) {
		t.Errorf("call T resolved to kind %d, want %d (ObjectLiteral) — the marker gate did not read the overlay package.json",
			kind, reflection.KindObjectLiteral)
	}
}

// Regression for the builders.IsRunType FS threading: the reflect-form annotation
// honoring keeps the UNWRAPPED marker T (not the written `RunType<…>` annotation)
// only when it recognises the annotation as ts-runtypes' RunType — which needs the
// package.json gate to read the OVERLAY (builders.IsRunType receives the program
// FS). Without the FS there, an annotated schema const `const s: RunType<{a}> = …`
// would override T with the RunType wrapper and reflect the RunType interface
// (id, kind, …) instead of the modeled `{a: string}`.
func TestMarkerGate_IsRunTypeReadsOverlayForAnnotatedSchemaConst(t *testing.T) {
	const idx = `
export type InjectTypeFnArgs<T, F1 extends string, F2 extends string = never, F3 extends string = never> = string & {readonly __rtInjectTypeFnArgsBrand?: T; readonly __rtInjectTypeFnArgsFns?: [F1, F2, F3]};
export interface RunType<T = unknown> { id: string; kind: unknown; readonly __rtType?: {t: T}; [k: string]: unknown }
export function createValidateFn<T>(schema: RunType<T>, id?: InjectTypeFnArgs<T, 'val'>): (v: unknown) => boolean;
export function createValidateFn<T>(val?: T, id?: InjectTypeFnArgs<T, 'val'>): (v: unknown) => boolean;
`
	const callCode = `import {createValidateFn, type RunType} from '@mionjs/run-types';
const s: RunType<{a: string}> = null as unknown as RunType<{a: string}>;
createValidateFn(s);
`
	cwd := tspath.NormalizePath(t.TempDir())
	overlay := map[string]string{
		tspath.ResolvePath(cwd, "runtypes.d.ts"):                               ``,
		tspath.ResolvePath(cwd, "node_modules/@mionjs/run-types/package.json"): `{"name":"@mionjs/run-types","exports":{".":"./index.d.ts"}}`,
		tspath.ResolvePath(cwd, "node_modules/@mionjs/run-types/index.d.ts"):   idx,
		tspath.ResolvePath(cwd, "call.ts"):                                     callCode,
	}
	fileNames := make([]string, 0, len(overlay))
	for path := range overlay {
		fileNames = append(fileNames, path)
	}
	p, err := program.NewInferred(program.Options{Cwd: cwd, Overlay: overlay, SingleThreaded: true}, fileNames)
	if err != nil {
		t.Fatalf("NewInferred: %v", err)
	}
	r, err := resolver.New(p, resolver.Options{Cwd: cwd, SingleThreaded: true})
	if err != nil {
		t.Fatalf("resolver.New: %v", err)
	}
	t.Cleanup(r.Close)

	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}, IncludeRunTypes: true})
	if resp.Error != "" {
		t.Fatalf("scan error: %s", resp.Error)
	}
	if len(resp.Sites) == 0 {
		t.Fatalf("no site produced")
	}
	rootID := resp.Sites[0].ID
	var rootKind reflection.ReflectionKind = -1
	propNames := map[string]bool{}
	for _, rt := range resp.RunTypes {
		if rt.ID == rootID {
			rootKind = rt.Kind
		}
		if rt.Name != "" {
			propNames[rt.Name] = true
		}
	}
	// The modeled type `{a: string}` — an object whose only property is `a`.
	if rootKind != reflection.KindObjectLiteral {
		t.Errorf("root resolved to kind %d, want %d (ObjectLiteral) — the annotation was not recognised as RunType via the overlay", rootKind, reflection.KindObjectLiteral)
	}
	if !propNames["a"] {
		t.Errorf("reflected properties %v do not include 'a' — the modeled type was not resolved", keysOf(propNames))
	}
	// Must NOT have dragged in the RunType wrapper interface.
	for _, wrapperProp := range []string{"kind", "__rtType"} {
		if propNames[wrapperProp] {
			t.Errorf("reflected the RunType wrapper property %q — the annotation override was not suppressed", wrapperProp)
		}
	}
}

func keysOf(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
