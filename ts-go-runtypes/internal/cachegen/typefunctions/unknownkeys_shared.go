package typefunctions

import (
	"sort"
	"strconv"
	"strings"

	"github.com/mionkit/ts-runtypes/internal/jsquote"
	"github.com/mionkit/ts-runtypes/internal/reflection"
)

// unknownKeysPureFnFilePath is the source path the resolver reports as the
// pf_getUnknownKeysFromArray / pf_hasUnknownKeysFromArray registrations'
// expected home (the `{3}` arg in the PFE9012 message). Same file as the
// validationErrors pure-fns (pure-fns-utils.ts). Repo-relative hint only — the
// whole-program PFE9012 check matches by key, not by this path.
const unknownKeysPureFnFilePath = "packages/ts-runtypes/src/runtypes/pure-fns-utils.ts"

// objectKeysContext captures the data needed to emit the
// callCheckUnknownProperties call for an object/interface — the
// known-key arrays (RT children and ALL children) and the variable
// names used to refer to them in the closure prologue.
//
// Mirrors addObjectPropsToContext output (interface.ts:232-269).
type objectKeysContext struct {
	keysName         string   // variable name in closure scope for the RT-children key array
	allKeysName      string   // variable name in closure scope for the ALL-children key array
	rtChildrenNames  []string // sorted unique RT-children property names
	allChildrenNames []string // sorted unique ALL-children property names
	hasNonRTChildren bool     // true when RT children is a strict subset of ALL children
}

// addObjectPropsToContext computes (and registers in the closure
// prologue) the known-key arrays for an interface/object. The arrays
// are emitted once per unique RunType per closure via context items —
// the reference does the same so the same hash → same key-array literal.
//
// Mirrors addObjectPropsToContext (interface.ts:243-269).
func addObjectPropsToContext(rt *reflection.RunType, ctx *EmitContext) objectKeysContext {
	rtNames, allNames := collectObjectChildNames(rt, ctx)

	rtChildrenNames := dedupSortStrings(rtNames)
	allChildrenNames := dedupSortStrings(allNames)

	hasNonRTChildren := !sameStringSet(rtChildrenNames, allChildrenNames)

	// Variable names mirror the `k_<hash>` / `kA_<hash>` scheme. We
	// use the RunType ID as the hash so the same canonical object
	// reuses the same context-item key across emit calls.
	keysName := "k_" + rt.ID
	allKeysName := "kA_" + rt.ID

	if !ctx.HasContextItem(keysName) {
		ctx.SetContextItem(keysName, "const "+keysName+" = "+arrayToJSLiteral(rtChildrenNames))
	}
	if hasNonRTChildren && !ctx.HasContextItem(allKeysName) {
		ctx.SetContextItem(allKeysName, "const "+allKeysName+" = "+arrayToJSLiteral(allChildrenNames))
	}

	return objectKeysContext{
		keysName:         keysName,
		allKeysName:      allKeysName,
		rtChildrenNames:  rtChildrenNames,
		allChildrenNames: allChildrenNames,
		hasNonRTChildren: hasNonRTChildren,
	}
}

// collectObjectChildNames returns two slices of named property names —
// the RT-included subset, and the FULL set (including children dropped
// by RT for being function-typed, static, or otherwise not part of the
// serialised shape). Both lists exclude index-signature children (those
// don't have property names) AND children with empty names.
//
// Mirrors getRTChildren + getChildRunTypes filter+name pluck
// in addObjectPropsToContext.
func collectObjectChildNames(rt *reflection.RunType, ctx *EmitContext) (rtNames []string, allNames []string) {
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil {
			continue
		}
		if resolved.Kind == reflection.KindIndexSignature {
			continue
		}
		if resolved.Name == "" {
			continue
		}
		allNames = append(allNames, resolved.Name)
		// RT child filter: drop static + function-like (PropertySignature
		// wrapping a function, KindMethod, KindMethodSignature) entries
		// the RT skips. Match emitObjectPrepareForJson's filter.
		if resolved.IsStatic {
			continue
		}
		if isFunctionLikeKind(resolved.Kind) {
			continue
		}
		// PropertySignature / Property wrapping a function-typed child:
		// the parent's RT chain drops them too.
		if (resolved.Kind == reflection.KindProperty || resolved.Kind == reflection.KindPropertySignature) && resolved.Child != nil {
			grandchild := ctx.ResolveRef(resolved.Child)
			if grandchild != nil && isFunctionLikeKind(grandchild.Kind) {
				continue
			}
		}
		rtNames = append(rtNames, resolved.Name)
	}
	return rtNames, allNames
}

