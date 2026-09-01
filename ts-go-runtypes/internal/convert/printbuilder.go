// printbuilder.go — the VALUE-FIRST builders printer: a reflection RunType
// node to the `RT.*` / `TF.*` call spelling. Shapes with no id-exact builder
// spelling ride the `getRunType<T>()` escape (builderEscape).
package convert

import (
	"fmt"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// builderExpr renders the value-first builder spelling of a node.
func (ctx *printContext) builderExpr(node *reflection.RunType) (string, *Diagnostic) {
	node = ctx.deref(node)
	if node == nil {
		return "", unsupportedDiag(&reflection.RunType{Kind: reflection.KindRef}, ctx.decl)
	}
	if refText, refDiag, isRef := ctx.declRef(node, TargetBuilders); isRef {
		return refText, refDiag
	}
	leave, entered := ctx.enter(node)
	if !entered {
		return "", ctx.anonymousCycleDiag()
	}
	defer leave()
	if len(node.TypeMeta) > 0 {
		// User-metadata intersections have no value-first spelling — the
		// type-argument escape carries the intersection exactly.
		return ctx.builderEscape(node)
	}
	rt := func(call string) (string, *Diagnostic) {
		ctx.needs.useRT = true
		return ctx.names.RT + "." + call, nil
	}
	tf := func(call string) (string, *Diagnostic) {
		ctx.needs.useTF = true
		return ctx.names.TF + "." + call, nil
	}
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
			ctx.needs.useGetRunType = true
			return fmt.Sprintf("%s<%s>()", ctx.names.GetRunType, exactText), nil
		}
		if family.Temporal {
			ctx.needs.useTFT = true
			if len(params) == 0 {
				return ctx.names.TFT + "." + family.BuilderFn + "()", nil
			}
			paramsText, ok := printFormatParams(params, false)
			if !ok {
				return "", unsupportedFormatDiag(annotation.Name, ctx.decl)
			}
			return fmt.Sprintf("%s.%s(%s)", ctx.names.TFT, family.BuilderFn, paramsText), nil
		}
		if len(params) == 0 {
			return tf(family.BuilderFn + "()")
		}
		paramsText, ok := printFormatParams(params, family.BigintParams)
		if !ok {
			return "", unsupportedFormatDiag(annotation.Name, ctx.decl)
		}
		return tf(fmt.Sprintf("%s(%s)", family.BuilderFn, paramsText))
	}
	switch node.Kind {
	case reflection.KindString:
		return tf("string()")
	case reflection.KindNumber:
		return tf("number()")
	case reflection.KindBigInt:
		return tf("bigInt()")
	case reflection.KindBoolean:
		return rt("boolean()")
	case reflection.KindSymbol:
		return rt("symbol()")
	case reflection.KindAny:
		return rt("any()")
	case reflection.KindUnknown:
		return rt("unknown()")
	case reflection.KindNever:
		return rt("never()")
	case reflection.KindVoid:
		return rt("void()")
	case reflection.KindNull:
		return rt("literal(null)")
	case reflection.KindUndefined:
		return rt("literal(undefined)")
	case reflection.KindLiteral:
		literalText, ok := literalValueText(node)
		if !ok {
			return "", unsupportedDiag(node, ctx.decl)
		}
		return rt(fmt.Sprintf("literal(%s)", literalText))
	case reflection.KindArray:
		childText, diag := ctx.builderExpr(node.Child)
		if diag != nil {
			return "", diag
		}
		if hasStructuralPayload(node) {
			// Params outside the public bag surface (`uniqueItems: false`, a
			// hand-spelled sentinel key) escape whole: the generic bag would
			// resolve a different brand and move the id.
			if !structuralParamsPubliclySpellable(node.FormatAnnotation) {
				return ctx.builderEscape(node)
			}
			parts, partsDiag := ctx.structuralParts(node, structuralAnnotationParams(node), ctx.builderExpr, TargetBuilders)
			if partsDiag != nil {
				return "", partsDiag
			}
			return rt(fmt.Sprintf("array(%s, {%s})", childText, strings.Join(parts, ", ")))
		}
		return rt(fmt.Sprintf("array(%s)", childText))
	case reflection.KindPromise:
		childText, diag := ctx.builderExpr(node.Child)
		if diag != nil {
			return "", diag
		}
		return rt(fmt.Sprintf("promise(%s)", childText))
	case reflection.KindClass:
		switch node.SubKind {
		case reflection.SubKindDate:
			return tf("date()")
		case reflection.SubKindMap:
			arguments := ctx.nativeArguments(node)
			if len(arguments) != 2 {
				return "", unsupportedDiag(node, ctx.decl)
			}
			keyText, keyDiag := ctx.builderExpr(arguments[0])
			if keyDiag != nil {
				return "", keyDiag
			}
			valueText, valueDiag := ctx.builderExpr(arguments[1])
			if valueDiag != nil {
				return "", valueDiag
			}
			return rt(fmt.Sprintf("map(%s, %s)", keyText, valueText))
		case reflection.SubKindSet:
			arguments := ctx.nativeArguments(node)
			if len(arguments) != 1 {
				return "", unsupportedDiag(node, ctx.decl)
			}
			itemText, itemDiag := ctx.builderExpr(arguments[0])
			if itemDiag != nil {
				return "", itemDiag
			}
			return rt(fmt.Sprintf("set(%s)", itemText))
		}
		if info, ok := reflection.TemporalInfoBySubKind(node.SubKind); ok {
			// The natural value-first spelling: the no-params temporal
			// builders return the UNBRANDED base instance type, so the id
			// converges with the type-first form by construction.
			ctx.needs.useTFT = true
			return ctx.names.TFT + "." + lowerFirst(info.Name) + "()", nil
		}
		if isRegExpNode(node) {
			return rt("regexp()")
		}
		if len(node.Arguments) == 0 {
			// The plain instance type rides the natural ctor-value builder;
			// a generic instantiation has no ctor-only spelling and escapes
			// through getRunType instead.
			spelling, diag := ctx.classSpelling(node)
			if diag != nil {
				return "", diag
			}
			return rt(fmt.Sprintf("classType(%s)", spelling))
		}
		return ctx.builderEscape(node)
	case reflection.KindRegexp:
		return rt("regexp()")
	case reflection.KindEnum:
		// NOT `RT.enum(Color)`: the enum builder carries the VALUE union
		// (`E[keyof E]`, assignment-equivalent but a different reflected
		// graph), so the id-exact builder spelling is the type-argument one.
		name, diag := ctx.enumSpelling(node)
		if diag != nil {
			return "", diag
		}
		ctx.needs.useGetRunType = true
		return fmt.Sprintf("%s<%s>()", ctx.names.GetRunType, name), nil
	case reflection.KindUnion:
		var arms []string
		for _, armRef := range node.Children {
			armText, diag := ctx.builderExpr(armRef)
			if diag != nil {
				return "", diag
			}
			arms = append(arms, armText)
		}
		return rt(fmt.Sprintf("union([%s])", strings.Join(sortArms(arms), ", ")))
	case reflection.KindObjectLiteral:
		members, indexes, diag := ctx.objectMembers(node)
		if diag != nil {
			return "", diag
		}
		if hasSignatureMembers(members) {
			// Callable/method-bearing shapes have no builder spelling that
			// carries the member kinds — escape the whole object.
			return ctx.builderEscape(node)
		}
		bagText := ""
		if hasStructuralPayload(node) {
			// Same discipline as the array arm: out-of-surface params escape.
			if !structuralParamsPubliclySpellable(node.FormatAnnotation) {
				return ctx.builderEscape(node)
			}
			bagParts, partsDiag := ctx.structuralParts(node, structuralAnnotationParams(node), ctx.builderExpr, TargetBuilders)
			if partsDiag != nil {
				return "", partsDiag
			}
			bagText = ", {" + strings.Join(bagParts, ", ") + "}"
		}
		recordText := ""
		if len(indexes) > 0 {
			keyText, keyDiag, keyed := ctx.recordKeyText(indexes)
			if keyDiag != nil {
				return "", keyDiag
			}
			if !keyed {
				// Several signatures whose VALUE types differ: one `record`
				// carries one value type, so the escape takes it.
				return ctx.builderEscape(node)
			}
			valueText, valueDiag := ctx.builderExpr(indexes[0].value)
			if valueDiag != nil {
				return "", valueDiag
			}
			// The structural bag rides the record half (it is the object-level
			// payload), and the lone string key is `record`'s own default.
			switch {
			case keyText == "":
				recordText = fmt.Sprintf("%s.record(%s%s)", ctx.names.RT, valueText, bagText)
			default:
				recordText = fmt.Sprintf("%s.record(%s, %s%s)", ctx.names.RT, keyText, valueText, bagText)
			}
			if len(members) == 0 {
				ctx.needs.useRT = true
				return recordText, nil
			}
		}
		var parts []string
		for _, member := range members {
			innerText, innerDiag := ctx.builderExpr(member.child)
			if innerDiag != nil {
				return "", innerDiag
			}
			switch {
			case member.optional && member.readonly:
				innerText = fmt.Sprintf("%s.propMod({optional: true, readonly: true}, %s)", ctx.names.RT, innerText)
			case member.readonly:
				innerText = fmt.Sprintf("%s.propMod({readonly: true}, %s)", ctx.names.RT, innerText)
			case member.optional:
				innerText = fmt.Sprintf("%s.optional(%s)", ctx.names.RT, innerText)
			}
			parts = append(parts, fmt.Sprintf("%s: %s", member.key, innerText))
		}
		if recordText != "" {
			// Named members BESIDE an index: `object(...)` cannot carry an
			// index and `record(...)` cannot carry named members, but their
			// INTERSECTION is exactly the shape — `Record<K, V> & {…}` is what
			// TypeScript resolves the mixed literal to, so the id is identical.
			ctx.needs.useRT = true
			return rt(fmt.Sprintf("intersection(%s, %s.object({%s}))", recordText, ctx.names.RT, strings.Join(parts, ", ")))
		}
		return rt(fmt.Sprintf("object({%s}%s)", strings.Join(parts, ", "), bagText))
	case reflection.KindTuple:
		shape, ok := ctx.tupleMembers(node)
		if !ok {
			return "", unsupportedDiag(node, ctx.decl)
		}
		// A `never` rest is uninhabited, so it contributes no elements and
		// TypeScript folds `[T, ...never[]]` into a shape the rebuilt
		// `rest: RT.never()` does not resolve back to — the group spelling is
		// NOT id-exact here (the convert fuzz caught `[any, ...never[]]`
		// changing id on the builders leg, C2). The type-argument escape is
		// exact, same as for template literals and objects below.
		if shape.rest != nil && shape.rest.Kind == reflection.KindNever {
			return ctx.builderEscape(node)
		}
		// Every tuple prints the GROUP form (`RT.tuple({required: […]})`), and
		// only the groups it actually has — naming them is what makes the
		// generated definition unambiguous, where a bare list reads as if it
		// might accept optionals. Labeled tuples wrap each element in
		// `RT.slot(…)`, unlabeled ones print the element alone; the labels are
		// id data, so the two spellings must never mix.
		renderList := func(members []*reflection.RunType, labels []string) (string, *Diagnostic) {
			var parts []string
			for i, member := range members {
				memberText, diag := ctx.builderExpr(member)
				if diag != nil {
					return "", diag
				}
				if shape.labeled {
					memberText = fmt.Sprintf("%s.slot(%s, %s)", ctx.names.RT, quoteSingle(labels[i]), memberText)
				}
				parts = append(parts, memberText)
			}
			return "[" + strings.Join(parts, ", ") + "]", nil
		}
		var groups []string
		if len(shape.required) > 0 {
			requiredText, diag := renderList(shape.required, shape.requiredLabels)
			if diag != nil {
				return "", diag
			}
			groups = append(groups, "required: "+requiredText)
		}
		if len(shape.optional) > 0 {
			optionalText, optDiag := renderList(shape.optional, shape.optionalLabels)
			if optDiag != nil {
				return "", optDiag
			}
			groups = append(groups, "optional: "+optionalText)
		}
		if shape.rest != nil {
			restText, restDiag := ctx.builderExpr(shape.rest)
			if restDiag != nil {
				return "", restDiag
			}
			if shape.labeled {
				restText = fmt.Sprintf("%s.slot(%s, %s)", ctx.names.RT, quoteSingle(shape.restLabel), restText)
			}
			groups = append(groups, "rest: "+restText)
		}
		return rt(fmt.Sprintf("tuple({%s})", strings.Join(groups, ", ")))
	case reflection.KindFunction:
		// All-required named parameters print the slot form
		// (`RT.func({params: [RT.slot('event', …)], ret})`), which converges
		// with the written signature (parameter names fold into the id).
		// Optional / rest / defaulted parameters have no id-exact value-first
		// spelling — the type-argument escape carries those.
		if slotForm, printable, diag := ctx.funcSlotForm(node); diag != nil {
			return "", diag
		} else if printable {
			return slotForm, nil
		}
		return ctx.builderEscape(node)
	case reflection.KindTemplateLiteral, reflection.KindObject:
		// No value-first spelling carries these exactly (RT.templateLiteral
		// defaults its part grouping) — the type-argument escape does.
		return ctx.builderEscape(node)
	}
	return "", unsupportedDiag(node, ctx.decl)
}

