package purefunctions

import (
	"strings"
	"testing"
)

func depsOfFirst(t *testing.T, source string) ([]string, []Diagnostic) {
	t.Helper()
	entries, diags := extractFromOverlay(t, map[string]string{"a.ts": source})
	if len(entries) == 0 {
		t.Fatalf("expected at least one entry; diags=%+v", diags)
	}
	return entries[0].PureFnDependencies, diags
}

func TestDeps_LiteralKey_GetPureFn(t *testing.T) {
	deps, diags := depsOfFirst(t, `
import {registerPureFnFactory} from '@ts-runtypes/core';
export const _ = registerPureFnFactory('rt::consumer', function (utl) {
  return function _f(x: number) {
    return utl.getPureFn('rt::dep')(x);
  };
});`)
	for _, d := range diags {
		if d.Code == CodePurityDepNotLiteral {
			t.Fatalf("unexpected dep-literal diagnostic: %+v", d)
		}
	}
	if len(deps) != 1 || deps[0] != "rt::dep" {
		t.Fatalf("expected deps=[rt::dep], got %v", deps)
	}
}

func TestDeps_AllFourKeyMethods(t *testing.T) {
	deps, _ := depsOfFirst(t, `
import {registerPureFnFactory} from '@ts-runtypes/core';
export const _ = registerPureFnFactory('rt::multi', function (utl) {
  return function _f(x: any) {
    utl.getPureFn('rt::a')(x);
    utl.usePureFn('rt::b')(x);
    utl.getCompiledPureFn('rt::c');
    utl.hasPureFn('rt::d');
    return 1;
  };
});`)
	want := []string{"rt::a", "rt::b", "rt::c", "rt::d"}
	if strings.Join(deps, ",") != strings.Join(want, ",") {
		t.Fatalf("expected %v, got %v", want, deps)
	}
}

func TestDeps_FindCompiledPureFn_BareName(t *testing.T) {
	// findCompiledPureFn takes a bare fnName (no namespace). Emitted as
	// `::<fnName>` so the runtime suffix-matcher resolves it the same
	// way the old tracking proxy used to record it.
	deps, _ := depsOfFirst(t, `
import {registerPureFnFactory} from '@ts-runtypes/core';
export const _ = registerPureFnFactory('rt::findCaller', function (utl) {
  return function _f() {
    return utl.findCompiledPureFn('someBareName');
  };
});`)
	if len(deps) != 1 || deps[0] != "::someBareName" {
		t.Fatalf("expected ['::someBareName'], got %v", deps)
	}
}

func TestDeps_RenamedUtlParam(t *testing.T) {
	// User picks their own name for the rtUtils param — extractor reads
	// it off Parameters[0] rather than hardcoding `utl`.
	deps, _ := depsOfFirst(t, `
import {registerPureFnFactory} from '@ts-runtypes/core';
export const _ = registerPureFnFactory('rt::renamed', function (J) {
  return function _f(x: any) {
    return J.getPureFn('rt::renamedDep')(x);
  };
});`)
	if len(deps) != 1 || deps[0] != "rt::renamedDep" {
		t.Fatalf("expected ['rt::renamedDep'], got %v", deps)
	}
}

func TestDeps_FactoryLocalConst(t *testing.T) {
	// Dep key declared as a `const` *inside* the factory body. Local
	// table resolves it before the file-level fallback.
	deps, _ := depsOfFirst(t, `
import {registerPureFnFactory} from '@ts-runtypes/core';
export const _ = registerPureFnFactory('rt::local', function (utl) {
  const KEY = 'rt::localDep';
  return function _f(x: any) {
    return utl.getPureFn(KEY)(x);
  };
});`)
	if len(deps) != 1 || deps[0] != "rt::localDep" {
		t.Fatalf("expected ['rt::localDep'], got %v", deps)
	}
}

func TestDeps_FileLevelConst_Fallback(t *testing.T) {
	deps, _ := depsOfFirst(t, `
import {registerPureFnFactory} from '@ts-runtypes/core';
const FILE_KEY = 'rt::fileDep';
export const _ = registerPureFnFactory('rt::fileFb', function (utl) {
  return function _f(x: any) {
    return utl.getPureFn(FILE_KEY)(x);
  };
});`)
	if len(deps) != 1 || deps[0] != "rt::fileDep" {
		t.Fatalf("expected ['rt::fileDep'], got %v", deps)
	}
}

func TestDeps_DedupAndSort(t *testing.T) {
	// Same dep called multiple times in different positions → one
	// entry. Multiple distinct deps → sorted alphabetically.
	deps, _ := depsOfFirst(t, `
import {registerPureFnFactory} from '@ts-runtypes/core';
export const _ = registerPureFnFactory('rt::dedup', function (utl) {
  return function _f(x: any) {
    utl.getPureFn('rt::z')(x);
    utl.usePureFn('rt::a')(x);
    utl.getPureFn('rt::a')(x);
    return 1;
  };
});`)
	want := []string{"rt::a", "rt::z"}
	if strings.Join(deps, ",") != strings.Join(want, ",") {
		t.Fatalf("expected sorted-deduped %v, got %v", want, deps)
	}
}

func TestDeps_NonLiteralArg_PFE9013(t *testing.T) {
	_, diags := depsOfFirst(t, `
import {registerPureFnFactory} from '@ts-runtypes/core';
declare const buildKey: (n: number) => string;
export const _ = registerPureFnFactory('rt::bad', function (utl) {
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
		t.Fatalf("expected PFE9013 for non-literal arg, got %+v", diags)
	}
}

func TestDeps_NoCalls_NilDeps(t *testing.T) {
	// Factory body has no utl.<dep-method>(...) calls → no deps slice.
	deps, _ := depsOfFirst(t, `
import {registerPureFnFactory} from '@ts-runtypes/core';
export const _ = registerPureFnFactory('rt::plain', function (utl) {
  return function _f(x: number) { return x + 1; };
});`)
	if len(deps) != 0 {
		t.Fatalf("expected no deps, got %v", deps)
	}
}

func TestDeps_NoFirstParam_NoExtraction(t *testing.T) {
	// Without a first parameter we can't identify utl; extractDeps
	// returns (nil, nil) so any utl-shaped calls in the body are
	// silently ignored. (They'd fail purity anyway — `utl` would be a
	// free identifier — but the dep extractor stays out of that path.)
	_, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerPureFnFactory} from '@ts-runtypes/core';
export const _ = registerPureFnFactory('rt::noParam', function () {
  return function _f() { return 1; };
});`,
	})
	for _, d := range diags {
		if d.Code == CodePurityDepNotLiteral {
			t.Fatalf("PFE9013 fired with no first param: %+v", d)
		}
	}
}
