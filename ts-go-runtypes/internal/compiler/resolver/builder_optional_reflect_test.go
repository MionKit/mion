package resolver_test

import (
	"fmt"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// Regression for the cold value-first schema reflection bug: reflecting a
// schema built with `optional(...)` — `getRunType(object({ note: optional(...) }))`
// — must resolve the MODELED type (`{ note?: string }`), not leak the schema's
// internal `ObjectType<C>` / `PropModCarrier` / `RunType` wrapper types. Cold
// (first scan, before tsgo has instantiated the schema builder types) tsgo does
// not reduce the `ObjectOptionalOnly<C>` mapped/conditional type, so `FieldOf<C[K]>`
// is left unapplied and the raw field carriers get reflected.
//
// The overlay mirrors the REAL schema types (packages/ts-runtypes/src/builders/
// static.ts + compose.ts): PropModCarrier / FieldOf / ObjectType / ObjectOptionalOnly
// (each modifier tier `Flatten`ed into one literal, as in static.ts — so the
// cold-scan resolver must see through that extra homomorphic map too), plus
// `object` / `optional` / `string` builders and the two `getRunType` overloads.
const builderOptionalDTS = `declare module '@ts-runtypes/core' {
  export type InjectRunTypeId<T> = string & {readonly __rtInjectRunTypeIdBrand?: T};
  export type CompTimeArgs<T> = T;
  export interface RunType<T = unknown> { readonly id: string; }
  export type InferType<R> = R extends RunType<infer T> ? T : never;
  export interface PropModifiers { optional?: true; readonly?: true; }
  export interface PropModCarrier<M extends PropModifiers, F> { readonly __propMod: M; readonly __field: F; }
  export type FieldOf<V> = V extends {__propMod: PropModifiers; __field: unknown} ? InferType<V['__field']> : InferType<V>;
  export type IsOptional<V> = V extends {__propMod: {optional: true}} ? true : false;
  export type IsReadonly<V> = V extends {__propMod: {readonly: true}} ? true : false;
  export type AnyOptional<C> = true extends {[K in keyof C]: IsOptional<C[K]>}[keyof C] ? true : false;
  export type AnyReadonly<C> = true extends {[K in keyof C]: IsReadonly<C[K]>}[keyof C] ? true : false;
  type Flatten<T> = { [K in keyof T]: T[K] };
  type ObjectOptionalOnly<C> = Flatten<{
    -readonly [K in keyof C as IsOptional<C[K]> extends true ? never : K]: FieldOf<C[K]>;
  } & {
    -readonly [K in keyof C as IsOptional<C[K]> extends true ? K : never]?: FieldOf<C[K]>;
  }>;
  type ObjectReadonlyOnly<C> = Flatten<{
    -readonly [K in keyof C as IsReadonly<C[K]> extends true ? never : K]: FieldOf<C[K]>;
  } & {
    readonly [K in keyof C as IsReadonly<C[K]> extends true ? K : never]: FieldOf<C[K]>;
  }>;
  type ObjectMixed<C> = Flatten<{
    -readonly [K in keyof C as IsOptional<C[K]> extends true ? never : IsReadonly<C[K]> extends true ? never : K]: FieldOf<C[K]>;
  } & {
    readonly [K in keyof C as IsOptional<C[K]> extends true ? never : IsReadonly<C[K]> extends true ? K : never]: FieldOf<C[K]>;
  } & {
    -readonly [K in keyof C as IsOptional<C[K]> extends true ? (IsReadonly<C[K]> extends true ? never : K) : never]?: FieldOf<C[K]>;
  } & {
    readonly [K in keyof C as IsOptional<C[K]> extends true ? (IsReadonly<C[K]> extends true ? K : never) : never]?: FieldOf<C[K]>;
  }>;
  export type ObjectType<C> =
    AnyOptional<C> extends false
      ? AnyReadonly<C> extends false
        ? {-readonly [K in keyof C]: FieldOf<C[K]>}
        : ObjectReadonlyOnly<C>
      : AnyReadonly<C> extends false
        ? ObjectOptionalOnly<C>
        : ObjectMixed<C>;
  export function string(id?: InjectRunTypeId<string>): RunType<string>;
  export function optional<const F>(field: CompTimeArgs<F>): PropModCarrier<{optional: true}, F>;
  export function object<const C extends Record<string, unknown>>(config: CompTimeArgs<C>, id?: InjectRunTypeId<ObjectType<C>>): RunType<ObjectType<C>>;
  export function getRunType<T>(schema: RunType<T>, id?: InjectRunTypeId<T>): RunType<T>;
  export function getRunType<T>(value?: T, id?: InjectRunTypeId<T>): RunType<T>;
}
`

// leakedBuilderTypeNames are the schema-internal names that must NEVER surface in
// reflection (the cold-scan leak dumped these into the bundle as dead entries).
var leakedBuilderTypeNames = map[string]bool{
	"RunType": true, "PropModCarrier": true, "ObjectOptionalOnly": true,
	"ObjectType": true, "ObjectReadonlyOnly": true, "ObjectMixed": true,
	"FormatAnnotation": true, "PropModifiers": true, "Flatten": true,
}

// TestBuilderOptionalReflect_ColdModeledType is the regression guard: on a COLD
// scan (fresh resolver, so tsgo hasn't yet instantiated the schema builder types)
// reflecting a value-first schema that uses `optional(...)` must resolve the
// MODELED type ({ note?: string }) — an anonymous object literal — and must NOT
// leak the schema's internal `ObjectOptionalOnly<C>` / `PropModCarrier` / `RunType`
// wrapper types into the cache or the emitted bundle.
func TestBuilderOptionalReflect_ColdModeledType(t *testing.T) {
	const code = `import {getRunType, object, optional, string} from '@ts-runtypes/core';
getRunType(object({ note: optional(string()) }));
`
	r := setupInline(t, map[string]string{"runtypes.d.ts": builderOptionalDTS, "test.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"test.ts"}})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}

	types := dump(r)
	byID := map[string]*protocol.RunType{}
	for _, rt := range types {
		byID[rt.ID] = rt
		if leakedBuilderTypeNames[rt.TypeName] {
			t.Errorf("schema-internal type leaked into the runtype cache: %q (id %s)", rt.TypeName, rt.ID)
		}
	}
	// The reachable graph is tiny ({ note?: string } = root + property + string);
	// the pre-fix cold leak dumped ~13 dead entries here.
	if len(types) > 5 {
		t.Errorf("cache has %d runtypes; expected <=5 for { note?: string } — dead schema entries leaked:\n%s", len(types), dumpTypeNames(types))
	}

	if len(resp.Sites) != 1 {
		t.Fatalf("expected 1 site, got %d", len(resp.Sites))
	}
	root := byID[resp.Sites[0].ID]
	if root == nil {
		t.Fatalf("root site %s missing from cache", resp.Sites[0].ID)
	}
	if root.Kind != protocol.KindObjectLiteral {
		t.Errorf("root kind = %d, want KindObjectLiteral (%d)", root.Kind, protocol.KindObjectLiteral)
	}
	if root.TypeName != "" {
		t.Errorf("root TypeName = %q, want anonymous (the schema alias must not surface)", root.TypeName)
	}
	note := findMember(types, root, "note")
	if note == nil {
		t.Fatalf("root has no 'note' member; children=%d", len(root.Children))
	}
	if !note.Optional {
		t.Errorf("'note' should be optional")
	}
	if note.Child == nil {
		t.Fatalf("'note' has no child type")
	}
	if child := byID[note.Child.ID]; child == nil || child.Kind != protocol.KindString {
		t.Errorf("'note' child kind = %v, want KindString (%d)", child, protocol.KindString)
	}
}

func dumpTypeNames(types []*protocol.RunType) string {
	out := ""
	for _, rt := range types {
		out += fmt.Sprintf("  id=%s kind=%d typeName=%q name=%q\n", rt.ID, rt.Kind, rt.TypeName, rt.Name)
	}
	return out
}
