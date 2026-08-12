// printschema.go — the JSON-SCHEMA printer: a reflection RunType node to a
// 2020-12 document, standard keywords wherever exact and the RunTypes
// dialect (docs/json-schema-2020-12-javascript.md) where JavaScript needs
// more words; nominal identities ride the `embedType<T>()` escape
// (schemaEmbedNode). `--portable` turns every dialect spelling into a
// refusal.
package convert

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/mionkit/ts-runtypes/internal/reflection"
)

// defaultedStructuralParams returns the structural params whose value IS the
// 2020-12 default for their keyword. Those cannot ride the standard keyword and
// come back: a schema saying `minItems: 0` validates exactly like one that
// omits it, so the door reads the keyword as absent (deliberately — that IS the
// standard's meaning) and the brand would lose the param. They ride rtFormatParams
// instead, which leaves the standard keywords' semantics untouched.
func defaultedStructuralParams(params map[string]any) map[string]any {
	out := map[string]any{}
	for key, value := range params {
		switch key {
		case "minItems", "minProperties":
			if number, ok := value.(float64); ok && number == 0 {
				out[key] = value
			}
			if number, ok := value.(int); ok && number == 0 {
				out[key] = value
			}
		case "uniqueItems":
			if flag, ok := value.(bool); ok && !flag {
				out[key] = value
			}
		}
	}
	return out
}

// rtFormatParamsSuffix renders the rtFormatParams keyword for a defaulted param set, or ""
// when there is nothing to carry.
func rtFormatParamsSuffix(params map[string]any) string {
	if len(params) == 0 {
		return ""
	}
	keys := make([]string, 0, len(params))
	for key := range params {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		valueText, ok := paramValueText(params[key], false)
		if !ok {
			return ""
		}
		parts = append(parts, fmt.Sprintf("%s: %s", key, valueText))
	}
	return ", rtFormatParams: {" + strings.Join(parts, ", ") + "}"
}

// printBigintParamsAsDigits spells a bigint family's params for the schema
// target: the same keys, each value as bare digits with the `n` suffix
// stripped, which is the form `${infer … extends bigint}` matches on the door
// side. A non-string param value has no digits to carry, so it reports false.
func printBigintParamsAsDigits(params map[string]any) (string, bool) {
	keys := make([]string, 0, len(params))
	for key := range params {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		digits, ok := params[key].(string)
		if !ok {
			return "", false
		}
		parts = append(parts, fmt.Sprintf("%s: %s", key, quoteSingle(strings.TrimSuffix(digits, "n"))))
	}
	return "{" + strings.Join(parts, ", ") + "}", true
}

// schemaExpr renders the JSON-Schema spelling of a node. Standard 2020-12
// spellings are used wherever exact; JS-only constructs ride the dialect
// (`jsType` / `rtFormat` / `embedType`), which --portable forbids.
func (ctx *printContext) schemaExpr(node *reflection.RunType) (string, *Diagnostic) {
	node = ctx.deref(node)
	if node == nil {
		return "", unsupportedDiag(&reflection.RunType{Kind: reflection.KindRef}, ctx.decl)
	}
	if refText, refDiag, isRef := ctx.declRef(node, TargetJSONSchema); isRef {
		return refText, refDiag
	}
	leave, entered := ctx.enter(node)
	if !entered {
		return "", ctx.anonymousCycleDiag()
	}
	defer leave()
	if len(node.TypeMeta) > 0 {
		return ctx.schemaMetaText(node)
	}
	return ctx.schemaExprCore(node)
}

// schemaMetaText renders a `base & {…}` metadata intersection as the `tsMeta`
// dialect keyword: the base schema beside the metadata objects' own schemas,
// which the door conjoins back. Nested rather than sitting beside the base's
// keywords, because a base can itself BE a dialect discriminator (`{jsType:
// 'bigint'}`) and those are read before any sibling.
func (ctx *printContext) schemaMetaText(node *reflection.RunType) (string, *Diagnostic) {
	// The base is this node minus its metadata. The copy drops the ID as well:
	// the cycle guard already holds this node, and re-entering under the same
	// ID would read as a cycle.
	baseNode := *node
	baseNode.TypeMeta = nil
	baseNode.ID = ""
	baseText, baseDiag := ctx.schemaExprCore(&baseNode)
	if baseDiag != nil {
		return "", baseDiag
	}
	metaTexts := make([]string, 0, len(node.TypeMeta))
	for _, metaRef := range node.TypeMeta {
		meta := ctx.deref(metaRef)
		if meta == nil {
			return "", unsupportedDiag(node, ctx.decl)
		}
		metaText, metaDiag := ctx.schemaExpr(meta)
		if metaDiag != nil {
			return "", metaDiag
		}
		metaTexts = append(metaTexts, metaText)
	}
	if ctx.opts.Portable {
		return "", &Diagnostic{Code: CodePortableDialect, Severity: SeverityError, Decl: declLabel(ctx.decl),
			Message: "a metadata intersection has no standard 2020-12 spelling; drop --portable to use the tsMeta dialect keyword"}
	}
	return fmt.Sprintf("{tsMeta: {base: %s, meta: [%s]}}", baseText, strings.Join(metaTexts, ", ")), nil
}

