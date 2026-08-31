package resolver_test

import (
	"strings"
	"testing"

	_ "github.com/mionkit/ts-runtypes/internal/cachegen/typefunctions/formats/all"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/compiler/resolver"
	"github.com/mionkit/ts-runtypes/internal/constants"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// modulemode_test.go covers the --module-mode grouping layer: allSingle
// (per-family bundle modules + facades folded into the runtypes bundle) and
// allModules (per-node runtype modules, the pre-bundle layout). Default-mode
// shapes are locked by the existing suites (rewrite/perfile/scanfile tests).

// setupInlineMode is setupInline with a module mode.
func setupInlineMode(t testing.TB, sources map[string]string, mode string) *resolver.Session {
	t.Helper()
	return setupInlineWith(t, sources, func(programOpts *program.Options, resolverOpts *resolver.Options) {
		programOpts.SingleThreaded = true
		resolverOpts.SingleThreaded = true
		resolverOpts.ModuleMode = mode
	})
}

// pairedSources puts BOTH marker forms in one file: the static form
// (getRunTypeId<T>() / createValidateFn<T>()) and the reflection form
// (getRunTypeId(value)) — per the marker test coverage rule.
const pairedSource = `import {createValidateFn, getRunTypeId} from '@mionjs/run-types';
type User = {id: number; name: string};
export const isUser = createValidateFn<User>();
export const staticId = getRunTypeId<User>();
const u = {id: 1, name: 'm'} as User;
export const reflectedId = getRunTypeId(u);
`

func scanWithModules(t *testing.T, r *resolver.Session, files []string) protocol.Response {
	t.Helper()
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: files, IncludeEntryModules: true})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	return resp
}

func TestModuleMode_AllSingle_FamilyBundleAndFacadeFolding(t *testing.T) {
	r := setupInlineMode(t, map[string]string{"a.ts": pairedSource}, constants.ModuleModeAllSingle)
	resp := scanWithModules(t, r, []string{"a.ts"})

	valBundle, ok := resp.EntryModules[constants.FnsBundleDir+"/val"]
	if !ok {
		t.Fatalf("allSingle: missing %s/val bundle; modules: %v", constants.FnsBundleDir, moduleNames(resp))
	}
	// Bundle exports each entry under its binding name (named export — the
	// rewrite imports it without renaming).
	if !strings.Contains(valBundle, "export const "+constants.EntryBindingPrefix) {
		t.Fatalf("val bundle missing named exports:\n%s", valBundle)
	}
	// No per-entry fn module should exist alongside the bundle.
	for name := range resp.EntryModules {
		if strings.Contains(name, "_") && !strings.Contains(name, "/") {
			t.Fatalf("allSingle: unexpected per-entry fn module %q (should ride a bundle)", name)
		}
	}

	// The runtypes bundle absorbs the facades: per-root named export, and no
	// standalone facade module keyed by the bare root id.
	runtypes, ok := resp.EntryModules[constants.RunTypesBundleBasename]
	if !ok {
		t.Fatalf("allSingle: missing runtypes bundle; modules: %v", moduleNames(resp))
	}
	var reflectionRoot string
	for _, site := range resp.Sites {
		if site.FnId == "" && site.ID != "" {
			reflectionRoot = site.ID
			break
		}
	}
	if reflectionRoot == "" {
		t.Fatalf("no reflection site found")
	}
	if _, standalone := resp.EntryModules[reflectionRoot]; standalone {
		t.Fatalf("allSingle: facade %q still has its own module", reflectionRoot)
	}
	if !strings.Contains(runtypes, "export const "+constants.EntryBindingPrefix+reflectionRoot+"=[5,") {
		t.Fatalf("runtypes bundle missing folded facade export for %q:\n%s", reflectionRoot, runtypes)
	}
}

