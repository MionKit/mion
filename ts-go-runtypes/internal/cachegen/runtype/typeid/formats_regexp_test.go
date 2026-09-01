package typeid_test

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// These tests prove the regex VALUE is recoverable from the type system
// — not the erased `RegExp` interface shape — by walking the
// registerFormatPattern({regexp: /…/, …}) call AST from `typeof p`.
// Mirrors the reference deepkit-transformer behaviour, which is likewise an
// AST-level read, not a type-level one. (A regex's source can't live at
// the type level, so the call-site AST is the only door.)

// scanFormatPattern scans `pattern: typeof p` where p is built by a
// registerFormatPattern({...}) call and returns the resolved pattern
// object from FormatAnnotation.Params.
func scanFormatPattern(t *testing.T, constDecl string) (*reflection.RunType, map[string]any) {
	t.Helper()
	root := runFormatScan(t, `
import {getRunTypeId} from '@mionjs/run-types';
import type {TypeFormat} from '@mionjs/run-types';
interface FormatPattern { readonly __fmtPatternBrand: true }
declare function registerFormatPattern(args: {regexp: RegExp; mockSamples: readonly string[]; message?: string}): FormatPattern;
`+constDecl+`
type Branded = TypeFormat<string, 'stringFormat', {pattern: typeof p}>;
getRunTypeId<Branded>();
`)
	if root.FormatAnnotation == nil {
		t.Fatalf("expected FormatAnnotation, got nil")
	}
	pattern, _ := root.FormatAnnotation.Params["pattern"].(map[string]any)
	return root, pattern
}

func TestFormatPattern_RecoversSourceAndFlags(t *testing.T) {
	_, pattern := scanFormatPattern(t,
		`const p = registerFormatPattern({regexp: /^[a-z0-9]+\.[a-z]{2,}$/i, mockSamples: ['mion.io']});`)
	if pattern == nil {
		t.Fatalf("expected a resolved pattern object")
	}
	if pattern["source"] != `^[a-z0-9]+\.[a-z]{2,}$` {
		t.Fatalf("recovered source = %q, want the original pattern", pattern["source"])
	}
	if pattern["flags"] != "i" {
		t.Fatalf("recovered flags = %q, want \"i\"", pattern["flags"])
	}
}

func TestFormatPattern_DistinctPatternsDistinctID(t *testing.T) {
	a, _ := scanFormatPattern(t, `const p = registerFormatPattern({regexp: /^[a-z]+$/, mockSamples: ['abc']});`)
	b, _ := scanFormatPattern(t, `const p = registerFormatPattern({regexp: /^[0-9]+$/, mockSamples: ['123']});`)
	if a.ID == b.ID {
		t.Fatalf("two different regexes must hash to distinct ids; both got %q", a.ID)
	}
}

func TestFormatPattern_SamePatternSameID(t *testing.T) {
	decl := `const p = registerFormatPattern({regexp: /^[a-z]+$/u, mockSamples: ['abc']});`
	a, _ := scanFormatPattern(t, decl)
	b, _ := scanFormatPattern(t, decl)
	if a.ID != b.ID {
		t.Fatalf("identical regexes must share one id; got %q vs %q", a.ID, b.ID)
	}
}

// Boundary: a `declare const p: FormatPattern` (no initializer — the
// shape a published .d.ts ships) is NOT traceable. The pattern object
// then carries no recovered source. Documents the limit of AST
// recovery: it needs a visible literal initializer, which is why the
// built-in formats use an inline string-literal source instead.
func TestFormatPattern_DeclareConstNotRecovered(t *testing.T) {
	_, pattern := scanFormatPattern(t, `declare const p: FormatPattern;`)
	if pattern != nil {
		if _, ok := pattern["source"]; ok {
			t.Fatalf("a declare-const FormatPattern has no initializer and must NOT yield a source: %#v", pattern)
		}
	}
}

// TestFormatPattern_ResolvedLiteralObject pins the "resolved object, not
// AST" guarantee: the pattern surfaces as a flat literal object
// {source, flags, mockSamples, message} — plain values the runtime reads
// without parsing, never the erased RegExp shape or AST nodes.
func TestFormatPattern_ResolvedLiteralObject(t *testing.T) {
	_, pattern := scanFormatPattern(t,
		`const p = registerFormatPattern({regexp: /^[a-z-]+$/, mockSamples: ['a-b', 'abc'], message: 'slug'});`)
	if pattern == nil {
		t.Fatalf("pattern is not a resolved object")
	}
	if pattern["source"] != "^[a-z-]+$" {
		t.Errorf("source = %#v, want the literal regex source", pattern["source"])
	}
	if pattern["flags"] != "" {
		t.Errorf("flags = %#v, want empty", pattern["flags"])
	}
	if pattern["message"] != "slug" {
		t.Errorf("message = %#v, want \"slug\"", pattern["message"])
	}
	samples, ok := pattern["mockSamples"].([]any)
	if !ok || len(samples) != 2 || samples[0] != "a-b" || samples[1] != "abc" {
		t.Errorf("mockSamples = %#v, want [\"a-b\",\"abc\"]", pattern["mockSamples"])
	}
}

