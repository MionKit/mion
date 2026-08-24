package purefunctions

import (
	"testing"
)

// withFactoryBody wraps a body into a complete registerPureFnFactory call
// so we can drive checkPurity end-to-end via ExtractFromProgramCached. Returns
// only the diagnostics that came back; entries are ignored for the
// purity test surface (we already cover the happy-path emission paths
// in extract_test.go).
func withFactoryBody(t *testing.T, body string) []Diagnostic {
	t.Helper()
	source := `import {registerPureFnFactory} from '@ts-runtypes/core';
export const _ = registerPureFnFactory('test::fn', function () {
` + body + `
});`
	_, diags := extractFromOverlay(t, map[string]string{"case.ts": source})
	return diags
}

// purityCodes returns the codes of every PFE9006-PFE9011 diagnostic in
// diags. Order is preserved (sorted alphabetically by site upstream, so
// the slice is deterministic across runs).
func purityCodes(diags []Diagnostic) []string {
	var out []string
	for _, diag := range diags {
		switch diag.Code {
		case CodePurityThis, CodePurityAwait, CodePurityYield,
			CodePurityDynamicImport, CodePurityForbidden, CodePurityClosure:
			out = append(out, diag.Code)
		}
	}
	return out
}

func firstDiagWithCode(diags []Diagnostic, code string) (Diagnostic, bool) {
	for _, diag := range diags {
		if diag.Code == code {
			return diag, true
		}
	}
	return Diagnostic{}, false
}

// ──────────────────────────────────────────────────────────────────────
// Passing cases — factory body parses as a pure function.
// ──────────────────────────────────────────────────────────────────────

func TestPurity_PureBody_NoDiagnostics(t *testing.T) {
	diags := withFactoryBody(t, `
  return function inner(x: number) {
    const y = x * 2;
    return y + 1;
  };`)
	if got := purityCodes(diags); len(got) != 0 {
		t.Fatalf("expected zero purity diagnostics, got %v\n(all diags: %+v)", got, diags)
	}
}

func TestPurity_AllowedGlobals_NoDiagnostics(t *testing.T) {
	diags := withFactoryBody(t, `
  return function inner(x: any) {
    const a = Math.floor(x);
    const b = JSON.stringify(x);
    const c = parseInt('42');
    const d = Array.from([1, 2]);
    const e = Number.isFinite(a);
    return [a, b, c, d, e];
  };`)
	if got := purityCodes(diags); len(got) != 0 {
		t.Fatalf("allowed globals should not flag, got %v", got)
	}
}

func TestPurity_LocalDecls_NoDiagnostics(t *testing.T) {
	diags := withFactoryBody(t, `
  const factor = 2;
  return function inner(x: number) {
    return x * factor;
  };`)
	// `factor` is in the outer factory's scope; inner reaches up through
	// scope.parent.has, which returns true. No diagnostic.
	if got := purityCodes(diags); len(got) != 0 {
		t.Fatalf("local decls should be in scope, got %v", got)
	}
}

func TestPurity_ForOf_LocalIterator_NoDiagnostics(t *testing.T) {
	diags := withFactoryBody(t, `
  return function inner(items: number[]) {
    let total = 0;
    for (const item of items) {
      total = total + item;
    }
    return total;
  };`)
	if got := purityCodes(diags); len(got) != 0 {
		t.Fatalf("for-of binding should be in scope, got %v", got)
	}
}

func TestPurity_TryCatch_LocalBinding_NoDiagnostics(t *testing.T) {
	diags := withFactoryBody(t, `
  return function inner() {
    try {
      return 1;
    } catch (err) {
      return err;
    }
  };`)
	if got := purityCodes(diags); len(got) != 0 {
		t.Fatalf("catch binding should be in scope, got %v", got)
	}
}

func TestPurity_DestructuredLocal_NoDiagnostics(t *testing.T) {
	diags := withFactoryBody(t, `
  return function inner(arg: any) {
    const {a, b} = arg;
    return a + b;
  };`)
	if got := purityCodes(diags); len(got) != 0 {
		t.Fatalf("destructured locals should be in scope, got %v", got)
	}
}

