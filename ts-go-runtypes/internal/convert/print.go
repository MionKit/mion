// print.go — the three printers. Each is a pure walk from a reflection
// RunType node (plus the name table and the ref-resolve closure) to source
// text; no checker access, so they test in isolation. Coverage grows by
// phase (docs/todos/format-conversion-completion.md): atoms + literals +
// generic format families + arrays + tuples so far; an unsupported kind
// reports CNV001 and the declaration stays untouched.
package convert

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/mionkit/ts-runtypes/internal/reflection"
)

// printedDecl is one declaration's replacement text plus the imports it uses.
type printedDecl struct {
	text  string
	needs importNeeds
}

// printContext carries one declaration's printing state: the name table, the
// options, the ref-resolve closure, and the import needs the walk accumulates.
type printContext struct {
	names   *nameTable
	opts    Options
	decl    *declaration
	resolve func(id string) *reflection.RunType
	needs   importNeeds
	// walking guards the recursive printers against circular graphs: a node
	// already on the walk path reports CNV001 (circular conversion is a later
	// phase) instead of recursing forever.
	walking map[string]bool
}

// enter marks a node as on-path; the returned func unmarks it. The second
// result is false when the node is already on the path (a cycle).
func (ctx *printContext) enter(node *reflection.RunType) (func(), bool) {
	if node == nil || node.ID == "" {
		return func() {}, true
	}
	if ctx.walking == nil {
		ctx.walking = map[string]bool{}
	}
	if ctx.walking[node.ID] {
		return nil, false
	}
	ctx.walking[node.ID] = true
	return func() { delete(ctx.walking, node.ID) }, true
}

// circularPendingDiag reports a circular type, whose conversion (RT.circular /
// $defs) is a later phase.
func (ctx *printContext) circularPendingDiag() *Diagnostic {
	return &Diagnostic{Code: CodeUnsupportedKind, Severity: SeverityError, Decl: declLabel(ctx.decl),
		Message: "circular types are not convertible yet (see docs/todos/format-conversion-completion.md)"}
}

// deref follows a `{kind:-1, id}` ref sentinel to its canonical node.
func (ctx *printContext) deref(node *reflection.RunType) *reflection.RunType {
	if node != nil && node.Kind == reflection.KindRef && ctx.resolve != nil {
		return ctx.resolve(node.ID)
	}
	return node
}

// printDecl renders the full replacement statement(s) for one resolved
// declaration in the requested target form.
func printDecl(resolved *resolvedDecl, opts Options, names *nameTable) (*printedDecl, *Diagnostic) {
	decl := resolved.Decl
	ctx := &printContext{names: names, opts: opts, decl: decl, resolve: resolved.Resolve}
	exportPrefix := ""
	if decl.Exported {
		exportPrefix = "export "
	}
	switch opts.Target {
	case TargetType:
		typeName := decl.Name
		if typeName == "" {
			typeName = names.deriveTypeName(decl.ConstName)
		}
		if typeName == "" {
			return nil, &Diagnostic{Code: CodeNameCollision, Severity: SeverityError, Decl: declLabel(decl),
				Message: fmt.Sprintf("no free type name derivable from %q", decl.ConstName)}
		}
		typeExpr, diag := ctx.typeExpr(resolved.Node)
		if diag != nil {
			return nil, diag
		}
		return &printedDecl{text: fmt.Sprintf("%stype %s = %s;", exportPrefix, typeName, typeExpr), needs: ctx.needs}, nil

	case TargetBuilders:
		builderExpr, diag := ctx.builderExpr(resolved.Node)
		if diag != nil {
			return nil, diag
		}
		return assembleConstDecl(decl, names, exportPrefix, builderExpr, ctx.needs)

	case TargetJSONSchema:
		schemaExpr, diag := ctx.schemaExpr(resolved.Node)
		if diag != nil {
			return nil, diag
		}
		// Object schema literals need `as const`: an inline literal otherwise
		// widens against the keyword slots' declared unions (`const: 'ana'`
		// would recover `string`). Boolean schemas and embedType calls don't.
		if strings.HasPrefix(schemaExpr, "{") {
			schemaExpr += " as const"
		}
		wrapped := fmt.Sprintf("%s(%s)", names.RunTypeFromJSONSchema, schemaExpr)
		ctx.needs.useRunTypeFromJSONSchema = true
		return assembleConstDecl(decl, names, exportPrefix, wrapped, ctx.needs)
	}
	return nil, &Diagnostic{Code: CodeUnsupportedKind, Severity: SeverityError, Decl: declLabel(decl), Message: "unknown target"}
}

// assembleConstDecl renders `const nameRT = <expr>;` plus, when the source
// declaration was type-form (so the type name must survive), the paired
// `type Name = InferType<typeof nameRT>;` alias. A const-form source keeps
// its existing const name and its existing alias statement.
func assembleConstDecl(decl *declaration, names *nameTable, exportPrefix, expr string, needs importNeeds) (*printedDecl, *Diagnostic) {
	constName := decl.ConstName
	if constName == "" {
		constName = names.deriveConstName(decl.Name)
	}
	if constName == "" {
		return nil, &Diagnostic{Code: CodeNameCollision, Severity: SeverityError, Decl: declLabel(decl),
			Message: fmt.Sprintf("no free const name derivable from %q", decl.Name)}
	}
	text := fmt.Sprintf("%sconst %s = %s;", exportPrefix, constName, expr)
	if decl.Form == TargetType {
		needs.useInferType = true
		text += fmt.Sprintf("\n%stype %s = %s<typeof %s>;", exportPrefix, decl.Name, names.InferType, constName)
	}
	return &printedDecl{text: text, needs: needs}, nil
}