// ─────────────────── value-first regex recovery ───────────────────
//
// In a value-first config (`define({slug: {type:'string', pattern: /…/}})`),
// the regex rides the VALUE channel, not the type channel: the property's TYPE
// erases to `RegExp`, but the homomorphic Omit/Pick mapped type behind
// `ModelType` preserves the property declaration, so the scanner recovers
// {source, flags} from the literal initializer. These tests mirror the
// `ModelType<typeof M>['field']` shape so the scanned type is the branded
// string directly.

// scanValueFirstPattern scans the named field of a value-first model and
// returns the recovered FormatAnnotation.Params["pattern"].
func scanValueFirstPattern(t *testing.T, decls, field string) map[string]any {
	t.Helper()
	root := runFormatScan(t, `
import {getRunTypeId} from '@mionjs/run-types';
import type {TypeFormat} from '@mionjs/run-types';
type FieldType<F> = F extends {type:'string'} ? TypeFormat<string,'stringFormat', Omit<F,'type'>> : never;
type ModelType<C> = { -readonly [K in keyof C]: FieldType<C[K]> };
`+decls+`
getRunTypeId<ModelType<typeof M>['`+field+`']>();
`)
	if root.FormatAnnotation == nil {
		t.Fatalf("expected FormatAnnotation on the field, got nil")
	}
	pattern, _ := root.FormatAnnotation.Params["pattern"].(map[string]any)
	return pattern
}

func TestFormatPattern_ValueFirstInlineRegex(t *testing.T) {
	pattern := scanValueFirstPattern(t,
		`const M = { slug: { type: 'string' as const, pattern: /^[a-z0-9-]+$/i } };`, "slug")
	if pattern == nil {
		t.Fatalf("inline /…/ value did not yield a recovered pattern")
	}
	if pattern["source"] != "^[a-z0-9-]+$" {
		t.Errorf("source = %#v, want the inline regex source", pattern["source"])
	}
	if pattern["flags"] != "i" {
		t.Errorf("flags = %#v, want \"i\"", pattern["flags"])
	}
}

func TestFormatPattern_ValueFirstSourceFlagsObject(t *testing.T) {
	pattern := scanValueFirstPattern(t,
		`const M = { digits: { type: 'string' as const, pattern: {source: '^[0-9]+$', flags: 'g'} } };`, "digits")
	if pattern == nil || pattern["source"] != "^[0-9]+$" || pattern["flags"] != "g" {
		t.Fatalf("{source,flags} value not recovered: %#v", pattern)
	}
}

func TestFormatPattern_ValueFirstRegisterFormatPatternValue(t *testing.T) {
	// `pattern: p` where p is a registerFormatPattern(...) const — recovered by
	// resolving the identifier to its initializer call (mockSamples included).
	pattern := scanValueFirstPattern(t, `
interface FormatPattern { readonly __fmtPatternBrand: true }
declare function registerFormatPattern(args: {regexp: RegExp; mockSamples: readonly string[]}): FormatPattern;
const p = registerFormatPattern({regexp: /^[0-9a-f]+$/i, mockSamples: ['dead']});
const M = { hex: { type: 'string' as const, pattern: p } };`, "hex")
	if pattern == nil || pattern["source"] != "^[0-9a-f]+$" || pattern["flags"] != "i" {
		t.Fatalf("registerFormatPattern value not recovered: %#v", pattern)
	}
	if samples, ok := pattern["mockSamples"].([]any); !ok || len(samples) != 1 || samples[0] != "dead" {
		t.Errorf("mockSamples = %#v, want [\"dead\"]", pattern["mockSamples"])
	}
}

// Value-first inline regex and the type-first {source,flags} form for the same
// pattern must hash to one id — identical recovered {source, flags}.
func TestFormatPattern_ValueFirstConvergesWithTypeFirst(t *testing.T) {
	valueFirst := runFormatScan(t, `
import {getRunTypeId} from '@mionjs/run-types';
import type {TypeFormat} from '@mionjs/run-types';
type FieldType<F> = F extends {type:'string'} ? TypeFormat<string,'stringFormat', Omit<F,'type'>> : never;
type ModelType<C> = { -readonly [K in keyof C]: FieldType<C[K]> };
const M = { slug: { type: 'string' as const, pattern: /^[a-z-]+$/ } };
getRunTypeId<ModelType<typeof M>['slug']>();
`)
	typeFirst := runFormatScan(t, `
import {getRunTypeId} from '@mionjs/run-types';
import type {TypeFormat} from '@mionjs/run-types';
getRunTypeId<TypeFormat<string, 'stringFormat', {pattern: {source: '^[a-z-]+$'; flags: ''}}>>();
`)
	if valueFirst.ID != typeFirst.ID {
		t.Fatalf("value-first inline regex (%s) must converge with type-first {source,flags} (%s)", valueFirst.ID, typeFirst.ID)
	}
}

// `satisfies`-wrapped pattern values must recover exactly like bare ones —
// the recovery shares comptimeargs.UnwrapWrappers with the CompTimeArgs
// validation, so a wrapper the validation accepts can't silently drop the
// pattern at recovery time.
func TestFormatPattern_ValueFirstSatisfiesObject(t *testing.T) {
	pattern := scanValueFirstPattern(t,
		`const M = { digits: { type: 'string' as const, pattern: ({source: '^[0-9]+$', flags: 'g'} satisfies {source: string; flags?: string}) } };`, "digits")
	if pattern == nil || pattern["source"] != "^[0-9]+$" || pattern["flags"] != "g" {
		t.Fatalf("satisfies-wrapped {source,flags} value not recovered: %#v", pattern)
	}
}
