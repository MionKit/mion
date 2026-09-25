package resolver_test

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// nestedMarkerDecls declares a library's own markers shaped like the drizzle pair: neither returns a RunType,
// so neither is a builder the enclosing marker can reflect in its place.
const nestedMarkerDecls = `import {getRunTypeId, createValidateFn, type InjectRunTypeId, type RunType} from '@mionjs/run-types';
type Parents = {id: number};
type Children = {pid: number};
declare function tableFromType<T>(options?: {tables?: Record<string, unknown>}, id?: InjectRunTypeId<T>): {table: T};
declare function toDrizzle<T>(options?: {tables?: Record<string, unknown>}, id?: InjectRunTypeId<T>): {table: T};
declare function lookup<T>(id?: InjectRunTypeId<T>): RunType<T>;
`

// scanSites scans a.ts and fails on a scan error.
func scanSites(t *testing.T, src string) []protocol.Site {
	t.Helper()
	r := setupInline(t, map[string]string{"a.ts": src})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}
	return resp.Sites
}

// TestScan_NestedMarkerCallKeepsItsId pins that a marker call anywhere inside another marker call's arguments
// still gets its own id; the builder side is TestScan_GenuineNestedBuilderStillEnclosed.
func TestScan_NestedMarkerCallKeepsItsId(t *testing.T) {
	cases := map[string]string{
		"direct":             `export const c = toDrizzle<Children>({tables: {parents: tableFromType<Parents>()}});`,
		"arrow":              `export const c = toDrizzle<Children>({tables: {parents: () => tableFromType<Parents>()}});`,
		"createValidateFn":   `export const c = toDrizzle<Children>({tables: {parents: createValidateFn<Parents>()}});`,
		"userRunTypeWrapper": `export const c = toDrizzle<Children>({tables: {parents: lookup<Parents>()}});`,
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			assertNestedSites(t, scanSites(t, nestedMarkerDecls+body))
		})
	}
}

// assertNestedSites checks the outer and the nested call each got their own resolved id.
func assertNestedSites(t *testing.T, sites []protocol.Site) {
	t.Helper()
	if len(sites) != 2 {
		t.Fatalf("expected 2 sites (outer and nested marker call), got %d: %+v", len(sites), sites)
	}
	for _, site := range sites {
		if site.ID == "" {
			t.Fatalf("every site must carry a resolved id, got %+v", sites)
		}
	}
	if sites[0].ID == sites[1].ID {
		t.Fatalf("outer and nested calls name different types, got the same id %q", sites[0].ID)
	}
}

// hasSiteID reports whether one of the sites carries id.
func hasSiteID(sites []protocol.Site, id string) bool {
	for _, site := range sites {
		if site.ID == id {
			return true
		}
	}
	return false
}

// TestScan_NestedGetRunTypeId_Static pins the static shape nested in a marker call argument.
func TestScan_NestedGetRunTypeId_Static(t *testing.T) {
	assertNestedSites(t, scanSites(t, nestedMarkerDecls+`export const c = toDrizzle<Children>({tables: {parents: getRunTypeId<Parents>()}});`))
}

// TestScan_NestedGetRunTypeId_Reflect pins the value-first shape nested in a marker call argument, and that
// both shapes resolve to the id a top-level getRunTypeId<Parents>() gets.
func TestScan_NestedGetRunTypeId_Reflect(t *testing.T) {
	reflectSites := scanSites(t, nestedMarkerDecls+`const parent: Parents = {id: 1};
export const c = toDrizzle<Children>({tables: {parents: getRunTypeId(parent)}});`)
	assertNestedSites(t, reflectSites)
	staticSites := scanSites(t, nestedMarkerDecls+`export const c = toDrizzle<Children>({tables: {parents: getRunTypeId<Parents>()}});`)
	topLevel := scanSites(t, nestedMarkerDecls+`export const p = getRunTypeId<Parents>();`)
	if len(topLevel) != 1 || topLevel[0].ID == "" {
		t.Fatalf("expected 1 resolved top-level site, got %+v", topLevel)
	}
	parentsID := topLevel[0].ID
	if !hasSiteID(reflectSites, parentsID) || !hasSiteID(staticSites, parentsID) {
		t.Fatalf("both nested getRunTypeId shapes must resolve to Parents' id %q, got reflect %+v and static %+v", parentsID, reflectSites, staticSites)
	}
}
