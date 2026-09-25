package resolver_test

import (
	"sort"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// A parameter typed through a user alias over a marker (`type Slot<T> = InjectRunTypeId<T>`) loses the marker's
// alias name, so it is matched by its brand property only. It must still inject the id of its real type argument,
// never the id of `unknown`. Paired static / reflect tests per the marker test coverage rule.

// scanSitesByPos scans one inline file and returns its sites in source order.
func scanSitesByPos(t *testing.T, code string) []protocol.Site {
	t.Helper()
	r := setupInline(t, map[string]string{"a.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}
	sites := append([]protocol.Site(nil), resp.Sites...)
	sort.Slice(sites, func(i, j int) bool { return sites[i].Pos < sites[j].Pos })
	return sites
}

// assertWrappedMatchesDirect checks sites laid out as [direct, wrapped, unknown].
func assertWrappedMatchesDirect(t *testing.T, sites []protocol.Site) {
	t.Helper()
	if len(sites) != 3 {
		t.Fatalf("expected 3 sites (direct, wrapped, unknown), got %d: %+v", len(sites), sites)
	}
	direct, wrapped, unknownSite := sites[0], sites[1], sites[2]
	if wrapped.ID == unknownSite.ID {
		t.Fatalf("the alias-wrapped marker injected the id of `unknown` (%s)", wrapped.ID)
	}
	if wrapped.ID != direct.ID {
		t.Fatalf("the alias-wrapped marker must inject the same id as the direct marker: wrapped %s, direct %s", wrapped.ID, direct.ID)
	}
}

func TestMarkerAliasWrapped_InjectRunTypeId_Static(t *testing.T) {
	sites := scanSitesByPos(t, `import {getRunTypeId, type InjectRunTypeId} from '@mionjs/run-types';
type Slot<T> = InjectRunTypeId<T>;
function wrap<T>(val?: T, id?: Slot<T>): string {
  return getRunTypeId<T>(undefined, id);
}
export const direct = getRunTypeId<{a: number}>();
export const wrapped = wrap<{a: number}>();
export const unknownId = getRunTypeId<unknown>();
`)
	assertWrappedMatchesDirect(t, sites)
}

func TestMarkerAliasWrapped_InjectRunTypeId_Reflect(t *testing.T) {
	sites := scanSitesByPos(t, `import {getRunTypeId, type InjectRunTypeId} from '@mionjs/run-types';
type Slot<T> = InjectRunTypeId<T>;
function wrap<T>(val?: T, id?: Slot<T>): string {
  return getRunTypeId<T>(undefined, id);
}
const value: {a: number} = {a: 1};
const unknownValue: unknown = 1;
export const direct = getRunTypeId(value);
export const wrapped = wrap(value);
export const unknownId = getRunTypeId(unknownValue);
`)
	assertWrappedMatchesDirect(t, sites)
}

// The router shape that surfaced the bug: a multi-parameter alias whose argument is built from its parameters.
// Every call site got the same `unknown` id; different types must now get different ids.
func TestMarkerAliasWrapped_TupleSlot_Static(t *testing.T) {
	sites := scanSitesByPos(t, `import {getRunTypeId, type InjectRunTypeId} from '@mionjs/run-types';
type Slot<P, R> = InjectRunTypeId<[P, R]>;
function wrap<P, R>(val?: [P, R], id?: Slot<P, R>): string {
  return getRunTypeId<[P, R]>(undefined, id);
}
export const direct = getRunTypeId<[string, number]>();
export const wrapped = wrap<string, number>();
export const other = wrap<boolean, string>();
`)
	if len(sites) != 3 {
		t.Fatalf("expected 3 sites, got %d: %+v", len(sites), sites)
	}
	if sites[1].ID != sites[0].ID {
		t.Fatalf("Slot<string, number> must inject the id of [string, number]: got %s, want %s", sites[1].ID, sites[0].ID)
	}
	if sites[2].ID == sites[1].ID {
		t.Fatalf("two different Slot types injected the same id %s", sites[1].ID)
	}
}

func TestMarkerAliasWrapped_TupleSlot_Reflect(t *testing.T) {
	sites := scanSitesByPos(t, `import {getRunTypeId, type InjectRunTypeId} from '@mionjs/run-types';
type Slot<P, R> = InjectRunTypeId<[P, R]>;
function wrap<P, R>(val?: [P, R], id?: Slot<P, R>): string {
  return getRunTypeId<[P, R]>(undefined, id);
}
const first: [string, number] = ['a', 1];
const second: [boolean, string] = [true, 'b'];
export const direct = getRunTypeId(first);
export const wrapped = wrap(first);
export const other = wrap(second);
`)
	if len(sites) != 3 {
		t.Fatalf("expected 3 sites, got %d: %+v", len(sites), sites)
	}
	if sites[1].ID != sites[0].ID {
		t.Fatalf("Slot inferred from [string, number] must inject its id: got %s, want %s", sites[1].ID, sites[0].ID)
	}
	if sites[2].ID == sites[1].ID {
		t.Fatalf("two different Slot types injected the same id %s", sites[1].ID)
	}
}

// A wrapped InjectTypeFnArgs must keep both its type and its function families.
func TestMarkerAliasWrapped_InjectTypeFnArgs(t *testing.T) {
	sites := scanSitesByPos(t, `import {getRunTypeId, type InjectTypeFnArgs} from '@mionjs/run-types';
type ValidateSlot<T> = InjectTypeFnArgs<T, 'validate'>;
declare function direct<T>(val?: T, id?: InjectTypeFnArgs<T, 'validate'>): unknown;
declare function wrapped<T>(val?: T, id?: ValidateSlot<T>): unknown;
direct<{a: number}>();
wrapped<{a: number}>();
const value: {a: number} = {a: 1};
wrapped(value);
export const unknownId = getRunTypeId<unknown>();
`)
	if len(sites) != 4 {
		t.Fatalf("expected 4 sites, got %d: %+v", len(sites), sites)
	}
	directSite, wrappedStatic, wrappedReflect, unknownSite := sites[0], sites[1], sites[2], sites[3]
	if directSite.FnId == "" {
		t.Fatalf("the direct InjectTypeFnArgs site must carry a fnId: %+v", directSite)
	}
	for name, site := range map[string]protocol.Site{"static": wrappedStatic, "reflect": wrappedReflect} {
		if site.ID == unknownSite.ID {
			t.Fatalf("%s: the alias-wrapped InjectTypeFnArgs injected the id of `unknown`", name)
		}
		if site.ID != directSite.ID {
			t.Fatalf("%s: wrapped id %s, want the direct id %s", name, site.ID, directSite.ID)
		}
		if site.FnId != directSite.FnId {
			t.Fatalf("%s: wrapped fnId %q, want the direct fnId %q", name, site.FnId, directSite.FnId)
		}
	}
}

// A project's own look-alike brand, declared by an untrusted package and wrapped in an alias, stays inert: the
// brand property is read only when the trusted marker package declared it.
func TestMarkerAliasWrapped_UntrustedBrandStaysInert_Static(t *testing.T) {
	got := markerPackageProgram(t, `import {getRunTypeId, type InjectRunTypeId} from '@my-org/runtypes-markers';
type Slot<T> = InjectRunTypeId<T>;
declare function wrap<T>(val?: T, id?: Slot<T>): string;
wrap<string>();
`, marker.Options{})
	if got == nil {
		t.Fatal("expected the brand-property fallback to still emit a site")
	}
	if got.Kind != reflection.KindUnknown {
		t.Fatalf("an untrusted brand must not resolve its type argument, got kind %d", got.Kind)
	}
}

func TestMarkerAliasWrapped_UntrustedBrandStaysInert_Reflect(t *testing.T) {
	got := markerPackageProgram(t, `import {type InjectRunTypeId} from '@my-org/runtypes-markers';
type Slot<T> = InjectRunTypeId<T>;
declare function wrap<T>(val?: T, id?: Slot<T>): string;
const value: string = 'a';
wrap(value);
`, marker.Options{})
	if got == nil {
		t.Fatal("expected the brand-property fallback to still emit a site")
	}
	if got.Kind != reflection.KindString {
		t.Fatalf("expected KindString (T inferred from the argument, as before), got %d", got.Kind)
	}
}
