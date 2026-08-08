// print.go — the three printers. Each is a pure function from a reflection
// RunType node (plus the name table) to source text; no checker access, so
// they golden-test in isolation. Phase 1 covers the atomic ladder + literals;
// an unsupported kind reports CNV001 and the declaration stays untouched.
package convert

import (
	"fmt"
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
		typeExpr, diag := printTypeExpr(resolved.Node, decl)
		if diag != nil {
			return nil, diag
		}
		return &printedDecl{text: fmt.Sprintf("%stype %s = %s;", exportPrefix, typeName, typeExpr)}, nil

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

// printTypeExpr renders the type-first spelling of an atomic node.
func printTypeExpr(node *reflection.RunType, decl *declaration) (string, *Diagnostic) {
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
			return "", unsupportedDiag(node, decl)
		}
		return literalText, nil
	}
	return "", unsupportedDiag(node, decl)
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