// dedupSortStrings deduplicates + sorts a string slice. Sorting keeps
// the emitted array literal deterministic across runs (Go's `for k :=
// range map` iteration order is random); the JS Set + Array.from
// preserves insertion order, but our Go side has to be deterministic
// for byte-stable cache outputs.
func dedupSortStrings(in []string) []string {
	if len(in) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(in))
	out := make([]string, 0, len(in))
	for _, s := range in {
		if _, ok := seen[s]; ok {
			continue
		}
		seen[s] = struct{}{}
		out = append(out, s)
	}
	sort.Strings(out)
	return out
}

// sameStringSet reports whether two slices (both already deduped) contain
// the same string set.
func sameStringSet(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// arrayToJSLiteral renders a string slice as a JS array literal — each
// element quoted as a single-quoted string with backslash + single-quote
// escapes applied. Mirrors the arrayToLiteral helper.
func arrayToJSLiteral(items []string) string {
	if len(items) == 0 {
		return "[]"
	}
	parts := make([]string, 0, len(items))
	for _, item := range items {
		parts = append(parts, quoteJS(item))
	}
	return "[" + strings.Join(parts, ",") + "]"
}

// objectHasIndexSignatureChild reports whether the object has an
// index-signature child that the RT didn't filter out. Index sigs
// flip the "any unknown key is unknown" semantic: when present, every
// key matching the index pattern is considered "known".
func objectHasIndexSignatureChild(rt *reflection.RunType, ctx *EmitContext) bool {
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil {
			continue
		}
		if resolved.Kind == reflection.KindIndexSignature {
			return true
		}
	}
	return false
}

// callCheckUnknownPropertiesForHas mirrors
// callCheckUnknownProperties (interface.ts:272-300) for the
// hasUnknownKeys family. Emits a JS expression that's `true` when
// the value has at least one key outside the known-keys array.
//
// When returnKeys=true the expression returns the array of unknown
// keys instead of a boolean — used by strip/error/undefined emitters.
//
// keepObjectCheck controls whether the boolean (has) form is wrapped in a
// `typeof v === 'object' && v !== null && …` guard. Plain-mode emits keep it
// (standalone hasUnknownKeys may receive garbage); the `runsAfterValidation`
// variant drops it — validation already proved every object position. The
// returnKeys form never guards (parity with the reference emit).
func callCheckUnknownPropertiesForHas(rt *reflection.RunType, ctx *EmitContext, returnKeys bool, keepObjectCheck bool) string {
	keysCtx := addObjectPropsToContext(rt, ctx)
	if len(keysCtx.rtChildrenNames) == 0 && len(keysCtx.allChildrenNames) == 0 {
		return ""
	}
	v := ctx.Vλl
	conditional := keysCtx.keysName
	if keysCtx.hasNonRTChildren {
		// Honor the `checkNonRTProps` runtime option — when truthy, fold
		// every declared key (including non-RT) into "known" set.
		optsArg := ctx.ArgName("θpts")
		if optsArg != "" {
			conditional = optsArg + ".checkNonRTProps ? " + keysCtx.allKeysName + " : " + keysCtx.keysName
		}
	}
	if returnKeys {
		fnVar := ctx.UsePureFn(corePureFnNamespace, "getUnknownKeysFromArray", unknownKeysPureFnFilePath)
		return fnVar + "(" + v + ", " + conditional + ")"
	}
	fnVar := ctx.UsePureFn(corePureFnNamespace, "hasUnknownKeysFromArray", unknownKeysPureFnFilePath)
	call := fnVar + "(" + v + ", " + conditional + ")"
	if !keepObjectCheck {
		// runsAfterValidation: validation already proved this position is a
		// non-null object; the guard is dead weight. (A for-in over
		// undefined/null iterates zero times anyway, so even the optional-
		// property descent stays safe.)
		return call
	}
	// Object guard around the pure-fn call: the emit prepends
	// `typeof v === 'object' && v !== null` so non-object inputs don't
	// reach the pure-fn (which expects an object). Match that.
	return objectGuard(v, call)
}