func TestPurity_ObjectLiteralKey_NotAReference(t *testing.T) {
	// `eval` here is a property KEY on an object literal — not a reference
	// to the global eval. Must not trigger PFE9010.
	diags := withFactoryBody(t, `
  return function inner() {
    const obj = {eval: 1, fetch: 2};
    return obj;
  };`)
	if got := purityCodes(diags); len(got) != 0 {
		t.Fatalf("forbidden names as object keys should not flag, got %v", got)
	}
}

func TestPurity_Temporal_Allowed(t *testing.T) {
	// User-requested delta: Temporal is in allowedGlobals.
	diags := withFactoryBody(t, `
  return function inner() {
    return Temporal.PlainDate.from('2024-01-01');
  };`)
	if got := purityCodes(diags); len(got) != 0 {
		t.Fatalf("Temporal must be allowed, got %v", got)
	}
}

func TestPurity_BinaryEncodingGlobals_Allowed(t *testing.T) {
	// User-requested delta: binary + text-encoding constructors are in
	// allowedGlobals so hashing / binary-codec / encoding algorithms can be
	// ported inline into a factory body. References EVERY newly-added global,
	// so dropping any key from the map re-introduces a PFE9011 closure (or
	// PFE9010 forbidden) violation right here.
	diags := withFactoryBody(t, `
  return function inner(input: string) {
    const bytes = new TextEncoder().encode(input);
    const text = new TextDecoder().decode(bytes);
    const buf = new ArrayBuffer(64);
    const view = new DataView(buf);
    view.setInt32(0, 1);
    const a = new Int8Array(buf);
    const b = new Uint8Array(buf);
    const c = new Uint8ClampedArray(buf);
    const d = new Int16Array(buf);
    const e = new Uint16Array(buf);
    const f = new Int32Array(buf);
    const g = new Uint32Array(buf);
    const h = new Float32Array(buf);
    const i = new Float64Array(buf);
    const j = new BigInt64Array(buf);
    const k = new BigUint64Array(buf);
    return [text, view, a, b, c, d, e, f, g, h, i, j, k, btoa(text), atob('AA==')];
  };`)
	if got := purityCodes(diags); len(got) != 0 {
		t.Fatalf("binary/encoding globals must be allowed, got %v\n(all diags: %+v)", got, diags)
	}
}

func TestPurity_BunEngineProbe_Allowed(t *testing.T) {
	// `Bun` is in allowedGlobals ("Console + runtime hints"), which is what
	// lets a factory specialise its returned closure per engine — rt::countEnumKeys
	// picks a for-in counter on V8 and an Object.keys counter on JavaScriptCore.
	// The probe MUST be `typeof Bun !== 'undefined'`: `process`, `globalThis` and
	// `global` are all in forbiddenIdentifiers, so no other engine test is legal.
	// Dropping "Bun" from allowedGlobals re-introduces a PFE9011 closure violation
	// right here.
	diags := withFactoryBody(t, `
  if (typeof Bun !== 'undefined') {
    return function inner(obj: Record<string, unknown>) {
      return Object.keys(obj).length;
    };
  }
  return function inner(obj: Record<string, unknown>) {
    let count = 0;
    for (const _key in obj) count++;
    return count;
  };`)
	if got := purityCodes(diags); len(got) != 0 {
		t.Fatalf("the Bun engine probe must be allowed, got %v\n(all diags: %+v)", got, diags)
	}
}

func TestPurity_ProcessEngineProbe_NotAllowed(t *testing.T) {
	// The counterpart to the test above: the OTHER obvious way to detect the
	// runtime stays forbidden, so nobody swaps the Bun probe for a process one.
	diags := withFactoryBody(t, `
  return function inner() {
    return typeof process !== 'undefined';
  };`)
	if _, ok := firstDiagWithCode(diags, CodePurityForbidden); !ok {
		t.Fatalf("expected %s for a process-based engine probe, got %v", CodePurityForbidden, purityCodes(diags))
	}
}

