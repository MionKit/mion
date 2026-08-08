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
	if annotation := node.FormatAnnotation; annotation != nil {
		family, known := formatFamilies[annotation.Name]
		if !known {
			return "", unsupportedFormatDiag(annotation.Name, ctx.decl)
		}
		paramsText, ok := printFormatParams(annotation.Params, family.bigintParams)
		if !ok {
			return "", unsupportedFormatDiag(annotation.Name, ctx.decl)
		}
		ctx.needs.useTF = true
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
		childText, diag := ctx.typeExpr(node.Child)
		if diag != nil {
			return "", diag
		}
		return childText + "[]", nil
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
	rt := func(call string) (string, *Diagnostic) {
		ctx.needs.useRT = true
		return ctx.names.RT + "." + call, nil
	}
	tf := func(call string) (string, *Diagnostic) {
		ctx.needs.useTF = true
		return ctx.names.TF + "." + call, nil
	}
	if annotation := node.FormatAnnotation; annotation != nil {
		family, known := formatFamilies[annotation.Name]
		if !known {
			return "", unsupportedFormatDiag(annotation.Name, ctx.decl)
		}
		paramsText, ok := printFormatParams(annotation.Params, family.bigintParams)
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
		return rt(fmt.Sprintf("array(%s)", childText))
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
	dialect := func(literal string) (string, *Diagnostic) {
		if ctx.opts.Portable {
			return "", &Diagnostic{Code: CodePortableDialect, Severity: SeverityError, Decl: declLabel(ctx.decl),
				Message: fmt.Sprintf("%s has no standard 2020-12 spelling; drop --portable to use the RunTypes dialect", kindLabel(node.Kind))}
		}
		return literal, nil
	}
	// Format annotations ride jsFormat verbatim for now — the standard-keyword
	// rows (minLength / minimum / format:'email' / …) land with the preset
	// mirror (docs/todos/format-conversion-completion.md), which is also what
	// will widen --portable coverage to standard-expressible brands.
	if annotation := node.FormatAnnotation; annotation != nil {
		family, known := formatFamilies[annotation.Name]
		if !known {
			return "", unsupportedFormatDiag(annotation.Name, ctx.decl)
		}
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
			return fmt.Sprintf("%s(%sn)", ctx.names.EmbedType, strings.TrimSuffix(digits, "n")), nil
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
		return fmt.Sprintf("{type: 'array', items: %s}", childText), nil
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