func TestModuleMode_AllSingle_FacadeThunkHoisted(t *testing.T) {
	// ≥ facadeHoistMin (3) reflection roots: every folded facade shares the
	// same bundle deps thunk, so it's hoisted into ONE `const rtL=…` reused by
	// each facade instead of a repeated `()=>[__rt_runtypes]`.
	source := `import {getRunTypeId} from '@mionjs/run-types';
type A = {a: string};
type B = {b: number};
type C = {c: boolean};
type D = {d: string};
export const a = getRunTypeId<A>();
export const b = getRunTypeId<B>();
export const c = getRunTypeId<C>();
export const d = getRunTypeId<D>();
`
	r := setupInlineMode(t, map[string]string{"a.ts": source}, constants.ModuleModeAllSingle)
	resp := scanWithModules(t, r, []string{"a.ts"})
	runtypes, ok := resp.EntryModules[constants.RunTypesBundleBasename]
	if !ok {
		t.Fatalf("missing runtypes bundle; modules: %v", moduleNames(resp))
	}
	bundleBinding := constants.EntryBindingPrefix + constants.RunTypesBundleBasename // __rt_runtypes
	hoist := "const rtL=()=>[" + bundleBinding + "];"
	if n := strings.Count(runtypes, hoist); n != 1 {
		t.Fatalf("expected exactly one hoisted thunk %q, got %d:\n%s", hoist, n, runtypes)
	}
	if strings.Contains(runtypes, "=[5,()=>["+bundleBinding+"]") {
		t.Fatalf("facade thunks must be hoisted, found an inline `()=>[%s]`:\n%s", bundleBinding, runtypes)
	}
	if !strings.Contains(runtypes, "=[5,rtL,,") {
		t.Fatalf("facades must reuse the shared `rtL` local:\n%s", runtypes)
	}
	// The shared local references the data export, which must be declared first.
	dataIdx := strings.Index(runtypes, "export const "+bundleBinding+"=[4,")
	hoistIdx := strings.Index(runtypes, hoist)
	if dataIdx < 0 || hoistIdx < 0 || dataIdx > hoistIdx {
		t.Fatalf("data export must precede the hoist (dataIdx=%d hoistIdx=%d):\n%s", dataIdx, hoistIdx, runtypes)
	}
}

func TestModuleMode_AllSingle_FacadeThunkInlineBelowThreshold(t *testing.T) {
	// 2 roots (< facadeHoistMin) → no hoist; each facade keeps its inline thunk.
	source := `import {getRunTypeId} from '@mionjs/run-types';
type A = {a: string};
type B = {b: number};
export const a = getRunTypeId<A>();
export const b = getRunTypeId<B>();
`
	r := setupInlineMode(t, map[string]string{"a.ts": source}, constants.ModuleModeAllSingle)
	resp := scanWithModules(t, r, []string{"a.ts"})
	runtypes, ok := resp.EntryModules[constants.RunTypesBundleBasename]
	if !ok {
		t.Fatalf("missing runtypes bundle; modules: %v", moduleNames(resp))
	}
	if strings.Contains(runtypes, "const rtL=") {
		t.Fatalf("2 facades (< threshold) must not hoist:\n%s", runtypes)
	}
	bundleBinding := constants.EntryBindingPrefix + constants.RunTypesBundleBasename
	if !strings.Contains(runtypes, "=[5,()=>["+bundleBinding+"]") {
		t.Fatalf("below-threshold facades should keep the inline thunk:\n%s", runtypes)
	}
}

func TestModuleMode_AllSingle_SiteModuleStamping(t *testing.T) {
	r := setupInlineMode(t, map[string]string{"a.ts": pairedSource}, constants.ModuleModeAllSingle)
	// Plain scan — no entry modules requested — must still stamp Site.Module
	// (the Vite transform hot path relies on it).
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	var sawCreate, sawReflect bool
	for _, site := range resp.Sites {
		if site.FnId != "" {
			sawCreate = true
			if site.Module != constants.FnsBundleDir+"/val" {
				t.Fatalf("createValidateFn site Module = %q, want %s/val", site.Module, constants.FnsBundleDir)
			}
		} else {
			sawReflect = true
			if site.Module != constants.RunTypesBundleBasename {
				t.Fatalf("reflection site Module = %q, want %s", site.Module, constants.RunTypesBundleBasename)
			}
		}
	}
	if !sawCreate || !sawReflect {
		t.Fatalf("expected both site forms (create=%v reflect=%v)", sawCreate, sawReflect)
	}
}

