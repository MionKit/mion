package resolver

import (
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/operations"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/runtype/typeid"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/textpos"
)

// overrideCalleePrefix skips the common non-override call before the heavy signature resolution; the
// marker brands stay the correctness contract.
const overrideCalleePrefix = "override"

// maxOverrideFoldIterations bounds the base-key fixpoint (a target structurally containing another
// overridden type), matching the cross-family edge fixpoint. Nesting deeper than this only means the
// deepest override does not apply and the structural body is emitted, never an incorrect id.
const maxOverrideFoldIterations = 8

// overrideSite is one resolved overrideX<T>(pureFn, id) call; opName is the family op the trailing
// InjectTypeFnArgs<T, opName> names.
type overrideSite struct {
	typeArgument *checker.Type
	opName       string
	fnArg        *ast.Node
}

// rawOverride is one discovered override declaration, captured before base keys are folded to a fixpoint;
// cfnID is the cfn's pure-fn id, the value that rides the `|cfn:<family>:<id>` suffix.
type rawOverride struct {
	typeArg *checker.Type
	opName  string
	cfnID   string
	site    diagnostics.Site
}

// overrideArgSpan is the byte range rewritten to `null`: the argument's body lives only in the cfn module.
type overrideArgSpan struct {
	start int
	end   int
}

// ensureOverrides runs the one-time, whole-program override-collection pass, installing the override map
// on the cache so all subsequent id assignments fold the `|cfn:<family>:<hash>` suffix. MUST run before
// any AssignID, hence the call at the top of dispatchScanFiles; idempotent per Program. It walks every
// program source file whichever files the triggering scan requested: an override declared in one file
// shifts the ids of types used in any other, so the map must be complete before the first id is minted.
func (sess *Session) ensureOverrides() {
	if sess.overridesBuilt {
		return
	}
	sess.overridesBuilt = true
	if sess.Program == nil || sess.Program.TS == nil || sess.checker == nil {
		return
	}
	state := sess.scanStateFor(sess.checker)

	// Phase 1: cfn extraction is independent of the override map, so it runs here, not per fixpoint
	// iteration. File + source order keeps OVR001's "first wins" stable and the entry list reproducible.
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
			cfn, cfnOK := purefunctions.ExtractOverrideFn(sess.checker, sess.MarkerOptions(), sourceFile, site.fnArg)
			if !cfnOK {
				return true
			}
			raws = append(raws, rawOverride{
				typeArg: site.typeArgument,
				opName:  site.opName,
				cfnID:   cfn.Key(),
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

	// Phase 2: a target whose base key contains another overridden type needs the inner fold applied first,
	// so each iteration recomputes base keys against the previous map until they stabilize.
	overrides, baseKeys := sess.foldOverrideMap(raws)

	// Phase 3 runs on the FINAL, stable base keys.
	sess.overrideDiagnostics = overrideDiagnostics(raws, baseKeys)

	sess.cache.SetOverrides(overrides)
}

// overrideIDs is the set of pure-fn ids the override pass extracted; an override's id is shaped like any
// other pure fn's, so this set is what tells a redirect's target apart from an ordinary soft dep.
func (sess *Session) overrideIDs() map[string]bool {
	out := make(map[string]bool, len(sess.overrideEntries))
	for _, entry := range sess.overrideEntries {
		out[entry.Key()] = true
	}
	return out
}

// foldOverrideMap iterates the base-key computation to a fixpoint, returning the map plus each raw's final
// base key; the first raw in source order wins a (baseKey, opName) pair, conflicts go to overrideDiagnostics.
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
			if _, exists := families[raw.opName]; !exists {
				families[raw.opName] = raw.cfnID
			}
		}
		if overrideMapsEqual(prev, next) {
			return next, baseKeys
		}
		prev = next
	}
	return prev, baseKeys
}

// overrideMapsEqual is the fixpoint convergence test over (baseKey → opName → hash) content.
func overrideMapsEqual(a, b map[string]map[string]string) bool {
	if len(a) != len(b) {
		return false
	}
	for baseKey, famsA := range a {
		famsB, ok := b[baseKey]
		if !ok || len(famsA) != len(famsB) {
			return false
		}
		for opName, hash := range famsA {
			if famsB[opName] != hash {
				return false
			}
		}
	}
	return true
}

// overrideDiagnostics derives OVR001 / OVR010 from the raws and their final base keys. OVR001 is STRICT:
// any second override of the same (type, family) is an error whatever its body. OVR010 warns once per
// distinct validate override, for its cross-family reach.
func overrideDiagnostics(raws []rawOverride, baseKeys []string) []diagnostics.Diagnostic {
	var diags []diagnostics.Diagnostic
	firstIndex := map[string]int{} // "<baseKey>|<opName>" → index of the winning raw
	for i, raw := range raws {
		key := baseKeys[i] + "|" + raw.opName
		if winner, exists := firstIndex[key]; exists {
			diags = append(diags, diagnostics.NewWithRelated(
				diagnostics.CodeDuplicateOverride, raw.site, []string{raw.opName},
				diagnostics.Related{Site: raws[winner].site, Message: "First overridden here"},
			))
			continue
		}
		firstIndex[key] = i
		// validate is a shared cross-family dependency (union decoders call val_<member> to narrow), so
		// overriding it reaches past createValidateFn<T>(); a Warning, the build proceeds.
		if raw.opName == "validate" {
			diags = append(diags, diagnostics.New(diagnostics.CodeOverrideValidateCrossFamily, raw.site))
		}
	}
	return diags
}

// collectOverrideReplacements returns the `null` replacements for every override call's inline pure-fn
// argument in the requested files, the body now living only in the cfn module. The span map is
// whole-program, so only spans whose file is in this request are emitted, sorted (file, start).
func (sess *Session) collectOverrideReplacements(files []string) []protocol.Replacement {
	if len(sess.overrideArgSpansByFile) == 0 {
		return nil
	}
	filePaths := make([]string, 0, len(sess.overrideArgSpansByFile))
	for filePath := range sess.overrideArgSpansByFile {
		inRequest := false
		for _, file := range files {
			if sameTransformPath(filePath, file, sess.absPath(file)) {
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

// detectOverrideSite recognizes an `overrideX<T>(pureFn, id)` site by shape: a trailing
// InjectTypeFnArgs<T, opName> slot AND a PureFunction-branded argument, a combination no createX factory
// carries. A single-family marker is required, overrides never multiplex.
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
	var opName string
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
				// Keyed by the operation NAME, never the marker token: the name is the hash-side
				// identity, so renaming the public vocabulary cannot move a structural id.
				if op, known := operations.ByFnKey(fnKeys[0]); known {
					opName = op.Name
				}
			}
		case marker.KindPureFunction:
			pureFnParamIndex = paramIndex
		}
	}
	if typeArgument == nil || opName == "" || pureFnParamIndex < 0 {
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
	return overrideSite{typeArgument: typeArgument, opName: opName, fnArg: fnArg}, true
}
