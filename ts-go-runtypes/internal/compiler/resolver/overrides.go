package resolver

import (
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/ts-runtypes/internal/cachegen/runtype/typeid"
	"github.com/mionkit/ts-runtypes/internal/compiler/marker"
	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/protocol"
	"github.com/mionkit/ts-runtypes/internal/textpos"
)

// overrideCalleePrefix is the cheap pre-filter for the override-collection pass:
// every public `overrideX<T>(pureFn, id)` factory is named `override…`, so a
// call whose callee identifier lacks this prefix is skipped before the (heavy)
// signature resolution. The brands remain the correctness contract — the prefix
// only short-circuits the common non-override call.
const overrideCalleePrefix = "override"

// maxOverrideFoldIterations bounds the base-key fixpoint (item 3). Override
// nesting (a target that structurally contains another overridden type) is
// shallow in practice; the cap matches the cross-family edge fixpoint. If a
// build ever nests deeper, the deepest override simply may not apply (the
// structural body is emitted) — never incorrect.
const maxOverrideFoldIterations = 8

// overrideSite is the resolved shape of one overrideX<T>(pureFn, id) call: the
// overridden type, the family op key the trailing InjectTypeFnArgs<T, fnKey>
// names, and the inline pure-fn argument node.
type overrideSite struct {
	typeArgument *checker.Type
	fnKey        string
	fnArg        *ast.Node
}

// rawOverride is one discovered override declaration, captured before base keys
// are folded to a fixpoint. cfnHash is the cfn's body-hash name (CodeHash), the
// value that rides the `|cfn:<family>:<hash>` suffix.
type rawOverride struct {
	typeArg *checker.Type
	fnKey   string
	cfnHash string
	site    diagnostics.Site
}

// overrideArgSpan is the byte range of an override call's inline pure-fn
// argument, used to rewrite it to `null` (its body lives only in the cfn module).
type overrideArgSpan struct {
	start int
	end   int
}

// ensureOverrides runs the one-time, whole-program override-collection pass for
// the current Program. It finds every `overrideX<T>(pureFn)` call, extracts the
// cfn (pure-fn body), resolves T's base structural key, and installs the
// override map on the cache so all subsequent id assignments fold the
// `|cfn:<family>:<hash>` suffix. MUST run before any AssignID — hence it is
// called at the top of dispatchScanFiles. Idempotent per Program (guarded by
// overridesBuilt, reset on SetProgram / Reset).
//
// The pass walks every program source file regardless of which files the
// triggering scan requested: an override declared in one file shifts the ids of
// types used in any other, so the map must be complete before the first id is
// minted.
func (sess *Session) ensureOverrides() {
	if sess.overridesBuilt {
		return
	}
	sess.overridesBuilt = true
	if sess.Program == nil || sess.Program.TS == nil || sess.checker == nil {
		return
	}
	state := sess.scanStateFor(sess.checker)

	// Phase 1 — collect every override declaration once. cfn extraction is
	// independent of the override map, so it runs here (not per fixpoint
	// iteration). Deterministic file + source order keeps OVR001's "first wins"
	// stable and the cfn entry list reproducible.
	var raws []rawOverride
	var entries []purefunctions.Entry
	seen := map[string]struct{}{}
	argSpans := map[string][]overrideArgSpan{}
	for _, sourceFile := range sess.Program.TS.SourceFiles() {
		if sourceFile == nil || sourceFile.IsDeclarationFile {
			continue
		}
		forEachCallExpression(sourceFile, func(call *ast.Node) bool {
			site, ok := state.detectOverrideSite(call)
			if !ok {
				return true
			}
			cfn, cfnOK := purefunctions.ExtractOverrideFn(sess.checker, sourceFile, site.fnArg)
			if !cfnOK {
				return true
			}
			raws = append(raws, rawOverride{
				typeArg: site.typeArgument,
				fnKey:   site.fnKey,
				cfnHash: cfn.FunctionName,
				site:    textpos.NodeSite(sourceFile.FileName(), sourceFile, call),
			})
			argSpans[sourceFile.FileName()] = append(argSpans[sourceFile.FileName()],
				overrideArgSpan{start: site.fnArg.Pos(), end: site.fnArg.End()})
			if _, dup := seen[cfn.Key()]; !dup {
				seen[cfn.Key()] = struct{}{}
				entries = append(entries, cfn)
			}
			return true
		})
	}
	sess.overrideEntries = entries
	sess.overrideArgSpansByFile = argSpans
	if len(raws) == 0 {
		return
	}

	// Phase 2 — fold the override map to a fixpoint. A target whose base key
	// contains another overridden type needs the inner fold applied first; each
	// iteration recomputes base keys against the previous map until the keys
	// stabilize (bounded — see maxOverrideFoldIterations).
	overrides, baseKeys := sess.foldOverrideMap(raws)

	// Phase 3 — diagnostics on the FINAL, stable base keys: strict OVR001 (any
	// second override of a (type, family) pair) + OVR010 (validate cross-family).
	sess.overrideDiagnostics = overrideDiagnostics(raws, baseKeys)

	sess.cache.SetOverrides(overrides)
}