// countFastPathN reports whether an object node is eligible for the
// `runsAfterValidation` key-count fast path, and the declared prop count N
// to compare against. Eligible iff:
//
//   - every RT child property is REQUIRED (validation then proves all N are
//     present, so `countEnumKeys(v) !== N` exactly separates clean from
//     dirty — see the spec's swap/missing-prop counterexamples), and
//   - there is no index-signature child (the caller suppresses the parent
//     check entirely for those), and
//   - the RT children equal ALL children (non-RT props — function-typed,
//     static — aren't validated, so their presence is unpredictable and the
//     count is meaningless; those shapes fall back to the key-array scan).
//
// Unlike addObjectPropsToContext this registers NOTHING in the closure
// prologue — the fast path needs no key arrays.
func countFastPathN(rt *reflection.RunType, ctx *EmitContext) (int, bool) {
	rtNames, allNames := collectObjectChildNames(rt, ctx)
	rtChildren := dedupSortStrings(rtNames)
	allChildren := dedupSortStrings(allNames)
	if len(rtChildren) == 0 {
		return 0, false
	}
	if !sameStringSet(rtChildren, allChildren) {
		return 0, false
	}
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil {
			continue
		}
		if resolved.Kind == reflection.KindIndexSignature {
			return 0, false
		}
		if resolved.IsStatic || isFunctionLikeKind(resolved.Kind) {
			continue
		}
		if resolved.Optional {
			return 0, false
		}
	}
	return len(rtChildren), true
}

// emitCountKeys emits the key-count fast-path expression `cntEK(v) === N` (or
// `!==`) and registers the rt::countEnumKeys pure-fn dependency + closure alias.
//
// Which counter `cntEK` actually is depends on the runtime, and the emitter
// deliberately does NOT care: rt::countEnumKeys is a factory that picks a
// for-in counter on V8 and an Object.keys counter on JavaScriptCore (Bun),
// once at materialisation, because the two engines invert on which is faster.
// Both forms are pinned to answer identically for every input (see
// pf_countEnumKeys in packages/ts-runtypes/src/runtypes/pure-fns-utils.ts), so
// the emitted expression is unchanged and keeps the enumeration semantics
// hUKFA had.
// `match` picks the direction. hasUnknownKeys wants the NEGATIVE
// (`cntEK(v) !== N`, "something extra is here"); the fused validators
// AND-chain the POSITIVE assertion into a boolean expression
// (`cntEK(v) === N`, "exactly the declared keys"), so emitting it directly
// keeps the body readable and saves a negation at runtime.
func emitCountKeys(ctx *EmitContext, v string, n int, match bool) string {
	fnVar := ctx.UsePureFn(corePureFnNamespace, "countEnumKeys", unknownKeysPureFnFilePath)
	comparison := " !== "
	if match {
		comparison = " === "
	}
	return fnVar + "(" + v + ")" + comparison + strconv.Itoa(n)
}

// KeyCheckShape names how a caller composes its parent key check, so
// arraySkipsKeyCheck can render the skip in the caller's own algebra.
type KeyCheckShape int