func TestPurity_Crypto_Allowed(t *testing.T) {
	// `crypto` is allowed like Math / Date: a computation namespace that reads a
	// benign host VALUE, not a side-effect channel. Its SYNC members
	// (randomUUID / getRandomValues) are non-deterministic — exactly like
	// Math.random / Date.now, which are also allowed and which mock-generator
	// pure-fns want. Non-determinism is NOT the forbidden line, so no closure
	// (PFE9011) or forbidden (PFE9010) diagnostic.
	diags := withFactoryBody(t, `
  return function inner() {
    const id = crypto.randomUUID();
    const buf = crypto.getRandomValues(new Uint8Array(16));
    return [id, buf];
  };`)
	if got := purityCodes(diags); len(got) != 0 {
		t.Fatalf("crypto (sync members) must be allowed, got %v\n(all diags: %+v)", got, diags)
	}
}

func TestPurity_CryptoSubtleAwait_IsAsyncViolation(t *testing.T) {
	// crypto is allowed, but the synchronous-only rule still bites: its async
	// subtle.* API can only be consumed with await. The failure is PFE9007
	// (await), NOT a closure / forbidden on `crypto` — that is the whole
	// principle (the async hash simply doesn't fit; a real hash is ported
	// inline over the typed arrays).
	diags := withFactoryBody(t, `
  return async function inner(data: Uint8Array) {
    return await crypto.subtle.digest('SHA-256', data);
  };`)
	if _, ok := firstDiagWithCode(diags, CodePurityAwait); !ok {
		t.Fatalf("expected PFE9007 for await on crypto.subtle, got %+v", diags)
	}
	for _, d := range diags {
		if (d.Code == CodePurityClosure || d.Code == CodePurityForbidden) && len(d.Args) > 0 && d.Args[0] == "crypto" {
			t.Fatalf("crypto itself must be allowed; only the await should fail, got %+v", diags)
		}
	}
}

func TestPurity_SharedArrayBuffer_NotAllowed(t *testing.T) {
	// SharedArrayBuffer is deliberately ABSENT: a cross-context shared-mutation
	// channel (the same category as the SYNC-but-forbidden storage APIs), with
	// no use in a self-contained pure-fn. Referencing it stays a closure
	// violation — this pins the exclusion so a careless future addition is
	// caught, and documents that "synchronous" was never the sole test.
	diags := withFactoryBody(t, `
  return function inner() {
    return new SharedArrayBuffer(16);
  };`)
	if _, ok := firstDiagWithCode(diags, CodePurityClosure); !ok {
		t.Fatalf("SharedArrayBuffer must NOT be allowed; expected PFE9011, got %+v", diags)
	}
}

// ──────────────────────────────────────────────────────────────────────
// Failing cases — purity violations.
// ──────────────────────────────────────────────────────────────────────

func TestPurity_This_PFE9006(t *testing.T) {
	diags := withFactoryBody(t, `
  return function inner() {
    return this;
  };`)
	if _, ok := firstDiagWithCode(diags, CodePurityThis); !ok {
		t.Fatalf("expected PFE9006 for `this`, got %+v", diags)
	}
}

func TestPurity_Await_PFE9007(t *testing.T) {
	diags := withFactoryBody(t, `
  return async function inner() {
    return await Promise.resolve(1);
  };`)
	if _, ok := firstDiagWithCode(diags, CodePurityAwait); !ok {
		t.Fatalf("expected PFE9007 for await, got %+v", diags)
	}
}

func TestPurity_Yield_PFE9008(t *testing.T) {
	diags := withFactoryBody(t, `
  return function* inner() {
    yield 1;
    yield 2;
  };`)
	if _, ok := firstDiagWithCode(diags, CodePurityYield); !ok {
		t.Fatalf("expected PFE9008 for yield, got %+v", diags)
	}
}