// foldOverrideMap iterates the base-key computation to a fixpoint and returns the
// final override map plus the final base key of each raw (parallel to raws). The
// first raw (source order) wins a (baseKey, fnKey) pair; conflicts are reported
// separately by overrideDiagnostics.
func (sess *Session) foldOverrideMap(raws []rawOverride) (map[string]map[string]string, []string) {
	prev := map[string]map[string]string{}
	baseKeys := make([]string, len(raws))
	for iteration := 0; iteration < maxOverrideFoldIterations; iteration++ {
		computer := typeid.NewWithOverrides(sess.checker, prev)
		next := map[string]map[string]string{}
		for i, raw := range raws {
			baseKey := computer.BaseStructuralKey(raw.typeArg)
			baseKeys[i] = baseKey
			families := next[baseKey]
			if families == nil {
				families = map[string]string{}
				next[baseKey] = families
			}
			if _, exists := families[raw.fnKey]; !exists {
				families[raw.fnKey] = raw.cfnHash
			}
		}
		if overrideMapsEqual(prev, next) {
			return next, baseKeys
		}
		prev = next
	}
	return prev, baseKeys
}

// overrideMapsEqual reports whether two override maps carry identical
// (baseKey → fnKey → hash) content — the fixpoint convergence test.
func overrideMapsEqual(a, b map[string]map[string]string) bool {
	if len(a) != len(b) {
		return false
	}
	for baseKey, famsA := range a {
		famsB, ok := b[baseKey]
		if !ok || len(famsA) != len(famsB) {
			return false
		}
		for fnKey, hash := range famsA {
			if famsB[fnKey] != hash {
				return false
			}
		}
	}
	return true
}

// overrideDiagnostics derives OVR001 / OVR010 from the raws + their final base
// keys. OVR001 is STRICT: any second override of the same (type, family) is an
// error regardless of body (you can't have two overrides for one function and
// type). OVR010 warns once per distinct validate override (its cross-family reach).
func overrideDiagnostics(raws []rawOverride, baseKeys []string) []diagnostics.Diagnostic {
	var diags []diagnostics.Diagnostic
	firstIndex := map[string]int{} // "<baseKey>|<fnKey>" → index of the winning raw
	for i, raw := range raws {
		key := baseKeys[i] + "|" + raw.fnKey
		if winner, exists := firstIndex[key]; exists {
			diags = append(diags, diagnostics.NewWithRelated(
				diagnostics.CodeDuplicateOverride, raw.site, []string{raw.fnKey},
				diagnostics.Related{Site: raws[winner].site, Message: "First overridden here"},
			))
			continue
		}
		firstIndex[key] = i
		// validate is a shared cross-family dependency: JSON / binary union
		// decoders call val_<member> to narrow. Overriding it reaches past
		// createValidateFn<T>(), so flag the site (Warning — the build proceeds).
		if raw.fnKey == "val" {
			diags = append(diags, diagnostics.New(diagnostics.CodeOverrideValidateCrossFamily, raw.site))
		}
	}
	return diags
}

