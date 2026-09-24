package typefunctions

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
	"strconv"
	"strings"
)

// isObjectLikeKind reports whether kind's validate emit needs the shared `typeof === 'object' && !== null` guard.
func isObjectLikeKind(kind reflection.ReflectionKind) bool {
	switch kind {
	case reflection.KindObjectLiteral, reflection.KindClass,
		reflection.KindIndexSignature, reflection.KindArray,
		reflection.KindTuple:
		return true
	}
	return false
}

// isFunctionLikeKind reports whether kind emits a function-shape check, or is skipped as a property's wrapped child.
func isFunctionLikeKind(kind reflection.ReflectionKind) bool {
	switch kind {
	case reflection.KindFunction, reflection.KindMethod,
		reflection.KindMethodSignature, reflection.KindCallSignature:
		return true
	}
	return false
}

// objectHasCallSignature reports whether an object-like RunType carries a KindCallSignature member, which
// makes the whole interface function-like: DataOnly strips it to `never` and validate guards it with
// `typeof === 'function'`. The serializers therefore answer CodeNS for it (alwaysThrow at the root, dropped
// at a property position) rather than walk it as a plain object and disagree with validate.
func objectHasCallSignature(rt *reflection.RunType, ctx *EmitContext) bool {
	if rt == nil {
		return false
	}
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved != nil && resolved.Kind == reflection.KindCallSignature {
			return true
		}
	}
	return false
}

// callableLeafSubstitute swaps a callable interface for its call signature so DiagCodeForLeaf yields a FUNCTION code.
// A "" code silently skips the entry: a JSON composite binds that dangling dep with an unguarded `utl.getRT(key).fn`.
// A nil refTable or unresolvable ref returns the leaf, keeping the silent skip as the unknown-future-kind safety net.
func callableLeafSubstitute(leaf *reflection.RunType, refTable map[string]*reflection.RunType) *reflection.RunType {
	if leaf == nil || leaf.Kind != reflection.KindObjectLiteral {
		return leaf
	}
	for _, child := range leaf.Children {
		resolved := child
		if child != nil && child.Kind == reflection.KindRef {
			if refTable == nil {
				continue
			}
			resolved = refTable[child.ID]
		}
		if resolved != nil && resolved.Kind == reflection.KindCallSignature {
			return resolved
		}
	}
	return leaf
}

// isRestTupleMember reports whether a tuple member carries the "rest" flag the projection sets on `[A, ...B[]]`.
func isRestTupleMember(rt *reflection.RunType) bool {
	if rt == nil || rt.Kind != reflection.KindTupleMember {
		return false
	}
	return hasFlag(rt.Flags, "rest")
}

// isSymbolKeyedIndexSig reports whether a KindIndexSignature has a symbol-typed key (`{[k: symbol]: T}`);
// every emit skips it, because a for-in loop never enumerates a symbol-keyed property.
func isSymbolKeyedIndexSig(rt *reflection.RunType, ctx *EmitContext) bool {
	if rt == nil || rt.Index == nil {
		return false
	}
	indexResolved := ctx.ResolveRef(rt.Index)
	return indexResolved != nil && indexResolved.Kind == reflection.KindSymbol
}

func hasFlag(flags []string, target string) bool {
	for _, flag := range flags {
		if flag == target {
			return true
		}
	}
	return false
}

// patternKeyFlag prefixes the flag of a synthetic index signature; the rest of the flag is the key regex source.
const patternKeyFlag = "patternKey:"

// patternPropMembers turns rt's patternProperties entries into synthetic index signatures the codecs walk
// like any other dynamic-key member. The id derives from the parent's canonical id and the entry's position,
// so the per-member context items (sibling-key sets, hoisted regexes) stay unique and stable.
func patternPropMembers(rt *reflection.RunType) []*reflection.RunType {
	if rt == nil || len(rt.PatternProps) == 0 {
		return nil
	}
	members := make([]*reflection.RunType, 0, len(rt.PatternProps))
	for i, check := range rt.PatternProps {
		if check == nil || check.Value == nil {
			continue
		}
		members = append(members, &reflection.RunType{
			ID:    rt.ID + "_pp" + strconv.Itoa(i),
			Kind:  reflection.KindIndexSignature,
			Child: check.Value,
			Flags: []string{patternKeyFlag + check.Source},
		})
	}
	return members
}

// objectMembers is THE member list a codec walks for an object or class: declared children, then the
// patternProperties entries as synthetic index signatures. Every emitter object arm and every noop / compat
// predicate iterates this, so a pattern-keyed value is encoded, decoded, cloned and counted exactly like an
// index-signature value. validate, validationErrors and the unknown-keys families read rt.PatternProps
// directly instead: they check the pattern as a constraint rather than transform its values. propertyNames
// and contains never reach a codec, neither having a value to transform.
func objectMembers(rt *reflection.RunType) []*reflection.RunType {
	if rt == nil {
		return nil
	}
	synthetic := patternPropMembers(rt)
	if len(synthetic) == 0 {
		return rt.Children
	}
	return append(append(make([]*reflection.RunType, 0, len(rt.Children)+len(synthetic)), rt.Children...), synthetic...)
}

// indexSignatureKeyRegex returns the regex source a dynamic-key sweep over rt filters its keys with: a
// template-literal key or a patternProperties source. ok is false for a plain string / number key.
func indexSignatureKeyRegex(rt *reflection.RunType, ctx *EmitContext) (string, bool) {
	for _, flag := range rt.Flags {
		if strings.HasPrefix(flag, patternKeyFlag) {
			return strings.TrimPrefix(flag, patternKeyFlag), true
		}
	}
	if rt.Index != nil {
		if indexResolved := ctx.ResolveRef(rt.Index); indexResolved != nil && indexResolved.Kind == reflection.KindTemplateLiteral {
			return buildTemplateLiteralRegex(indexResolved)
		}
	}
	return "", false
}

// indexSignatureKeyRegexVar hoists rt's key regex into the factory prologue and returns its variable name,
// or "" when the sweep filters nothing; one helper, so every codec's index-signature arm filters alike.
func indexSignatureKeyRegexVar(rt *reflection.RunType, ctx *EmitContext) string {
	regex, ok := indexSignatureKeyRegex(rt, ctx)
	if !ok {
		return ""
	}
	keyRegexVar := ctx.NextLocalVar("reIdx")
	if !ctx.HasContextItem(keyRegexVar) {
		ctx.SetContextItem(keyRegexVar, "const "+keyRegexVar+" = new RegExp("+quoteJSDouble(regex)+")")
	}
	return keyRegexVar
}
