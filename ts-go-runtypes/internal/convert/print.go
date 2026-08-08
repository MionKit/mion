// print.go — the three printers. Each is a pure function from a reflection
// RunType node (plus the name table) to source text; no checker access, so
// they golden-test in isolation. Phase 1 covers the atomic ladder + literals;
// an unsupported kind reports CNV001 and the declaration stays untouched.
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

// printDecl renders the full replacement statement(s) for one resolved
// declaration in the requested target form.
func printDecl(resolved *resolvedDecl, opts Options, names *nameTable) (*printedDecl, *Diagnostic) {
	decl := resolved.Decl
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
		typeExpr, typeNeeds, diag := printTypeExpr(resolved.Node, names, decl)
		if diag != nil {
			return nil, diag
		}
		return &printedDecl{text: fmt.Sprintf("%stype %s = %s;", exportPrefix, typeName, typeExpr), needs: typeNeeds}, nil

	case TargetBuilders:
		builderExpr, needs, diag := printBuilderExpr(resolved.Node, names, decl)
		if diag != nil {
			return nil, diag
		}
		return assembleConstDecl(decl, names, exportPrefix, builderExpr, needs)

	case TargetJSONSchema:
		schemaExpr, needs, diag := printSchemaExpr(resolved.Node, opts, names, decl)
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
		needs.useRunTypeFromJSONSchema = true
		return assembleConstDecl(decl, names, exportPrefix, wrapped, needs)
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
}

var formatFamilies = map[string]formatFamily{
	"stringFormat": {builderFn: "string", typeAlias: "String"},
	"numberFormat": {builderFn: "number", typeAlias: "Number"},
	"bigintFormat": {builderFn: "bigInt", typeAlias: "BigInt", bigintParams: true},
}