const (
	// KeyCheckAnd — a term in an `&&` chain meaning "this object is clean"
	// (the fused validator). Skipping contributes TRUE.
	KeyCheckAnd KeyCheckShape = iota
	// KeyCheckOr — a term in an `||` chain meaning "something undeclared is
	// here" (hasUnknownKeys). Skipping contributes FALSE.
	KeyCheckOr
	// KeyCheckStatements — a block that records or mutates (unknownKeyErrors,
	// strip, the fused error form). Skipping runs nothing.
	KeyCheckStatements
)

// arraySkipsKeyCheck wraps a parent key check so it never runs on an array.
//
// # No family checks an array for undeclared keys. Not one, not any variant.
//
// An array cannot carry undeclared object properties: its enumerable keys ARE
// its elements. `'0'` and `'1'` on `[a, b]` are not stray properties somebody
// added, they are the array. Reporting them says nothing a reader can act on,
// and a JSON payload cannot express the thing the check is looking for.
//
// This is the ONE place that rule lives, and every parent key check goes through
// it: the blind predicate, its `runsAfterValidation` variant, the fused
// validator and the fused error form. Four families that must answer alike, one
// helper, so they cannot drift — which is exactly how they drifted before.
//
// # It is not the object guard, and it is not made redundant by validation
//
// The blind families wrap their whole chain in unknownKeysObjectGuard
// (`typeof v === 'object' && v !== null && !Array.isArray(v)`) because nothing
// above them has established shape. The `runsAfterValidation` variant and the
// fused families drop the `typeof` / `!== null` half, and should: the caller
// promised validation ran, and the fused validator emits that half itself as the
// leading term of the very same chain.
//
// The array half is different, and this is the easy mistake. Passing validation
// does NOT prove a value is not an array, because an array can structurally
// satisfy an object shape — `[1, 2]` is a `{length: number}`, `['x']` is a
// `{0: string}`. So the array test survives where the rest of the guard goes,
// and each term is still emitted exactly once.
//
// # It does not stop descent into an array
//
// This wraps an OBJECT node's own key check. An ARRAY node emits no key check at
// all, only the traversal of its elements, and each element's object arm carries
// its own. `[{a: 'x', evil: 1}]` against `Item[]` is still rejected, with
// `{path: [0, 'evil'], expected: 'never'}`.
func arraySkipsKeyCheck(v string, check string, shape KeyCheckShape) string {
	switch shape {
	case KeyCheckAnd:
		return "(Array.isArray(" + v + ") || " + check + ")"
	case KeyCheckOr:
		return "(!Array.isArray(" + v + ") && " + check + ")"
	default:
		return "if (!Array.isArray(" + v + ")) {" + check + "}"
	}
}

// collectObjectHasUnknownKeysChildren is a helper that returns the
// per-child hasUnknownKeys expressions for an object's children, plus a
// flag indicating whether the object has an index-signature child.
// Mirrors super.emitHasUnknownKeys (the CollectionRunType default) but
// inlined here so the interface emit can stitch parent+children
// together with `||`.
func collectObjectHasUnknownKeysChildren(rt *reflection.RunType, ctx *EmitContext) ([]string, bool) {
	var parts []string
	hasIndex := false
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil {
			continue
		}
		if resolved.Kind == reflection.KindIndexSignature {
			hasIndex = true
		}
		if resolved.IsStatic {
			continue
		}
		if isFunctionLikeKind(resolved.Kind) {
			continue
		}
		childRT := ctx.CompileChild(child, CodeE)
		if childRT.Type == CodeNS {
			// Children with NS propagate upward — but for unknown-keys
			// emit we tolerate them as "no contribution" (the parent
			// renderer drops the factory if needed). Skip the child.
			continue
		}
		if childRT.Code == "" {
			continue
		}
		parts = append(parts, childRT.Code)
	}
	return parts, hasIndex
}