// schemaExprCore is schemaExpr past the deref / declRef / cycle-guard preamble
// and past the metadata split, so schemaMetaText can ask for a node's base
// spelling without re-running any of it.
func (ctx *printContext) schemaExprCore(node *reflection.RunType) (string, *Diagnostic) {
	if diag := ctx.unevaluatedDiag(node); diag != nil {
		return "", diag
	}
	dialect := func(literal string) (string, *Diagnostic) {
		if ctx.opts.Portable {
			return "", &Diagnostic{Code: CodePortableDialect, Severity: SeverityError, Decl: declLabel(ctx.decl),
				Message: fmt.Sprintf("%s has no standard 2020-12 spelling; drop --portable to use the RunTypes dialect", kindLabel(node.Kind))}
		}
		return literal, nil
	}
	if len(node.Negations) > 0 {
		if len(node.Negations) > 1 {
			return "", ctx.multiNegationDiag()
		}
		// The STANDARD `not`, with no extension spelling beside it (CORE-NOT).
		// JavaScript has no "not this type"; RunTypes' negation exists to model
		// JSON Schema's `not`, so it round-trips through the keyword it was
		// built for. The base type sits beside it, which is what makes a plain
		// validator read "a string that is not an email".
		negated := ctx.deref(node.Negations[0])
		if negated == nil {
			return "", unsupportedDiag(node, ctx.decl)
		}
		negatedText, negDiag := ctx.schemaExpr(node.Negations[0])
		if negDiag != nil {
			return "", negDiag
		}
		baseText := "type: 'string'"
		if family, _, known := leafFormat(negated.FormatAnnotation); known && family.base == "number" {
			baseText = "type: 'number'"
		}
		return fmt.Sprintf("{%s, not: %s}", baseText, negatedText), nil
	}
	// A format annotation prints as its WIRE half (the base type, plus the
	// standard `format` where the family maps onto a registered one) with
	// `rtFormat` naming the family and `rtFormatParams` carrying its params.
	//
	// rtFormatParams carries ALL params verbatim, not only the ones the standard
	// has no word for. Two reasons: the params fold into the structural id, so
	// dropping any (mockSamples, nested inside a pattern bag, is the one that
	// bites) would move it; and one authoritative copy makes reconstruction
	// exact instead of a merge of two half-sources. The standard keywords beside
	// it are a faithful PROJECTION of the same params, so a plain validator
	// still enforces what it can.
	if annotation := node.FormatAnnotation; annotation != nil && !isStructuralAnnotation(annotation) {
		family, _, known := leafFormat(annotation)
		if !known {
			return "", unsupportedFormatDiag(annotation.Name, ctx.decl)
		}
		paramsText, ok := printFormatParams(annotation.Params, family.bigintParams)
		if !ok {
			return "", unsupportedFormatDiag(annotation.Name, ctx.decl)
		}
		// JSON has no bigint, so that family's bounds ride as DIGIT STRINGS and
		// the door lifts the literal types back out of them.
		if family.bigintParams {
			digitsText, digitsOK := printBigintParamsAsDigits(annotation.Params)
			if !digitsOK {
				return "", unsupportedFormatDiag(annotation.Name, ctx.decl)
			}
			paramsText = digitsText
		}
		parts := []string{formatWireParts(family, annotation)}
		// RT-FORMAT-STANDARD: every param that HAS a standard keyword is
		// mirrored onto it, so a plain 2020-12 validator enforces the same
		// bounds a RunTypes one does. Without this, CORE-INERT would be false
		// for a format node: deleting the extension keywords would delete the
		// constraints with them. The mirror is a projection, never the source
		// — rtFormatParams below stays authoritative.
		if mirrored := standardParamKeywords(annotation.Params, family); mirrored != "" {
			parts = append(parts, mirrored)
		}
		parts = append(parts, fmt.Sprintf("rtFormat: %s", quoteSingle(annotation.Name)))
		if len(annotation.Params) > 0 {
			parts = append(parts, fmt.Sprintf("rtFormatParams: %s", paramsText))
		}
		return dialect("{" + strings.Join(parts, ", ") + "}")
	}
	switch node.Kind {
	case reflection.KindString:
		return "{type: 'string'}", nil
	case reflection.KindNumber:
		return "{type: 'number'}", nil
	case reflection.KindBoolean:
		return "{type: 'boolean'}", nil
	case reflection.KindNull:
		return "{type: 'null'}", nil
	case reflection.KindUnknown:
		return "{}", nil
	case reflection.KindNever:
		return "{enum: []}", nil
	case reflection.KindAny:
		return dialect("{jsType: 'any'}")
	case reflection.KindUndefined:
		// undefined and void encode as JSON null, in an object member and an
		// array slot alike (json_stringify.go). On the wire the three are the
		// same value, and the annotation is what tells them apart.
		return dialect("{type: 'null', jsType: 'undefined'}")
	case reflection.KindVoid:
		return dialect("{type: 'null', jsType: 'void'}")
	case reflection.KindSymbol:
		return dialect("{jsType: 'symbol'}")
	case reflection.KindBigInt:
		// A bigint encodes as a quoted decimal string, so the wire is a string
		// carrying the digits pattern and jsType says what it becomes.
		return dialect("{type: 'string', pattern: '^-?[0-9]+$', jsType: 'bigint'}")
	case reflection.KindLiteral:
		if isBigIntLiteral(node) {
			// The bigint row with the value pinned: `const` holds the WIRE
			// value, which is the digit string, and `jsType` is what stops it
			// reading as an ordinary string literal.
			digits, ok := node.Literal.(string)
			if !ok {
				return "", unsupportedDiag(node, ctx.decl)
			}
			return dialect(fmt.Sprintf("{type: 'string', const: %s, jsType: 'bigint'}",
				quoteSingle(strings.TrimSuffix(digits, "n"))))
		}
		literalText, ok := literalValueText(node)
		if !ok {
			return "", unsupportedDiag(node, ctx.decl)
		}
		return fmt.Sprintf("{const: %s}", literalText), nil
	case reflection.KindArray:
		// A param whose value IS the 2020-12 default (`minItems: 0`,
		// `uniqueItems: false`) reads back as ABSENT through the standard
		// keyword — correct for the standard, where such a schema validates
		// identically to one without it, but it would drop the brand. Those
		// entries ride rtFormatParams instead, so the standard keywords keep their
		// standard meaning and the params still survive.
		defaulted := defaultedStructuralParams(structuralAnnotationParams(node))
		if len(defaulted) > 0 && ctx.opts.Portable {
			return "", &Diagnostic{Code: CodePortableDialect, Severity: SeverityError, Decl: declLabel(ctx.decl),
				Message: "a structural param at its 2020-12 default has no standard spelling that survives; drop --portable to use the rtFormatParams dialect keyword"}
		}
		childText, diag := ctx.schemaExpr(node.Child)
		if diag != nil {
			return "", diag
		}
		if hasStructuralPayload(node) {
			parts, partsDiag := ctx.structuralParts(node, structuralAnnotationParams(node), ctx.schemaExpr, TargetJSONSchema)
			if partsDiag != nil {
				return "", partsDiag
			}
			return fmt.Sprintf("{type: 'array', items: %s, %s%s}", childText, strings.Join(parts, ", "), rtFormatParamsSuffix(defaulted)), nil
		}
		return fmt.Sprintf("{type: 'array', items: %s%s}", childText, rtFormatParamsSuffix(defaulted)), nil
	case reflection.KindPromise:
		childText, diag := ctx.schemaExpr(node.Child)
		if diag != nil {
			return "", diag
		}
		// The resolved schema rides a SUB-KEY rather than being merged in
		// place. Merging looked neater and is wrong: `Promise<Set<null>>` would
		// put `jsType: 'Promise'` onto a child already carrying
		// `jsType: 'Set'`, and two annotations cannot share one node. Found by
		// the fuzz generator on the first seed after negation widened it.
		return dialect(fmt.Sprintf("{jsType: 'Promise', jsResolved: %s}", childText))
	case reflection.KindClass:
		switch node.SubKind {
		case reflection.SubKindDate:
			// A Date encodes as its toJSON() ISO string, so the wire half is a
			// date-time string and jsType says what it becomes. The door reads
			// jsType first, so the `format` beside it describes the JSON
			// without contributing to the recovered type (CORE-PRECEDENCE).
			return dialect("{type: 'string', format: 'date-time', jsType: 'Date'}")
		case reflection.SubKindMap:
			arguments := ctx.nativeArguments(node)
			if len(arguments) != 2 {
				return "", unsupportedDiag(node, ctx.decl)
			}
			keyText, keyDiag := ctx.schemaExpr(arguments[0])
			if keyDiag != nil {
				return "", keyDiag
			}
			valueText, valueDiag := ctx.schemaExpr(arguments[1])
			if valueDiag != nil {
				return "", valueDiag
			}
			// A Map encodes as an array of [key, value] pairs, so the key and
			// value ARE the wire schema — no argument list to keep in sync.
			return dialect(fmt.Sprintf(
				"{type: 'array', items: {type: 'array', prefixItems: [%s, %s], minItems: 2, items: false}, jsType: 'Map'}",
				keyText, valueText))
		case reflection.SubKindSet:
			arguments := ctx.nativeArguments(node)
			if len(arguments) != 1 {
				return "", unsupportedDiag(node, ctx.decl)
			}
			itemText, itemDiag := ctx.schemaExpr(arguments[0])
			if itemDiag != nil {
				return "", itemDiag
			}
			// A Set encodes as an array with no duplicates, so `items` carries
			// the element and `uniqueItems` is a real constraint a plain
			// validator enforces.
			return dialect(fmt.Sprintf("{type: 'array', items: %s, uniqueItems: true, jsType: 'Set'}", itemText))
		}
		if isRegExpNode(node) {
			return dialect("{type: 'string', jsType: 'RegExp'}")
		}
		// The eight Temporal builtins spell as data, under their reflected
		// format name (`temporalInstant`) — the same word the branded rtFormat
		// row uses. The door resolves the row through the formats surface's
		// guarded base map, so nothing here forces the Temporal lib on a
		// json-schema consumer.
		if info, isTemporal := reflection.TemporalInfoBySubKind(node.SubKind); isTemporal {
			// The wire half comes from the reflection registry, so it cannot
			// drift from what the serializer actually writes. Five of the eight
			// carry a pattern rather than a format on purpose: ZonedDateTime's
			// toJSON() is RFC 9557, which a date-time checker rejects.
			wire := ""
			if format := info.WireFormat(); format != "" {
				wire = fmt.Sprintf("format: %s, ", quoteSingle(format))
			} else if pattern := info.WirePattern(); pattern != "" {
				wire = fmt.Sprintf("pattern: %s, ", quoteSingle(pattern))
			}
			return dialect(fmt.Sprintf("{type: 'string', %sjsType: %s}", wire, quoteSingle(info.DialectName())))
		}
		// A user class or any other class kind keeps the escape: its identity
		// is nominal, so only the live symbol can carry it.
		return ctx.schemaEmbedNode(node)
	case reflection.KindRegexp:
		// `JSON.stringify(re.toString())`, so the wire carries the delimiters
		// and flags: "/^ab?c$/gi".
		return dialect("{type: 'string', jsType: 'RegExp'}")
	case reflection.KindEnum:
		return ctx.schemaEmbedNode(node)
	case reflection.KindUnion:
		if diag := ctx.partialOneOfDiag(node); diag != nil {
			return "", diag
		}
		if len(node.OneOf) > 0 {
			var branches []string
			for _, branchRef := range node.OneOf {
				branchText, diag := ctx.schemaExpr(branchRef)
				if diag != nil {
					return "", diag
				}
				branches = append(branches, branchText)
			}
			return fmt.Sprintf("{oneOf: [%s]}", strings.Join(sortArms(branches), ", ")), nil
		}
		allPlainLiterals := true
		var literalParts []string
		for _, armRef := range node.Children {
			arm := ctx.deref(armRef)
			if arm == nil || arm.FormatAnnotation != nil || isBigIntLiteral(arm) {
				allPlainLiterals = false
				break
			}
			switch arm.Kind {
			case reflection.KindLiteral:
				literalText, ok := literalValueText(arm)
				if !ok {
					allPlainLiterals = false
				} else {
					literalParts = append(literalParts, literalText)
				}
			case reflection.KindNull:
				literalParts = append(literalParts, "null")
			default:
				allPlainLiterals = false
			}
			if !allPlainLiterals {
				break
			}
		}
		if allPlainLiterals {
			return fmt.Sprintf("{enum: [%s]}", strings.Join(sortArms(literalParts), ", ")), nil
		}
		var arms []string
		for _, armRef := range node.Children {
			armText, diag := ctx.schemaExpr(armRef)
			if diag != nil {
				return "", diag
			}
			arms = append(arms, armText)
		}
		return fmt.Sprintf("{anyOf: [%s]}", strings.Join(sortArms(arms), ", ")), nil
	case reflection.KindObjectLiteral:
		// Same as the array branch above: a param sitting at its 2020-12
		// default rides rtFormatParams so the brand survives.
		defaulted := defaultedStructuralParams(structuralAnnotationParams(node))
		if len(defaulted) > 0 && ctx.opts.Portable {
			return "", &Diagnostic{Code: CodePortableDialect, Severity: SeverityError, Decl: declLabel(ctx.decl),
				Message: "a structural param at its 2020-12 default has no standard spelling that survives; drop --portable to use the rtFormatParams dialect keyword"}
		}
		members, indexes, diag := ctx.objectMembers(node)
		if diag != nil {
			return "", diag
		}
		if hasSignatureMembers(members) {
			return ctx.schemaEmbedNode(node)
		}
		// A non-string key or a second signature has no STANDARD spelling —
		// `additionalProperties` says one thing about string keys and nothing
		// else — so those ride the tsIndexes dialect keyword, each signature as
		// its own key/value schema pair.
		tsIndexesText := ""
		if len(indexes) > 1 || (len(indexes) == 1 && indexes[0].key.Kind != reflection.KindString) {
			indexesText, indexesDiag, ok := ctx.tsIndexesText(indexes)
			if indexesDiag != nil {
				return "", indexesDiag
			}
			if !ok {
				return ctx.schemaEmbedNode(node)
			}
			if ctx.opts.Portable {
				return "", &Diagnostic{Code: CodePortableDialect, Severity: SeverityError, Decl: declLabel(ctx.decl),
					Message: "a non-string index signature has no standard 2020-12 spelling; drop --portable to use the tsIndexes dialect keyword"}
			}
			tsIndexesText = indexesText
			indexes = nil
		}
		schemaBag := ""
		if hasStructuralPayload(node) {
			bagParts, partsDiag := ctx.structuralParts(node, structuralAnnotationParams(node), ctx.schemaExpr, TargetJSONSchema)
			if partsDiag != nil {
				return "", partsDiag
			}
			schemaBag = ", " + strings.Join(bagParts, ", ")
		}
		if tsIndexesText != "" {
			schemaBag = ", " + tsIndexesText + schemaBag
		}
		additionalText := ""
		if len(indexes) > 0 {
			valueText, valueDiag := ctx.schemaExpr(indexes[0].value)
			if valueDiag != nil {
				return "", valueDiag
			}
			if len(members) == 0 {
				return fmt.Sprintf("{type: 'object', additionalProperties: %s%s%s}", valueText, schemaBag, rtFormatParamsSuffix(defaulted)), nil
			}
			// Named members BESIDE the index: `properties` and
			// `additionalProperties` together, which is exactly what the door
			// lowers back to `Record<string, V> & {…}`.
			additionalText = fmt.Sprintf(", additionalProperties: %s", valueText)
		}
		var propertyParts []string
		var requiredParts []string
		var readonlyParts []string
		for _, member := range members {
			innerText, innerDiag := ctx.schemaExpr(member.child)
			if innerDiag != nil {
				return "", innerDiag
			}
			propertyParts = append(propertyParts, fmt.Sprintf("%s: %s", member.key, innerText))
			if !member.optional {
				requiredParts = append(requiredParts, quoteSingle(member.name))
			}
			if member.readonly {
				readonlyParts = append(readonlyParts, quoteSingle(member.name))
			}
		}
		// A readonly member rides the tsReadonly dialect keyword, named the way
		// `required` names its own. Standard `readOnly` is NOT the same thing:
		// 2020-12 declares it non-constraining and the door lifts nothing from
		// it, so it would silently drop the modifier and move the id.
		if len(readonlyParts) > 0 && ctx.opts.Portable {
			return "", &Diagnostic{Code: CodePortableDialect, Severity: SeverityError, Decl: declLabel(ctx.decl),
				Message: "a readonly member has no standard 2020-12 spelling; drop --portable to use the tsReadonly dialect keyword"}
		}
		out := "{type: 'object'"
		// An index-only shape has no members to name, and an empty `properties`
		// would just be noise beside the tsIndexes pairs that carry it.
		if len(propertyParts) > 0 {
			out += fmt.Sprintf(", properties: {%s}", strings.Join(propertyParts, ", "))
		}
		if len(requiredParts) > 0 {
			out += fmt.Sprintf(", required: [%s]", strings.Join(requiredParts, ", "))
		}
		if len(readonlyParts) > 0 {
			out += fmt.Sprintf(", tsReadonly: [%s]", strings.Join(readonlyParts, ", "))
		}
		return out + additionalText + schemaBag + rtFormatParamsSuffix(defaulted) + "}", nil
	case reflection.KindTuple:
		shape, ok := ctx.tupleMembers(node)
		if !ok {
			return "", unsupportedDiag(node, ctx.decl)
		}
		if shape.labeled && ctx.opts.Portable {
			// tsLabels is RunTypes dialect — labels have no standard keyword.
			return "", &Diagnostic{Code: CodePortableDialect, Severity: SeverityError, Decl: declLabel(ctx.decl),
				Message: "tuple slot labels have no standard 2020-12 spelling; drop --portable to use the tsLabels dialect keyword"}
		}
		var prefixParts []string
		for _, member := range append(append([]*reflection.RunType{}, shape.required...), shape.optional...) {
			memberText, diag := ctx.schemaExpr(member)
			if diag != nil {
				return "", diag
			}
			prefixParts = append(prefixParts, memberText)
		}
		// `type: 'array'` is load-bearing: a type-less keyword denotes the
		// six-kind union with the constraint applied per kind. minItems is the
		// required-slot count (its 2020-12 default 0 would make every prefix
		// slot optional), omitted only when it IS 0.
		out := fmt.Sprintf("{type: 'array', prefixItems: [%s]", strings.Join(prefixParts, ", "))
		if len(shape.required) > 0 {
			out += fmt.Sprintf(", minItems: %d", len(shape.required))
		}
		if shape.rest != nil {
			restText, diag := ctx.schemaExpr(shape.rest)
			if diag != nil {
				return "", diag
			}
			out += fmt.Sprintf(", items: %s", restText)
		} else {
			out += ", items: false"
		}
		if shape.labeled {
			// Slot labels ride the tsLabels dialect keyword, one literal per
			// slot in order (rest slot included) — the door lowers it back
			// onto the `__rtLabels` sentinel, so the printed schema resolves
			// to the same labeled-tuple id.
			labels := append(append([]string{}, shape.requiredLabels...), shape.optionalLabels...)
			if shape.rest != nil {
				labels = append(labels, shape.restLabel)
			}
			quoted := make([]string, 0, len(labels))
			for _, label := range labels {
				quoted = append(quoted, quoteSingle(label))
			}
			out += fmt.Sprintf(", tsLabels: [%s]", strings.Join(quoted, ", "))
		}
		return out + "}", nil
	case reflection.KindTemplateLiteral:
		// A pattern string alone cannot rebuild the type, so the parts ride
		// verbatim: the literal texts and the placeholder SCHEMAS, which the
		// door interpolates back into a template literal type.
		templateText, ok := ctx.templateSchemaText(node)
		if !ok {
			return ctx.schemaEmbedNode(node)
		}
		return dialect(templateText)
	case reflection.KindFunction:
		// The signature rides as data: a params TUPLE schema (the same
		// prefixItems / minItems / items / tsLabels vocabulary a written tuple
		// uses, so optional and rest slots and the parameter NAMES all carry)
		// beside the return schema.
		functionText, functionDiag, ok := ctx.functionSchemaText(node)
		if functionDiag != nil {
			return "", functionDiag
		}
		if !ok {
			return ctx.schemaEmbedNode(node)
		}
		return dialect(functionText)
	case reflection.KindObject:
		// TypeScript's `object` keyword — the non-primitive gate. NOT the same
		// as a keyword-less object schema, which the door reads as
		// `Record<string, unknown>`.
		// `object` is the non-primitive gate and it ADMITS arrays, so the wire
		// is the two-member type union rather than {type: 'object'}.
		return dialect("{type: ['object', 'array'], jsType: 'object'}")
	}
	return "", unsupportedDiag(node, ctx.decl)
}