func TestModuleMode_Default_NoSiteModuleStamping(t *testing.T) {
	r := setupInline(t, map[string]string{"a.ts": pairedSource})
	resp := scanWithModules(t, r, []string{"a.ts"})
	for _, site := range resp.Sites {
		if site.Module != "" {
			t.Fatalf("default mode must not stamp Site.Module; got %q", site.Module)
		}
	}
	if _, ok := resp.EntryModules[constants.FnsBundleDir+"/val"]; ok {
		t.Fatalf("default mode must not emit family bundles")
	}
}

func TestModuleMode_AllSingle_CrossFamilyBundleImport(t *testing.T) {
	// A non-merging union encoder discriminates members via val_<member>
	// cross-family edges (the TestDemandScope_ItSeededByCrossFamilyUnion
	// fixture) — in allSingle the tb bundle must import those entries as
	// NAMED exports of the val bundle.
	source := `import {createBinaryEncoderFn} from '@mionjs/run-types';
export const _ = createBinaryEncoderFn<{a: {n: number}} | {a: {s: string}}>();
`
	r := setupInlineMode(t, map[string]string{"a.ts": source}, constants.ModuleModeAllSingle)
	resp := scanWithModules(t, r, []string{"a.ts"})
	tbBundle, ok := resp.EntryModules[constants.FnsBundleDir+"/tb"]
	if !ok {
		t.Fatalf("missing %s/tb bundle; modules: %v", constants.FnsBundleDir, moduleNames(resp))
	}
	valSpecifier := constants.EntryModulePrefix + constants.FnsBundleDir + "/val" + constants.EntryModuleSuffix
	if !strings.Contains(tbBundle, "from '"+valSpecifier+"'") {
		t.Fatalf("tb bundle missing named import from %s:\n%s", valSpecifier, tbBundle)
	}
	// Imports never rename — the export name IS the binding, everywhere.
	for _, line := range strings.Split(tbBundle, "\n") {
		if strings.HasPrefix(line, "import {") && strings.Contains(line, " as ") {
			t.Fatalf("tb bundle must not rename imports:\n%s", line)
		}
	}
	if _, ok := resp.EntryModules[constants.FnsBundleDir+"/val"]; !ok {
		t.Fatalf("missing %s/val bundle (cross-family fixpoint); modules: %v", constants.FnsBundleDir, moduleNames(resp))
	}
}

func TestModuleMode_AllSingle_PureFnBundleAndNamedReplacement(t *testing.T) {
	// The real package declares registerPureFnFactory with the brand-branded
	// signature the walker's marker check requires — no extension needed.
	source := `import {registerPureFnFactory} from '@mionjs/run-types';
export const _ = registerPureFnFactory('test::double', function (utl) {
  return function double(x: number): number { return x * 2; };
});
`
	r := setupInlineMode(t, map[string]string{"a.ts": source}, constants.ModuleModeAllSingle)
	resp := scanWithModules(t, r, []string{"a.ts"})
	if len(resp.Replacements) == 0 {
		t.Fatalf("expected a pure-fn replacement")
	}
	rep := resp.Replacements[0]
	pfSpecifier := constants.EntryModulePrefix + constants.PureFnModuleDir + constants.EntryModuleSuffix
	if rep.ImportFrom != pfSpecifier {
		t.Fatalf("replacement ImportFrom = %q, want %q", rep.ImportFrom, pfSpecifier)
	}
	pfBundle, ok := resp.EntryModules[constants.PureFnModuleDir]
	if !ok {
		t.Fatalf("missing %q bundle; modules: %v", constants.PureFnModuleDir, moduleNames(resp))
	}
	if !strings.Contains(pfBundle, "export const "+rep.Text+"=[") {
		t.Fatalf("pf bundle missing export %q:\n%s", rep.Text, pfBundle)
	}
}