// joinSemicolons joins non-empty strings with `;`. Empty entries are
// dropped. Shared by the unknown-keys statement-shaped family emitters
// (unknownKeyErrors, unknownKeysToUndefined).
func joinSemicolons(parts ...string) string {
	var nonEmpty []string
	for _, part := range parts {
		if part != "" {
			nonEmpty = append(nonEmpty, part)
		}
	}
	return strings.Join(nonEmpty, ";")
}

// joinOr joins JS expressions with ` || `. Wraps in parens when there's
// more than one to keep precedence stable when the result is nested.
func joinOr(parts []string) string {
	if len(parts) == 0 {
		return ""
	}
	if len(parts) == 1 {
		return parts[0]
	}
	return "(" + strings.Join(parts, " || ") + ")"
}

// unknownKeysObjectGuard is the shape precondition every OBJECT-node
// unknown-keys emit runs under. A key scan only means "declared vs
// undeclared" when the value actually is a plain object: on anything else
// the descent either throws (`v.address` against null/undefined) or invents
// keys, because `for (const k in v)` walks a string's character indices and
// an array's element indices. Guarded out, the node contributes nothing and
// the family reports its neutral answer — no errors for unknownKeyErrors,
// false for hasUnknownKeys. Reporting the SHAPE is validationErrors' job,
// which is what keeps the documented `[...verr(v), ...uke(v)]` report free
// of duplicate shape errors. Same predicate the merged-union emit already
// gates on (emitUnionUnknownKeysMerged).
func unknownKeysObjectGuard(v string) string {
	return "typeof " + v + " === 'object' && " + v + " !== null && !Array.isArray(" + v + ")"
}

// unknownKeysArrayGuard is the same precondition for an ARRAY / TUPLE node,
// whose descent reads `v.length` and `v[i]`.
func unknownKeysArrayGuard(v string) string {
	return "Array.isArray(" + v + ")"
}

// guardStatement wraps a statement-shaped body in a shape guard.
func guardStatement(guard, body string) string {
	return "if (" + guard + ") {" + body + "}"
}

// trimWhitespace removes leading + trailing whitespace and the trailing
// semicolon. Used inside Finalize-detection helpers to recognise
// "essentially empty" bodies.
func trimWhitespace(code string) string {
	out := strings.TrimSpace(code)
	for strings.HasSuffix(out, ";") {
		out = strings.TrimSpace(out[:len(out)-1])
	}
	return out
}

// siblingNamedKeysCtxKey returns the context-item key under which a
// parent object's sibling-named-prop set is stored for `idxSig` (the
// child index-signature RunType). The key is derived from the index
// sig's own RunType ID — the only canonical handle the index-sig emit
// has on itself, since we can't store parent-relative data on a shared
// canonical node (see CLAUDE.md "Never store parent-relative data on a
// canonical node").
func siblingNamedKeysCtxKey(idxSig *reflection.RunType) string {
	return "siblingNamed_" + idxSig.ID
}

// publishSiblingNamedKeysForIndexSig walks `rt`'s children; for each
// IndexSignature child, registers a closure-prologue
// `const siblingNamed_<idxSigID> = new Set(['name1', 'name2'])` so the
// index-sig emit can guard `if (siblingNamed_X.has(prop)) continue;`
// at the top of its for-in loop. Mirrors
// IndexSignatureRunType.getSkipCode + InterfaceRunType.getNamedChildren
// (ref: packages/run-types/src/nodes/member/indexProperty.ts:166-173,
// nodes/collection/interface.ts:getNamedChildren).
//
// Called from every per-family object emit (validate, validationErrors,
// hasUnknownKeys, stripUnknownKeys, unknownKeyErrors,
// unknownKeysToUndefined) when the object mixes named props with an
// index signature. Each family compiles into its own walker with its
// own context items, so the same key can be re-published per family
// without collision.
func publishSiblingNamedKeysForIndexSig(rt *reflection.RunType, ctx *EmitContext) {
	siblingNames := indexSigExemptKeys(rt, ctx)
	if len(siblingNames) == 0 {
		return
	}
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil || resolved.Kind != reflection.KindIndexSignature {
			continue
		}
		ctxKey := siblingNamedKeysCtxKey(resolved)
		if ctx.HasContextItem(ctxKey) {
			continue
		}
		ctx.SetContextItem(ctxKey, "const "+ctxKey+" = new Set("+arrayToJSLiteral(siblingNames)+")")
	}
}

