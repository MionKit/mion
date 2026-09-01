// TypeDeps: the per-file set of source files that DECLARE the types a call
// site reflects. See docs/todos/unified-type-dependency-invalidation.md — a
// host declares these to its bundler so editing a type in ANOTHER file re-runs
// the file that reflects it, which no bundler can work out on its own (the
// import is erased, or never existed).
package resolver_test

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// transformDeps runs OpTransform for one file and returns its reported
// TypeDeps, reduced to basenames so assertions do not carry the temp dir.
func transformDeps(t *testing.T, session *resolver.Session, file string) []string {
	t.Helper()
	response := session.Dispatch(protocol.Request{Op: protocol.OpTransform, Files: []string{file}})
	if response.Error != "" {
		t.Fatalf("transform %s: %s", file, response.Error)
	}
	result, ok := response.Transformed[file]
	if !ok {
		t.Fatalf("transform %s: no TransformResult", file)
	}
	out := make([]string, 0, len(result.TypeDeps))
	for _, dep := range result.TypeDeps {
		out = append(out, filepath.Base(dep))
	}
	return out
}

func hasDep(deps []string, want string) bool {
	for _, dep := range deps {
		if dep == want {
			return true
		}
	}
	return false
}

func assertDep(t *testing.T, deps []string, want string) {
	t.Helper()
	if !hasDep(deps, want) {
		t.Fatalf("expected %q among the reported type deps, got %v", want, deps)
	}
}

func assertNoDep(t *testing.T, deps []string, unwanted string) {
	t.Helper()
	if hasDep(deps, unwanted) {
		t.Fatalf("did not expect %q among the reported type deps, got %v", unwanted, deps)
	}
}

// TestTypeDeps_ReportsDeclaringFile is the base case: the reflected type lives
// in another module, so that module must be reported. An unrelated file — one
// the program contains but this site's type never touches — must NOT be, or the
// mechanism is just the coarse stamp with extra steps.
func TestTypeDeps_ReportsDeclaringFile(t *testing.T) {
	session := setupInline(t, map[string]string{
		"models.ts":    `export interface Signup { email: string; age: number }`,
		"unrelated.ts": `export interface Unrelated { nothing: boolean }`,
		"uses.ts": `import {getRunTypeId} from '@mionjs/run-types';
import type {Signup} from './models.ts';
export const id = getRunTypeId<Signup>();
`,
	})
	deps := transformDeps(t, session, "uses.ts")
	assertDep(t, deps, "models.ts")
	assertNoDep(t, deps, "unrelated.ts")
}

// TestTypeDeps_AmbientDeclaration covers the case the Next adapter's invariant 7
// was proven on: a type declared in a .d.ts and never imported. There is
// genuinely no import edge for a bundler to follow, so if the walk does not
// report the file, nothing ever will.
func TestTypeDeps_AmbientDeclaration(t *testing.T) {
	session := setupInline(t, map[string]string{
		"ambient.d.ts": `declare interface AmbientUser { id: number; nickname: string }`,
		"uses.ts": `import {getRunTypeId} from '@mionjs/run-types';
export const id = getRunTypeId<AmbientUser>();
`,
	})
	deps := transformDeps(t, session, "uses.ts")
	assertDep(t, deps, "ambient.d.ts")
}

// TestTypeDeps_WarmCacheStillReports is the memoization trap, and the reason
// recording is keyed by wire id rather than hung off the type walk. assignID
// short-circuits on a warm pointer/structural cache, so the SECOND transform of
// a file walks nothing — and a collector attached to the walk would report an
// empty set there. Empty means "unknown" to every host, which degrades it to
// coarse invalidation on exactly the incremental-update path this exists for.
func TestTypeDeps_WarmCacheStillReports(t *testing.T) {
	session := setupInline(t, map[string]string{
		"models.ts": `export interface Signup { email: string; age: number }`,
		"uses.ts": `import {getRunTypeId} from '@mionjs/run-types';
import type {Signup} from './models.ts';
export const id = getRunTypeId<Signup>();
`,
	})
	first := transformDeps(t, session, "uses.ts")
	assertDep(t, first, "models.ts")

	second := transformDeps(t, session, "uses.ts")
	assertDep(t, second, "models.ts")
	if strings.Join(first, ",") != strings.Join(second, ",") {
		t.Fatalf("a warm transform reported different deps:\n cold: %v\n warm: %v", first, second)
	}
}

