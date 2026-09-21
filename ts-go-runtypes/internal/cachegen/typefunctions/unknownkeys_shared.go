package typefunctions

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnids"
	"sort"
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/jsquote"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// objectKeysContext holds an object's known-key arrays (RT children and ALL children) and their closure variable names.
type objectKeysContext struct {
	keysName         string   // variable name in closure scope for the RT-children key array
	allKeysName      string   // variable name in closure scope for the ALL-children key array
	rtChildrenNames  []string // sorted unique RT-children property names
	allChildrenNames []string // sorted unique ALL-children property names
	hasNonRTChildren bool     // true when RT children is a strict subset of ALL children
}

// addObjectPropsToContext registers an object's known-key arrays in the closure prologue, once per unique RunType.
func addObjectPropsToContext(rt *reflection.RunType, ctx *EmitContext) objectKeysContext {
	rtNames, allNames := collectObjectChildNames(rt, ctx)

	rtChildrenNames := dedupSortStrings(rtNames)
	allChildrenNames := dedupSortStrings(allNames)

	hasNonRTChildren := !sameStringSet(rtChildrenNames, allChildrenNames)

	// The RunType ID is the hash, so the same canonical object reuses one context-item key across emit calls.
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

// collectObjectChildNames returns the RT-included property names and the FULL set, which keeps the children RT drops.
// Both lists exclude index-signature children (they have no property name) and children with empty names.
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
		// The RT skips static and function-like entries; the prepare-for-JSON filter drops the same ones.
		if resolved.IsStatic {
			continue
		}
		if reflection.IsUnsafePropertyName(resolved.Name) {
			continue
		}
		if isFunctionLikeKind(resolved.Kind) {
			continue
		}
		// A property wrapping a function-typed child: the parent's RT chain drops it too.
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

// dedupSortStrings dedups and sorts; sorting is what keeps the emitted array literal byte-stable across runs.
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

// sameStringSet reports whether two already-deduped, sorted slices hold the same strings.
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

// arrayToJSLiteral renders a string slice as a JS array literal of single-quoted strings.
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

// objectHasIndexSignatureChild reports an index-signature child, which makes every key matching the pattern "known".
func objectHasIndexSignatureChild(rt *reflection.RunType, ctx *EmitContext) bool {
	for _, child := range objectMembers(rt) {
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

// callCheckUnknownPropertiesForHas emits the expression that is `true` when the value has a key outside the known-keys array.
// returnKeys=true returns the array of unknown keys instead, for the strip / error / undefined emitters.
// keepObjectCheck wraps the boolean form in the object guard; `runsAfterValidation` drops it, and returnKeys never guards.
func callCheckUnknownPropertiesForHas(rt *reflection.RunType, ctx *EmitContext, returnKeys bool, keepObjectCheck bool) string {
	keysCtx := addObjectPropsToContext(rt, ctx)
	if len(keysCtx.rtChildrenNames) == 0 && len(keysCtx.allChildrenNames) == 0 {
		return ""
	}
	v := ctx.Vλl
	conditional := keysCtx.keysName
	if keysCtx.hasNonRTChildren {
		// The `checkNonRTProps` runtime option folds every declared key, non-RT ones included, into the known set.
		optsArg := ctx.ArgName("θpts")
		if optsArg != "" {
			conditional = optsArg + ".checkNonRTProps ? " + keysCtx.allKeysName + " : " + keysCtx.keysName
		}
	}
	if returnKeys {
		fnVar := ctx.UsePureFn(purefnids.GetUnknownKeysFromArray)
		return fnVar + "(" + v + ", " + conditional + ")"
	}
	fnVar := ctx.UsePureFn(purefnids.HasUnknownKeysFromArray)
	call := fnVar + "(" + v + ", " + conditional + ")"
	if !keepObjectCheck {
		// runsAfterValidation: validation already proved a non-null object, and a for-in over undefined iterates zero times anyway.
		return call
	}
	// The pure fn expects an object, so non-object inputs must not reach it.
	return objectGuard(v, call)
}

// countFastPathN reports the declared prop count N for the `runsAfterValidation` key-count fast path, and whether the node is eligible:
//
//   - every RT child is REQUIRED, so validation proves all N present and `countEnumKeys(v) !== N` separates clean from dirty,
//   - no index-signature child (the caller suppresses the parent check entirely for those), and
//   - RT children equal ALL children: non-RT props are never validated, so the count would mean nothing.
//
// Registers NOTHING in the closure prologue: the fast path needs no key arrays.
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
		if reflection.IsUnsafePropertyName(resolved.Name) {
			continue
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

// emitCountKeys emits the key-count expression `cntEK(v) === N` (or `!==`) and registers the countEnumKeys pure fn.
//
// Which counter countEnumKeys picks is per engine (for-in on V8, Object.keys on JavaScriptCore), and both forms are
// pinned to answer identically for every input, so the emitter does not care (packages/run-types/src/runtypes/pure-fns-utils.ts).
// `match` picks the direction: hasUnknownKeys wants the negative `!==`, the fused validators AND-chain the positive `===`.
func emitCountKeys(ctx *EmitContext, v string, n int, match bool) string {
	fnVar := ctx.UsePureFn(purefnids.CountEnumKeys)
	comparison := " !== "
	if match {
		comparison = " === "
	}
	return fnVar + "(" + v + ")" + comparison + strconv.Itoa(n)
}

// collectObjectHasUnknownKeysChildren returns the per-child hasUnknownKeys expressions plus whether an index-signature
// child was seen, so the object emit can stitch parent and children together with `||`.
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
		if reflection.IsUnsafePropertyName(resolved.Name) {
			continue
		}
		if isFunctionLikeKind(resolved.Kind) {
			continue
		}
		childRT := ctx.CompileChild(child, CodeE)
		if childRT.Type == CodeNS {
			// NS normally propagates upward; for unknown-keys it counts as no contribution instead.
			continue
		}
		if childRT.Code == "" {
			continue
		}
		parts = append(parts, childRT.Code)
	}
	return parts, hasIndex
}

// joinSemicolons joins non-empty strings with `;`, dropping the empty ones.
func joinSemicolons(parts ...string) string {
	var nonEmpty []string
	for _, part := range parts {
		if part != "" {
			nonEmpty = append(nonEmpty, part)
		}
	}
	return strings.Join(nonEmpty, ";")
}

// joinOr joins JS expressions with ` || `, parenthesised past one so precedence holds when the result is nested.
func joinOr(parts []string) string {
	if len(parts) == 0 {
		return ""
	}
	if len(parts) == 1 {
		return parts[0]
	}
	return "(" + strings.Join(parts, " || ") + ")"
}

// unknownKeysObjectGuard is the shape precondition every OBJECT-node unknown-keys emit runs under.
// A key scan only means "declared vs undeclared" on a plain object: elsewhere the descent throws (`v.address` on null)
// or invents keys, since `for (const k in v)` walks a string's character indices and an array's element indices.
// Guarded out, the node reports its family's neutral answer; reporting the SHAPE is validationErrors' job, which keeps
// `[...verr(v), ...uke(v)]` free of duplicate shape errors. Same predicate emitUnionUnknownKeysMerged gates on.
func unknownKeysObjectGuard(v string) string {
	return "typeof " + v + " === 'object' && " + v + " !== null && !Array.isArray(" + v + ")"
}

// unknownKeysArrayGuard is the same precondition for an ARRAY / TUPLE node, whose descent reads `v.length` and `v[i]`.
func unknownKeysArrayGuard(v string) string {
	return "Array.isArray(" + v + ")"
}

func guardStatement(guard, body string) string {
	return "if (" + guard + ") {" + body + "}"
}

// trimWhitespace also drops every trailing semicolon, so Finalize can recognise an "essentially empty" body.
func trimWhitespace(code string) string {
	out := strings.TrimSpace(code)
	for strings.HasSuffix(out, ";") {
		out = strings.TrimSpace(out[:len(out)-1])
	}
	return out
}

// siblingNamedKeysCtxKey names the context item holding the parent object's sibling-named-prop set for `idxSig`.
// Keyed by the index sig's own RunType ID, the only canonical handle it has: parent-relative data must never live on a
// shared canonical node.
func siblingNamedKeysCtxKey(idxSig *reflection.RunType) string {
	return "siblingNamed_" + idxSig.ID
}

// publishSiblingNamedKeysForIndexSig registers `const siblingNamed_<idxSigID> = new Set([...])` per index-signature child,
// so the index-sig emit can skip those keys at the top of its for-in loop.
// Each family compiles into its own walker with its own context items, so one key is re-published per family without collision.
func publishSiblingNamedKeysForIndexSig(rt *reflection.RunType, ctx *EmitContext) {
	siblingNames := indexSigExemptKeys(rt, ctx)
	if len(siblingNames) == 0 {
		return
	}
	for _, child := range objectMembers(rt) {
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

// indexSigExemptKeys is the key set an index signature's sweep may SKIP, by default every declared sibling.
// TypeScript rejects a declared member incompatible with its own index signature, so within ONE declaration skipping
// them cannot lose a check; an INTERSECTION breaks that argument, which is what JSON Schema's `additionalProperties`
// means when an `allOf` member declares a property. So the `additionalOwn` param (the schema's OWN `properties` keys)
// wins when present: keys from anywhere else stay in the sweep and face the value check.
func indexSigExemptKeys(rt *reflection.RunType, ctx *EmitContext) []string {
	if rt.FormatAnnotation != nil && rt.FormatAnnotation.Name == "formattedObject" {
		if own, ok := rt.FormatAnnotation.Params["additionalOwn"]; ok {
			return stringListParam(own)
		}
	}
	return collectSiblingNamedKeys(rt, ctx)
}

// stringListParam reads a `readonly string[]` format param; the wire carries it as []any, so this filters rather than casts.
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

// collectSiblingNamedKeys returns the deduped, sorted names an index-signature for-in loop must SKIP: every named non-static child.
// It keys on the NAME whatever the per-family emit does with the value: a DataOnly-stripped prop (`p0: ArrayBuffer`) is dropped
// from the projection but its key must still be skipped, or the index loop copies it back in (G6).
// Function-like children are stripped the same way, so they are in too: leaving them out ran the index signature's own value
// encoder over a function (an uncontrolled TypeError in binary, the function's source text in JSON).
// Statics stay out: they are not own enumerable keys, so no for-in ever reaches them.
// Shared by publishSiblingNamedKeysForIndexSig and the clone path's buildSafeIndexSignatureObject.
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

// siblingNamedSkipCode returns the line an index-signature for-in loop opens with so a sibling named property is skipped.
// Returns "" when the parent object emit published no sibling-names set for this idxSig.
// Uses the published Set for O(1) membership, which the unknownKeysToUndefined consumer already builds.
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

// siblingPatternsCtxKey / siblingPatternRegexCtxKey name the closure-prologue items the patternProperties EXEMPTION rides.
// Keyed by the index signature's canonical id for the same reason siblingNamedKeysCtxKey is.
func siblingPatternsCtxKey(idxSig *reflection.RunType) string {
	return "ppSkip_" + idxSig.ID
}
func siblingPatternRegexCtxKey(idxSig *reflection.RunType, position int) string {
	return "rePPSkip_" + idxSig.ID + "_" + strconv.Itoa(position)
}

// publishSiblingPatternsForIndexSig is the patternProperties twin of publishSiblingNamedKeysForIndexSig.
// Per 2020-12 a key matched by a sibling `patternProperties` entry is NOT "additional", so it must be exempt from the index
// signature a schema-valued `additionalProperties` lowers to, exactly as a sibling NAMED property is.
// Without it `{patternProperties: {'f.o': …}, additionalProperties: {type: 'integer'}}` rejects `{fxo: [1, 2]}`, which
// the pattern entry accepts.
// One hoisted RegExp per source plus a single prologue predicate, so the loop pays one call per key and allocates nothing.
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

// siblingPatternSkipCode is the patternProperties twin of siblingNamedSkipCode, so a pattern-matched key never faces the
// additionalProperties value check.
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

// unknownKeysChildrenCode joins each non-static, non-function child's CodeS emit with `;`.
// Shared by the strip / unknownKeyErrors / unknownKeysToUndefined object emits, whose child loop is identical.
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
		if reflection.IsUnsafePropertyName(resolved.Name) {
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

// unknownKeysSupports gates the renderer's top-level loop for EVERY unknown-keys family emitter
// (has / strip / errors / toUndefined / stripUnknownKeysWire): they differ in what they emit per kind, never in which kinds they accept.
// Same set as the prepareForJsonMutate / validationErrors emitters; atomic kinds emit an empty body that each family's
// Finalize folds to its noop shape.
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
		// A promise value is a then-able, not a plain object: noop, like an atomic.
		return true
	case reflection.KindFunction, reflection.KindMethod,
		reflection.KindMethodSignature, reflection.KindCallSignature:
		// Function values have no enumerable own keys to check, so the emit is a noop.
		return true
	}
	return false
}

// emitTupleUnknownKeysRecurse is the shared tuple arm for every family that reports or removes undeclared keys.
// One Array.isArray guard wraps the slot recursion, so an absent or wrong-shaped value never reaches a slot read.
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

// objectCallSignatureChild returns the node's call-signature child, or nil. A shape that has one is a Function with
// properties bolted on, so several emit decisions (the object guard, the brand guard, the unknown-key check) key off it.
func objectCallSignatureChild(rt *reflection.RunType, ctx *EmitContext) *reflection.RunType {
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil {
			continue
		}
		if resolved.Kind == reflection.KindCallSignature {
			return child
		}
	}
	return nil
}
