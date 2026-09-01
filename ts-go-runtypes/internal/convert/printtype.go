// printtype.go — the TYPE-FIRST printer: a reflection RunType node to the
// plain TypeScript type spelling. `typeExpr` is the entry (reference/self
// checks, the cycle guard, the metadata intersection), `typeExprCore` the
// kind dispatch. The other two targets' escapes render their embedded type
// text through this printer (print.go's escapeTypeText).
package convert

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// temporalBrandText renders the TFT brand spelling for a temporal family
// annotation (`TFT.PlainDate<{min: '2020-01-01'}>`); paramless spellings are
// the bare alias.
func (ctx *printContext) temporalBrandText(annotation *reflection.FormatAnnotation, family formatFamily) (string, bool) {
	ctx.needs.useTFT = true
	if len(annotation.Params) == 0 {
		return ctx.names.TFT + "." + family.TypeAlias, true
	}
	paramsText, ok := printFormatParams(annotation.Params, false)
	if !ok {
		return "", false
	}
	return fmt.Sprintf("%s.%s<%s>", ctx.names.TFT, family.TypeAlias, paramsText), true
}

// recordAliasWouldCycle reports whether printing an index signature as the
// mapped alias `Record<string, V>` would make the declaration circularly
// reference itself (TS2456).
//
// TypeScript resolves an alias body eagerly through its own union arms and
// through the type ARGUMENTS of another alias, so `type Idx = Record<string,
// Idx>` and `type Both = Record<string, Both> | number` are both rejected,
// while every deferred position is fine (`{v: Record<string, X>}`,
// `Record<string, X[]>`, `[Record<string, X>]`). The index-signature literal
// `{[key: string]: V}` defers like an ordinary member and is always legal, so
// it is what gets printed whenever the alias spelling would not compile.
func (ctx *printContext) recordAliasWouldCycle(value *reflection.RunType) bool {
	seen := map[string]bool{}
	var walk func(node *reflection.RunType) bool
	walk = func(node *reflection.RunType) bool {
		node = ctx.deref(node)
		if node == nil {
			return false
		}
		if node.ID == ctx.rootID {
			return true
		}
		if seen[node.ID] {
			return false
		}
		seen[node.ID] = true
		found := false
		ctx.unionArms(node, func(arm *reflection.RunType) {
			if !found {
				found = walk(arm)
			}
		})
		if found || node.Kind != reflection.KindObjectLiteral {
			return found
		}
		// A nested record's VALUE is another `Record<>` type argument, so it
		// stays eager; every other object member defers.
		members, indexes, diag := ctx.objectMembers(node)
		if diag != nil || len(indexes) != 1 || !plainStringIndex(members, indexes) {
			return false
		}
		return walk(indexes[0].value)
	}
	return walk(value)
}

// typeExpr renders the type-first spelling of a node: reference/self checks,
// the cycle guard, then the user-metadata intersection (`base & {…}`) around
// the core kind spelling.
func (ctx *printContext) typeExpr(node *reflection.RunType) (string, *Diagnostic) {
	node = ctx.deref(node)
	if node == nil {
		return "", unsupportedDiag(&reflection.RunType{Kind: reflection.KindRef}, ctx.decl)
	}
	if refText, refDiag, isRef := ctx.declRef(node, TargetType); isRef {
		return refText, refDiag
	}
	leave, entered := ctx.enter(node)
	if !entered {
		return "", ctx.anonymousCycleDiag()
	}
	defer leave()
	if len(node.TypeMeta) == 0 {
		return ctx.typeExprCore(node)
	}
	// TypeMeta — the open user-metadata objects a collapsed
	// `base & {…}` intersection carried. The type target restores the
	// intersection spelling; re-resolving collapses it back to the same
	// base + metadata pair.
	baseText, baseDiag := ctx.typeExprCore(node)
	if baseDiag != nil {
		return "", baseDiag
	}
	// A union base binds looser than `&`; an arrow base would swallow the
	// intersection into its return type.
	if node.Kind == reflection.KindUnion || node.Kind == reflection.KindFunction {
		baseText = "(" + baseText + ")"
	}
	parts := []string{baseText}
	for _, metaRef := range node.TypeMeta {
		meta := ctx.deref(metaRef)
		if meta == nil {
			return "", unsupportedDiag(node, ctx.decl)
		}
		metaText, metaDiag := ctx.typeExpr(meta)
		if metaDiag != nil {
			return "", metaDiag
		}
		parts = append(parts, metaText)
	}
	return strings.Join(parts, " & "), nil
}

