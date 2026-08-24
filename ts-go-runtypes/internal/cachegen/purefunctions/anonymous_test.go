package purefunctions

import (
	"strings"
	"testing"
)

// The anonymous lane is content-addressed (keyed rt::<CodeHash>) and comes in two
// forms distinguished by the pure-fn parameter's marker:
//   - registerAnonymousPureFn(fn)          — DIRECT: the arg IS the pure fn;
//     the extractor wraps it into `function(){ return <fn> }` (params empty).
//   - registerAnonymousPureFnFactory(cf)   — FACTORY: the arg IS a factory,
//     extracted as-is (params + body + deps).
// Per the repo's marker-test discipline each form is covered DIRECTLY and THROUGH
// A LIBRARY WRAPPER (a fixture forwarding the markers), asserting the wrapper
// injects the same rt::<hash> a direct call would.

func TestExtractAnonymous_DirectForm(t *testing.T) {
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerAnonymousPureFn} from '@ts-runtypes/core';
export const cpf = registerAnonymousPureFn((n: number): number => n * 2);`,
	})
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	got := entries[0]
	if got.Namespace != AnonymousNamespace {
		t.Errorf("expected namespace %q, got %q", AnonymousNamespace, got.Namespace)
	}
	if len(got.FunctionName) != bodyHashLength {
		t.Errorf("functionName should be a %d-char content hash, got %q", bodyHashLength, got.FunctionName)
	}
	// DIRECT: the fn is wrapped, so the synthesised factory has NO params and its
	// code returns the pure fn verbatim (types stripped).
	if len(got.ParamNames) != 0 {
		t.Errorf("direct form should have no factory params, got %v", got.ParamNames)
	}
	if !strings.HasPrefix(strings.TrimSpace(got.Code), "return ") {
		t.Errorf("direct form code should return the pure fn, got:\n%s", got.Code)
	}
	if strings.Contains(got.Code, ": number") {
		t.Errorf("annotations should be stripped, got code:\n%s", got.Code)
	}
	// The injected trailing arg is the SAME key the entry is registered under.
	if want := ", '" + got.Key() + "'"; got.HashInjectText != want {
		t.Errorf("hash inject text = %q, want %q", got.HashInjectText, want)
	}
	if got.HashInjectPos == 0 {
		t.Errorf("hash inject pos should be the closing-paren offset, got 0")
	}
}

func TestExtractAnonymous_FactoryForm(t *testing.T) {
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerAnonymousPureFnFactory} from '@ts-runtypes/core';
export const cpf = registerAnonymousPureFnFactory(function (utl) {
  const FACTOR = 2;
  return function _double(n: number): number {
    return n * FACTOR;
  };
});`,
	})
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	got := entries[0]
	if got.Namespace != AnonymousNamespace || len(got.FunctionName) != bodyHashLength {
		t.Errorf("expected rt::<hash> key, got %q", got.Key())
	}
	// FACTORY: the factory is emitted as-is — its param (utl) is kept and its body
	// (the one-time `const FACTOR` setup) survives.
	if len(got.ParamNames) != 1 || got.ParamNames[0] != "utl" {
		t.Errorf("factory form should keep the utl param, got %v", got.ParamNames)
	}
	if !strings.Contains(got.Code, "FACTOR") {
		t.Errorf("factory body (one-time setup) should survive, got:\n%s", got.Code)
	}
	if got.HashInjectText != ", '"+got.Key()+"'" {
		t.Errorf("factory form must also inject the hash, got %q", got.HashInjectText)
	}
}

func TestExtractAnonymous_FormsDedupByContent(t *testing.T) {
	// Content-addressing is by the emitted CODE, not the authoring form. A direct
	// fn and a TRIVIAL factory that just returns it produce identical code
	// (`return <fn>;`) and correctly dedup — they mean the same thing. A factory
	// that does one-time SETUP has different code and gets its own entry.
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerAnonymousPureFn, registerAnonymousPureFnFactory} from '@ts-runtypes/core';
export const direct = registerAnonymousPureFn((n: number): number => n * 2);
export const trivialFactory = registerAnonymousPureFnFactory(function () {
  return (n: number): number => n * 2;
});
export const setupFactory = registerAnonymousPureFnFactory(function () {
  const FACTOR = 2;
  return (n: number): number => n * FACTOR;
});`,
	})
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	// direct + trivialFactory collapse to one; setupFactory is its own.
	if len(entries) != 2 {
		t.Fatalf("expected 2 entries (trivial forms deduped, setup factory distinct), got %d: %+v", len(entries), entries)
	}
}

func TestExtractAnonymous_ContentAddressedDedup(t *testing.T) {
	// Two structurally-identical DIRECT bodies (in different files) collapse to
	// ONE rt::<hash> entry.
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerAnonymousPureFn} from '@ts-runtypes/core';
export const first = registerAnonymousPureFn((n: number): number => n);`,
		"b.ts": `
import {registerAnonymousPureFn} from '@ts-runtypes/core';
export const second = registerAnonymousPureFn((n: number): number => n);`,
	})
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics (equal bodies must not collide): %+v", diags)
	}
	if len(entries) != 1 {
		t.Fatalf("equal bodies should collapse to 1 entry, got %d: %+v", len(entries), entries)
	}
}