// indexSigExemptKeys is the key set an index signature's sweep may SKIP.
//
// By default that is every declared sibling (collectSiblingNamedKeys): TypeScript
// rejects a declared member incompatible with its own index signature, so within
// ONE declaration skipping them cannot lose a check. An INTERSECTION breaks that
// argument — a member contributed by one constituent faces another's index
// signature — which is exactly what JSON Schema's `additionalProperties` means
// when an `allOf` member declares a property.
//
// So when the node carries the `additionalOwn` param (the schema's OWN
// `properties` keys, written by the door for a schema-valued
// `additionalProperties`), that list wins: keys from anywhere else stay in the
// sweep and face the value check. Types without the param are unaffected.
func indexSigExemptKeys(rt *reflection.RunType, ctx *EmitContext) []string {
	if rt.FormatAnnotation != nil && rt.FormatAnnotation.Name == "formattedObject" {
		if own, ok := rt.FormatAnnotation.Params["additionalOwn"]; ok {
			return stringListParam(own)
		}
	}
	return collectSiblingNamedKeys(rt, ctx)
}

// stringListParam reads a `readonly string[]` param off a format annotation.
// The wire carries it as []any of strings (the literal tuple walk), so the
// conversion is a filter rather than a cast.
func stringListParam(raw any) []string {
	entries, ok := raw.([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(entries))
	for _, entry := range entries {
		if name, isString := entry.(string); isString {
			out = append(out, name)
		}
	}
	if len(out) == 0 {
		return nil
	}
	return dedupSortStrings(out)
}

// collectSiblingNamedKeys returns the deduped, sorted names of every declared
// property that must be SKIPPED by an index-signature for-in loop: every named
// non-static child. Crucially it keys on the NAME, independent of whether the
// per-family emit keeps or DROPS the property — a property whose value is
// DataOnly-stripped (`p0: ArrayBuffer`) is dropped from the projection but its
// key must still be skipped so the index loop doesn't copy it back in (G6).
// FUNCTION-LIKE children are stripped the same way and so are covered by that
// same rule: excluding them here left their key in the sweep, and the index
// signature's own value encoder then ran over a function
// (`{p0: () => number; [k: number]: RegExp}` reached serString(undefined) — an
// uncontrolled TypeError in binary, a function silently serialized as its
// source text in JSON). Statics stay out: they are not own enumerable keys, so
// no for-in ever reaches them.
// Shared by publishSiblingNamedKeysForIndexSig (binary + the JSON mutate /
// stringify walks) and the clone path's buildSafeIndexSignatureObject.
func collectSiblingNamedKeys(rt *reflection.RunType, ctx *EmitContext) []string {
	var siblingNames []string
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil || resolved.Kind == reflection.KindIndexSignature {
			continue
		}
		if resolved.IsStatic {
			continue
		}
		if resolved.Name != "" {
			siblingNames = append(siblingNames, resolved.Name)
		}
	}
	if len(siblingNames) == 0 {
		return nil
	}
	return dedupSortStrings(siblingNames)
}