// unsupportedFormatDiag reports a format family this phase cannot print.
func unsupportedFormatDiag(name string, decl *declaration) *Diagnostic {
	return &Diagnostic{Code: CodeUnsupportedKind, Severity: SeverityError, Decl: declLabel(decl),
		Message: fmt.Sprintf("format family %q is not convertible yet (generic string/number/bigint families only)", name)}
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

// printTypeExpr renders the type-first spelling of an atomic node. The needs
// matter here too: a format brand spells as `TF.String<{…}>`, so even the
// type target can require the formats namespace import.
func printTypeExpr(node *reflection.RunType, names *nameTable, decl *declaration) (string, importNeeds, *Diagnostic) {
	needs := importNeeds{}
	if annotation := node.FormatAnnotation; annotation != nil {
		family, known := formatFamilies[annotation.Name]
		if !known {
			return "", needs, unsupportedFormatDiag(annotation.Name, decl)
		}
		paramsText, ok := printFormatParams(annotation.Params, family.bigintParams)
		if !ok {
			return "", needs, unsupportedFormatDiag(annotation.Name, decl)
		}
		needs.useTF = true
		return fmt.Sprintf("%s.%s<%s>", names.TF, family.typeAlias, paramsText), needs, nil
	}
	switch node.Kind {
	case reflection.KindString:
		return "string", needs, nil
	case reflection.KindNumber:
		return "number", needs, nil
	case reflection.KindBoolean:
		return "boolean", needs, nil
	case reflection.KindBigInt:
		return "bigint", needs, nil
	case reflection.KindSymbol:
		return "symbol", needs, nil
	case reflection.KindNull:
		return "null", needs, nil
	case reflection.KindUndefined:
		return "undefined", needs, nil
	case reflection.KindVoid:
		return "void", needs, nil
	case reflection.KindAny:
		return "any", needs, nil
	case reflection.KindUnknown:
		return "unknown", needs, nil
	case reflection.KindNever:
		return "never", needs, nil
	case reflection.KindLiteral:
		literalText, ok := literalValueText(node)
		if !ok {
			return "", needs, unsupportedDiag(node, decl)
		}
		return literalText, needs, nil
	}
	return "", needs, unsupportedDiag(node, decl)
}

// printBuilderExpr renders the value-first builder spelling of an atomic node.
func printBuilderExpr(node *reflection.RunType, names *nameTable, decl *declaration) (string, importNeeds, *Diagnostic) {
	needs := importNeeds{}
	rt := func(call string) (string, importNeeds, *Diagnostic) {
		needs.useRT = true
		return names.RT + "." + call, needs, nil
	}
	tf := func(call string) (string, importNeeds, *Diagnostic) {
		needs.useTF = true
		return names.TF + "." + call, needs, nil
	}
	if annotation := node.FormatAnnotation; annotation != nil {
		family, known := formatFamilies[annotation.Name]
		if !known {
			return "", needs, unsupportedFormatDiag(annotation.Name, decl)
		}
		paramsText, ok := printFormatParams(annotation.Params, family.bigintParams)
		if !ok {
			return "", needs, unsupportedFormatDiag(annotation.Name, decl)
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
			return "", needs, unsupportedDiag(node, decl)
		}
		return rt(fmt.Sprintf("literal(%s)", literalText))
	}
	return "", needs, unsupportedDiag(node, decl)
}

// printSchemaExpr renders the JSON-Schema spelling of an atomic node.
// Standard 2020-12 spellings are used wherever exact; JS-only kinds ride the
// `jsType` dialect rows, which --portable forbids.
func printSchemaExpr(node *reflection.RunType, opts Options, names *nameTable, decl *declaration) (string, importNeeds, *Diagnostic) {
	needs := importNeeds{}
	standard := func(literal string) (string, importNeeds, *Diagnostic) { return literal, needs, nil }
	dialect := func(literal string) (string, importNeeds, *Diagnostic) {
		if opts.Portable {
			return "", needs, &Diagnostic{Code: CodePortableDialect, Severity: SeverityError, Decl: declLabel(decl),
				Message: fmt.Sprintf("%s has no standard 2020-12 spelling; drop --portable to use the RunTypes dialect", kindLabel(node.Kind))}
		}
		return literal, needs, nil
	}
	// Format annotations ride jsFormat verbatim for now — the standard-keyword
	// rows (minLength / minimum / format:'email' / …) land with the preset
	// mirror (docs/todos/format-conversion-completion.md), which is also what
	// will widen --portable coverage to standard-expressible brands.
	if annotation := node.FormatAnnotation; annotation != nil {
		family, known := formatFamilies[annotation.Name]
		if !known {
			return "", needs, unsupportedFormatDiag(annotation.Name, decl)
		}
		paramsText, ok := printFormatParams(annotation.Params, family.bigintParams)
		if !ok {
			return "", needs, unsupportedFormatDiag(annotation.Name, decl)
		}
		// Bigint param values cannot ride JSON — the brand embeds instead.
		if family.bigintParams {
			if opts.Portable {
				return dialect("")
			}
			needs.useEmbedType = true
			needs.useTF = true
			return fmt.Sprintf("%s<%s.%s<%s>>()", names.EmbedType, names.TF, family.typeAlias, paramsText), needs, nil
		}
		entry := fmt.Sprintf("{jsFormat: {name: %s, params: %s}}", quoteSingle(annotation.Name), paramsText)
		if len(annotation.Params) == 0 {
			entry = fmt.Sprintf("{jsFormat: {name: %s}}", quoteSingle(annotation.Name))
		}
		return dialect(entry)
	}
	switch node.Kind {
	case reflection.KindString:
		return standard("{type: 'string'}")
	case reflection.KindNumber:
		return standard("{type: 'number'}")
	case reflection.KindBoolean:
		return standard("{type: 'boolean'}")
	case reflection.KindNull:
		return standard("{type: 'null'}")
	case reflection.KindUnknown:
		return standard("{}")
	case reflection.KindNever:
		return standard("{enum: []}")
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
			if opts.Portable {
				return dialect("")
			}
			digits, _ := node.Literal.(string)
			needs.useEmbedType = true
			return fmt.Sprintf("%s(%sn)", names.EmbedType, digits), needs, nil
		}
		literalText, ok := literalValueText(node)
		if !ok {
			return "", needs, unsupportedDiag(node, decl)
		}
		return standard(fmt.Sprintf("{const: %s}", literalText))
	}
	return "", needs, unsupportedDiag(node, decl)
}

// literalValueText renders a literal node's VALUE as TS source (`'a'`, `42`,
// `true`, `123n`). False when the literal payload is a shape this phase does
// not print (regexp / symbol literals).
func literalValueText(node *reflection.RunType) (string, bool) {
	if isBigIntLiteral(node) {
		digits, ok := node.Literal.(string)
		return digits + "n", ok
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

// unsupportedDiag reports a kind outside the phase-1 printer coverage.
func unsupportedDiag(node *reflection.RunType, decl *declaration) *Diagnostic {
	return &Diagnostic{Code: CodeUnsupportedKind, Severity: SeverityError, Decl: declLabel(decl),
		Message: fmt.Sprintf("%s is not convertible yet (phase 1 covers atomic kinds and literals)", kindLabel(node.Kind))}
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
	}
	if label, ok := labels[kind]; ok {
		return label
	}
	return fmt.Sprintf("kind %d", kind)
}