// functionSchemaText renders a function node as the `tsFunction` dialect
// keyword. ok=false hands the node to the embed escape, for two cases:
//
//   - a parameter DEFAULT, which carries reflection information no printed
//     form spells (the type target refuses it too);
//   - an OPTIONAL or REST parameter, neither of which survives the trip. The
//     door spreads the params tuple into a rest parameter and the names ride
//     an intersection on that tuple, so materialising the signature rewrites
//     `extra?: string` into a required `extra: string | undefined`, and a rest
//     slot comes back as ONE spread parameter carrying a labeled tuple rather
//     than as the parameters it was written as. Dropping the names instead
//     would keep both, but names fold into the id just as hard — so neither
//     half can be given up and the escape carries the signature exactly.
//
// This is the same shape the value-first slot form accepts (funcSlotForm), for
// the same reason: all-required, named, default-free parameters are the ones
// whose rebuilt signature has the id it started with.
func (ctx *printContext) functionSchemaText(node *reflection.RunType) (string, *Diagnostic, bool) {
	var prefixParts []string
	var labels []string
	labeled := len(node.Parameters) > 0
	requiredCount := 0
	for _, paramRef := range node.Parameters {
		param := ctx.deref(paramRef)
		if param == nil || param.DefaultVal != nil || hasFlag(param, "nonLiteralDefault") ||
			param.Optional || hasFlag(param, "rest") {
			return "", nil, false
		}
		if param.Name == "" {
			// TypeScript labels every slot or none, so one unnamed parameter
			// drops the whole label list rather than inventing names.
			labeled = false
		}
		labels = append(labels, param.Name)
		childText, childDiag := ctx.schemaExpr(param.Child)
		if childDiag != nil {
			return "", childDiag, false
		}
		prefixParts = append(prefixParts, childText)
		requiredCount++
	}
	returnText := "{jsType: 'void'}"
	if node.Return != nil {
		text, returnDiag := ctx.schemaExpr(node.Return)
		if returnDiag != nil {
			return "", returnDiag, false
		}
		returnText = text
	}
	paramsText := fmt.Sprintf("{type: 'array', prefixItems: [%s]", strings.Join(prefixParts, ", "))
	if requiredCount > 0 {
		paramsText += fmt.Sprintf(", minItems: %d", requiredCount)
	}
	// `items: false` closes the tuple: a signature has exactly these
	// parameters, and an open tail would read as a rest slot.
	paramsText += ", items: false"
	if labeled {
		quoted := make([]string, 0, len(labels))
		for _, label := range labels {
			quoted = append(quoted, quoteSingle(label))
		}
		paramsText += fmt.Sprintf(", tsLabels: [%s]", strings.Join(quoted, ", "))
	}
	paramsText += "}"
	return fmt.Sprintf("{tsFunction: {params: %s, return: %s}}", paramsText, returnText), nil, true
}

