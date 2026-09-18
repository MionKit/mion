package purefunctions

import (
	"fmt"
	"strings"
	"testing"
)

// A registration is identified by where it lives — its package, its file and the
// name it is bound to — and comes in two forms, told apart by the pure-fn
// parameter's marker:
//   - registerPureFn(fn)          — DIRECT: the arg IS the pure fn; the
//     extractor wraps it into `function(){ return <fn> }` (params empty).
//   - registerPureFnFactory(cf)   — FACTORY: the arg IS a factory, extracted
//     as-is (params + body + deps).
//
// Per the repo's marker-test discipline each form is covered DIRECTLY and
// THROUGH A LIBRARY WRAPPER (a fixture forwarding the markers), asserting the
// wrapper injects the same id a direct call at that location would.

func TestExtractRegistration_DirectForm(t *testing.T) {
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerPureFn} from '@mionjs/run-types';
export const double = registerPureFn((n: number): number => n * 2);`,
	})
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	got := entries[0]
	if got.BindingName != "double" || !strings.HasPrefix(got.ID, idPrefix) {
		t.Errorf("id = %q (bound to %q), want an id under %q", got.ID, got.BindingName, idPrefix)
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
	// The injected trailing arg is the SAME id the entry is registered under.
	if want := ", '" + got.ID + "'"; got.IDInjectText != want {
		t.Errorf("id inject text = %q, want %q", got.IDInjectText, want)
	}
	if got.IDInjectPos == 0 {
		t.Errorf("id inject pos should be the closing-paren offset, got 0")
	}
}

func TestExtractRegistration_FactoryForm(t *testing.T) {
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerPureFnFactory} from '@mionjs/run-types';
export const double = registerPureFnFactory(function (utl) {
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
	if got.BindingName != "double" || !strings.HasPrefix(got.ID, idPrefix) {
		t.Errorf("id = %q (bound to %q), want an id under %q", got.ID, got.BindingName, idPrefix)
	}
	// FACTORY: the factory is emitted as-is — its param (utl) is kept and its body
	// (the one-time `const FACTOR` setup) survives.
	if len(got.ParamNames) != 1 || got.ParamNames[0] != "utl" {
		t.Errorf("factory form should keep the utl param, got %v", got.ParamNames)
	}
	if !strings.Contains(got.Code, "FACTOR") {
		t.Errorf("factory body (one-time setup) should survive, got:\n%s", got.Code)
	}
	if got.IDInjectText != ", '"+got.ID+"'" {
		t.Errorf("factory form must also inject the id, got %q", got.IDInjectText)
	}
}

func TestExtractRegistration_SameBodyTwoBindingsIsOneEntry(t *testing.T) {
	// Two bindings, one body. They are the same function however it was named,
	// so they share an id and collapse to one entry. Both call sites are still
	// rewritten to it; RawEntries is what keeps the duplicate site's offsets.
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerPureFn} from '@mionjs/run-types';
export const first = registerPureFn((n: number): number => n);
export const second = registerPureFn((n: number): number => n);`,
	})
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	if len(entries) != 1 {
		t.Fatalf("one body is one entry, got %d: %+v", len(entries), entries)
	}
}

func TestExtractRegistration_DifferentBodiesAreDifferentIDs(t *testing.T) {
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerPureFn} from '@mionjs/run-types';
export const first = registerPureFn((n: number): number => n);
export const second = registerPureFn((n: number): number => n + 1);`,
	})
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	if len(entries) != 2 {
		t.Fatalf("expected 2 entries, got %d: %+v", len(entries), entries)
	}
	if entries[0].ID == entries[1].ID {
		t.Errorf("two bodies must not share an id: %q", entries[0].ID)
	}
}

func TestExtractRegistration_SameBodyTwoFilesOnePackage(t *testing.T) {
	// One package, two files, one body. The id says who owns the function and
	// hashes the function, and neither half distinguishes these, so the package
	// ships it once and both call sites resolve to it.
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerPureFn} from '@mionjs/run-types';
export const slugify = registerPureFn((s: string): string => s.toLowerCase());`,
		"b.ts": `
import {registerPureFn} from '@mionjs/run-types';
export const slugify = registerPureFn((s: string): string => s.toLowerCase());`,
	})
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	if len(entries) != 1 {
		t.Fatalf("one body is one entry however many files hold it, got %d: %+v", len(entries), entries)
	}
}