func TestPurity_DynamicImport_PFE9009(t *testing.T) {
	diags := withFactoryBody(t, `
  return function inner() {
    return import('./other.js');
  };`)
	if _, ok := firstDiagWithCode(diags, CodePurityDynamicImport); !ok {
		t.Fatalf("expected PFE9009 for dynamic import, got %+v", diags)
	}
}

func TestPurity_Eval_PFE9010(t *testing.T) {
	diags := withFactoryBody(t, `
  return function inner() {
    return eval('1+1');
  };`)
	diag, ok := firstDiagWithCode(diags, CodePurityForbidden)
	if !ok {
		t.Fatalf("expected PFE9010 for eval, got %+v", diags)
	}
	if len(diag.Args) == 0 || diag.Args[0] != "eval" {
		t.Errorf("message should reference `eval`, got %v", diag.Args)
	}
}

func TestPurity_Fetch_PFE9010(t *testing.T) {
	diags := withFactoryBody(t, `
  return function inner() {
    return fetch('/api');
  };`)
	if _, ok := firstDiagWithCode(diags, CodePurityForbidden); !ok {
		t.Fatalf("expected PFE9010 for fetch, got %+v", diags)
	}
}

func TestPurity_Process_PFE9010(t *testing.T) {
	diags := withFactoryBody(t, `
  return function inner() {
    return process.env.HOME;
  };`)
	if _, ok := firstDiagWithCode(diags, CodePurityForbidden); !ok {
		t.Fatalf("expected PFE9010 for process, got %+v", diags)
	}
}

func TestPurity_SetTimeout_PFE9010(t *testing.T) {
	diags := withFactoryBody(t, `
  return function inner() {
    setTimeout(() => {}, 0);
    return 1;
  };`)
	if _, ok := firstDiagWithCode(diags, CodePurityForbidden); !ok {
		t.Fatalf("expected PFE9010 for setTimeout, got %+v", diags)
	}
}

func TestPurity_GlobalThis_Forbidden(t *testing.T) {
	// User-requested delta: globalThis is now in forbiddenIdentifiers
	// (moved out of allowedGlobals).
	diags := withFactoryBody(t, `
  return function inner() {
    return globalThis;
  };`)
	diag, ok := firstDiagWithCode(diags, CodePurityForbidden)
	if !ok {
		t.Fatalf("expected PFE9010 for globalThis, got %+v", diags)
	}
	if len(diag.Args) == 0 || diag.Args[0] != "globalThis" {
		t.Errorf("message should reference `globalThis`, got %v", diag.Args)
	}
}

func TestPurity_ClosureVariable_PFE9011(t *testing.T) {
	// Reference an identifier that's neither in scope nor a known global.
	// In the test fixture, `SECRET` is referenced from inside the factory
	// without being declared. (The reference ESLint rule sees it as a closure
	// variable from the outer module; here, since the factory's parent
	// chain doesn't include any module-level declaration of SECRET, the
	// scope check fails and PFE9011 fires.)
	diags := withFactoryBody(t, `
  return function inner() {
    return SECRET;
  };`)
	diag, ok := firstDiagWithCode(diags, CodePurityClosure)
	if !ok {
		t.Fatalf("expected PFE9011 for SECRET closure, got %+v", diags)
	}
	if len(diag.Args) == 0 || diag.Args[0] != "SECRET" {
		t.Errorf("message should reference `SECRET`, got %v", diag.Args)
	}
}

func TestPurity_ModuleLevelConst_StillClosureViolation(t *testing.T) {
	// The whole point of the purity rule: a `const` declared OUTSIDE the
	// factory but INSIDE the same module — i.e. a real closure variable
	// at module scope — must still fail. `withFactoryBody` can't express
	// this shape (it wraps the body directly inside the call), so this
	// test uses extractFromOverlay to author the full source.
	_, diags := extractFromOverlay(t, map[string]string{
		"case.ts": `import {registerPureFnFactory} from '@ts-runtypes/core';
const name = 'John';
export const sayHello = registerPureFnFactory('myNamespace::sayHello', function () {
  return function _greet() {
    return 'Hello ' + name;
  };
});
`,
	})
	diag, ok := firstDiagWithCode(diags, CodePurityClosure)
	if !ok {
		t.Fatalf("expected PFE9011 for module-level `name` closure, got %+v", diags)
	}
	if len(diag.Args) == 0 || diag.Args[0] != "name" {
		t.Errorf("message should reference `name`, got %v", diag.Args)
	}
}