// formatWireParts spells the WIRE half of a format family: the base JSON type
// plus the standard `format` where the family maps onto a registered one. This
// is the half a plain 2020-12 validator reads.
//
// Deliberately NO `jsType`, even for the families whose base is not a JSON type
// (bigint, the native Date, Temporal). CORE-PRECEDENCE reads jsType BEFORE
// rtFormat, so a node carrying both would resolve to the bare JS type and drop
// its format brand — `TF.BigInt<{min: 0n}>` came back as plain `bigint`. The
// family name is the complete answer on its own, and RunTypes knows each
// family's base, so the annotation would be redundant even if it were safe.
func formatWireParts(family formatFamily, annotation *reflection.FormatAnnotation) string {
	switch family.base {
	case "number":
		return "type: 'number'"
	case "bigint":
		// A bigint travels as a decimal string, so the wire is a string and the
		// jsType is what says it decodes back to a bigint.
		return "type: 'string', pattern: '^-?[0-9]+$'"
	}
	if info, isTemporal := reflection.TemporalInfoByFormatName(annotation.Name); isTemporal {
		wire := ""
		if format := info.WireFormat(); format != "" {
			wire = fmt.Sprintf("format: %s, ", quoteSingle(format))
		} else if pattern := info.WirePattern(); pattern != "" {
			wire = fmt.Sprintf("pattern: %s, ", quoteSingle(pattern))
		}
		return strings.TrimSuffix(fmt.Sprintf("type: 'string', %s", wire), ", ")
	}
	if annotation.Name == "nativeDate" {
		return "type: 'string', format: 'date-time'"
	}
	if standard := standardFormatName(annotation.Name); standard != "" {
		return fmt.Sprintf("type: 'string', format: %s", quoteSingle(standard))
	}
	return "type: 'string'"
}