func TestExtractRegistration_NamelessDedupsByBody(t *testing.T) {
	// A registration bound to NO name (handed straight to a wrapper) is
	// identified by its body, so two structurally identical ones in one file
	// collapse to a single entry.
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerPureFn, type PureFunction, type InjectPureFnId} from '@mionjs/run-types';
function use<F extends (...args: any[]) => any>(fn: PureFunction<F>, id?: InjectPureFnId<F>) {
  return registerPureFn(fn as never, id as never);
}
export const a = [use((n: number): number => n * 2), use((n: number): number => n * 2)];`,
	})
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	if len(entries) != 1 {
		t.Fatalf("equal nameless bodies should collapse to 1 entry, got %d: %+v", len(entries), entries)
	}
	// An id says who owns the pure fn and hashes its body, whether or not the
	// registration was bound to anything.
	if !strings.HasPrefix(entries[0].ID, idPrefix) {
		t.Errorf("an id should name the package that owns it, got %q", entries[0].ID)
	}
	_, hash, ok := SplitID(entries[0].ID)
	if !ok || len(hash) != bodyHashLength {
		t.Errorf("an id's hash half should be %d chars, got %q", bodyHashLength, hash)
	}
}

func TestExtractRegistration_ExplicitIDAccepted(t *testing.T) {
	// The id the build would inject, written at the call site: this is what a
	// package built by plain tsc does, and it must extract exactly as if the
	// build had injected it.
	source := `
import {registerPureFn} from '@mionjs/run-types';
export const double = registerPureFn((n: number): number => n * 2%s);`
	computed, _ := extractFromOverlay(t, map[string]string{"a.ts": fmt.Sprintf(source, "")})
	if len(computed) != 1 {
		t.Fatalf("expected the fixture to extract once, got %+v", computed)
	}
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": fmt.Sprintf(source, ", '"+computed[0].ID+"'"),
	})
	if len(diags) != 0 {
		t.Fatalf("an explicit id that matches the computed one must be accepted: %+v", diags)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	if entries[0].IDInjectText != "" {
		t.Errorf("an id already written must not be spliced again, got %q", entries[0].IDInjectText)
	}
}

func TestExtractRegistration_ExplicitIDMismatch_PFE9014(t *testing.T) {
	// A hand-pasted or stale id would register the body under one id while every
	// reference to it uses the other, so it yields no entry at all.
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerPureFn} from '@mionjs/run-types';
export const double = registerPureFn((n: number): number => n * 2, '@acme/app/a#somethingElse');`,
	})
	if len(entries) != 0 {
		t.Fatalf("a mismatched id must yield no entry, got %+v", entries)
	}
	if len(diags) != 1 || diags[0].Code != CodePureFnIdMismatch {
		t.Fatalf("expected one PFE9014, got %+v", diags)
	}
	if len(diags[0].Args) != 2 || diags[0].Args[0] != "@acme/app/a#somethingElse" || !strings.HasPrefix(diags[0].Args[1], idPrefix) {
		t.Errorf("expected (written, computed) args, got %v", diags[0].Args)
	}
}

func TestExtractRegistration_ThroughDirectWrapper(t *testing.T) {
	// A library wrapper forwards the InjectPureFnId + PureFunction (direct)
	// markers. Its consumer call site is recognised by BRAND (not callee name)
	// and gets the id of ITS OWN location, not the wrapper's.
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerPureFn, type PureFunction, type InjectPureFnId} from '@mionjs/run-types';
function mapFrom<F extends (...args: any[]) => any>(mapper: PureFunction<F>, id?: InjectPureFnId<F>) {
  if (!id) throw new Error('build did not run');
  return registerPureFn(mapper, id);
}
export const lower = mapFrom((s: string): string => s.toLowerCase());`,
	})
	if len(diags) != 0 {
		t.Fatalf("wrapper extraction diagnostics: %+v", diags)
	}
	if len(entries) != 1 {
		t.Fatalf("wrapper consumer call must extract exactly one entry, got %d: %+v", len(entries), entries)
	}
	if entries[0].BindingName != "lower" || !strings.HasPrefix(entries[0].ID, idPrefix) {
		t.Errorf("id = %q (bound to %q), want an id under %q", entries[0].ID, entries[0].BindingName, idPrefix)
	}
}

func TestExtractRegistration_ThroughFactoryWrapper(t *testing.T) {
	// The factory-form wrapper forwards PureFunctionFactory + InjectPureFnId.
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerPureFnFactory, type PureFunctionFactory, type InjectPureFnId, type RTUtils} from '@mionjs/run-types';
function registerAcmeFactory<F extends (utl: RTUtils) => any>(cf: PureFunctionFactory<F>, id?: InjectPureFnId<F>) {
  if (!id) throw new Error('build did not run');
  return registerPureFnFactory(cf, id);
}
export const lower = registerAcmeFactory(function () {
  return (s: string): string => s.toLowerCase();
});`,
	})
	if len(diags) != 0 || len(entries) != 1 {
		t.Fatalf("factory wrapper extraction: entries=%d diags=%+v", len(entries), diags)
	}
	if entries[0].BindingName != "lower" || !strings.HasPrefix(entries[0].ID, idPrefix) {
		t.Errorf("id = %q (bound to %q), want an id under %q", entries[0].ID, entries[0].BindingName, idPrefix)
	}
}