func TestModuleMode_AllModules_PerNodeRunTypes(t *testing.T) {
	// Static + reflection forms both demand the runtype graph; per-node mode
	// renders one module per node (kind 0) and no bundle/facade kinds.
	source := `import {getRunTypeId} from '@mionjs/run-types';
type User = {id: number; name: string};
export const staticId = getRunTypeId<User>();
const u = {id: 1, name: 'm'} as User;
export const reflectedId = getRunTypeId(u);
`
	r := setupInlineMode(t, map[string]string{"a.ts": source}, constants.ModuleModeAllModules)
	resp := scanWithModules(t, r, []string{"a.ts"})
	if _, ok := resp.EntryModules[constants.RunTypesBundleBasename]; ok {
		t.Fatalf("allModules must not emit the runtypes bundle")
	}
	var root string
	for _, site := range resp.Sites {
		if site.FnId == "" && site.ID != "" {
			root = site.ID
			break
		}
	}
	if root == "" {
		t.Fatalf("no reflection site found")
	}
	rootModule, ok := resp.EntryModules[root]
	if !ok {
		t.Fatalf("allModules: missing per-node module for root %q; modules: %v", root, moduleNames(resp))
	}
	if !strings.Contains(rootModule, "export const "+constants.EntryBindingPrefix+root+"=[0,()=>[") {
		t.Fatalf("per-node module must export its binding name with tuple kind 0:\n%s", rootModule)
	}
	// The root (an object) must import its member nodes — per-node layout,
	// each child arriving as a named import of its own binding (no rename).
	if !strings.Contains(rootModule, "import {"+constants.EntryBindingPrefix) {
		t.Fatalf("per-node root should import child node modules:\n%s", rootModule)
	}
	// More than one runtype module exists (root + members), each kind 0.
	kind0 := 0
	for _, source := range resp.EntryModules {
		if strings.Contains(source, "export const "+constants.EntryBindingPrefix) && strings.Contains(source, "=[0,") {
			kind0++
		}
	}
	if kind0 < 2 {
		t.Fatalf("expected multiple per-node runtype modules, got %d", kind0)
	}
}

func moduleNames(resp protocol.Response) []string {
	names := make([]string, 0, len(resp.EntryModules))
	for name := range resp.EntryModules {
		names = append(names, name)
	}
	return names
}

// entryModuleExports maps each emitted entry module to the set of binding names
// it exports (`export const __rt_…=`), for the import-resolvability check below.
func entryModuleExports(modules map[string]string) map[string]map[string]bool {
	exports := make(map[string]map[string]bool, len(modules))
	for name, source := range modules {
		names := make(map[string]bool)
		for _, part := range strings.Split(source, "export const ")[1:] {
			if end := strings.IndexByte(part, '='); end > 0 {
				names[strings.TrimSpace(part[:end])] = true
			}
		}
		exports[name] = names
	}
	return exports
}

// assertImportsResolve is the invariant every module mode owes: a binding is
// never imported from a module that does not export it. Unresolvable names fail
// unreadably downstream — rollup reports an EMPTY error thousands of columns
// into the single-line import block, and esbuild / vite-node do not check at
// all, so the binding is silently undefined until it is read. The Go twin of
// the devtools check in test/module-mode.test.ts.
func assertImportsResolve(t *testing.T, code string, modules map[string]string) {
	t.Helper()
	exports := entryModuleExports(modules)
	seen := 0
	for _, statement := range strings.Split(strings.ReplaceAll(code, "\n", " "), "; ") {
		statement = strings.TrimSpace(statement)
		if !strings.HasPrefix(statement, "import {") {
			continue
		}
		clauseEnd := strings.IndexByte(statement, '}')
		specifierStart := strings.IndexByte(statement[clauseEnd:], '\'') + clauseEnd + 1
		specifierEnd := strings.IndexByte(statement[specifierStart:], '\'') + specifierStart
		specifier := statement[specifierStart:specifierEnd]
		if !strings.HasPrefix(specifier, constants.EntryModulePrefix) {
			continue
		}
		basename := strings.TrimSuffix(strings.TrimPrefix(specifier, constants.EntryModulePrefix), constants.EntryModuleSuffix)
		names, ok := exports[basename]
		if !ok {
			t.Errorf("the rewrite imports from %q, which the build did not emit", basename)
			continue
		}
		for _, binding := range strings.Split(statement[len("import {"):clauseEnd], ",") {
			binding = strings.TrimSpace(binding)
			seen++
			if !names[binding] {
				t.Errorf("%q is imported from %q, which does not export it", binding, basename)
			}
		}
	}
	if seen == 0 {
		t.Fatalf("the rewrite injected no entry-module imports:\n%s", code)
	}
}

// transformWithModules runs OpTransform plus an entry-module scan for one file,
// so a test can hold the rewritten code and the modules it imports side by side.
func transformWithModules(t *testing.T, r *resolver.Session, file string) (string, map[string]string) {
	t.Helper()
	scan := scanWithModules(t, r, []string{file})
	tr := r.Dispatch(protocol.Request{Op: protocol.OpTransform, Files: []string{file}})
	if tr.Error != "" {
		t.Fatalf("transform: %s", tr.Error)
	}
	return tr.Transformed[file].Code, scan.EntryModules
}