// formatFamily describes one generic param-bag format family: the reflected
// annotation name, its `TF` value-first builder and type-first brand alias.
// The named preset families (email / uuid / …) convert once the preset-params
// mirror lands (docs/todos/format-conversion-completion.md).
type formatFamily struct {
	builderFn string
	typeAlias string
	// bigintParams marks a family whose param VALUES are bigints: they print
	// as `485n` literals, and the family can never ride `jsFormat` (JSON
	// cannot carry a bigint) — the schema target embeds the brand instead.
	bigintParams bool
	// exact marks a preset family whose builder/alias merge NON-EMPTY
	// defaults: the pretty spelling cannot be proven identical to the
	// annotation (a default key the annotation omits would survive the
	// merge), so type/builder targets use the exact TypeFormat constructor.
	exact bool
	// base is the exact constructor's base-type spelling.
	base string
}

// The full leaf-family roster (typeFormats.generated.ts is the pinned name
// source). Named presets over-specify on purpose: the builder / type-alias
// call carries the annotation's FULL params (defaults included), which merges
// onto the preset's defaults to the identical brand — no defaults table to
// drift, and the id oracle polices every row.
var formatFamilies = map[string]formatFamily{
	"stringFormat": {builderFn: "string", typeAlias: "String", base: "string"},
	"numberFormat": {builderFn: "number", typeAlias: "Number", base: "number"},
	"bigintFormat": {builderFn: "bigInt", typeAlias: "BigInt", bigintParams: true, base: "bigint"},
	"email":        {exact: true, base: "string"},
	"ip":           {exact: true, base: "string"},
	"domain":       {exact: true, base: "string"},
	"url":          {exact: true, base: "string"},
	"date":         {exact: true, base: "string"},
	"time":         {exact: true, base: "string"},
	"dateTime":     {exact: true, base: "string"},
	"nativeDate":   {builderFn: "date", typeAlias: "Date", base: "Date"},
}

// uuidSpellings maps the uuid family's enumerable version param onto its
// dedicated preset builders / aliases (the family has no generic type).
var uuidSpellings = map[string]formatFamily{
	"any": {builderFn: "uuid", typeAlias: "UUID"},
	"4":   {builderFn: "uuidv4", typeAlias: "UUIDv4"},
	"7":   {builderFn: "uuidv7", typeAlias: "UUIDv7"},
}

// leafFormat resolves a node's annotation to a printable leaf family; false
// when the annotation is structural (formattedArray/formattedObject, handled
// at the kind branches) or unknown. uuid resolves through its version param;
// uuidParamsless strips the version key from the printed params (the preset
// alias already carries it).
func leafFormat(annotation *reflection.FormatAnnotation) (formatFamily, map[string]any, bool) {
	if annotation.Name == "uuid" {
		version, _ := annotation.Params["version"].(string)
		family, known := uuidSpellings[version]
		if !known {
			return formatFamily{}, nil, false
		}
		return family, map[string]any{}, true
	}
	family, known := formatFamilies[annotation.Name]
	if !known {
		return formatFamily{}, nil, false
	}
	return family, annotation.Params, true
}

// multiNegationDiag: one `not` per node prints; stacked negations await the
// allOf spelling.
func (ctx *printContext) multiNegationDiag() *Diagnostic {
	return &Diagnostic{Code: CodeUnsupportedKind, Severity: SeverityError, Decl: declLabel(ctx.decl),
		Message: "stacked negations are not convertible yet (one not per node prints)"}
}

// exactBrandType renders the exact TypeFormat constructor for an annotation:
// no defaults merge, provably the reflected brand.
func (ctx *printContext) exactBrandType(annotation *reflection.FormatAnnotation, family formatFamily) (string, bool) {
	paramsText, ok := printFormatParams(annotation.Params, family.bigintParams)
	if !ok {
		return "", false
	}
	ctx.needs.useTypeFormat = true
	return fmt.Sprintf("%s<%s, %s, %s>", ctx.names.TypeFormat, family.base, quoteSingle(annotation.Name), paramsText), true
}

// structuralSubPrinter renders a child node in the current target's dialect —
// the printer method threaded into the structural helpers.
type structuralSubPrinter func(node *reflection.RunType) (string, *Diagnostic)