// typeSuffixNeedsParens marks spellings that bind looser than a postfix
// `[]` / `?`: unions, metadata intersections and arrow types.
func typeSuffixNeedsParens(node *reflection.RunType) bool {
	if node == nil {
		return false
	}
	if len(node.TypeMeta) > 0 {
		return true
	}
	return node.Kind == reflection.KindUnion || node.Kind == reflection.KindFunction
}

// wrapForSuffix parenthesizes text when the node's spelling would misparse
// under a following suffix — unless it printed as a plain name (a reference).
func wrapForSuffix(node *reflection.RunType, text string) string {
	if !typeSuffixNeedsParens(node) || isIdentifierText(text) {
		return text
	}
	return "(" + text + ")"
}

// isIdentifierText reports a bare (possibly qualified) identifier spelling.
func isIdentifierText(text string) bool {
	if text == "" {
		return false
	}
	for _, char := range text {
		if !(char == '.' || char == '_' || char == '$' ||
			(char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || (char >= '0' && char <= '9')) {
			return false
		}
	}
	return true
}

// typeExprCore is the kind dispatch behind typeExpr (negations, format
// annotations, then the kind switch), without the reference/cycle/meta layer.
func (ctx *printContext) typeExprCore(node *reflection.RunType) (string, *Diagnostic) {
	if annotation := node.FormatAnnotation; annotation != nil && !isStructuralAnnotation(annotation) {
		family, params, known := leafFormat(annotation)
		if !known {
			return "", unsupportedFormatDiag(annotation.Name, ctx.decl)
		}
		if family.Exact {
			exactText, ok := ctx.exactBrandType(annotation, family)
			if !ok {
				return "", unsupportedFormatDiag(annotation.Name, ctx.decl)
			}
			return exactText, nil
		}
		if family.Temporal {
			brandText, ok := ctx.temporalBrandText(annotation, family)
			if !ok {
				return "", unsupportedFormatDiag(annotation.Name, ctx.decl)
			}
			return brandText, nil
		}
		ctx.needs.useTF = true
		if len(params) == 0 {
			return fmt.Sprintf("%s.%s", ctx.names.TF, family.TypeAlias), nil
		}
		paramsText, ok := printFormatParams(params, family.BigintParams)
		if !ok {
			return "", unsupportedFormatDiag(annotation.Name, ctx.decl)
		}
		return fmt.Sprintf("%s.%s<%s>", ctx.names.TF, family.TypeAlias, paramsText), nil
	}
	switch node.Kind {
	case reflection.KindString:
		return "string", nil
	case reflection.KindNumber:
		return "number", nil
	case reflection.KindBoolean:
		return "boolean", nil
	case reflection.KindBigInt:
		return "bigint", nil
	case reflection.KindSymbol:
		return "symbol", nil
	case reflection.KindNull:
		return "null", nil
	case reflection.KindUndefined:
		return "undefined", nil
	case reflection.KindVoid:
		return "void", nil
	case reflection.KindAny:
		return "any", nil
	case reflection.KindUnknown:
		return "unknown", nil
	case reflection.KindNever:
		return "never", nil
	case reflection.KindLiteral:
		literalText, ok := literalValueText(node)
		if !ok {
			return "", unsupportedDiag(node, ctx.decl)
		}
		return literalText, nil
	case reflection.KindArray:
		childNode := ctx.deref(node.Child)
		childText, diag := ctx.typeExpr(childNode)
		if diag != nil {
			return "", diag
		}
		childText = wrapForSuffix(childNode, childText)
		if hasStructuralPayload(node) {
			if !structuralParamsPubliclySpellable(node.FormatAnnotation) {
				return ctx.rawStructuralBrandType(node, childText+"[]")
			}
			parts, partsDiag := ctx.structuralParts(node, structuralAnnotationParams(node), ctx.typeExpr, TargetType)
			if partsDiag != nil {
				return "", partsDiag
			}
			ctx.needs.useTF = true
			return fmt.Sprintf("%s.FormattedArray<%s[], {%s}>", ctx.names.TF, childText, strings.Join(parts, ", ")), nil
		}
		return childText + "[]", nil
	case reflection.KindPromise:
		childText, diag := ctx.typeExpr(node.Child)
		if diag != nil {
			return "", diag
		}
		return fmt.Sprintf("Promise<%s>", childText), nil
	case reflection.KindClass:
		switch node.SubKind {
		case reflection.SubKindDate:
			return "Date", nil
		case reflection.SubKindMap:
			arguments := ctx.nativeArguments(node)
			if len(arguments) != 2 {
				return "", unsupportedDiag(node, ctx.decl)
			}
			keyText, keyDiag := ctx.typeExpr(arguments[0])
			if keyDiag != nil {
				return "", keyDiag
			}
			valueText, valueDiag := ctx.typeExpr(arguments[1])
			if valueDiag != nil {
				return "", valueDiag
			}
			return fmt.Sprintf("Map<%s, %s>", keyText, valueText), nil
		case reflection.SubKindSet:
			arguments := ctx.nativeArguments(node)
			if len(arguments) != 1 {
				return "", unsupportedDiag(node, ctx.decl)
			}
			itemText, itemDiag := ctx.typeExpr(arguments[0])
			if itemDiag != nil {
				return "", itemDiag
			}
			return fmt.Sprintf("Set<%s>", itemText), nil
		}
		if info, ok := reflection.TemporalInfoBySubKind(node.SubKind); ok {
			// The registry's Builtin is the qualified global spelling
			// (`Temporal.Instant`) — in scope whenever the lib is loaded,
			// which the CNV007 guard has already established.
			return info.Builtin, nil
		}
		if isRegExpNode(node) {
			return "RegExp", nil
		}
		return ctx.classSpelling(node)
	case reflection.KindRegexp:
		return "RegExp", nil
	case reflection.KindEnum:
		return ctx.enumSpelling(node)
	case reflection.KindUnion:
		var parts []string
		for _, armRef := range node.Children {
			armNode := ctx.deref(armRef)
			armText, diag := ctx.typeExpr(armNode)
			if diag != nil {
				return "", diag
			}
			// An arrow type as a union arm must parenthesize (parse error
			// otherwise); metadata intersections are fine under `|`.
			if armNode != nil && armNode.Kind == reflection.KindFunction && !isIdentifierText(armText) {
				armText = "(" + armText + ")"
			}
			parts = append(parts, armText)
		}
		return strings.Join(sortArms(parts), " | "), nil
	case reflection.KindObjectLiteral:
		members, indexes, diag := ctx.objectMembers(node)
		if diag != nil {
			return "", diag
		}
		var baseText string
		if len(indexes) > 0 && !plainStringIndex(members, indexes) {
			// A non-string key, several signatures, or an index beside named
			// members: the object-literal form spells all of them, and it is
			// what the builders / schema escapes embed as their type text.
			literalText, literalDiag := ctx.objectLiteralText(members, indexes)
			if literalDiag != nil {
				return "", literalDiag
			}
			baseText = literalText
		} else if len(indexes) > 0 && ctx.recordAliasWouldCycle(indexes[0].value) {
			// `Record<>` is a mapped ALIAS: TypeScript resolves its argument
			// while resolving the declaration, so a value that reaches back
			// here is TS2456. The literal spelling defers and is legal.
			literalText, literalDiag := ctx.objectLiteralText(members, indexes)
			if literalDiag != nil {
				return "", literalDiag
			}
			baseText = literalText
		} else if len(indexes) > 0 {
			valueText, valueDiag := ctx.typeExpr(indexes[0].value)
			if valueDiag != nil {
				return "", valueDiag
			}
			baseText = fmt.Sprintf("Record<string, %s>", valueText)
		} else {
			literalText, literalDiag := ctx.objectLiteralText(members, nil)
			if literalDiag != nil {
				return "", literalDiag
			}
			baseText = literalText
		}
		if hasStructuralPayload(node) {
			if !structuralParamsPubliclySpellable(node.FormatAnnotation) {
				return ctx.rawStructuralBrandType(node, baseText)
			}
			parts, partsDiag := ctx.structuralParts(node, structuralAnnotationParams(node), ctx.typeExpr, TargetType)
			if partsDiag != nil {
				return "", partsDiag
			}
			ctx.needs.useTF = true
			return fmt.Sprintf("%s.FormattedObject<%s, {%s}>", ctx.names.TF, baseText, strings.Join(parts, ", ")), nil
		}
		return baseText, nil
	case reflection.KindTuple:
		if _, ok := ctx.tupleMembers(node); !ok {
			return "", unsupportedDiag(node, ctx.decl)
		}
		var parts []string
		appendMember := func(memberRef *reflection.RunType) *Diagnostic {
			member := ctx.deref(memberRef)
			inner := ctx.deref(member.Child)
			innerText, diag := ctx.typeExpr(inner)
			if diag != nil {
				return diag
			}
			label := ""
			if member.Name != "" {
				label = member.Name
			}
			isRest := false
			for _, flag := range member.Flags {
				if flag == "rest" {
					isRest = true
				}
			}
			// Unions, metadata intersections and arrows bind looser than the
			// `?` suffix and the rest `[]` — parenthesize to keep the meaning.
			if isRest || member.Optional {
				innerText = wrapForSuffix(inner, innerText)
			}
			switch {
			case isRest && label != "":
				parts = append(parts, fmt.Sprintf("...%s: %s[]", label, innerText))
			case isRest:
				parts = append(parts, fmt.Sprintf("...%s[]", innerText))
			case member.Optional && label != "":
				parts = append(parts, fmt.Sprintf("%s?: %s", label, innerText))
			case member.Optional:
				parts = append(parts, innerText+"?")
			case label != "":
				parts = append(parts, fmt.Sprintf("%s: %s", label, innerText))
			default:
				parts = append(parts, innerText)
			}
			return nil
		}
		for _, memberRef := range node.Children {
			if diag := appendMember(memberRef); diag != nil {
				return "", diag
			}
		}
		return "[" + strings.Join(parts, ", ") + "]", nil
	case reflection.KindFunction:
		return ctx.functionTypeText(node)
	case reflection.KindTemplateLiteral:
		templateText, ok := ctx.templateLiteralText(node)
		if !ok {
			return "", unsupportedDiag(node, ctx.decl)
		}
		return templateText, nil
	case reflection.KindObject:
		return "object", nil
	}
	return "", unsupportedDiag(node, ctx.decl)
}

// functionTypeText renders a function node as an arrow type, parameter
// names included — they fold into the structural id, so the printed labels
// are the reflected ones.
func (ctx *printContext) functionTypeText(node *reflection.RunType) (string, *Diagnostic) {
	paramsText, paramsDiag := ctx.parameterListText(node)
	if paramsDiag != nil {
		return "", paramsDiag
	}
	returnText := "void"
	if node.Return != nil {
		text, returnDiag := ctx.typeExpr(node.Return)
		if returnDiag != nil {
			return "", returnDiag
		}
		returnText = text
	}
	return fmt.Sprintf("(%s) => %s", paramsText, returnText), nil
}

// parameterListText renders a signature-bearing node's parameter list.
func (ctx *printContext) parameterListText(node *reflection.RunType) (string, *Diagnostic) {
	var parts []string
	for index, paramRef := range node.Parameters {
		param := ctx.deref(paramRef)
		if param == nil {
			return "", unsupportedDiag(node, ctx.decl)
		}
		if param.DefaultVal != nil || hasFlag(param, "nonLiteralDefault") {
			// Parameter defaults (a `typeof fn` type over a real function)
			// carry reflection information no printed form spells — refuse
			// rather than drop it.
			return "", &Diagnostic{Code: CodeUnsupportedKind, Severity: SeverityError, Decl: declLabel(ctx.decl),
				Message: fmt.Sprintf("parameter %q carries a default value, which has no conversion spelling yet", param.Name)}
		}
		innerText, innerDiag := ctx.typeExpr(param.Child)
		if innerDiag != nil {
			return "", innerDiag
		}
		name := param.Name
		if name == "" {
			name = fmt.Sprintf("arg%d", index)
		}
		isRest := false
		for _, flag := range param.Flags {
			if flag == "rest" {
				isRest = true
			}
		}
		switch {
		case isRest:
			// A rest parameter's child IS the array type.
			parts = append(parts, fmt.Sprintf("...%s: %s", name, innerText))
		case param.Optional:
			parts = append(parts, fmt.Sprintf("%s?: %s", name, innerText))
		default:
			parts = append(parts, fmt.Sprintf("%s: %s", name, innerText))
		}
	}
	return strings.Join(parts, ", "), nil
}

// templateLiteralText reconstructs the backtick spelling from the reflected
// texts + placeholder spans.
func (ctx *printContext) templateLiteralText(node *reflection.RunType) (string, bool) {
	payload, ok := node.Literal.(map[string]any)
	if !ok {
		return "", false
	}
	inner, ok := payload["templateLiteral"].(map[string]any)
	if !ok {
		return "", false
	}
	texts, textsOK := inner["texts"].([]any)
	placeholders, placeholdersOK := inner["placeholders"].([]any)
	if !textsOK || !placeholdersOK || len(texts) != len(placeholders)+1 {
		return "", false
	}
	var out strings.Builder
	out.WriteByte('`')
	for index, placeholder := range placeholders {
		text, textOK := texts[index].(string)
		if !textOK {
			return "", false
		}
		out.WriteString(escapeTemplateText(text))
		span, spanOK := placeholder.(map[string]any)
		if !spanOK {
			return "", false
		}
		spanText, spanTextOK := templateSpanText(span)
		if !spanTextOK {
			return "", false
		}
		out.WriteString("${" + spanText + "}")
	}
	lastText, lastOK := texts[len(texts)-1].(string)
	if !lastOK {
		return "", false
	}
	out.WriteString(escapeTemplateText(lastText))
	out.WriteByte('`')
	return out.String(), true
}

// templateSpanText spells one placeholder span (an atomic kind or a literal).
func templateSpanText(span map[string]any) (string, bool) {
	kind, ok := spanKind(span["kind"])
	if !ok {
		return "", false
	}
	switch kind {
	case reflection.KindString:
		return "string", true
	case reflection.KindNumber:
		return "number", true
	case reflection.KindBigInt:
		return "bigint", true
	case reflection.KindAny:
		return "any", true
	case reflection.KindUnknown:
		return "unknown", true
	case reflection.KindLiteral:
		switch literal := span["literal"].(type) {
		case string:
			return quoteSingle(literal), true
		case float64:
			return formatNumberLiteral(literal)
		case bool:
			return strconv.FormatBool(literal), true
		}
	}
	return "", false
}

// escapeTemplateText escapes a literal segment for a backtick template. A
// raw CR must be escaped: the TS scanner normalizes CR/CRLF to LF in cooked
// template text, so printing it raw would silently change the literal.
func escapeTemplateText(text string) string {
	replacer := strings.NewReplacer("\\", "\\\\", "`", "\\`", "${", "\\${", "\r", "\\r")
	return replacer.Replace(text)
}

// objectLiteralText renders an object shape as a TypeScript object literal:
// its named members, then one `[key: K]: V` clause per index signature. The
// type target prints it directly, and it is also what the builders /
// json-schema escapes embed when their own form has no word for the shape.
func (ctx *printContext) objectLiteralText(members []*objectMember, indexes []indexSignature) (string, *Diagnostic) {
	var parts []string
	for _, member := range members {
		if member.signatureNode != nil {
			// Method / call-signature members keep their signature syntax — a
			// property-typed arrow would be a different member kind (and id).
			paramsText, paramsDiag := ctx.parameterListText(member.signatureNode)
			if paramsDiag != nil {
				return "", paramsDiag
			}
			returnText := "void"
			if member.signatureNode.Return != nil {
				text, returnDiag := ctx.typeExpr(member.signatureNode.Return)
				if returnDiag != nil {
					return "", returnDiag
				}
				returnText = text
			}
			optionalMark := ""
			if member.optional {
				optionalMark = "?"
			}
			switch {
			case member.callSignature:
				parts = append(parts, fmt.Sprintf("(%s): %s", paramsText, returnText))
			case member.readonly:
				// Method syntax cannot spell `readonly` — the property-arrow
				// form reflects back identically.
				parts = append(parts, fmt.Sprintf("readonly %s%s: (%s) => %s", member.key, optionalMark, paramsText, returnText))
			default:
				parts = append(parts, fmt.Sprintf("%s%s(%s): %s", member.key, optionalMark, paramsText, returnText))
			}
			continue
		}
		innerText, innerDiag := ctx.typeExpr(member.child)
		if innerDiag != nil {
			return "", innerDiag
		}
		prefix := ""
		if member.readonly {
			prefix = "readonly "
		}
		suffix := ""
		if member.optional {
			suffix = "?"
		}
		parts = append(parts, fmt.Sprintf("%s%s%s: %s", prefix, member.key, suffix, innerText))
	}
	for _, index := range indexes {
		keyText, keyDiag := ctx.typeExpr(index.key)
		if keyDiag != nil {
			return "", keyDiag
		}
		valueText, valueDiag := ctx.typeExpr(index.value)
		if valueDiag != nil {
			return "", valueDiag
		}
		// The parameter NAME is not part of the type's identity; `key` keeps
		// the output stable and readable.
		parts = append(parts, fmt.Sprintf("[key: %s]: %s", keyText, valueText))
	}
	return "{" + strings.Join(parts, "; ") + "}", nil
}

// plainStringIndex reports the shape the value-first `record(...)` and the
// schema's `additionalProperties` can both say directly: exactly one index
// signature, string-keyed, with no named members beside it.
func plainStringIndex(members []*objectMember, indexes []indexSignature) bool {
	return len(indexes) == 1 && len(members) == 0 && indexes[0].key.Kind == reflection.KindString
}