// funcSlotForm renders a function node as `RT.func({params: [RT.slot(…)…],
// ret: …})` when every parameter is named, required, non-rest and default-free
// — the shape whose value-first id equals the written signature's.
// printable=false hands anything else back to the escape.
func (ctx *printContext) funcSlotForm(node *reflection.RunType) (string, bool, *Diagnostic) {
	var slotParts []string
	for _, paramRef := range node.Parameters {
		param := ctx.deref(paramRef)
		if param == nil || param.Name == "" || param.Optional || hasFlag(param, "rest") ||
			param.DefaultVal != nil || hasFlag(param, "nonLiteralDefault") {
			return "", false, nil
		}
		childText, childDiag := ctx.builderExpr(param.Child)
		if childDiag != nil {
			return "", false, childDiag
		}
		slotParts = append(slotParts, fmt.Sprintf("%s.slot(%s, %s)", ctx.names.RT, quoteSingle(param.Name), childText))
	}
	returnNode := ctx.deref(node.Return)
	ctx.needs.useRT = true
	if len(slotParts) == 0 {
		// Zero params: an omitted `params` group spells `() => R` exactly, so
		// the empty list never needs printing.
		if returnNode != nil && returnNode.Kind == reflection.KindVoid {
			return ctx.names.RT + ".func()", true, nil
		}
		returnText, returnDiag := ctx.builderExpr(node.Return)
		if returnDiag != nil {
			return "", false, returnDiag
		}
		return fmt.Sprintf("%s.func({ret: %s})", ctx.names.RT, returnText), true, nil
	}
	returnText, returnDiag := ctx.builderExpr(node.Return)
	if returnDiag != nil {
		return "", false, returnDiag
	}
	return fmt.Sprintf("%s.func({params: [%s], ret: %s})", ctx.names.RT, strings.Join(slotParts, ", "), returnText), true, nil
}

