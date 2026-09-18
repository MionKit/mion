package purefunctions

import (
	"strings"
	"testing"
)

// depsOf extracts the fixture and returns the dependencies of the entry bound to
// `name`, plus every diagnostic the extraction raised.
func depsOf(t *testing.T, name, source string) ([]string, []Diagnostic) {
	t.Helper()
	entries, diags := extractFromOverlay(t, map[string]string{"a.ts": source})
	want := idOf("a.ts", name)
	for _, entry := range entries {
		if entry.ID == want {
			return entry.PureFnDependencies, diags
		}
	}
	t.Fatalf("no entry for %q; entries=%+v diags=%+v", want, entries, diags)
	return nil, nil
}

// codeOf is depsOf's twin for the emitted body, which is where lowering shows.
func codeOf(t *testing.T, name, source string) string {
	t.Helper()
	entries, diags := extractFromOverlay(t, map[string]string{"a.ts": source})
	want := idOf("a.ts", name)
	for _, entry := range entries {
		if entry.ID == want {
			return entry.Code
		}
	}
	t.Fatalf("no entry for %q; entries=%+v diags=%+v", want, entries, diags)
	return ""
}

func TestDeps_ImportedBindingResolvesAndLowers(t *testing.T) {
	// The normal shape: a body reaches another pure fn by importing the id its
	// registration returned. The id is recorded as a dependency AND written into
	// the emitted body, which ships without the import.
	entries, diags := extractFromOverlay(t, map[string]string{
		"dep.ts": `
import {registerPureFn} from '@mionjs/run-types';
export const slugify = registerPureFn((s: string): string => s.toLowerCase());`,
		"a.ts": `
import {registerPureFnFactory} from '@mionjs/run-types';
import {slugify} from './dep';
export const titleOf = registerPureFnFactory(function (utl) {
  return function _f(s: string) {
    return utl.getPureFn(slugify)(s);
  };
});`,
	})
	for _, d := range diags {
		if d.Code == CodePurityDepNotLiteral || d.Code == CodePurityClosure {
			t.Fatalf("unexpected diagnostic: %+v", d)
		}
	}
	var consumer Entry
	for _, entry := range entries {
		if entry.ID == idOf("a.ts", "titleOf") {
			consumer = entry
		}
	}
	wantDep := idOf("dep.ts", "slugify")
	if len(consumer.PureFnDependencies) != 1 || consumer.PureFnDependencies[0] != wantDep {
		t.Fatalf("expected deps=[%s], got %v", wantDep, consumer.PureFnDependencies)
	}
	if !strings.Contains(consumer.Code, "utl.getPureFn('"+wantDep+"')") {
		t.Errorf("the emitted body must carry the id as a literal, got:\n%s", consumer.Code)
	}
	if strings.Contains(consumer.Code, "getPureFn(slugify)") {
		t.Errorf("the imported binding must not survive into the body, got:\n%s", consumer.Code)
	}
}

func TestDeps_ImportedBindingThroughCast(t *testing.T) {
	// `as` on the lookup result is the usual way to type it; the cast is stripped
	// and the argument underneath still lowers.
	code := codeOf(t, "titleOf", `
import {registerPureFnFactory, registerPureFn} from '@mionjs/run-types';
export const slugify = registerPureFn((s: string): string => s.toLowerCase());
export const titleOf = registerPureFnFactory(function (utl) {
  const slug = utl.getPureFn(slugify) as (s: string) => string;
  return function _f(s: string) { return slug(s); };
});`)
	want := idOf("a.ts", "slugify")
	if !strings.Contains(code, "utl.getPureFn('"+want+"')") {
		t.Errorf("expected the lowered id, got:\n%s", code)
	}
	if strings.Contains(code, "as (s: string)") {
		t.Errorf("the cast must still be stripped, got:\n%s", code)
	}
}

func TestDeps_StringLiteralTypeResolves(t *testing.T) {
	// A published package's `.d.ts` carries an id in the TYPE, which is also what
	// the generated constants file exports. That resolves and lowers too.
	code := codeOf(t, "titleOf", `
import {registerPureFnFactory} from '@mionjs/run-types';
declare const remoteId: '@acme/other/src/slug#slugify';
export const titleOf = registerPureFnFactory(function (utl) {
  return function _f(s: string) { return utl.getPureFn(remoteId)(s); };
});`)
	if !strings.Contains(code, "utl.getPureFn('@acme/other/src/slug#slugify')") {
		t.Errorf("expected the literal-typed id to lower, got:\n%s", code)
	}
}

func TestDeps_AllFourLookupMethods(t *testing.T) {
	deps, _ := depsOf(t, "multi", `
import {registerPureFnFactory, registerPureFn} from '@mionjs/run-types';
export const a = registerPureFn((x: number) => x + 1);
export const b = registerPureFn((x: number) => x + 2);
export const c = registerPureFn((x: number) => x + 3);
export const d = registerPureFn((x: number) => x + 4);
export const multi = registerPureFnFactory(function (utl) {
  return function _f(x: any) {
    utl.getPureFn(a)(x);
    utl.usePureFn(b)(x);
    utl.getCompiledPureFn(c);
    utl.hasPureFn(d);
    return 1;
  };
});`)
	want := []string{idOf("a.ts", "a"), idOf("a.ts", "b"), idOf("a.ts", "c"), idOf("a.ts", "d")}
	if strings.Join(deps, ",") != strings.Join(want, ",") {
		t.Fatalf("expected %v, got %v", want, deps)
	}
}