// standardParamKeywords projects the params that HAVE a standard 2020-12
// keyword onto it. Only the exact correspondences appear: a keyword whose
// meaning differs even slightly would make a plain validator enforce something
// the type does not say, which is worse than saying nothing.
//
// Deliberately skipped: the bigint family (its bounds are digit strings here,
// and `minimum` on a string means nothing) and every non-validating param
// (mockSamples, trim, …).
//
// `pattern` is mirrored, under the rule in patternWireSource. It used to be
// skipped on the grounds that the param is a {source, flags} bag rather than
// the plain string the keyword wants — but `source` IS that string, and
// dropping it broke CORE-INERT outright: reading `{type: 'string', pattern: …,
// minLength: 3}` and writing it back kept the length and lost the regex, so
// deleting the extension keywords from the result accepted values the input
// rejected.
func standardParamKeywords(params map[string]any, family formatFamily) string {
	if family.bigintParams {
		return ""
	}
	standard := map[string]string{
		"minLength": "minLength", "maxLength": "maxLength",
		"min": "minimum", "max": "maximum",
		"gt": "exclusiveMinimum", "lt": "exclusiveMaximum",
		"multipleOf": "multipleOf",
	}
	keys := make([]string, 0, len(params))
	for key := range params {
		if _, ok := standard[key]; ok {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		number, isNumber := params[key].(float64)
		if !isNumber {
			continue
		}
		numberText, ok := formatNumberLiteral(number)
		if !ok {
			continue
		}
		parts = append(parts, fmt.Sprintf("%s: %s", standard[key], numberText))
	}
	if source, ok := patternWireSource(params["pattern"]); ok {
		// Sorted position: `pattern` sits between `multipleOf` and the rest by
		// the same key order the numeric loop uses.
		parts = append(parts, fmt.Sprintf("pattern: %s", quoteSingle(source)))
		sort.Strings(parts)
	}
	if len(parts) == 0 {
		return ""
	}
	return strings.Join(parts, ", ")
}

// patternWireSource returns the regex source a `pattern` param can safely put on
// the standard `pattern` keyword, and false when it cannot.
//
// A 2020-12 `pattern` is a bare ECMA-262 source with NO flags, so the flags a
// RunTypes pattern carries decide whether the keyword can say the same thing:
//
//   - "" — the keyword is exactly the param. Mirrored.
//   - "u" — what the DOOR itself lifts a bare standard `pattern` to (see
//     StringParamsFrom in fromJsonSchema.ts: unicode mode is the default other
//     2020-12 validators compile under). Mirroring reproduces the source
//     document byte for byte, so this is the round-trip case and it is mirrored
//     — EXCEPT when the source uses a unicode property escape. `\p{L}` read
//     without `u` degrades to a literal `p{L}` match, which would reject nearly
//     every value the type accepts, and over-rejecting is the one failure this
//     mirroring must never introduce.
//   - anything else (i, m, s, y, g) — a standard validator cannot express it.
//     Case-insensitivity in particular would silently become case-SENSITIVE and
//     reject values the type accepts, so the pattern stays in rtFormatParams
//     alone and the standard reading simply says less.
//
// Saying less is always sound; saying something stricter than the type is not.
func patternWireSource(param any) (string, bool) {
	bag, isBag := param.(map[string]any)
	if !isBag {
		return "", false
	}
	source, hasSource := bag["source"].(string)
	if !hasSource || source == "" {
		return "", false
	}
	flags, _ := bag["flags"].(string)
	switch flags {
	case "":
		return source, true
	case "u":
		if strings.Contains(source, `\p{`) || strings.Contains(source, `\P{`) {
			return "", false
		}
		return source, true
	default:
		return "", false
	}
}

// standardFormatName maps a RunTypes format family onto the registered 2020-12
// `format` value describing the SAME wire shape, or "" when the registry has no
// honest word for it. Only exact matches appear: claiming a format that a
// validator would then enforce differently is worse than saying nothing.
func standardFormatName(name string) string {
	switch name {
	case "email":
		return "email"
	case "uuid":
		return "uuid"
	case "domain":
		return "hostname"
	case "url":
		return "uri"
	case "date":
		return "date"
	case "time":
		return "time"
	case "dateTime":
		return "date-time"
	}
	return ""
}

// tsIndexesText renders a set of index signatures as the `tsIndexes` dialect
// keyword — one `{key, value}` pair per signature, both sides ordinary schemas,
// which the door turns back into that many index signatures. ok=false hands the
// node to the embed escape when a key has no schema spelling of its own.
func (ctx *printContext) tsIndexesText(indexes []indexSignature) (string, *Diagnostic, bool) {
	pairs := make([]string, 0, len(indexes))
	patterns := make([]string, 0, len(indexes))
	for _, index := range indexes {
		keyText, keyDiag := ctx.schemaExpr(index.key)
		if keyDiag != nil {
			// A key the schema vocabulary cannot spell is not an error here:
			// the whole object still converts, through the escape.
			return "", nil, false
		}
		valueText, valueDiag := ctx.schemaExpr(index.value)
		if valueDiag != nil {
			return "", valueDiag, false
		}
		pairs = append(pairs, fmt.Sprintf("{key: %s, value: %s}", keyText, valueText))
		if pattern := wireKeyPattern(ctx.deref(index.key)); pattern != "" {
			patterns = append(patterns, pattern)
		}
	}
	// TS-WIRE-HALF: tsIndexes carries no constraint of its own, so whatever the
	// key really says about the JSON has to be written in the standard
	// vocabulary too. JSON object keys are always strings, so a numeric key IS
	// a constraint on those strings — `propertyNames` is where a plain
	// validator reads it.
	out := fmt.Sprintf("tsIndexes: [%s]", strings.Join(pairs, ", "))
	if len(patterns) == 1 {
		out = fmt.Sprintf("propertyNames: {pattern: %s}, %s", quoteSingle(patterns[0]), out)
	}
	return out, nil, true
}

// wireKeyPattern is the anchored pattern the JSON keys of an index signature
// must match, or "" when the key constrains nothing a JSON key could violate
// (a plain string key, or a key whose own schema already says it).
func wireKeyPattern(key *reflection.RunType) string {
	if key == nil {
		return ""
	}
	if key.Kind == reflection.KindNumber {
		// A numeric index accepts the JSON keys that are canonical decimal
		// integers, which is what `String(n)` produces for one.
		return `^(?:0|[1-9][0-9]*)$`
	}
	return ""
}

// templateSchemaText renders a template literal node as the `tsTemplate`
// dialect keyword — `texts` (n+1 literal chunks) beside `placeholders` (n
// schemas), the same pairing the reflection carries. ok=false hands the node
// back to the embed escape: a placeholder TypeScript cannot interpolate
// (`unknown`, an object shape) has no template spelling at all.
func (ctx *printContext) templateSchemaText(node *reflection.RunType) (string, bool) {
	texts, placeholders, ok := templateParts(node)
	if !ok {
		return "", false
	}
	quotedTexts := make([]string, 0, len(texts))
	for _, text := range texts {
		quotedTexts = append(quotedTexts, quoteSingle(text))
	}
	placeholderTexts := make([]string, 0, len(placeholders))
	for _, placeholder := range placeholders {
		placeholderText, placeholderOK := templateSpanSchemaText(placeholder)
		if !placeholderOK {
			return "", false
		}
		placeholderTexts = append(placeholderTexts, placeholderText)
	}
	// TS-WIRE-HALF: the pattern is not optional. A template literal type really
	// does constrain the string, so a plain 2020-12 validator has to be told —
	// the keyword alone would say something to RunTypes it does not say to
	// anyone else.
	return fmt.Sprintf("{type: 'string', pattern: %s, tsTemplate: {texts: [%s], placeholders: [%s]}}",
		quoteSingle(templateWirePattern(texts)), strings.Join(quotedTexts, ", "), strings.Join(placeholderTexts, ", ")), true
}

// templateWirePattern derives the standard `pattern` for a template literal
// type: the literal chunks, anchored and escaped, with every placeholder a
// wildcard.
//
// The placeholders stay wildcards ON PURPOSE. A regex narrower than the
// placeholder's own type would REJECT strings the type accepts, and the surface
// is wider than it looks — TypeScript takes `v0x10`, `v007`, `v.5` and `v1e3`
// for “ `v${number}` “ (only `NaN`, `Infinity` and numeric separators are
// out). Over-rejecting would make the schema disagree with the type it decodes
// to, which is worse than under-constraining, so the pattern pins what is
// certain (the literal text around the holes) and `tsTemplate` carries the rest.
func templateWirePattern(texts []string) string {
	var pattern strings.Builder
	pattern.WriteString("^")
	for i, text := range texts {
		if i > 0 {
			// `[\s\S]` rather than `.` — ECMA-262 `.` skips line terminators,
			// and a placeholder can hold a newline.
			pattern.WriteString(`[\s\S]*`)
		}
		pattern.WriteString(escapeRegexLiteral(text))
	}
	pattern.WriteString("$")
	return pattern.String()
}

// escapeRegexLiteral escapes a literal chunk for use inside an ECMA-262 regular
// expression. Go's regexp.QuoteMeta is close but not usable here: it escapes
// with Go's own metacharacter set and the result is read by JavaScript, so the
// set is spelled out. `/` is deliberately NOT in it — a JSON Schema pattern is a
// string, never a `/…/` literal, so escaping it would only add noise.
func escapeRegexLiteral(text string) string {
	var escaped strings.Builder
	for _, char := range text {
		if strings.ContainsRune(`\.+*?()|[]{}^$`, char) {
			escaped.WriteRune('\\')
		}
		escaped.WriteRune(char)
	}
	return escaped.String()
}

// templateParts pulls the (texts, placeholders) pair off a template literal
// node's payload, checking the n+1 / n pairing the spelling depends on.
func templateParts(node *reflection.RunType) ([]string, []map[string]any, bool) {
	payload, ok := node.Literal.(map[string]any)
	if !ok {
		return nil, nil, false
	}
	inner, ok := payload["templateLiteral"].(map[string]any)
	if !ok {
		return nil, nil, false
	}
	rawTexts, textsOK := inner["texts"].([]any)
	rawPlaceholders, placeholdersOK := inner["placeholders"].([]any)
	if !textsOK || !placeholdersOK || len(rawTexts) != len(rawPlaceholders)+1 {
		return nil, nil, false
	}
	texts := make([]string, 0, len(rawTexts))
	for _, rawText := range rawTexts {
		text, textOK := rawText.(string)
		if !textOK {
			return nil, nil, false
		}
		texts = append(texts, text)
	}
	placeholders := make([]map[string]any, 0, len(rawPlaceholders))
	for _, rawPlaceholder := range rawPlaceholders {
		placeholder, placeholderOK := rawPlaceholder.(map[string]any)
		if !placeholderOK {
			return nil, nil, false
		}
		placeholders = append(placeholders, placeholder)
	}
	return texts, placeholders, true
}

// templateSpanSchemaText renders one placeholder as an ordinary schema. Only
// the kinds TypeScript can interpolate into a template literal type get a
// spelling — `unknown` and anything else hands the whole node to the escape.
func templateSpanSchemaText(span map[string]any) (string, bool) {
	kind, ok := spanKind(span["kind"])
	if !ok {
		return "", false
	}
	switch kind {
	case reflection.KindString:
		return "{type: 'string'}", true
	case reflection.KindNumber:
		return "{type: 'number'}", true
	case reflection.KindBigInt:
		return "{jsType: 'bigint'}", true
	case reflection.KindLiteral:
		switch literal := span["literal"].(type) {
		case string:
			return fmt.Sprintf("{const: %s}", quoteSingle(literal)), true
		case float64:
			numberText, numberOK := formatNumberLiteral(literal)
			if !numberOK {
				return "", false
			}
			return fmt.Sprintf("{const: %s}", numberText), true
		case bool:
			return fmt.Sprintf("{const: %s}", strconv.FormatBool(literal)), true
		}
	}
	return "", false
}

// schemaEmbedNode spells a node as `embedType<TypeText>()` on the schema
// target — the escape for shapes whose standard-keyword spelling would not
// read back exactly. Dialect, so --portable refuses.
func (ctx *printContext) schemaEmbedNode(node *reflection.RunType) (string, *Diagnostic) {
	if ctx.opts.Portable {
		return "", &Diagnostic{Code: CodePortableDialect, Severity: SeverityError, Decl: declLabel(ctx.decl),
			Message: fmt.Sprintf("%s has no exact standard 2020-12 spelling; drop --portable to use the RunTypes dialect", kindLabel(node.Kind))}
	}
	typeText, diag := ctx.escapeTypeText(node)
	if diag != nil {
		return "", diag
	}
	ctx.needs.useEmbedType = true
	return fmt.Sprintf("%s<%s>()", ctx.names.EmbedType, typeText), nil
}