// builderEscape spells a node as `getRunType<TypeText>()` on the builders
// target — the escape for shapes with no value-first builder spelling
// (functions, template literals, metadata intersections, generic class
// instantiations). Type-argument resolution makes it id-exact by definition.
func (ctx *printContext) builderEscape(node *reflection.RunType) (string, *Diagnostic) {
	escapeText, escapeDiag := ctx.escapeTypeText(node)
	if escapeDiag != nil {
		return "", escapeDiag
	}
	ctx.needs.useGetRunType = true
	return fmt.Sprintf("%s<%s>()", ctx.names.GetRunType, escapeText), nil
}

// recordKeyText spells the KEY argument of `record(key, value)` for an index
// set: "" for the lone string key (record's implicit default, so the one-arg
// form prints), a single key's builder otherwise, and a union of the keys when
// a shape carries several signatures (`{[k: string]: V; [n: number]: V}` IS
// `Record<string | number, V>`). Reports keyed=false when the signatures carry
// DIFFERENT value types, which one `record` cannot say.
func (ctx *printContext) recordKeyText(indexes []indexSignature) (string, *Diagnostic, bool) {
	for _, index := range indexes[1:] {
		if index.value.ID != indexes[0].value.ID {
			return "", nil, false
		}
	}
	if len(indexes) == 1 && indexes[0].key.Kind == reflection.KindString {
		return "", nil, true
	}
	keyTexts := make([]string, 0, len(indexes))
	for _, index := range indexes {
		keyText, keyDiag := ctx.builderExpr(index.key)
		if keyDiag != nil {
			return "", keyDiag, false
		}
		keyTexts = append(keyTexts, keyText)
	}
	if len(keyTexts) == 1 {
		return keyTexts[0], nil, true
	}
	ctx.needs.useRT = true
	return fmt.Sprintf("%s.union([%s])", ctx.names.RT, strings.Join(sortArms(keyTexts), ", ")), nil, true
}