func TestExtractAnonymous_DifferentBodiesDistinctHash(t *testing.T) {
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerAnonymousPureFn} from '@ts-runtypes/core';
export const doubler = registerAnonymousPureFn((n: number): number => n * 2);
export const tripler = registerAnonymousPureFn((n: number): number => n * 3);`,
	})
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	if len(entries) != 2 {
		t.Fatalf("different bodies should produce 2 entries, got %d", len(entries))
	}
	if entries[0].Key() == entries[1].Key() {
		t.Errorf("different bodies must not share a key: %q", entries[0].Key())
	}
}

func TestExtractAnonymous_ThroughDirectWrapper(t *testing.T) {
	// A library wrapper forwards the InjectPureFnHash + PureFunction (direct)
	// markers. Its consumer call site is recognised by BRAND (not callee name)
	// and injects the SAME rt::<hash> a direct call to the same body would.
	direct, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerAnonymousPureFn} from '@ts-runtypes/core';
export const cpf = registerAnonymousPureFn((s: string): string => s.toLowerCase());`,
	})
	if len(diags) != 0 || len(direct) != 1 {
		t.Fatalf("direct extraction failed: entries=%d diags=%+v", len(direct), diags)
	}

	wrapped, wdiags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerAnonymousPureFn, type PureFunction, type InjectPureFnHash} from '@ts-runtypes/core';
function serverMapFrom<F extends (...args: any[]) => any>(mapper: PureFunction<F>, hash?: InjectPureFnHash<F>) {
  if (!hash) throw new Error('plugin did not run');
  return registerAnonymousPureFn(mapper, hash);
}
export const cpf = serverMapFrom((s: string): string => s.toLowerCase());`,
	})
	if len(wdiags) != 0 {
		t.Fatalf("wrapper extraction diagnostics: %+v", wdiags)
	}
	if len(wrapped) != 1 {
		t.Fatalf("wrapper consumer call must extract exactly one entry, got %d: %+v", len(wrapped), wrapped)
	}
	if wrapped[0].Key() != direct[0].Key() {
		t.Errorf("wrapper injected %q, direct injected %q — should match", wrapped[0].Key(), direct[0].Key())
	}
}

func TestExtractAnonymous_ThroughFactoryWrapper(t *testing.T) {
	// The factory-form wrapper forwards PureFunctionFactory + InjectPureFnHash.
	direct, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerAnonymousPureFnFactory} from '@ts-runtypes/core';
export const cpf = registerAnonymousPureFnFactory(function () {
  return (s: string): string => s.toLowerCase();
});`,
	})
	if len(diags) != 0 || len(direct) != 1 {
		t.Fatalf("direct factory extraction failed: entries=%d diags=%+v", len(direct), diags)
	}
	wrapped, wdiags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerAnonymousPureFnFactory, type PureFunctionFactory, type InjectPureFnHash, type RTUtils} from '@ts-runtypes/core';
function registerAcmeFactory<F extends (utl: RTUtils) => any>(cf: PureFunctionFactory<F>, hash?: InjectPureFnHash<F>) {
  if (!hash) throw new Error('plugin did not run');
  return registerAnonymousPureFnFactory(cf, hash);
}
export const cpf = registerAcmeFactory(function () {
  return (s: string): string => s.toLowerCase();
});`,
	})
	if len(wdiags) != 0 || len(wrapped) != 1 {
		t.Fatalf("factory wrapper extraction: entries=%d diags=%+v", len(wrapped), wdiags)
	}
	if wrapped[0].Key() != direct[0].Key() {
		t.Errorf("factory wrapper injected %q, direct injected %q — should match", wrapped[0].Key(), direct[0].Key())
	}
}

func TestExtractAnonymous_ThroughLeadingParamWrapper(t *testing.T) {
	// The real mion serverMapFrom shape: a leading non-marker param before the
	// marker pair, plus an overloaded marker-free name lane. The marker positions
	// are DISCOVERED (slots 1/2 here), the hash splices at its declared slot, and
	// the string-overload call never extracts.
	direct, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerAnonymousPureFn} from '@ts-runtypes/core';
export const cpf = registerAnonymousPureFn((customer: {id: number}): number => customer.id * 2);`,
	})
	if len(diags) != 0 || len(direct) != 1 {
		t.Fatalf("direct extraction failed: entries=%d diags=%+v", len(direct), diags)
	}

	wrapped, wdiags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerAnonymousPureFn, type PureFunction, type InjectPureFnHash} from '@ts-runtypes/core';
