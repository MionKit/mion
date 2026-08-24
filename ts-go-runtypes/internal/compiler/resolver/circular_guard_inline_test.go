package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// End-to-end coverage for the inline circular-reference guard (the compile-time
// `rejectCircularRefs` option). The armed variant of a guarded family must (a)
// bake the guard prologue + skeleton into its body, (b) demand rt::findCycle
// by body reference (delivered like any built-in), while (c) a PLAIN cyclable type
// carries no guard, no walker, and no RunType bundle — the pay-for-use win.

func scanEntryModules(t *testing.T, src string) map[string]string {
	t.Helper()
	r := setupInline(t, map[string]string{"a.ts": src})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}, IncludeEntryModules: true})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}
	return resp.EntryModules
}

// findEntry returns the first entry module whose body factory has the given tag
// prefix (e.g. "cCe_" for armed validate) — the module carrying that factory.
func findEntryWith(modules map[string]string, needle string) (string, bool) {
	for name, mod := range modules {
		if strings.Contains(mod, needle) {
			return name, true
		}
	}
	return "", false
}

func TestInlineGuard_ArmedValidateBakesGuardAndDemandsFindCycle(t *testing.T) {
	modules := scanEntryModules(t, `import {createValidateFn} from '@ts-runtypes/core';
interface Node {name: string; next?: Node}
export const isNode = createValidateFn<Node>(undefined, {rejectCircularRefs: true});
`)

	// The armed entry (val|C = "cCe") must carry the guard prologue.
	armedName, ok := findEntryWith(modules, "cCe_")
	if !ok {
		t.Fatalf("no armed validate entry emitted\nmodules: %v", keys(modules))
	}
	armed := modules[armedName]
	// Quote-free substrings: the factory body is a quoted JS string, so single
	// quotes inside it are escaped (\'), but these fragments carry none.
	for _, want := range []string{"fc = utl.getPureFn(", "if(fc(v,cyP))return false", "const cyP = {c:["} {
		if !strings.Contains(armed, want) {
			t.Errorf("armed validate entry missing %q:\n%s", want, armed)
		}
	}
	// It demands the built-in by body reference (the pure-fn dep tuple slot is a
	// real JS array literal, so its single quotes are NOT escaped).
	if !strings.Contains(armed, "'rt::findCycle'") {
		t.Errorf("armed entry does not list the findCycle pure-fn dep:\n%s", armed)
	}
	if _, ok := modules["pf/rt/findCycle"]; !ok {
		t.Errorf("rt::findCycle module was not served\nmodules: %v", keys(modules))
	}
}

func TestInlineGuard_PlainCyclableTypeShipsNoGuardNoBundle(t *testing.T) {
	// A plain (unarmed) createValidateFn over a cyclable type — the common case.
	modules := scanEntryModules(t, `import {createValidateFn} from '@ts-runtypes/core';
interface Node {name: string; next?: Node}
export const isNode = createValidateFn<Node>();
`)
	for name, mod := range modules {
		if strings.Contains(mod, "findCycle") {
			t.Errorf("plain cyclable type served the walker in %q — demand leaked:\n%s", name, mod)
		}
		// No RunType data bundle (kind-4 row bundle) for a plain createX cyclable type.
		if strings.HasPrefix(mod, "export const __rt_runtypes") || strings.Contains(mod, "rtmod:/runtypes.js") {
			t.Errorf("plain cyclable type emitted / imported a RunType bundle in %q:\n%s", name, mod)
		}
	}
}

func TestInlineGuard_ArmedEncodersThrow(t *testing.T) {
	// toBinary (tb|C) and jsonEncoder (jeCL|C) armed entries throw a
	// CircularReferenceError via utl.circularError.
	modules := scanEntryModules(t, `import {createBinaryEncoderFn, createJsonEncoderFn} from '@ts-runtypes/core';
interface Node {name: string; next?: Node}
export const tb = createBinaryEncoderFn<Node>(undefined, {rejectCircularRefs: true});
export const je = createJsonEncoderFn<Node>(undefined, {rejectCircularRefs: true});
`)
	throwers := 0
	for _, mod := range modules {
		if strings.Contains(mod, "if(cyR)throw utl.circularError(cyR)") {
			throwers++
		}
	}
	if throwers < 2 {
		t.Errorf("expected both armed encoders (tb + je) to throw via utl.circularError, found %d\nmodules: %v", throwers, keys(modules))
	}
	if _, ok := modules["pf/rt/findCycle"]; !ok {
		t.Errorf("rt::findCycle not served for armed encoders\nmodules: %v", keys(modules))
	}
}

// TestInlineGuard_ArmedCompositeNeverTripsJCP001 — regression: the armed JSON
// composite carries `rt::findCycle` in its SoftDeps (that IS the built-in's
// demand signal), but AssertCompositeSoftDeps must not read that pure-fn edge
// as a composite-bound primitive: the assertion runs BEFORE serveBuiltinPureFns
// delivers the body, so treating it as a primitive fired a spurious
// Error-severity JCP001 that failed batch builds.
func TestInlineGuard_ArmedCompositeNeverTripsJCP001(t *testing.T) {
	r := setupInline(t, map[string]string{"a.ts": `import {createJsonEncoderFn} from '@ts-runtypes/core';
interface Node {name: string; next?: Node}
export const je = createJsonEncoderFn<Node>(undefined, {rejectCircularRefs: true});
`})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}, IncludeEntryModules: true})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}
	for _, d := range resp.Diagnostics {
		if d.Code == diagnostics.CodeCompositeMissingPrimitive {
			t.Fatalf("armed jsonEncoder tripped JCP001 on its pure-fn soft dep: args=%v", d.Args)
		}
	}
	if _, ok := resp.EntryModules["pf/rt/findCycle"]; !ok {
		t.Errorf("rt::findCycle module was not served\nmodules: %v", keys(resp.EntryModules))
	}
}