// collectOverrideReplacements returns the `null` replacements for every override
// call's inline pure-fn argument in the requested files (the body now lives only
// in the cfn module). Scoped per file like the pure-fn factory nullings — the
// span map is whole-program, but only spans whose file is in this request are
// emitted. Sorted (file, start) for deterministic output.
func (sess *Session) collectOverrideReplacements(files []string) []protocol.Replacement {
	if len(sess.overrideArgSpansByFile) == 0 {
		return nil
	}
	filePaths := make([]string, 0, len(sess.overrideArgSpansByFile))
	for filePath := range sess.overrideArgSpansByFile {
		inRequest := false
		for _, file := range files {
			if sameTransformPath(filePath, file) {
				inRequest = true
				break
			}
		}
		if inRequest {
			filePaths = append(filePaths, filePath)
		}
	}
	sort.Strings(filePaths)
	var replacements []protocol.Replacement
	for _, filePath := range filePaths {
		spans := sess.overrideArgSpansByFile[filePath]
		sort.Slice(spans, func(i, j int) bool { return spans[i].start < spans[j].start })
		for _, span := range spans {
			replacements = append(replacements, protocol.Replacement{
				File:  filePath,
				Start: span.start,
				End:   span.end,
				Text:  "null",
			})
		}
	}
	return replacements
}

// detectOverrideSite reports whether call is an `overrideX<T>(pureFn, id)` site
// and returns its resolved shape. Recognition is shape-based: a trailing
// InjectTypeFnArgs<T, fnKey> slot AND a PureFunction-branded argument — a combo
// no createX factory carries — gated by the cheap `override` callee-name
// pre-filter. A single-family marker is required (overrides never multiplex).
func (state scanState) detectOverrideSite(call *ast.Node) (overrideSite, bool) {
	callExpression := call.AsCallExpression()
	if callExpression == nil || callExpression.Expression == nil {
		return overrideSite{}, false
	}
	callee := callExpression.Expression
	if callee.Kind != ast.KindIdentifier || !strings.HasPrefix(callee.Text(), overrideCalleePrefix) {
		return overrideSite{}, false
	}
	signature := checker.Checker_getResolvedSignature(state.scanChecker, call, nil, 0)
	if signature == nil {
		return overrideSite{}, false
	}
	parameters := checker.Signature_parameters(signature)
	if len(parameters) == 0 {
		return overrideSite{}, false
	}
	lastIndex := len(parameters) - 1
	var typeArgument *checker.Type
	var fnKey string
	pureFnParamIndex := -1
	for paramIndex := 0; paramIndex <= lastIndex; paramIndex++ {
		paramSymbol := parameters[paramIndex]
		if paramSymbol == nil {
			continue
		}
		paramType := checker.Checker_getTypeOfSymbol(state.scanChecker, paramSymbol)
		kind, typeArg, matched := state.detectMarker(paramType)
		if !matched {
			continue
		}
		switch kind {
		case marker.KindInjectTypeFnArgs:
			if paramIndex != lastIndex {
				continue
			}
			typeArgument = typeArg
			if fnKeys, fnOK := marker.FnKeysForInjectTypeFnArgs(state.scanChecker, paramType, state.sess.marker); fnOK && len(fnKeys) == 1 {
				fnKey = fnKeys[0]
			}
		case marker.KindPureFunction:
			pureFnParamIndex = paramIndex
		}
	}
	if typeArgument == nil || fnKey == "" || pureFnParamIndex < 0 {
		return overrideSite{}, false
	}
	if marker.IsFreeTypeParameter(typeArgument) {
		return overrideSite{}, false
	}
	if callExpression.Arguments == nil || pureFnParamIndex >= len(callExpression.Arguments.Nodes) {
		return overrideSite{}, false
	}
	fnArg := callExpression.Arguments.Nodes[pureFnParamIndex]
	if fnArg == nil {
		return overrideSite{}, false
	}
	return overrideSite{typeArgument: typeArgument, fnKey: fnKey, fnArg: fnArg}, true
}