func TestExtractRegistration_ThroughLeadingParamWrapper(t *testing.T) {
	// The real mion inputFrom shape: a leading non-marker param before the marker
	// pair. The marker positions are DISCOVERED (slots 1/2 here) and the id
	// splices at its declared slot.
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerPureFn, type PureFunction, type InjectPureFnId} from '@mionjs/run-types';
function inputFrom<Source, MappedInput>(
  source: Source,
  mapper: PureFunction<(value: Source) => MappedInput>,
  id?: InjectPureFnId<(value: Source) => MappedInput>
): unknown {
  if (!id) throw new Error('build did not run');
  return registerPureFn(mapper as never, id as never);
}
const source = {id: 1};
export const mapped = inputFrom(source, (customer: {id: number}): number => customer.id * 2);`,
	})
	if len(diags) != 0 {
		t.Fatalf("leading-param wrapper diagnostics: %+v", diags)
	}
	if len(entries) != 1 {
		t.Fatalf("expected one entry, got %d: %+v", len(entries), entries)
	}
	if entries[0].BindingName != "mapped" || !strings.HasPrefix(entries[0].ID, idPrefix) {
		t.Errorf("id = %q (bound to %q), want an id under %q", entries[0].ID, entries[0].BindingName, idPrefix)
	}
	if want := ", '" + entries[0].ID + "'"; entries[0].IDInjectText != want {
		t.Errorf("id inject text = %q, want %q (slot 2, no padding)", entries[0].IDInjectText, want)
	}
	if entries[0].IDInjectPos == 0 {
		t.Errorf("id inject position must be set")
	}
}

func TestExtractRegistration_IDSlotPaddingAcrossOptionalGap(t *testing.T) {
	// A wrapper with an optional non-marker param BETWEEN the fn and the id:
	// injecting at the id's declared slot pads the gap with `undefined`.
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerPureFn, type PureFunction, type InjectPureFnId} from '@mionjs/run-types';
function registerWithOpts<F extends (...args: any[]) => any>(
  fn: PureFunction<F>,
  opts?: {label?: string},
  id?: InjectPureFnId<F>
): unknown {
  if (!id) throw new Error('build did not run');
  return registerPureFn(fn as never, id as never);
}
export const padded = registerWithOpts((n: number): number => n + 1);`,
	})
	if len(diags) != 0 || len(entries) != 1 {
		t.Fatalf("optional-gap wrapper extraction: entries=%d diags=%+v", len(entries), diags)
	}
	if want := ", undefined, '" + entries[0].ID + "'"; entries[0].IDInjectText != want {
		t.Errorf("id inject text = %q, want %q (one undefined pad for the skipped opts slot)", entries[0].IDInjectText, want)
	}
}

func TestExtractRegistration_Replacements(t *testing.T) {
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerPureFn} from '@mionjs/run-types';
export const double = registerPureFn((n: number): number => n * 2);`,
	})
	if len(diags) != 0 || len(entries) != 1 {
		t.Fatalf("extraction failed: entries=%d diags=%+v", len(entries), diags)
	}
	reps := Replacements(entries, false)
	if len(reps) != 2 {
		t.Fatalf("a registration should yield 2 replacements (arg rewrite + id splice), got %d: %+v", len(reps), reps)
	}
	// One replacement rewrites the arg to a pf binding (ImportFrom set); the other
	// is a point insertion splicing the id literal (no ImportFrom).
	factoryRep, idRep := -1, -1
	for i, rep := range reps {
		if rep.ImportFrom != "" {
			factoryRep = i
		} else if rep.Start == rep.End {
			idRep = i
		}
	}
	if factoryRep < 0 || idRep < 0 {
		t.Fatalf("missing a replacement in %+v", reps)
	}
	if !strings.HasPrefix(reps[factoryRep].Text, "__rt_pf") {
		t.Errorf("arg replacement text should be a pf binding, got %q", reps[factoryRep].Text)
	}
	if !strings.Contains(reps[idRep].Text, "'"+entries[0].ID+"'") {
		t.Errorf("id replacement should splice the entry id, got %q", reps[idRep].Text)
	}
}

func TestExtractRegistration_ForwardedArgNotExtracted(t *testing.T) {
	// A call whose arg is a forwarded identifier (not an inline function) — the
	// wrapper body's own registerPureFn(fn, id) — extracts nothing: PFN001 is the
	// resolver's job, so this pass bails quietly and the rewrite stays idempotent.
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerPureFn, type PureFunction, type InjectPureFnId} from '@mionjs/run-types';
export function reg<F extends (...args: any[]) => any>(fn: PureFunction<F>, id?: InjectPureFnId<F>) {
  return registerPureFn(fn, id);
}`,
	})
	if len(entries) != 0 {
		t.Fatalf("forwarded arg must not extract, got %d entries: %+v", len(entries), entries)
	}
	if len(diags) != 0 {
		t.Fatalf("forwarded arg must be a quiet no-op, got diags: %+v", diags)
	}
}

func TestExtractRegistration_HollowNotExtracted(t *testing.T) {
	// A hollowed registration (`null` where the factory was) has no body to
	// extract, and re-scanning one must stay a quiet no-op.
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerPureFn} from '@mionjs/run-types';
export const double = registerPureFn(null);`,
	})
	if len(entries) != 0 || len(diags) != 0 {
		t.Fatalf("a hollow registration must extract nothing quietly, got entries=%+v diags=%+v", entries, diags)
	}
}