// structuralParts renders a node's structural payload (brand params +
// contains / patternProperties / propertyNames) as sorted `key: value` parts.
// closedOK tells whether the target may spell closedness (schema emits
// `additionalProperties: false` only when the closed list equals the declared
// keys, which is what the door re-derives).
func (ctx *printContext) structuralParts(node *reflection.RunType, params map[string]any, sub structuralSubPrinter, target Target) ([]string, *Diagnostic) {
	var parts []string
	keys := make([]string, 0, len(params))
	for key := range params {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		if key == "closed" || key == "closedPatterns" {
			continue
		}
		valueText, ok := paramValueText(params[key], false)
		if !ok {
			return nil, unsupportedDiag(node, ctx.decl)
		}
		parts = append(parts, fmt.Sprintf("%s: %s", key, valueText))
	}
	if len(node.Contains) > 1 {
		return nil, &Diagnostic{Code: CodeUnsupportedKind, Severity: SeverityError, Decl: declLabel(ctx.decl),
			Message: "stacked contains checks are not convertible yet"}
	}
	if len(node.Contains) == 1 {
		check := node.Contains[0]
		childText, diag := sub(check.Child)
		if diag != nil {
			return nil, diag
		}
		parts = append(parts, fmt.Sprintf("contains: %s", childText))
		if check.Min != 1 {
			parts = append(parts, fmt.Sprintf("minContains: %s", strconv.FormatFloat(check.Min, 'g', -1, 64)))
		}
		if check.Max >= 0 {
			parts = append(parts, fmt.Sprintf("maxContains: %s", strconv.FormatFloat(check.Max, 'g', -1, 64)))
		}
	}
	if len(node.PatternProps) > 0 {
		var patternParts []string
		for _, patternCheck := range node.PatternProps {
			valueText, diag := sub(patternCheck.Value)
			if diag != nil {
				return nil, diag
			}
			patternParts = append(patternParts, fmt.Sprintf("%s: %s", quoteSingle(patternCheck.Source), valueText))
		}
		parts = append(parts, fmt.Sprintf("patternProperties: {%s}", strings.Join(patternParts, ", ")))
	}
	if len(node.PropNames) > 1 {
		return nil, &Diagnostic{Code: CodeUnsupportedKind, Severity: SeverityError, Decl: declLabel(ctx.decl),
			Message: "stacked propertyNames checks are not convertible yet"}
	}
	if len(node.PropNames) == 1 {
		keyText, diag := sub(node.PropNames[0])
		if diag != nil {
			return nil, diag
		}
		parts = append(parts, fmt.Sprintf("propertyNames: %s", keyText))
	}
	if closedDiag := ctx.closedParts(node, params, target, &parts); closedDiag != nil {
		return nil, closedDiag
	}
	return parts, nil
}

// closedParts renders the closedness params. Builders and the type target
// carry the exact `closed` / `closedPatterns` lists verbatim; the schema
// target spells `additionalProperties: false` only when the closed list is
// exactly the declared member set (what the door re-derives), and refuses
// otherwise rather than move the id.
func (ctx *printContext) closedParts(node *reflection.RunType, params map[string]any, target Target, parts *[]string) *Diagnostic {
	closedValue, hasClosed := params["closed"]
	closedPatternsValue, hasClosedPatterns := params["closedPatterns"]
	if !hasClosed && !hasClosedPatterns {
		return nil
	}
	if target != TargetJSONSchema {
		if hasClosed {
			closedText, ok := paramValueText(closedValue, false)
			if !ok {
				return unsupportedDiag(node, ctx.decl)
			}
			*parts = append(*parts, fmt.Sprintf("closed: %s", closedText))
		}
		if hasClosedPatterns {
			closedPatternsText, ok := paramValueText(closedPatternsValue, false)
			if !ok {
				return unsupportedDiag(node, ctx.decl)
			}
			*parts = append(*parts, fmt.Sprintf("closedPatterns: %s", closedPatternsText))
		}
		return nil
	}
	if hasClosedPatterns {
		return &Diagnostic{Code: CodeUnsupportedKind, Severity: SeverityError, Decl: declLabel(ctx.decl),
			Message: "pattern-scoped closedness is not convertible to json-schema yet"}
	}
	closedList, _ := closedValue.([]any)
	declaredKeys := map[string]bool{}
	for _, memberRef := range node.Children {
		member := ctx.deref(memberRef)
		if member != nil {
			declaredKeys[member.Name] = true
		}
	}
	if len(closedList) != len(declaredKeys) {
		return &Diagnostic{Code: CodeUnsupportedKind, Severity: SeverityError, Decl: declLabel(ctx.decl),
			Message: "closedness with a non-declared key list is not convertible to json-schema yet"}
	}
	for _, key := range closedList {
		keyName, _ := key.(string)
		if !declaredKeys[keyName] {
			return &Diagnostic{Code: CodeUnsupportedKind, Severity: SeverityError, Decl: declLabel(ctx.decl),
				Message: "closedness with a non-declared key list is not convertible to json-schema yet"}
		}
	}
	*parts = append(*parts, "additionalProperties: false")
	return nil
}

// structuralAnnotationParams returns the structural brand's params (or an
// empty map when the node carries sentinels without the brand).
func structuralAnnotationParams(node *reflection.RunType) map[string]any {
	if node.FormatAnnotation != nil && isStructuralAnnotation(node.FormatAnnotation) {
		return node.FormatAnnotation.Params
	}
	return map[string]any{}
}

// hasStructuralPayload reports whether the node carries anything the
// structural helpers must print.
func hasStructuralPayload(node *reflection.RunType) bool {
	if node.FormatAnnotation != nil && isStructuralAnnotation(node.FormatAnnotation) {
		return true
	}
	return len(node.Contains) > 0 || len(node.PatternProps) > 0 || len(node.PropNames) > 0
}

// isStructuralAnnotation tells the array/object structural brands from the
// leaf families — they are handled at their kind branches, not as leaves.
func isStructuralAnnotation(annotation *reflection.FormatAnnotation) bool {
	return annotation.Name == "formattedArray" || annotation.Name == "formattedObject"
}

// unsupportedFormatDiag reports a format family this phase cannot print.
func unsupportedFormatDiag(name string, decl *declaration) *Diagnostic {
	return &Diagnostic{Code: CodeUnsupportedKind, Severity: SeverityError, Decl: declLabel(decl),
		Message: fmt.Sprintf("format family %q is not convertible yet (see docs/todos/format-conversion-completion.md)", name)}
}

