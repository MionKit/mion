package resolver_test

// provenance_scope_test.go pins WHICH call sites a runtype finding is reported
// at. Two axes decide it, and both used to be ignored, so one deliberate
// alwaysThrow type made thousands of healthy call sites report that the
// function they built always fails:
//
//   - DEPTH. A ScopeRoot code is about the type at the ROOT of a marker call.
//     Provenance is inherited down the type graph (so a child-position warning
//     reaches the site that pulled the member in), and a root code riding that
//     inheritance landed on every site that merely CONTAINED the type.
//   - FAMILY. A finding belongs to one family's entry (CES001 to the exact-shape
//     clone, PJ001 to the JSON encoder). Provenance keyed by type id alone told
//     every site that named the type about every other family's finding.
//
// The two "one level deeper" / "one family over" twins below are the detectors
// CLAUDE.md asks for: same trigger, moved off the position the code is about.

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// diagSitesFor collects the files one code was reported at, by basename.
func diagSitesFor(resp protocol.Response, code string) []string {
	var sites []string
	for _, diagnostic := range resp.Diagnostics {
		if diagnostic.Code != code {
			continue
		}
		sites = append(sites, shortFile(diagnostic.Site.FilePath))
	}
	return sites
}

// shortFile reduces an overlay path to its basename so assertions read.
func shortFile(path string) string {
	if slash := strings.LastIndexByte(path, '/'); slash >= 0 {
		return path[slash+1:]
	}
	return path
}

// wholeProgram dispatches the build pass, which renders every demanded entry
// across every file (the lane a project's own build runs).
func wholeProgram(t testing.TB, sources map[string]string) protocol.Response {
	t.Helper()
	response := setupInline(t, sources).Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if response.Error != "" {
		t.Fatalf("generate: %s", response.Error)
	}
	return response
}

// A root-position code reports ONLY where the bad type was named, never at a
// site that reaches it as a member. `b.ts` asks for a JSON encoder of a bare
// `never` (the deliberate alwaysThrow shape a suite pins); `a.ts` merely
// validates an object that contains a `never` property, and its validator works.
func TestProvenanceScope_RootCodeSkipsSitesThatOnlyReachTheType(t *testing.T) {
	response := wholeProgram(t, map[string]string{
		"a.ts": `import {createValidateFn} from '@mionjs/run-types';
export const holder = createValidateFn<{nothing: never}>();
`,
		"b.ts": `import {createJsonEncoderFn} from '@mionjs/run-types';
export const bare = createJsonEncoderFn<never>();
`,
	})
	sites := diagSitesFor(response, diagnostics.CodePJSNeverRoot)
	for _, site := range sites {
		if site == "a.ts" {
			t.Errorf("%s reported at a.ts, which only CONTAINS the never: sites=%v", diagnostics.CodePJSNeverRoot, sites)
		}
	}
	if len(sites) == 0 {
		t.Fatalf("%s must still report at the site that named `never`; diagnostics=%v", diagnostics.CodePJSNeverRoot, codesOf(response))
	}
}

// The same finding one level deeper is a CHILD-position code, and that one DOES
// ride the inheritance: the site that pulled the member in is told its member
// was dropped. This is the twin of the test above and the guard against fixing
// the root axis by switching inheritance off.
func TestProvenanceScope_GraphCodeStillReachesTheContainingSite(t *testing.T) {
	response := wholeProgram(t, map[string]string{
		"a.ts": `import {createJsonEncoderFn} from '@mionjs/run-types';
export const holder = createJsonEncoderFn<{token: symbol; name: string}>();
`,
	})
	sites := diagSitesFor(response, diagnostics.CodePJSNonSerializablePropDrop)
	if len(sites) == 0 {
		t.Fatalf("a dropped member must be reported at the site that asked for the object; diagnostics=%v", codesOf(response))
	}
	for _, site := range sites {
		if site != "a.ts" {
			t.Errorf("unexpected site %s for %s: sites=%v", site, diagnostics.CodePJSNonSerializablePropDrop, sites)
		}
	}
}

// A finding belongs to the family whose entry raised it. Both files name the
// SAME union; only `b.ts` asks for the exact-shape clone that refuses it, so
// `a.ts`'s validator must not be told its function always fails.
func TestProvenanceScope_FamilyCodeSkipsSitesDemandingAnotherFamily(t *testing.T) {
	response := wholeProgram(t, map[string]string{
		"shared.ts": `export type Shape = {a: string} | {b: number};
`,
		"a.ts": `import {createValidateFn} from '@mionjs/run-types';
import type {Shape} from './shared.ts';
export const isShape = createValidateFn<Shape>();
`,
		"b.ts": `import {createCloneExactShapeFn} from '@mionjs/run-types';
import type {Shape} from './shared.ts';
export const clone = createCloneExactShapeFn<Shape>();
`,
	})
	sites := diagSitesFor(response, diagnostics.CodeCESUnionRoot)
	if len(sites) == 0 {
		t.Fatalf("%s must report at the clone site; diagnostics=%v", diagnostics.CodeCESUnionRoot, codesOf(response))
	}
	for _, site := range sites {
		if site != "b.ts" {
			t.Errorf("%s reported at %s, which demanded no clone: sites=%v", diagnostics.CodeCESUnionRoot, site, sites)
		}
	}
}

// getRunTypeId asks for an id, not a function, so a reflection-only site is
// never told that some other site's function fails. Paired call shapes per the
// marker test coverage rule: static `getRunTypeId<T>()` and value-inferred
// `getRunTypeId(value)`.
func TestProvenanceScope_StaticIdSiteHearsNoFamilyFinding(t *testing.T) {
	response := wholeProgram(t, map[string]string{
		"a.ts": `import {getRunTypeId} from '@mionjs/run-types';
export type Shape = {a: string} | {b: number};
export const id = getRunTypeId<Shape>();
`,
		"b.ts": `import {createCloneExactShapeFn} from '@mionjs/run-types';
import type {Shape} from './a.ts';
export const clone = createCloneExactShapeFn<Shape>();
`,
	})
	assertOnlyCloneSiteReports(t, response)
}

func TestProvenanceScope_ValueIdSiteHearsNoFamilyFinding(t *testing.T) {
	response := wholeProgram(t, map[string]string{
		"a.ts": `import {getRunTypeId} from '@mionjs/run-types';
export type Shape = {a: string} | {b: number};
const sample: Shape = {a: 'x'};
export const id = getRunTypeId(sample);
`,
		"b.ts": `import {createCloneExactShapeFn} from '@mionjs/run-types';
import type {Shape} from './a.ts';
export const clone = createCloneExactShapeFn<Shape>();
`,
	})
	assertOnlyCloneSiteReports(t, response)
}

func assertOnlyCloneSiteReports(t *testing.T, response protocol.Response) {
	t.Helper()
	sites := diagSitesFor(response, diagnostics.CodeCESUnionRoot)
	if len(sites) == 0 {
		t.Fatalf("%s must report at the clone site; diagnostics=%v", diagnostics.CodeCESUnionRoot, codesOf(response))
	}
	for _, site := range sites {
		if site != "b.ts" {
			t.Errorf("%s reported at %s, which only asked for an id: sites=%v", diagnostics.CodeCESUnionRoot, site, sites)
		}
	}
}