// TestModuleMode_AllSingle_MultiFnSitePerFamilyImports is the regression cover
// for the allSingle import-grouping bug: a MULTI-function site
// (createStandardSchema's <T,'val','verr'>) injects bindings that live in
// DIFFERENT family bundles, so the rewrite must emit one import per bundle.
// It previously emitted a single import naming FnIds[0]'s bundle for all of
// them, leaving every other family's binding unresolvable.
func TestModuleMode_AllSingle_MultiFnSitePerFamilyImports(t *testing.T) {
	const code = `import {createStandardSchema} from '@mionjs/run-types';
export const schema = createStandardSchema<string>();
`
	r := setupInlineMode(t, map[string]string{"runtypes.d.ts": standardSchemaDTS, "call.ts": code}, constants.ModuleModeAllSingle)
	out, modules := transformWithModules(t, r, "call.ts")
	assertImportsResolve(t, out, modules)

	scan := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}})
	if scan.Error != "" {
		t.Fatalf("scanFiles: %s", scan.Error)
	}
	var site protocol.Site
	for _, candidate := range scan.Sites {
		if len(candidate.FnIds) > 1 {
			site = candidate
		}
	}
	if site.ID == "" {
		t.Fatalf("expected a multi-function site; got %+v", scan.Sites)
	}
	// One stamped bundle per fnId, positionally — and the scalar still mirrors
	// FnIds[0] so the single-fn wire is untouched.
	if len(site.Modules) != len(site.FnIds) {
		t.Fatalf("Modules = %v, want one per fnId %v", site.Modules, site.FnIds)
	}
	if site.Module != site.Modules[0] {
		t.Errorf("Module = %q, want the Modules[0] mirror %q", site.Module, site.Modules[0])
	}
	distinct := map[string]bool{}
	for _, module := range site.Modules {
		if !strings.HasPrefix(module, constants.FnsBundleDir+"/") {
			t.Errorf("Modules entry %q is not an %s/ bundle", module, constants.FnsBundleDir)
		}
		distinct[module] = true
	}
	if len(distinct) != len(site.FnIds) {
		t.Errorf("Modules = %v, want one DISTINCT family bundle per fnId", site.Modules)
	}
	// The rewrite emits one import statement per bundle, never one for all.
	for _, module := range site.Modules {
		specifier := constants.EntryModulePrefix + module + constants.EntryModuleSuffix
		if !strings.Contains(out, "from '"+specifier+"'") {
			t.Errorf("no import emitted for %q:\n%s", specifier, out)
		}
	}
}

// TestModuleMode_AllSingle_MultiSlotPerFamilyImports covers the same bug in the
// multi-SLOT shape (mion's route(): several markers on one call, each naming
// its own families) — two sites at one Pos, whose fnIds span three families.
func TestModuleMode_AllSingle_MultiSlotPerFamilyImports(t *testing.T) {
	const code = `import {twoSlot} from '@mionjs/run-types';
export const handler = twoSlot(() => 1);
`
	r := setupInlineMode(t, map[string]string{"runtypes.d.ts": multiSlotDTS, "call.ts": code}, constants.ModuleModeAllSingle)
	out, modules := transformWithModules(t, r, "call.ts")
	assertImportsResolve(t, out, modules)
}

// TestModuleMode_ImportsResolveEveryMode pins the invariant as MODE-INDEPENDENT
// across both marker forms (static getRunTypeId<T>() and reflection
// getRunTypeId(value), per the marker coverage rule) plus a createX site.
// default and allModules already held it; allSingle did not.
func TestModuleMode_ImportsResolveEveryMode(t *testing.T) {
	for _, mode := range []string{constants.ModuleModeDefault, constants.ModuleModeAllSingle, constants.ModuleModeAllModules} {
		t.Run(mode, func(t *testing.T) {
			r := setupInlineMode(t, map[string]string{"a.ts": pairedSource}, mode)
			out, modules := transformWithModules(t, r, "a.ts")
			assertImportsResolve(t, out, modules)
		})
	}
}