// printFormatParams renders a FormatAnnotation params map as TS source with
// sorted keys, so printed output is deterministic. False for a params value
// this phase cannot render.
func printFormatParams(params map[string]any, bigintValues bool) (string, bool) {
	keys := make([]string, 0, len(params))
	for key := range params {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	var parts []string
	for _, key := range keys {
		valueText, ok := paramValueText(params[key], bigintValues)
		if !ok {
			return "", false
		}
		parts = append(parts, fmt.Sprintf("%s: %s", key, valueText))
	}
	return "{" + strings.Join(parts, ", ") + "}", true
}

func paramValueText(value any, bigintValues bool) (string, bool) {
	switch typed := value.(type) {
	case string:
		// A bigint-family param value arrives as its bigint-literal string
		// (`485n`); it prints back verbatim as the literal the authoring
		// surface requires (the suffix is appended only if absent).
		if bigintValues {
			if strings.HasSuffix(typed, "n") {
				return typed, true
			}
			return typed + "n", true
		}
		return quoteSingle(typed), true
	case float64:
		return strconv.FormatFloat(typed, 'g', -1, 64), true
	case int:
		return strconv.Itoa(typed), true
	case bool:
		return strconv.FormatBool(typed), true
	case nil:
		return "null", true
	case map[string]any:
		return printFormatParams(typed, bigintValues)
	case []any:
		var parts []string
		for _, element := range typed {
			elementText, ok := paramValueText(element, bigintValues)
			if !ok {
				return "", false
			}
			parts = append(parts, elementText)
		}
		return "[" + strings.Join(parts, ", ") + "]", true
	}
	return "", false
}

// tupleShape is a tuple node partitioned into the three builder positions.
// Ordering is validated: required slots, then optionals, then one rest tail.
type tupleShape struct {
	required []*reflection.RunType
	optional []*reflection.RunType
	rest     *reflection.RunType
	labeled  bool
}

// tupleMembers partitions a tuple node's members. False when the member
// layout is one the printers cannot express (interleaved optionals).
func (ctx *printContext) tupleMembers(node *reflection.RunType) (*tupleShape, bool) {
	shape := &tupleShape{}
	for _, memberRef := range node.Children {
		member := ctx.deref(memberRef)
		if member == nil {
			return nil, false
		}
		inner := ctx.deref(member.Child)
		if inner == nil {
			return nil, false
		}
		if member.Name != "" {
			shape.labeled = true
		}
		isRest := false
		for _, flag := range member.Flags {
			if flag == "rest" {
				isRest = true
			}
		}
		switch {
		case isRest:
			if shape.rest != nil {
				return nil, false
			}
			shape.rest = inner
		case member.Optional:
			if shape.rest != nil {
				return nil, false
			}
			shape.optional = append(shape.optional, inner)
		default:
			if len(shape.optional) > 0 || shape.rest != nil {
				return nil, false
			}
			shape.required = append(shape.required, inner)
		}
	}
	return shape, true
}

// typeExpr renders the type-first spelling of a node.
func (ctx *printContext) typeExpr(node *reflection.RunType) (string, *Diagnostic) {
	node = ctx.deref(node)
	if node == nil {
		return "", unsupportedDiag(&reflection.RunType{Kind: reflection.KindRef}, ctx.decl)
	}
	leave, entered := ctx.enter(node)
	if !entered {
		return "", ctx.circularPendingDiag()
	}
	defer leave()
	if len(node.Negations) > 0 {
		if len(node.Negations) > 1 {
			return "", ctx.multiNegationDiag()
		}
		negatedText, diag := ctx.typeExpr(node.Negations[0])
		if diag != nil {
			return "", diag
		}
		// TF.Not<F> carries the base kind itself, so the negation node prints
		// as the wrapper alone.
		ctx.needs.useTF = true
		return fmt.Sprintf("%s.Not<%s>", ctx.names.TF, negatedText), nil
	}
	if annotation := node.FormatAnnotation; annotation != nil && !isStructuralAnnotation(annotation) {
		family, params, known := leafFormat(annotation)
		if !known {
			return "", unsupportedFormatDiag(annotation.Name, ctx.decl)
		}
		if family.exact {
			exactText, ok := ctx.exactBrandType(annotation, family)
			if !ok {
				return "", unsupportedFormatDiag(annotation.Name, ctx.decl)
			}
			return exactText, nil
		}
		ctx.needs.useTF = true
		if len(params) == 0 {
			return fmt.Sprintf("%s.%s", ctx.names.TF, family.typeAlias), nil
		}
		paramsText, ok := printFormatParams(params, family.bigintParams)
		if !ok {
			return "", unsupportedFormatDiag(annotation.Name, ctx.decl)
		}
		return fmt.Sprintf("%s.%s<%s>", ctx.names.TF, family.typeAlias, paramsText), nil
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
		if childNode != nil && childNode.Kind == reflection.KindUnion {
			childText = "(" + childText + ")"
		}
		if hasStructuralPayload(node) {
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
		return "", unsupportedDiag(node, ctx.decl)
	case reflection.KindUnion:
		if len(node.OneOf) > 0 {
			var branches []string
			for _, branchRef := range node.OneOf {
				branchText, diag := ctx.typeExpr(branchRef)
				if diag != nil {
					return "", diag
				}
				branches = append(branches, branchText)
			}
			ctx.needs.useRT = true
			return fmt.Sprintf("%s.OneOf<[%s]>", ctx.names.RT, strings.Join(branches, ", ")), nil
		}
		var parts []string
		for _, armRef := range node.Children {
			armText, diag := ctx.typeExpr(armRef)
			if diag != nil {
				return "", diag
			}
			parts = append(parts, armText)
		}
		return strings.Join(parts, " | "), nil
	case reflection.KindObjectLiteral:
		members, indexValue, diag := ctx.objectMembers(node)
		if diag != nil {
			return "", diag
		}
		if indexValue != nil && len(members) > 0 {
			return "", ctx.mixedIndexPendingDiag()
		}
		var baseText string
		if indexValue != nil {
			valueText, valueDiag := ctx.typeExpr(indexValue)
			if valueDiag != nil {
				return "", valueDiag
			}
			baseText = fmt.Sprintf("Record<string, %s>", valueText)
		} else {
			var parts []string
			for _, member := range members {
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
			baseText = "{" + strings.Join(parts, "; ") + "}"
		}
		if hasStructuralPayload(node) {
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
			// A union member binds looser than the `?` suffix and the rest
			// `[]` — parenthesize so the printed member keeps its meaning.
			if inner != nil && inner.Kind == reflection.KindUnion && (isRest || member.Optional) {
				innerText = "(" + innerText + ")"
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
	}
	return "", unsupportedDiag(node, ctx.decl)
}

// builderExpr renders the value-first builder spelling of a node.
func (ctx *printContext) builderExpr(node *reflection.RunType) (string, *Diagnostic) {
	node = ctx.deref(node)
	if node == nil {
		return "", unsupportedDiag(&reflection.RunType{Kind: reflection.KindRef}, ctx.decl)
	}
	leave, entered := ctx.enter(node)
	if !entered {
		return "", ctx.circularPendingDiag()
	}
	defer leave()
	rt := func(call string) (string, *Diagnostic) {
		ctx.needs.useRT = true
		return ctx.names.RT + "." + call, nil
	}
	tf := func(call string) (string, *Diagnostic) {
		ctx.needs.useTF = true
		return ctx.names.TF + "." + call, nil
	}
	if len(node.Negations) > 0 {
		if len(node.Negations) > 1 {
			return "", ctx.multiNegationDiag()
		}
		negatedText, diag := ctx.builderExpr(node.Negations[0])
		if diag != nil {
			return "", diag
		}
		return rt(fmt.Sprintf("not(%s)", negatedText))
	}
	if annotation := node.FormatAnnotation; annotation != nil && !isStructuralAnnotation(annotation) {
		family, params, known := leafFormat(annotation)
		if !known {
			return "", unsupportedFormatDiag(annotation.Name, ctx.decl)
		}
		if family.exact {
			exactText, ok := ctx.exactBrandType(annotation, family)
			if !ok {
				return "", unsupportedFormatDiag(annotation.Name, ctx.decl)
			}
			ctx.needs.useGetRunType = true
			return fmt.Sprintf("%s<%s>()", ctx.names.GetRunType, exactText), nil
		}
		if len(params) == 0 {
			return tf(family.builderFn + "()")
		}
		paramsText, ok := printFormatParams(params, family.bigintParams)
		if !ok {
			return "", unsupportedFormatDiag(annotation.Name, ctx.decl)
		}
		return tf(fmt.Sprintf("%s(%s)", family.builderFn, paramsText))
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
		return "", unsupportedDiag(node, ctx.decl)
	case reflection.KindUnion:
		if len(node.OneOf) > 0 {
			var branches []string
			for _, branchRef := range node.OneOf {
				branchText, diag := ctx.builderExpr(branchRef)
				if diag != nil {
					return "", diag
				}
				branches = append(branches, branchText)
			}
			return rt(fmt.Sprintf("oneOf([%s])", strings.Join(branches, ", ")))
		}
		var arms []string
		for _, armRef := range node.Children {
			armText, diag := ctx.builderExpr(armRef)
			if diag != nil {
				return "", diag
			}
			arms = append(arms, armText)
		}
		return rt(fmt.Sprintf("union([%s])", strings.Join(arms, ", ")))
	case reflection.KindObjectLiteral:
		members, indexValue, diag := ctx.objectMembers(node)
		if diag != nil {
			return "", diag
		}
		if indexValue != nil && len(members) > 0 {
			return "", ctx.mixedIndexPendingDiag()
		}
		bagText := ""
		if hasStructuralPayload(node) {
			bagParts, partsDiag := ctx.structuralParts(node, structuralAnnotationParams(node), ctx.builderExpr, TargetBuilders)
			if partsDiag != nil {
				return "", partsDiag
			}
			bagText = ", {" + strings.Join(bagParts, ", ") + "}"
		}
		if indexValue != nil {
			valueText, valueDiag := ctx.builderExpr(indexValue)
			if valueDiag != nil {
				return "", valueDiag
			}
			return rt(fmt.Sprintf("record(%s%s)", valueText, bagText))
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
		return rt(fmt.Sprintf("object({%s}%s)", strings.Join(parts, ", "), bagText))
	case reflection.KindTuple:
		shape, ok := ctx.tupleMembers(node)
		if !ok {
			return "", unsupportedDiag(node, ctx.decl)
		}
		if shape.labeled {
			// Labeled tuples await the label-capable builders
			// (docs/todos/format-conversion-completion.md).
			return "", &Diagnostic{Code: CodeUnsupportedKind, Severity: SeverityError, Decl: declLabel(ctx.decl),
				Message: "labeled tuples are not convertible to builders yet (label-capable builders pending)"}
		}
		renderList := func(members []*reflection.RunType) (string, *Diagnostic) {
			var parts []string
			for _, member := range members {
				memberText, diag := ctx.builderExpr(member)
				if diag != nil {
					return "", diag
				}
				parts = append(parts, memberText)
			}
			return "[" + strings.Join(parts, ", ") + "]", nil
		}
		requiredText, diag := renderList(shape.required)
		if diag != nil {
			return "", diag
		}
		call := fmt.Sprintf("tuple(%s", requiredText)
		if len(shape.optional) > 0 || shape.rest != nil {
			optionalText, optDiag := renderList(shape.optional)
			if optDiag != nil {
				return "", optDiag
			}
			call += ", " + optionalText
		}
		if shape.rest != nil {
			restText, restDiag := ctx.builderExpr(shape.rest)
			if restDiag != nil {
				return "", restDiag
			}
			call += ", " + restText
		}
		return rt(call + ")")
	}
	return "", unsupportedDiag(node, ctx.decl)
}

// schemaExpr renders the JSON-Schema spelling of a node. Standard 2020-12
// spellings are used wherever exact; JS-only constructs ride the dialect
// (`jsType` / `jsFormat` / `embedType`), which --portable forbids.
func (ctx *printContext) schemaExpr(node *reflection.RunType) (string, *Diagnostic) {
	node = ctx.deref(node)
	if node == nil {
		return "", unsupportedDiag(&reflection.RunType{Kind: reflection.KindRef}, ctx.decl)
	}
	leave, entered := ctx.enter(node)
	if !entered {
		return "", ctx.circularPendingDiag()
	}
	defer leave()
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
		// The standard `not` keyword runs the door's kind-complement algebra,
		// which does not read the dialect — the first-class Not<F> type
		// embeds instead, exact by construction.
		if ctx.opts.Portable {
			return dialect("")
		}
		negatedText, negDiag := ctx.typeExpr(node.Negations[0])
		if negDiag != nil {
			return "", negDiag
		}
		ctx.needs.useEmbedType = true
		ctx.needs.useTF = true
		return fmt.Sprintf("%s<%s.Not<%s>>()", ctx.names.EmbedType, ctx.names.TF, negatedText), nil
	}
	// Format annotations ride jsFormat verbatim for now — the standard-keyword
	// rows (minLength / minimum / format:'email' / …) land with the preset
	// mirror (docs/todos/format-conversion-completion.md), which is also what
	// will widen --portable coverage to standard-expressible brands.
	if annotation := node.FormatAnnotation; annotation != nil && !isStructuralAnnotation(annotation) {
		family, _, known := leafFormat(annotation)
		if !known {
			return "", unsupportedFormatDiag(annotation.Name, ctx.decl)
		}
		// jsFormat carries the annotation's OWN name + full params verbatim
		// (uuid included — the door rebuilds the brand from the pair), so the
		// schema spelling never depends on the preset tables.
		paramsText, ok := printFormatParams(annotation.Params, family.bigintParams)
		if !ok {
			return "", unsupportedFormatDiag(annotation.Name, ctx.decl)
		}
		// Bigint param values cannot ride JSON — the brand embeds instead.
		if family.bigintParams {
			if ctx.opts.Portable {
				return dialect("")
			}
			ctx.needs.useEmbedType = true
			ctx.needs.useTF = true
			return fmt.Sprintf("%s<%s.%s<%s>>()", ctx.names.EmbedType, ctx.names.TF, family.typeAlias, paramsText), nil
		}
		if len(annotation.Params) == 0 {
			return dialect(fmt.Sprintf("{jsFormat: {name: %s}}", quoteSingle(annotation.Name)))
		}
		return dialect(fmt.Sprintf("{jsFormat: {name: %s, params: %s}}", quoteSingle(annotation.Name), paramsText))
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
		return dialect("{jsType: 'undefined'}")
	case reflection.KindVoid:
		return dialect("{jsType: 'void'}")
	case reflection.KindSymbol:
		return dialect("{jsType: 'symbol'}")
	case reflection.KindBigInt:
		return dialect("{jsType: 'bigint'}")
	case reflection.KindLiteral:
		if isBigIntLiteral(node) {
			// A bigint LITERAL cannot ride pure data: no type-level operation
			// lifts a digit string back to the literal type, so this is exactly
			// the embedType case.
			if ctx.opts.Portable {
				return dialect("")
			}
			digits, _ := node.Literal.(string)
			ctx.needs.useEmbedType = true
			// Type-argument shape: value-shape const inference is not reliable
			// for negative bigint literal expressions.
			return fmt.Sprintf("%s<%sn>()", ctx.names.EmbedType, strings.TrimSuffix(digits, "n")), nil
		}
		literalText, ok := literalValueText(node)
		if !ok {
			return "", unsupportedDiag(node, ctx.decl)
		}
		return fmt.Sprintf("{const: %s}", literalText), nil
	case reflection.KindArray:
		childText, diag := ctx.schemaExpr(node.Child)
		if diag != nil {
			return "", diag
		}
		if hasStructuralPayload(node) {
			parts, partsDiag := ctx.structuralParts(node, structuralAnnotationParams(node), ctx.schemaExpr, TargetJSONSchema)
			if partsDiag != nil {
				return "", partsDiag
			}
			return fmt.Sprintf("{type: 'array', items: %s, %s}", childText, strings.Join(parts, ", ")), nil
		}
		return fmt.Sprintf("{type: 'array', items: %s}", childText), nil
	case reflection.KindPromise:
		childText, diag := ctx.schemaExpr(node.Child)
		if diag != nil {
			return "", diag
		}
		return dialect(fmt.Sprintf("{jsType: 'Promise', typeArguments: [%s]}", childText))
	case reflection.KindClass:
		switch node.SubKind {
		case reflection.SubKindDate:
			return dialect("{jsType: 'Date'}")
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
			return dialect(fmt.Sprintf("{jsType: 'Map', typeArguments: [%s, %s]}", keyText, valueText))
		case reflection.SubKindSet:
			arguments := ctx.nativeArguments(node)
			if len(arguments) != 1 {
				return "", unsupportedDiag(node, ctx.decl)
			}
			itemText, itemDiag := ctx.schemaExpr(arguments[0])
			if itemDiag != nil {
				return "", itemDiag
			}
			return dialect(fmt.Sprintf("{jsType: 'Set', typeArguments: [%s]}", itemText))
		}
		return "", unsupportedDiag(node, ctx.decl)
	case reflection.KindUnion:
		if len(node.OneOf) > 0 {
			var branches []string
			for _, branchRef := range node.OneOf {
				branchText, diag := ctx.schemaExpr(branchRef)
				if diag != nil {
					return "", diag
				}
				branches = append(branches, branchText)
			}
			return fmt.Sprintf("{oneOf: [%s]}", strings.Join(branches, ", ")), nil
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
			return fmt.Sprintf("{enum: [%s]}", strings.Join(literalParts, ", ")), nil
		}
		var arms []string
		for _, armRef := range node.Children {
			armText, diag := ctx.schemaExpr(armRef)
			if diag != nil {
				return "", diag
			}
			arms = append(arms, armText)
		}
		return fmt.Sprintf("{anyOf: [%s]}", strings.Join(arms, ", ")), nil
	case reflection.KindObjectLiteral:
		members, indexValue, diag := ctx.objectMembers(node)
		if diag != nil {
			return "", diag
		}
		if indexValue != nil && len(members) > 0 {
			return "", ctx.mixedIndexPendingDiag()
		}
		schemaBag := ""
		if hasStructuralPayload(node) {
			bagParts, partsDiag := ctx.structuralParts(node, structuralAnnotationParams(node), ctx.schemaExpr, TargetJSONSchema)
			if partsDiag != nil {
				return "", partsDiag
			}
			schemaBag = ", " + strings.Join(bagParts, ", ")
		}
		if indexValue != nil {
			valueText, valueDiag := ctx.schemaExpr(indexValue)
			if valueDiag != nil {
				return "", valueDiag
			}
			return fmt.Sprintf("{type: 'object', additionalProperties: %s%s}", valueText, schemaBag), nil
		}
		var propertyParts []string
		var requiredParts []string
		for _, member := range members {
			if member.readonly {
				// The exact readonly carrier (jsReadonly) is pending — standard
				// readOnly is annotation-only by design, so emitting it would
				// silently drop an id-relevant modifier.
				return "", &Diagnostic{Code: CodeUnsupportedKind, Severity: SeverityError, Decl: declLabel(ctx.decl),
					Message: "readonly members are not convertible to json-schema yet (jsReadonly pending)"}
			}
			innerText, innerDiag := ctx.schemaExpr(member.child)
			if innerDiag != nil {
				return "", innerDiag
			}
			propertyParts = append(propertyParts, fmt.Sprintf("%s: %s", member.key, innerText))
			if !member.optional {
				requiredParts = append(requiredParts, quoteSingle(member.name))
			}
		}
		out := fmt.Sprintf("{type: 'object', properties: {%s}", strings.Join(propertyParts, ", "))
		if len(requiredParts) > 0 {
			out += fmt.Sprintf(", required: [%s]", strings.Join(requiredParts, ", "))
		}
		return out + schemaBag + "}", nil
	case reflection.KindTuple:
		shape, ok := ctx.tupleMembers(node)
		if !ok {
			return "", unsupportedDiag(node, ctx.decl)
		}
		if shape.labeled {
			return "", &Diagnostic{Code: CodeUnsupportedKind, Severity: SeverityError, Decl: declLabel(ctx.decl),
				Message: "labeled tuples are not convertible to json-schema yet (jsLabels pending)"}
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
		return out + "}", nil
	}
	return "", unsupportedDiag(node, ctx.decl)
}

// nativeArguments derefs the KindParameter wrappers a Map/Set node carries in
// its Arguments slot, returning the parameter child types in order.
func (ctx *printContext) nativeArguments(node *reflection.RunType) []*reflection.RunType {
	var out []*reflection.RunType
	for _, argumentRef := range node.Arguments {
		argument := ctx.deref(argumentRef)
		if argument == nil {
			return nil
		}
		child := ctx.deref(argument.Child)
		if child == nil {
			return nil
		}
		out = append(out, child)
	}
	return out
}

// mixedIndexPendingDiag reports the mixed named-props + index-signature form,
// whose exact-index-type spelling is a later phase.
func (ctx *printContext) mixedIndexPendingDiag() *Diagnostic {
	return &Diagnostic{Code: CodeUnsupportedKind, Severity: SeverityError, Decl: declLabel(ctx.decl),
		Message: "mixed named properties + index signature is not convertible yet (see docs/todos/format-conversion-completion.md)"}
}

// objectMember is one printable property: its source key spelling (quoted
// when not a safe identifier), flags, and the dereferenced value node.
type objectMember struct {
	name     string
	key      string
	optional bool
	readonly bool
	child    *reflection.RunType
}

// objectMembers collects a plain object shape's property members plus at most
// one STRING-keyed index signature (number/symbol keys await jsIndexKeys).
// Members the current phase cannot print (methods, call signatures) report
// CNV001.
func (ctx *printContext) objectMembers(node *reflection.RunType) ([]*objectMember, *reflection.RunType, *Diagnostic) {
	var members []*objectMember
	var indexValue *reflection.RunType
	for _, memberRef := range node.Children {
		member := ctx.deref(memberRef)
		if member == nil {
			return nil, nil, unsupportedDiag(node, ctx.decl)
		}
		if member.Kind == reflection.KindIndexSignature {
			indexKey := ctx.deref(member.Index)
			if indexKey == nil || indexKey.Kind != reflection.KindString || indexValue != nil {
				return nil, nil, &Diagnostic{Code: CodeUnsupportedKind, Severity: SeverityError, Decl: declLabel(ctx.decl),
					Message: "non-string or multiple index signatures are not convertible yet (jsIndexKeys pending)"}
			}
			indexValue = ctx.deref(member.Child)
			if indexValue == nil {
				return nil, nil, unsupportedDiag(node, ctx.decl)
			}
			continue
		}
		if member.Kind != reflection.KindPropertySignature && member.Kind != reflection.KindProperty {
			return nil, nil, &Diagnostic{Code: CodeUnsupportedKind, Severity: SeverityError, Decl: declLabel(ctx.decl),
				Message: fmt.Sprintf("object member %q (%s) is not convertible yet (see docs/todos/format-conversion-completion.md)", member.Name, kindLabel(member.Kind))}
		}
		if strings.HasPrefix(member.Name, "@@") {
			return nil, nil, &Diagnostic{Code: CodeUnsupportedKind, Severity: SeverityError, Decl: declLabel(ctx.decl),
				Message: fmt.Sprintf("symbol-keyed member %q is not convertible yet", member.Name)}
		}
		key := member.Name
		if !member.IsSafeName {
			key = quoteSingle(member.Name)
		}
		child := ctx.deref(member.Child)
		if child == nil {
			return nil, nil, unsupportedDiag(node, ctx.decl)
		}
		members = append(members, &objectMember{
			name:     member.Name,
			key:      key,
			optional: member.Optional,
			readonly: member.Readonly,
			child:    child,
		})
	}
	return members, indexValue, nil
}

// literalValueText renders a literal node's VALUE as TS source (`'a'`, `42`,
// `true`, `123n`). False when the literal payload is a shape this phase does
// not print (regexp / symbol literals).
func literalValueText(node *reflection.RunType) (string, bool) {
	if isBigIntLiteral(node) {
		digits, ok := node.Literal.(string)
		return strings.TrimSuffix(digits, "n") + "n", ok
	}
	switch value := node.Literal.(type) {
	case string:
		return quoteSingle(value), true
	case float64:
		return strconv.FormatFloat(value, 'g', -1, 64), true
	case float32:
		return strconv.FormatFloat(float64(value), 'g', -1, 32), true
	case int:
		return strconv.Itoa(value), true
	case int32:
		return strconv.FormatInt(int64(value), 10), true
	case int64:
		return strconv.FormatInt(value, 10), true
	case bool:
		return strconv.FormatBool(value), true
	case nil:
		return "null", true
	}
	return "", false
}

// isBigIntLiteral reports the bigint literal encoding: a string payload
// tagged with the "bigint" flag.
func isBigIntLiteral(node *reflection.RunType) bool {
	for _, flag := range node.Flags {
		if flag == "bigint" {
			return true
		}
	}
	return false
}

// quoteSingle renders a single-quoted TS string literal.
func quoteSingle(value string) string {
	var out strings.Builder
	out.WriteByte('\'')
	for _, char := range value {
		switch char {
		case '\\':
			out.WriteString(`\\`)
		case '\'':
			out.WriteString(`\'`)
		case '\n':
			out.WriteString(`\n`)
		case '\r':
			out.WriteString(`\r`)
		case '\t':
			out.WriteString(`\t`)
		default:
			if char < 0x20 {
				out.WriteString(fmt.Sprintf(`\u%04x`, char))
			} else {
				out.WriteRune(char)
			}
		}
	}
	out.WriteByte('\'')
	return out.String()
}

// unsupportedDiag reports a kind outside the current printer coverage.
func unsupportedDiag(node *reflection.RunType, decl *declaration) *Diagnostic {
	return &Diagnostic{Code: CodeUnsupportedKind, Severity: SeverityError, Decl: declLabel(decl),
		Message: fmt.Sprintf("%s is not convertible yet (see docs/todos/format-conversion-completion.md)", kindLabel(node.Kind))}
}

// kindLabel names a reflection kind for messages.
func kindLabel(kind reflection.ReflectionKind) string {
	labels := map[reflection.ReflectionKind]string{
		reflection.KindNever: "never", reflection.KindAny: "any", reflection.KindUnknown: "unknown",
		reflection.KindVoid: "void", reflection.KindObject: "object", reflection.KindString: "string",
		reflection.KindNumber: "number", reflection.KindBoolean: "boolean", reflection.KindSymbol: "symbol",
		reflection.KindBigInt: "bigint", reflection.KindNull: "null", reflection.KindUndefined: "undefined",
		reflection.KindRegexp: "regexp", reflection.KindLiteral: "a literal", reflection.KindTemplateLiteral: "a template literal",
		reflection.KindPromise: "Promise", reflection.KindClass: "a class", reflection.KindEnum: "an enum",
		reflection.KindUnion: "a union", reflection.KindIntersection: "an intersection", reflection.KindArray: "an array",
		reflection.KindTuple: "a tuple", reflection.KindObjectLiteral: "an object shape", reflection.KindFunction: "a function",
		reflection.KindRef: "a reference",
	}
	if label, ok := labels[kind]; ok {
		return label
	}
	return fmt.Sprintf("kind %d", kind)
}
