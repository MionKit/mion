package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/cachegen/operations"
	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// runtypeDiagsOf is the analogue of filterDiagsByFamily for runtype
// diagnostics — keeps the assertions terse without forcing a map lookup
// per test.
func runtypeDiagsOf(diags []diagnostics.Diagnostic) []diagnostics.Diagnostic {
	return filterDiagsByFamily(diags, diagnostics.FamilyRunType)
}

// TestDiag_RunTypeRTThrow_NeverAtRoot pins the end-to-end runtype
// diagnostic flow. A `getRunTypeId<never>()` call site reaches the
// prepareForJson emitter's RTThrow site for KindNever, which records
// a PJ001 diagnostic against the marker call site. The diagnostic
// fans out one entry per call site (per user direction: dedup is
// one-per-call-site, not one-per-type-id).
func TestDiag_RunTypeRTThrow_NeverAtRoot_PrepareForJson(t *testing.T) {
	// pj is demand-driven now, so seed it via createJsonEncoderFn(mutate) → [pj].
	const code = `import {createJsonEncoderFn} from '@ts-runtypes/core';
export const _ = createJsonEncoderFn<never>(undefined, {strategy: 'mutate'});
`
	r := setupInline(t, map[string]string{"a.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"a.ts"},
		IncludeEntryModules: true,
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	runtypeDiags := runtypeDiagsOf(resp.Diagnostics)
	if len(runtypeDiags) == 0 {
		t.Fatalf("expected at least one runtype diagnostic, got 0 (%+v)", resp.Diagnostics)
	}
	var found *diagnostics.Diagnostic
	for i := range runtypeDiags {
		if runtypeDiags[i].Code == diagnostics.CodePJNeverRoot {
			found = &runtypeDiags[i]
			break
		}
	}
	if found == nil {
		t.Fatalf("expected a %s diagnostic, got %+v", diagnostics.CodePJNeverRoot, runtypeDiags)
	}
	if found.Severity != diagnostics.SeverityError {
		t.Errorf("severity: got %d want %d", found.Severity, diagnostics.SeverityError)
	}
	if !strings.Contains(found.Site.FilePath, "a.ts") {
		t.Errorf("site filePath: got %q, expected to contain 'a.ts'", found.Site.FilePath)
	}
	if found.Site.StartLine == 0 || found.Site.StartCol == 0 {
		t.Errorf("expected populated line/col, got line=%d col=%d", found.Site.StartLine, found.Site.StartCol)
	}
	if len(found.Args) != 1 || found.Args[0] != "Never" {
		t.Errorf("args: got %v, expected [\"Never\"]", found.Args)
	}
}

// TestDiag_RunTypeRTThrow_FunctionAtRoot exercises the function-root
// throw across the JSON families. `getRunTypeId<() => void>()` reaches
// the function-root RTThrow in each family.
func TestDiag_RunTypeRTThrow_FunctionAtRoot_PrepareForJson(t *testing.T) {
	// pj is demand-driven now, so seed it via createJsonEncoderFn(mutate) → [pj].
	const code = `import {createJsonEncoderFn} from '@ts-runtypes/core';
export const _ = createJsonEncoderFn<() => void>(undefined, {strategy: 'mutate'});
`
	r := setupInline(t, map[string]string{"f.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"f.ts"},
		IncludeEntryModules: true,
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	runtypeDiags := runtypeDiagsOf(resp.Diagnostics)
	var found *diagnostics.Diagnostic
	for i := range runtypeDiags {
		if runtypeDiags[i].Code == diagnostics.CodePJFunctionRoot {
			found = &runtypeDiags[i]
			break
		}
	}
	if found == nil {
		t.Fatalf("expected a %s diagnostic, got %+v", diagnostics.CodePJFunctionRoot, runtypeDiags)
	}
}

// TestDiag_PerFamilyPrefix_DistinctCodes pins the per-family prefix
// scheme. The same logical throw (Never at root) under different
// emitters surfaces as distinct codes — SJ001 for stringifyJson,
// TB001 for toBinary, etc. — so users reading their build log can
// see which RT family produced the diagnostic without parsing
// message text.
func TestDiag_PerFamilyPrefix_NeverAtRoot_DistinctCodes(t *testing.T) {
	// All three families are demand-driven now: seed pj via createJsonEncoderFn(mutate),
	// sj via createJsonEncoderFn(direct), and tb via its own createBinaryEncoderFn.
	const code = `import {createJsonEncoderFn, createBinaryEncoderFn} from '@ts-runtypes/core';
export const _ = createJsonEncoderFn<never>(undefined, {strategy: 'mutate'});
export const _s = createJsonEncoderFn<never>(undefined, {strategy: 'direct'});
export const _b = createBinaryEncoderFn<never>();
`
	r := setupInline(t, map[string]string{"n.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"n.ts"},
		IncludeEntryModules: true,
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	codes := map[string]bool{}
	for _, d := range runtypeDiagsOf(resp.Diagnostics) {
		codes[d.Code] = true
	}
	for _, expected := range []string{diagnostics.CodePJNeverRoot, diagnostics.CodeSJNeverRoot, diagnostics.CodeTBNeverRoot} {
		if !codes[expected] {
			t.Errorf("expected diagnostic code %s in %v", expected, codes)
		}
	}
}

// TestDiag_PropertyAbsorbsUnsupportedChild pins the v2 property-
// absorption rule: when an interface has an unsupported property
// (Never, Symbol, NonSerializable class, etc.), the property emit
// drops it from the parent's chain rather than propagating CodeNS
// to the root. The rest of the object's validator still works.
func TestDiag_PropertyAbsorbsUnsupportedChild_NeverProp(t *testing.T) {
	// pj is demand-driven now, so seed it via createJsonEncoderFn(mutate) → [pj].
	const code = `import {createJsonEncoderFn} from '@ts-runtypes/core';
interface User { name: string; bad: never; }
export const _ = createJsonEncoderFn<User>(undefined, {strategy: 'mutate'});
`
	r := setupInline(t, map[string]string{"u.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"u.ts"},
		IncludeEntryModules: true,
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	// Absorption means the User root does NOT become alwaysThrow. With the
	// never property dropped, the remaining shape (`name: string`) is
	// JSON-compatible, so the pj entry collapses to the noop short-form,
	// the jeMU composite elides its binding, and the emission prune drops
	// the orphan module entirely — absence of every pj module (and of any
	// 'PJ001' alwaysThrow arg in the payload) IS the absorption evidence.
	// An unabsorbed never would instead surface as an emitted alwaysThrow
	// entry referenced by the composite.
	var rootSiteID string
	for _, s := range resp.Sites {
		rootSiteID = s.ID
	}
	if rootSiteID == "" {
		t.Fatalf("expected at least one site for the User marker call")
	}
	if keys := familyEntryKeys(resp, "prepareForJson"); len(keys) != 0 {
		t.Errorf("the absorbed-to-identity pj entry must be elided + pruned, got %v", keys)
	}
	// The composite (the injected binding) survives as the noop SHORT FORM —
	// every primitive binding elided, so the runtime registers the native
	// JSON.stringify noop — with no alwaysThrow code anywhere in the payload.
	jsonEncoderOp, ok := operations.ByName("jsonEncoder")
	if !ok {
		t.Fatal("jsonEncoder operation missing from the registry")
	}
	rootKey := operations.FnHashFor(jsonEncoderOp, nil, "mutate", false) + "_" + rootSiteID
	userModule := entryModule(resp, rootKey)
	if !strings.Contains(userModule, "'User',,true]") {
		t.Errorf("jeMU composite for the absorbed User must collapse to the noop short form, got: %s", userModule)
	}
	if all := allEntrySources(resp); strings.Contains(all, "'PJ001'") {
		t.Errorf("no emitted module may carry the PJ001 alwaysThrow arg — property absorbs the never child. Got:\n%s", all)
	}
	// A PJ015 child-position WARNING should fire for the dropped never property
	// — NOT the PJ001 root error. `never` is directly DataOnly-stripped, so the
	// property is dropped (the object still serializes); an Error would wrongly
	// claim the factory throws at runtime when it serializes fine (F3).
	runtype := runtypeDiagsOf(resp.Diagnostics)
	var drop *diagnostics.Diagnostic
	for i := range runtype {
		if runtype[i].Code == diagnostics.CodePJNonSerializablePropDrop {
			drop = &runtype[i]
			break
		}
	}
	if drop == nil {
		t.Fatalf("expected PJ015 drop warning for the dropped never property, got %+v", runtype)
	}
	if drop.Severity != diagnostics.SeverityWarning {
		t.Errorf("PJ015 severity = %v, want Warning (a dropped property serializes fine)", drop.Severity)
	}
	if len(drop.Args) != 1 || drop.Args[0] != "bad" {
		t.Errorf("expected args=[\"bad\"] (the dropped property name), got %v", drop.Args)
	}
	// The PJ001 root error must NOT fire — the property is dropped, not failed.
	for i := range runtype {
		if runtype[i].Code == diagnostics.CodePJNeverRoot {
			t.Errorf("PJ001 (root never error) must not fire for a dropped never property, got %+v", runtype[i])
		}
	}
}

// TestDiag_SymbolUnsupported_PerFamily pins v2's reclassification of
// KindSymbol — `getRunTypeId<symbol>()` produces an alwaysThrow factory
// (or its per-family equivalent code) across every RT family.
func TestDiag_SymbolUnsupported_PerFamily(t *testing.T) {
	// validate seeds `it` (all-emit); pj/sj/tb are demand-driven, so seed pj via
	// createJsonEncoderFn(mutate), sj via createJsonEncoderFn(direct), tb via createBinaryEncoderFn.
	const code = `import {createValidateFn, createJsonEncoderFn, createBinaryEncoderFn} from '@ts-runtypes/core';
export const _ = createValidateFn<symbol>();
export const _p = createJsonEncoderFn<symbol>(undefined, {strategy: 'mutate'});
export const _s = createJsonEncoderFn<symbol>(undefined, {strategy: 'direct'});
export const _b = createBinaryEncoderFn<symbol>();
`
	r := setupInline(t, map[string]string{"s.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"s.ts"},
		IncludeEntryModules: true,
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	codes := map[string]bool{}
	for _, d := range runtypeDiagsOf(resp.Diagnostics) {
		codes[d.Code] = true
	}
	// Each family emits its own Symbol-unsupported code.
	for _, want := range []string{diagnostics.CodeVLSymbolRoot, diagnostics.CodePJSymbolRoot, diagnostics.CodeSJSymbolRoot, diagnostics.CodeTBSymbolRoot} {
		if !codes[want] {
			t.Errorf("expected diagnostic %s to fire for symbol at root, got %v", want, codes)
		}
	}
}

// TestDiag_AlwaysThrowEntry_EmbedsRenderedMessage pins the entry-module shape —
// when a root throws, the rendered init() carries the COMPLETE runtime throw
// message (rendered by the Go emitter and embedded in the tuple), not a bare
// code resolved JS-side and not an inline throwing factory body. The Go↔plugin
// wire still carries only the diagnostic code.
func TestDiag_AlwaysThrowEntry_EmbedsRenderedMessage(t *testing.T) {
	// pj is demand-driven now, so seed it via createJsonEncoderFn(mutate) → [pj].
	const code = `import {createJsonEncoderFn} from '@ts-runtypes/core';
export const _ = createJsonEncoderFn<never>(undefined, {strategy: 'mutate'});
`
	r := setupInline(t, map[string]string{"n.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"n.ts"},
		IncludeEntryModules: true,
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	src := familyEntrySources(resp, "prepareForJson")
	// never under prepareForJson → PJ001; leaf kind label "Never".
	wantMessage := "[" + diagnostics.CodePJNeverRoot + "] Type `Never` can never be encoded to JSON — the generated function will always fail."
	if !strings.Contains(src, wantMessage) {
		t.Errorf("expected rendered alwaysThrow message %q embedded in init(), got:\n%s", wantMessage, src)
	}
	if strings.Contains(src, "throw new Error(") {
		t.Errorf("wire format should not embed inline throw bodies, got:\n%s", src)
	}
}

// TestDiag_SilentSkip_FunctionMember pins the Phase 3 silent-skip
// visibility: when an interface has a function-typed member, the RT
// silently drops it from the validator/serializer. The new diagnostic
// surfaces that drop at build time so the user knows e.g. `onClick`
// is not validated. The exact code (VL010 vs VL011) depends on whether
// TypeScript parses the member as a method or a property — both flow
// through the same family prefix (IT) so consumers can grep by prefix.
func TestDiag_SilentSkip_FunctionMember_Validate(t *testing.T) {
	const code = `import {createValidateFn} from '@ts-runtypes/core';
interface User { name: string; onClick: () => void; }
export const _ = createValidateFn<User>();
`
	r := setupInline(t, map[string]string{"u.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"u.ts"},
		IncludeEntryModules: true,
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	var found *diagnostics.Diagnostic
	for _, d := range runtypeDiagsOf(resp.Diagnostics) {
		switch d.Code {
		case diagnostics.CodeVLFunctionPropDropped, diagnostics.CodeVLMethodDropped:
			d := d
			found = &d
		}
		if found != nil {
			break
		}
	}
	if found == nil {
		t.Fatalf("expected VL010 or VL011 diagnostic, got %+v", resp.Diagnostics)
	}
	if found.Severity != diagnostics.SeverityWarning {
		t.Errorf("severity: got %d want %d", found.Severity, diagnostics.SeverityWarning)
	}
	if len(found.Args) != 1 || found.Args[0] != "onClick" {
		t.Errorf("args: got %v, expected [\"onClick\"]", found.Args)
	}
}

// TestDiag_RunTypeFansOutAcrossCallSites pins the per-user-direction
// dedup rule: when N marker calls reference the same RT ID with the
// same problem, emit N diagnostics — one per call site — not one
// shared by them all.
func TestDiag_RunTypeFansOutAcrossCallSites(t *testing.T) {
	// pj is demand-driven; three createJsonEncoderFn(mutate) sites share one `never`
	// id, so the single rendered pj entry fans the PJ001 diag out to all three.
	const code = `import {createJsonEncoderFn} from '@ts-runtypes/core';
export const a = createJsonEncoderFn<never>(undefined, {strategy: 'mutate'});
export const b = createJsonEncoderFn<never>(undefined, {strategy: 'mutate'});
export const c = createJsonEncoderFn<never>(undefined, {strategy: 'mutate'});
`
	r := setupInline(t, map[string]string{"multi.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"multi.ts"},
		IncludeEntryModules: true,
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	var neverDiags []diagnostics.Diagnostic
	for _, d := range runtypeDiagsOf(resp.Diagnostics) {
		if d.Code == diagnostics.CodePJNeverRoot {
			neverDiags = append(neverDiags, d)
		}
	}
	if len(neverDiags) != 3 {
		t.Fatalf("expected 3 diagnostics (one per call site), got %d (%+v)", len(neverDiags), neverDiags)
	}
	// Each entry has its own distinct line.
	seenLines := map[int]bool{}
	for _, d := range neverDiags {
		seenLines[d.Site.StartLine] = true
	}
	if len(seenLines) != 3 {
		t.Errorf("expected 3 distinct call-site lines, got %d (%v)", len(seenLines), seenLines)
	}
}