// siblingNamedSkipCode returns the JS prologue to inject at the top
// of an index-signature for-in loop body so iterations matching a
// sibling named property are skipped. Returns "" when the parent
// object emit didn't publish a sibling-names set for this idxSig
// (objects without named props alongside the index sig). Mirrors
// the getSkipCode return shape (indexProperty.ts:172) —
// `if (sib === prop) continue;`. Multi-sibling form uses the published
// Set for O(1) membership; the reference emits `if (a===prop || b===prop) continue;`
// but Set.has(prop) reads the same at runtime and we already build the
// set for the unknownKeysToUndefined consumer.
func siblingNamedSkipCode(idxSig *reflection.RunType, ctx *EmitContext, prop string) string {
	if idxSig == nil {
		return ""
	}
	ctxKey := siblingNamedKeysCtxKey(idxSig)
	if !ctx.HasContextItem(ctxKey) {
		return ""
	}
	return "if (" + ctxKey + ".has(" + prop + ")) continue;"
}

// siblingPatternsCtxKey / siblingPatternRegexCtxKey name the closure-prologue
// items the patternProperties EXEMPTION rides. Keyed by the index signature's
// canonical id for the same reason siblingNamedKeysCtxKey is (never
// parent-relative data on a canonical node).
func siblingPatternsCtxKey(idxSig *reflection.RunType) string {
	return "ppSkip_" + idxSig.ID
}
func siblingPatternRegexCtxKey(idxSig *reflection.RunType, position int) string {
	return "rePPSkip_" + idxSig.ID + "_" + strconv.Itoa(position)
}

// publishSiblingPatternsForIndexSig is the patternProperties twin of
// publishSiblingNamedKeysForIndexSig. Per 2020-12 a key matched by a sibling
// `patternProperties` entry is NOT "additional", so it must be exempt from the
// index signature a schema-valued `additionalProperties` lowers to — exactly as
// a sibling NAMED property is. Without the exemption
// `{properties: …, patternProperties: {'f.o': …}, additionalProperties: {type:
// 'integer'}}` rejects `{fxo: [1, 2]}`, which the pattern entry accepts.
//
// Registers one hoisted RegExp per source plus a single prologue predicate
// (`const ppSkip_X = (k) => reA.test(k) || reB.test(k)`) so the loop pays one
// call per key and allocates nothing. No-op for objects with no patternProps or
// no index signature — i.e. every non-schema-authored type.
func publishSiblingPatternsForIndexSig(rt *reflection.RunType, ctx *EmitContext) {
	if len(rt.PatternProps) == 0 {
		return
	}
	var sources []string
	for _, patternProp := range rt.PatternProps {
		if patternProp != nil && patternProp.Source != "" {
			sources = append(sources, patternProp.Source)
		}
	}
	if len(sources) == 0 {
		return
	}
	sources = dedupSortStrings(sources)
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil || resolved.Kind != reflection.KindIndexSignature {
			continue
		}
		predicateKey := siblingPatternsCtxKey(resolved)
		if ctx.HasContextItem(predicateKey) {
			continue
		}
		tests := make([]string, 0, len(sources))
		for position, source := range sources {
			regexKey := siblingPatternRegexCtxKey(resolved, position)
			if !ctx.HasContextItem(regexKey) {
				ctx.SetContextItem(regexKey, "const "+regexKey+" = new RegExp("+jsquote.Double(source)+")")
			}
			tests = append(tests, regexKey+".test(k)")
		}
		ctx.SetContextItem(predicateKey, "const "+predicateKey+" = (k) => "+strings.Join(tests, " || "))
	}
}

// siblingPatternSkipCode is the patternProperties twin of siblingNamedSkipCode:
// the `if (…) continue;` line the index-signature for-in loop opens with so a
// pattern-matched key never also faces the additionalProperties value check.
// Returns "" when the parent emit published no predicate for this index sig.
func siblingPatternSkipCode(idxSig *reflection.RunType, ctx *EmitContext, prop string) string {
	if idxSig == nil {
		return ""
	}
	predicateKey := siblingPatternsCtxKey(idxSig)
	if !ctx.HasContextItem(predicateKey) {
		return ""
	}
	return "if (" + predicateKey + "(" + prop + ")) continue;"
}