func TestPurity_ModuleLevelFunction_StillClosureViolation(t *testing.T) {
	// A module-level helper function called from inside the factory is
	// also a closure access — the factory should not reach for it.
	_, diags := extractFromOverlay(t, map[string]string{
		"case.ts": `import {registerPureFnFactory} from '@ts-runtypes/core';
function helper(x: number) { return x * 2; }
export const x = registerPureFnFactory('ns::fn', function () {
  return function _f(n: number) {
    return helper(n);
  };
});
`,
	})
	diag, ok := firstDiagWithCode(diags, CodePurityClosure)
	if !ok {
		t.Fatalf("expected PFE9011 for module-level `helper` closure, got %+v", diags)
	}
	if len(diag.Args) == 0 || diag.Args[0] != "helper" {
		t.Errorf("message should reference `helper`, got %v", diag.Args)
	}
}

func TestPurity_ImportedSymbol_StillClosureViolation(t *testing.T) {
	// Imports are bindings in the module scope. Referencing one from
	// inside the factory body is a closure access and must fail.
	_, diags := extractFromOverlay(t, map[string]string{
		"case.ts": `import {registerPureFnFactory} from '@ts-runtypes/core';
declare const someImportedHelper: (n: number) => number;
export const x = registerPureFnFactory('ns::fn', function () {
  return function _f(n: number) {
    return someImportedHelper(n);
  };
});
`,
	})
	diag, ok := firstDiagWithCode(diags, CodePurityClosure)
	if !ok {
		t.Fatalf("expected PFE9011 for module-level imported symbol, got %+v", diags)
	}
	if len(diag.Args) == 0 || diag.Args[0] != "someImportedHelper" {
		t.Errorf("message should reference `someImportedHelper`, got %v", diag.Args)
	}
}

func TestPurity_NestedFunctionScopeBoundary(t *testing.T) {
	// Outer factory declares `X`. Inner function declares its own `X`
	// (via parameter). Reference to `X` inside the inner should resolve
	// to the inner's binding, not the outer's — no diagnostic.
	diags := withFactoryBody(t, `
  const X = 1;
  return function inner(X: number) {
    return X + 1;
  };`)
	if got := purityCodes(diags); len(got) != 0 {
		t.Fatalf("inner param `X` should shadow outer; got %v", got)
	}
}

func TestPurity_MultipleViolations_AllReported(t *testing.T) {
	diags := withFactoryBody(t, `
  return function inner() {
    eval('1');
    return fetch('/');
  };`)
	if _, ok := firstDiagWithCode(diags, CodePurityForbidden); !ok {
		t.Fatalf("expected at least one PFE9010, got %+v", diags)
	}
	// Verify both eval and fetch surface.
	var hasEval, hasFetch bool
	for _, diag := range diags {
		if diag.Code != CodePurityForbidden {
			continue
		}
		if len(diag.Args) > 0 && diag.Args[0] == "eval" {
			hasEval = true
		}
		if len(diag.Args) > 0 && diag.Args[0] == "fetch" {
			hasFetch = true
		}
	}
	if !hasEval || !hasFetch {
		t.Fatalf("expected both eval AND fetch flagged; hasEval=%v hasFetch=%v\ndiags=%+v", hasEval, hasFetch, diags)
	}
}

func TestPurity_PropertyAccess_NotAReference(t *testing.T) {
	// `obj.eval` — `eval` here is a property name on `obj`, not a
	// reference to the global eval. Should not fire.
	diags := withFactoryBody(t, `
  return function inner(obj: any) {
    return obj.eval;
  };`)
	if _, ok := firstDiagWithCode(diags, CodePurityForbidden); ok {
		t.Fatalf("property access name should not trigger PFE9010; diags=%+v", diags)
	}
}