// TestTypeDeps_SharedIDAcrossFiles pins the structural-cache path. Two files
// declaring the SAME shape collapse to one wire id, and only the first is
// projected — so the second file's declaration is never walked. Editing either
// one changes the demanded id, so both must be reported, which is why
// recordDeclFiles unions on a structural hit instead of recording once.
func TestTypeDeps_SharedIDAcrossFiles(t *testing.T) {
	session := setupInline(t, map[string]string{
		"a.ts": `export interface ShapeA { same: string }`,
		"b.ts": `export interface ShapeB { same: string }`,
		"uses.ts": `import {getRunTypeId} from '@mionjs/run-types';
import type {ShapeA} from './a.ts';
import type {ShapeB} from './b.ts';
export const first = getRunTypeId<ShapeA>();
export const second = getRunTypeId<ShapeB>();
`,
	})
	deps := transformDeps(t, session, "uses.ts")
	assertDep(t, deps, "a.ts")
	assertDep(t, deps, "b.ts")
}

// TestTypeDeps_NestedTypeFile pins transitivity: the site names one type, but
// the file that declares a MEMBER's type is just as much a dependency — editing
// it changes the outer type's shape and therefore the injected fn.
func TestTypeDeps_NestedTypeFile(t *testing.T) {
	session := setupInline(t, map[string]string{
		"inner.ts": `export interface Address { street: string; zip: string }`,
		"outer.ts": `import type {Address} from './inner.ts';
export interface Customer { name: string; address: Address }
`,
		"uses.ts": `import {getRunTypeId} from '@mionjs/run-types';
import type {Customer} from './outer.ts';
export const id = getRunTypeId<Customer>();
`,
	})
	deps := transformDeps(t, session, "uses.ts")
	assertDep(t, deps, "outer.ts")
	assertDep(t, deps, "inner.ts")
}

// TestTypeDeps_FormEquivalence is the marker test coverage rule (CLAUDE.md):
// both call shapes of getRunTypeId, in their natural spelling, must resolve to
// the same cache entry — and therefore report the same type dependencies.
// Static form: the caller supplies T. Reflection form: T is inferred from a
// value. The hash equivalence is asserted through the injected id.
func TestTypeDeps_FormEquivalence(t *testing.T) {
	const models = `export interface Signup { email: string; age: number }`

	staticSession := setupInline(t, map[string]string{
		"models.ts": models,
		"uses.ts": `import {getRunTypeId} from '@mionjs/run-types';
import type {Signup} from './models.ts';
export const id = getRunTypeId<Signup>();
`,
	})
	staticDeps := transformDeps(t, staticSession, "uses.ts")
	assertDep(t, staticDeps, "models.ts")

	reflectionSession := setupInline(t, map[string]string{
		"models.ts": models,
		"uses.ts": `import {getRunTypeId} from '@mionjs/run-types';
import type {Signup} from './models.ts';
const value: Signup = {email: 'a@b.c', age: 30};
export const id = getRunTypeId(value);
`,
	})
	reflectionDeps := transformDeps(t, reflectionSession, "uses.ts")
	assertDep(t, reflectionDeps, "models.ts")

	staticID := siteTypeID(t, staticSession, "uses.ts")
	reflectionID := siteTypeID(t, reflectionSession, "uses.ts")
	if staticID != reflectionID {
		t.Fatalf("the two getRunTypeId call shapes resolved to different ids: static %q vs reflection %q", staticID, reflectionID)
	}
}

// siteTypeID returns the wire id of the single marker site in file.
func siteTypeID(t *testing.T, session *resolver.Session, file string) string {
	t.Helper()
	response := session.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{file}})
	if response.Error != "" {
		t.Fatalf("scanFiles %s: %s", file, response.Error)
	}
	if len(response.Sites) != 1 {
		t.Fatalf("expected exactly one site in %s, got %d", file, len(response.Sites))
	}
	return response.Sites[0].ID
}