// unknownKeysChildrenCode collects each non-static, non-function child's
// emitted code (CodeS) and joins with `;`. Shared by the object emit of the
// strip / unknownKeyErrors / unknownKeysToUndefined families — the
// child-filtering + compile loop is identical across all three.
func unknownKeysChildrenCode(rt *reflection.RunType, ctx *EmitContext) string {
	var parts []string
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil {
			continue
		}
		if resolved.IsStatic {
			continue
		}
		if isFunctionLikeKind(resolved.Kind) {
			continue
		}
		childRT := ctx.CompileChild(child, CodeS)
		if childRT.Type == CodeNS {
			continue
		}
		if childRT.Code != "" {
			parts = append(parts, childRT.Code)
		}
	}
	return strings.Join(parts, ";")
}

// unknownKeysSupports gates the renderer's top-level loop for EVERY
// unknown-keys family emitter (has / strip / errors / toUndefined /
// toUndefinedWire) — the families differ in what they emit per kind,
// never in which kinds they accept. Same set as the prepareForJson /
// validationErrors emitters in Phase 0 (every kind a real codegen pass
// will need to either handle or transparently no-op). Atomic kinds emit
// an empty body and each family's Finalize folds that to its noop shape.
func unknownKeysSupports(rt *reflection.RunType) bool {
	if rt == nil {
		return false
	}
	switch rt.Kind {
	case reflection.KindAny, reflection.KindUnknown,
		reflection.KindVoid,
		reflection.KindNull, reflection.KindUndefined,
		reflection.KindString, reflection.KindNumber, reflection.KindBoolean,
		reflection.KindBigInt, reflection.KindSymbol,
		reflection.KindObject, reflection.KindRegexp,
		reflection.KindLiteral, reflection.KindEnum,
		reflection.KindNever, reflection.KindTemplateLiteral:
		return true
	case reflection.KindObjectLiteral:
		return true
	case reflection.KindClass:
		switch rt.SubKind {
		case reflection.SubKindDate, reflection.SubKindNone,
			reflection.SubKindMap, reflection.SubKindSet,
			reflection.SubKindNonSerializable:
			return true
		}
		return reflection.IsTemporalSubKind(rt.SubKind)
	case reflection.KindArray:
		return rt.Child != nil
	case reflection.KindTuple:
		return true
	case reflection.KindTupleMember:
		return true
	case reflection.KindProperty, reflection.KindPropertySignature:
		return true
	case reflection.KindIndexSignature:
		return true
	case reflection.KindUnion:
		return len(rt.Children) > 0
	case reflection.KindIntersection:
		return true
	case reflection.KindPromise:
		// Promise wraps don't track unknown keys (the value is a
		// then-able, not a plain object). Same noop stance as atomic.
		return true
	case reflection.KindFunction, reflection.KindMethod,
		reflection.KindMethodSignature, reflection.KindCallSignature:
		// Function values aren't objects with enumerable own keys to
		// check; the function emit is a noop. Same here.
		return true
	}
	return false
}

// emitTupleUnknownKeysRecurse is the shared tuple arm for the errors and
// strip families: recurse into every slot and join the surviving child
// statements. (toUndefined deliberately no-ops at tuples instead — see
// emitTupleUnknownKeysToUndefined.)
func emitTupleUnknownKeysRecurse(rt *reflection.RunType, ctx *EmitContext) RTCode {
	if len(rt.Children) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}
	var parts []string
	for _, child := range rt.Children {
		childRT := ctx.CompileChild(child, CodeS)
		if childRT.Type == CodeNS {
			continue
		}
		if childRT.Code != "" {
			parts = append(parts, childRT.Code)
		}
	}
	if len(parts) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}
	body := guardStatement(unknownKeysArrayGuard(ctx.Vλl), strings.Join(parts, ";"))
	return RTCode{Code: body, Type: CodeS}
}