function serverMapFrom<Source, MappedInput>(source: Source, fnName: string): unknown;
function serverMapFrom<Source, MappedInput>(
  source: Source,
  mapper: PureFunction<(value: Source) => MappedInput>,
  hash?: InjectPureFnHash<(value: Source) => MappedInput>
): unknown;
function serverMapFrom(source: unknown, mapperOrName: unknown, hash?: string): unknown {
  if (typeof mapperOrName === 'string') return mapperOrName;
  if (!hash) throw new Error('plugin did not run');
  return registerAnonymousPureFn(mapperOrName as never, hash as never);
}
const source = {id: 1};
export const mapped = serverMapFrom(source, (customer: {id: number}): number => customer.id * 2);
export const named = serverMapFrom(source, 'toCustomerId');`,
	})
	if len(wdiags) != 0 {
		t.Fatalf("leading-param wrapper diagnostics: %+v", wdiags)
	}
	if len(wrapped) != 1 {
		t.Fatalf("only the inline-mapper call must extract (string overload never does), got %d: %+v", len(wrapped), wrapped)
	}
	if wrapped[0].Key() != direct[0].Key() {
		t.Errorf("leading-param wrapper injected %q, direct injected %q — should match (content-addressed)", wrapped[0].Key(), direct[0].Key())
	}
	if want := ", '" + wrapped[0].Key() + "'"; wrapped[0].HashInjectText != want {
		t.Errorf("hash inject text = %q, want %q (slot 2, no padding)", wrapped[0].HashInjectText, want)
	}
	if wrapped[0].HashInjectPos == 0 {
		t.Errorf("hash inject position must be set")
	}
}

func TestExtractAnonymous_HashSlotPaddingAcrossOptionalGap(t *testing.T) {
	// A wrapper with an optional non-marker param BETWEEN the mapper and the hash:
	// injecting at the hash's declared slot pads the gap with `undefined`.
	wrapped, wdiags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerAnonymousPureFn, type PureFunction, type InjectPureFnHash} from '@ts-runtypes/core';
function registerWithOpts<F extends (...args: any[]) => any>(
  fn: PureFunction<F>,
  opts?: {label?: string},
  hash?: InjectPureFnHash<F>
): unknown {
  if (!hash) throw new Error('plugin did not run');
  return registerAnonymousPureFn(fn as never, hash as never);
}
export const padded = registerWithOpts((n: number): number => n + 1);`,
	})
	if len(wdiags) != 0 || len(wrapped) != 1 {
		t.Fatalf("optional-gap wrapper extraction: entries=%d diags=%+v", len(wrapped), wdiags)
	}
	if want := ", undefined, '" + wrapped[0].Key() + "'"; wrapped[0].HashInjectText != want {
		t.Errorf("hash inject text = %q, want %q (one undefined pad for the skipped opts slot)", wrapped[0].HashInjectText, want)
	}
}

func TestExtractAnonymous_Replacements(t *testing.T) {
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerAnonymousPureFn} from '@ts-runtypes/core';
export const cpf = registerAnonymousPureFn((n: number): number => n * 2);`,
	})
	if len(diags) != 0 || len(entries) != 1 {
		t.Fatalf("extraction failed: entries=%d diags=%+v", len(entries), diags)
	}
	reps := Replacements(entries, false)
	if len(reps) != 2 {
		t.Fatalf("anonymous entry should yield 2 replacements (arg rewrite + hash splice), got %d: %+v", len(reps), reps)
	}
	// One replacement rewrites the arg to a pf binding (ImportFrom set); the other
	// is a point insertion splicing the hash literal (no ImportFrom).
	var factoryRep, hashRep int = -1, -1
	for i, rep := range reps {
		if rep.ImportFrom != "" {
			factoryRep = i
		} else if rep.Start == rep.End {
			hashRep = i
		}
	}
	if factoryRep < 0 || hashRep < 0 {
		t.Fatalf("missing a replacement in %+v", reps)
	}
	if !strings.HasPrefix(reps[factoryRep].Text, "__rt_pf") {
		t.Errorf("arg replacement text should be a pf binding, got %q", reps[factoryRep].Text)
	}
	if !strings.Contains(reps[hashRep].Text, "'"+entries[0].Key()+"'") {
		t.Errorf("hash replacement should splice the entry key, got %q", reps[hashRep].Text)
	}
}

func TestExtractAnonymous_ForwardedArgNotExtracted(t *testing.T) {
	// A call whose arg is a forwarded identifier (not an inline function) — e.g.
	// the wrapper body's own registerAnonymousPureFn(fn, hash) — extracts nothing:
	// PFN001 is the resolver's job, so this pass bails quietly and the rewrite
	// stays idempotent.
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerAnonymousPureFn, type PureFunction, type InjectPureFnHash} from '@ts-runtypes/core';
export function reg<F extends (...args: any[]) => any>(fn: PureFunction<F>, hash?: InjectPureFnHash<F>) {
  return registerAnonymousPureFn(fn, hash);
}`,
	})
	if len(entries) != 0 {
		t.Fatalf("forwarded arg must not extract, got %d entries: %+v", len(entries), entries)
	}
	if len(diags) != 0 {
		t.Fatalf("forwarded arg must be a quiet no-op, got diags: %+v", diags)
	}
}