func TestDeps_RenamedUtlParam(t *testing.T) {
	// User picks their own name for the rtUtils param — the extractor reads it
	// off Parameters[0] rather than hardcoding `utl`.
	deps, _ := depsOf(t, "renamed", `
import {registerPureFnFactory, registerPureFn} from '@mionjs/run-types';
export const dep = registerPureFn((x: number) => x);
export const renamed = registerPureFnFactory(function (J) {
  return function _f(x: any) {
    return J.getPureFn(dep)(x);
  };
});`)
	if len(deps) != 1 || deps[0] != idOf("a.ts", "dep") {
		t.Fatalf("expected the dep id, got %v", deps)
	}
}

func TestDeps_FactoryLocalConst(t *testing.T) {
	// A dep id declared as a `const` INSIDE the factory body: the declaration is
	// part of the emitted body, so it resolves and nothing is lowered.
	code := codeOf(t, "local", `
import {registerPureFnFactory} from '@mionjs/run-types';
export const local = registerPureFnFactory(function (utl) {
  const KEY = '@acme/app/src/other#localDep';
  return function _f(x: any) {
    return utl.getPureFn(KEY)(x);
  };
});`)
	if !strings.Contains(code, "utl.getPureFn(KEY)") {
		t.Errorf("a factory-local const must survive as written, got:\n%s", code)
	}
	deps, _ := depsOf(t, "local", `
import {registerPureFnFactory} from '@mionjs/run-types';
export const local = registerPureFnFactory(function (utl) {
  const KEY = '@acme/app/src/other#localDep';
  return function _f(x: any) {
    return utl.getPureFn(KEY)(x);
  };
});`)
	if len(deps) != 1 || deps[0] != "@acme/app/src/other#localDep" {
		t.Fatalf("expected the const's value as the dep, got %v", deps)
	}
}

func TestDeps_StringLiteralAtCallSite(t *testing.T) {
	deps, _ := depsOf(t, "literal", `
import {registerPureFnFactory} from '@mionjs/run-types';
export const literal = registerPureFnFactory(function (utl) {
  return function _f(x: any) {
    return utl.getPureFn('@acme/app/src/other#written')(x);
  };
});`)
	if len(deps) != 1 || deps[0] != "@acme/app/src/other#written" {
		t.Fatalf("expected the written id as the dep, got %v", deps)
	}
}

func TestDeps_DedupAndSort(t *testing.T) {
	// Same dep reached several times → one entry. Several distinct deps →
	// sorted, so the emitted module is byte-stable.
	deps, _ := depsOf(t, "dedup", `
import {registerPureFnFactory} from '@mionjs/run-types';
export const dedup = registerPureFnFactory(function (utl) {
  return function _f(x: any) {
    utl.getPureFn('@acme/app/src/other#z')(x);
    utl.usePureFn('@acme/app/src/other#a')(x);
    utl.getPureFn('@acme/app/src/other#a')(x);
    return 1;
  };
});`)
	want := []string{"@acme/app/src/other#a", "@acme/app/src/other#z"}
	if strings.Join(deps, ",") != strings.Join(want, ",") {
		t.Fatalf("expected sorted-deduped %v, got %v", want, deps)
	}
}

func TestDeps_UnreadableArg_PFE9013(t *testing.T) {
	_, diags := depsOf(t, "bad", `
import {registerPureFnFactory} from '@mionjs/run-types';
declare const buildKey: (n: number) => string;
export const bad = registerPureFnFactory(function (utl) {
  return function _f(x: any) {
    return utl.getPureFn(buildKey(1))(x);
  };
});`)
	found := false
	for _, d := range diags {
		if d.Code == CodePurityDepNotLiteral {
			found = true
			if len(d.Args) < 2 || d.Args[1] != "getPureFn" {
				t.Errorf("expected args[1]=getPureFn (the dep method name), got %v", d.Args)
			}
		}
	}
	if !found {
		t.Fatalf("expected PFE9013 for an id the build cannot read, got %+v", diags)
	}
}

func TestDeps_ImportedNonRegistration_PFE9013(t *testing.T) {
	// An imported binding that is not a registration is not an id: accepting it
	// would invent a dependency on a pure fn nothing registers.
	_, diags := depsOf(t, "bad", `
import {registerPureFnFactory} from '@mionjs/run-types';
declare const notAPureFn: string;
export const bad = registerPureFnFactory(function (utl) {
  return function _f(x: any) {
    return utl.getPureFn(notAPureFn)(x);
  };
});`)
	found := false
	for _, d := range diags {
		if d.Code == CodePurityDepNotLiteral {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected PFE9013 for a binding that is not a pure fn, got %+v", diags)
	}
}

func TestDeps_NoCalls_NilDeps(t *testing.T) {
	// Factory body has no utl.<lookup>(...) calls → no deps slice.
	deps, _ := depsOf(t, "plain", `
import {registerPureFnFactory} from '@mionjs/run-types';
export const plain = registerPureFnFactory(function (utl) {
  return function _f(x: number) { return x + 1; };
});`)
	if len(deps) != 0 {
		t.Fatalf("expected no deps, got %v", deps)
	}
}

func TestDeps_NoFirstParam_NoExtraction(t *testing.T) {
	// Without a first parameter we can't identify utl; extractDeps returns
	// nothing, so any utl-shaped calls in the body are silently ignored. (They'd
	// fail purity anyway — `utl` would be a free identifier — but the dep
	// extractor stays out of that path.)
	_, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerPureFnFactory} from '@mionjs/run-types';
export const noParam = registerPureFnFactory(function () {
  return function _f() { return 1; };
});`,
	})
	for _, d := range diags {
		if d.Code == CodePurityDepNotLiteral {
			t.Fatalf("PFE9013 fired with no first param: %+v", d)
		}
	}
}
