// print.go — the three printers. Each is a pure walk from a reflection
// RunType node (plus the name table, the run's declaration set and the
// ref-resolve closure) to source text; no checker access, so they test in
// isolation. Shapes with no native spelling in a target ride the escapes
// (`getRunType<T>()` on builders, `embedType<T>()` on the schema target);
// anything with no spelling at all reports CNV001 and the declaration stays
// untouched (record: docs/done/format-conversion-completion.md).
package convert

import (
	"fmt"
	"math"
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
	// Set-wide reference state: the run's declaration table, this file's
	// import bindings and in-scope names, the root node's id (self back-edges
	// close on it) and, for the type target only, the declaration's own name.
	set         *Set
	bindings    *fileBindings
	inScope     map[string]bool
	currentFile string
	rootID      string
	selfName    string
	// usedSelf records that a self back-edge printed (`RT.self()`), so the
	// builders target wraps the whole expression in `RT.circular(…)`.
	usedSelf bool
	// walking guards the recursive printers: a node already on the walk path
	// is a back-edge — the root's id closes as a self-reference, anything
	// else (a cycle through an unnamed intermediate) reports CNV001.
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

// anonymousCycleDiag reports a cycle that never passes through the printed
// declaration's root or a referenceable declaration — there is no spelling
// that closes it (`self()` / `$ref: '#'` bind the root only).
func (ctx *printContext) anonymousCycleDiag() *Diagnostic {
	return &Diagnostic{Code: CodeUnsupportedKind, Severity: SeverityError, Decl: declLabel(ctx.decl),
		Message: "cycle through an unnamed type has no conversion spelling (name the cycling type and convert it too)"}
}

// declRef resolves a node against the run's declaration table: a self
// back-edge prints the target's self spelling, another declaration's node
// prints a name reference. The bool reports whether the node WAS a reference
// (the caller returns the text/diag instead of walking the node).
func (ctx *printContext) declRef(node *reflection.RunType, target Target) (string, *Diagnostic, bool) {
	if node == nil || node.ID == "" || ctx.set == nil {
		return "", nil, false
	}
	if node.ID == ctx.rootID {
		if len(ctx.walking) == 0 {
			// The declaration's own root — unless another declaration with the
			// same structural id already names this exact type, in which case
			// the whole declaration is an alias of it and prints as a
			// reference (`type C = B`).
			if entry, exists := ctx.set.Table[node.ID]; exists && entry.TypeName != "" && entry.TypeName != declLabel(ctx.decl) {
				return ctx.refSpelling(entry, target)
			}
			return "", nil, false
		}
		switch target {
		case TargetType:
			if ctx.selfName == "" {
				// A self back-edge inside an embedded type expression (a
				// negation embed, an escape) would spell the declaration's own
				// alias inside its own const initializer — circular in TS.
				return "", &Diagnostic{Code: CodeUnsupportedKind, Severity: SeverityError, Decl: declLabel(ctx.decl),
					Message: "self-referential type inside an embedded type expression is not convertible"}, true
			}
			return ctx.selfName, nil, true
		case TargetBuilders:
			ctx.usedSelf = true
			ctx.needs.useRT = true
			return ctx.names.RT + ".self()", nil, true
		case TargetJSONSchema:
			return "{$ref: '#'}", nil, true
		}
		return "", nil, false
	}
	entry, exists := ctx.set.Table[node.ID]
	if !exists || entry.TypeName == "" || !referenceWorthy(node) {
		return "", nil, false
	}
	if target != TargetType && ctx.reaches(node.ID, ctx.rootID) {
		// The referenced declaration cycles back here; a name reference would
		// make the printed const's type self-referential (TS rejects it), so
		// the partner inlines and the cycle closes at the root instead. The
		// type target keeps the name — aliases resolve lazily.
		return "", nil, false
	}
	return ctx.refSpelling(entry, target)
}

// refSpelling renders a table reference in the requested target, resolving
// the cross-file spelling and recording import needs.
func (ctx *printContext) refSpelling(entry RefTarget, target Target) (string, *Diagnostic, bool) {
	if target == TargetJSONSchema && ctx.opts.Portable {
		// embedType is dialect; under --portable a reference inlines instead
		// (structurally identical, so the id cannot move).
		return "", nil, false
	}
	if entry.File != ctx.currentFile && !entry.Exported {
		// The reference must import the type NAME, which the declaring file
		// does not export — importing it would not compile.
		return "", &Diagnostic{Code: CodeOutsideSet, Severity: SeverityError, Decl: declLabel(ctx.decl),
			Message: fmt.Sprintf("references %q, whose type alias %s does not export — export the alias so the reference can survive conversion", entry.TypeName, entry.File)}, true
	}
	spelling := entry.TypeName
	if ctx.bindings != nil {
		resolved, keepLocal, needsImport, ok := ctx.bindings.spellForTarget(entry, ctx.currentFile)
		if !ok {
			return "", &Diagnostic{Code: CodeOutsideSet, Severity: SeverityError, Decl: declLabel(ctx.decl),
				Message: fmt.Sprintf("references %q from %s but this file has no import that reaches it", entry.TypeName, entry.File)}, true
		}
		spelling = resolved
		if keepLocal != "" {
			ctx.needs.keepLocal(keepLocal)
		}
		if needsImport {
			ctx.needs.addForeign(foreignNeed{module: ctx.bindings.moduleFor(entry.File), name: entry.TypeName})
		}
	}
	switch target {
	case TargetType:
		return spelling, nil, true
	case TargetBuilders:
		ctx.needs.useGetRunType = true
		return fmt.Sprintf("%s<%s>()", ctx.names.GetRunType, spelling), nil, true
	case TargetJSONSchema:
		ctx.needs.useEmbedType = true
		return fmt.Sprintf("%s<%s>()", ctx.names.EmbedType, spelling), nil, true
	}
	return "", nil, false
}

// referenceWorthy gates name references to the kinds users author as named
// declarations. Atoms, literals and format brands always inline — an aliased
// `string` must not upgrade every structurally-equal string in the set to a
// name reference.
func referenceWorthy(node *reflection.RunType) bool {
	switch node.Kind {
	case reflection.KindObjectLiteral, reflection.KindTuple, reflection.KindUnion,
		reflection.KindArray, reflection.KindFunction, reflection.KindTemplateLiteral,
		reflection.KindEnum, reflection.KindClass, reflection.KindPromise:
		return true
	}
	return false
}

// reaches reports whether targetID is reachable from fromID in the resolved
// graph — the cycle test behind reference-vs-inline decisions.
func (ctx *printContext) reaches(fromID, targetID string) bool {
	if fromID == targetID {
		return true
	}
	visited := map[string]bool{}
	queue := []string{fromID}
	found := false
	var scan func(entry *reflection.RunType)
	scan = func(entry *reflection.RunType) {
		if entry == nil || found {
			return
		}
		if entry.ID == targetID {
			found = true
			return
		}
		if entry.Kind == reflection.KindRef {
			if !visited[entry.ID] {
				queue = append(queue, entry.ID)
			}
			return
		}
		// An inline (non-interned) node: walk its slots directly.
		entry.EachRefSlot(scan)
	}
	for len(queue) > 0 && !found {
		id := queue[0]
		queue = queue[1:]
		if visited[id] {
			continue
		}
		visited[id] = true
		if id == targetID {
			return true
		}
		node := ctx.resolve(id)
		if node == nil {
			continue
		}
		node.EachRefSlot(scan)
	}
	return found
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
func printDecl(resolved *resolvedDecl, opts Options, names *nameTable, fileCtx *fileContext) (*printedDecl, *Diagnostic) {
	decl := resolved.Decl
	ctx := &printContext{names: names, opts: opts, decl: decl, resolve: resolved.Resolve,
		set: fileCtx.set, bindings: fileCtx.bindings, inScope: fileCtx.inScope,
		currentFile: fileCtx.path, rootID: resolved.Node.ID}
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
		// The printed TYPE declaration follows the ALIAS's export modifier
		// (an unexported const may pair with an exported alias other files
		// import); an alias-less const keeps the const's own.
		typeExportPrefix := exportPrefix
		if decl.Form != TargetType && decl.AliasStmt != nil {
			typeExportPrefix = ""
			if decl.AliasExported {
				typeExportPrefix = "export "
			}
		}
		ctx.selfName = typeName
		typeExpr, diag := ctx.typeExpr(resolved.Node)
		if diag != nil {
			return nil, diag
		}
		return &printedDecl{text: fmt.Sprintf("%stype %s = %s;", typeExportPrefix, typeName, typeExpr), needs: ctx.needs}, nil

	case TargetBuilders:
		builderExpr, diag := ctx.builderExpr(resolved.Node)
		if diag != nil {
			return nil, diag
		}
		if ctx.usedSelf {
			ctx.needs.useRT = true
			builderExpr = fmt.Sprintf("%s.circular(%s)", ctx.names.RT, builderExpr)
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
// mirror lands (docs/done/format-conversion-completion.md).
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
	// temporal marks the FormatTemporalX families: they live on the
	// dedicated `@ts-runtypes/core/formats/temporal` subpath (`TFT`), and
	// the schema target embeds the brand (the door keeps Temporal out of
	// jsFormat by design).
	temporal bool
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
	// The orderable Temporal families (registry: internal/reflection/
	// temporal.go); PlainMonthDay / Duration carry no brand (no-params only).
	"temporalInstant":        {builderFn: "instant", typeAlias: "Instant", temporal: true},
	"temporalZonedDateTime":  {builderFn: "zonedDateTime", typeAlias: "ZonedDateTime", temporal: true},
	"temporalPlainDate":      {builderFn: "plainDate", typeAlias: "PlainDate", temporal: true},
	"temporalPlainTime":      {builderFn: "plainTime", typeAlias: "PlainTime", temporal: true},
	"temporalPlainDateTime":  {builderFn: "plainDateTime", typeAlias: "PlainDateTime", temporal: true},
	"temporalPlainYearMonth": {builderFn: "plainYearMonth", typeAlias: "PlainYearMonth", temporal: true},
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

// temporalBrandText renders the TFT brand spelling for a temporal family
// annotation (`TFT.PlainDate<{min: '2020-01-01'}>`); paramless spellings are
// the bare alias.
func (ctx *printContext) temporalBrandText(annotation *reflection.FormatAnnotation, family formatFamily) (string, bool) {
	ctx.needs.useTFT = true
	if len(annotation.Params) == 0 {
		return ctx.names.TFT + "." + family.typeAlias, true
	}
	paramsText, ok := printFormatParams(annotation.Params, false)
	if !ok {
		return "", false
	}
	return fmt.Sprintf("%s.%s<%s>", ctx.names.TFT, family.typeAlias, paramsText), true
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

// escapeTypeText renders a node's TYPE spelling for an embed/getRunType
// escape inside a const initializer. Runs on a FRESH walk context (the
// enclosing printer has already entered the node) that keeps the root id but
// no self name: embedding the root's own structure is fine, while a nested
// back-edge to it would spell the declaration's alias inside its own
// initializer — the empty selfName turns that into a refusal.
func (ctx *printContext) escapeTypeText(node *reflection.RunType) (string, *Diagnostic) {
	sub := &printContext{names: ctx.names, opts: ctx.opts, decl: ctx.decl, resolve: ctx.resolve,
		set: ctx.set, bindings: ctx.bindings, inScope: ctx.inScope, currentFile: ctx.currentFile, rootID: ctx.rootID}
	text, diag := sub.typeExpr(node)
	ctx.needs.merge(sub.needs)
	return text, diag
}

// structuralParamsCarryStandard reports whether the structural brand's params
// survive the standard-keyword spelling: a value equal to its 2020-12 default
// (minItems 0, minProperties 0, uniqueItems false) reads back as ABSENT, so
// the brand would silently drop — those embed instead.
func structuralParamsCarryStandard(params map[string]any) bool {
	for key, value := range params {
		switch key {
		case "minItems", "minProperties":
			if number, ok := value.(float64); ok && number == 0 {
				return false
			}
			if number, ok := value.(int); ok && number == 0 {
				return false
			}
		case "uniqueItems":
			if flag, ok := value.(bool); ok && !flag {
				return false
			}
		}
	}
	return true
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
		Message: fmt.Sprintf("format family %q is not convertible yet (see docs/done/format-conversion-completion.md)", name)}
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
		if family.temporal {
			brandText, ok := ctx.temporalBrandText(annotation, family)
			if !ok {
				return "", unsupportedFormatDiag(annotation.Name, ctx.decl)
			}
			return brandText, nil
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
		childText = wrapForSuffix(childNode, childText)
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
				if member.signatureNode != nil {
					// Method / call-signature members keep their signature
					// syntax — a property-typed arrow would be a different
					// member kind (and id).
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
						// Method syntax cannot spell `readonly` — the
						// property-arrow form reflects back identically.
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

func spanKind(raw any) (reflection.ReflectionKind, bool) {
	switch value := raw.(type) {
	case int:
		return reflection.ReflectionKind(value), true
	case float64:
		return reflection.ReflectionKind(value), true
	}
	return 0, false
}

// escapeTemplateText escapes a literal segment for a backtick template. A
// raw CR must be escaped: the TS scanner normalizes CR/CRLF to LF in cooked
// template text, so printing it raw would silently change the literal.
func escapeTemplateText(text string) string {
	replacer := strings.NewReplacer("\\", "\\\\", "`", "\\`", "${", "\\${", "\r", "\\r")
	return replacer.Replace(text)
}

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
		if family.temporal {
			ctx.needs.useTFT = true
			if len(params) == 0 {
				return ctx.names.TFT + "." + family.builderFn + "()", nil
			}
			paramsText, ok := printFormatParams(params, false)
			if !ok {
				return "", unsupportedFormatDiag(annotation.Name, ctx.decl)
			}
			return fmt.Sprintf("%s.%s(%s)", ctx.names.TFT, family.builderFn, paramsText), nil
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
		if hasSignatureMembers(members) {
			// Callable/method-bearing shapes have no builder spelling that
			// carries the member kinds — escape the whole object.
			return ctx.builderEscape(node)
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
			// (docs/done/format-conversion-completion.md).
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
	case reflection.KindFunction, reflection.KindTemplateLiteral, reflection.KindObject:
		// No value-first spelling carries these exactly (RT.func defaults its
		// parameter labels, RT.templateLiteral its part grouping) — the
		// type-argument escape does.
		return ctx.builderEscape(node)
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
	if refText, refDiag, isRef := ctx.declRef(node, TargetJSONSchema); isRef {
		return refText, refDiag
	}
	leave, entered := ctx.enter(node)
	if !entered {
		return "", ctx.anonymousCycleDiag()
	}
	defer leave()
	if len(node.TypeMeta) > 0 {
		return ctx.schemaEmbedNode(node)
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
		// The standard `not` keyword runs the door's kind-complement algebra,
		// which does not read the dialect — the first-class Not<F> type
		// embeds instead, exact by construction.
		if ctx.opts.Portable {
			return dialect("")
		}
		negatedText, negDiag := ctx.escapeTypeText(node.Negations[0])
		if negDiag != nil {
			return "", negDiag
		}
		ctx.needs.useEmbedType = true
		ctx.needs.useTF = true
		return fmt.Sprintf("%s<%s.Not<%s>>()", ctx.names.EmbedType, ctx.names.TF, negatedText), nil
	}
	// Format annotations ride jsFormat verbatim for now — the standard-keyword
	// rows (minLength / minimum / format:'email' / …) land with the preset
	// mirror (docs/done/format-conversion-completion.md), which is also what
	// will widen --portable coverage to standard-expressible brands.
	if annotation := node.FormatAnnotation; annotation != nil && !isStructuralAnnotation(annotation) {
		family, _, known := leafFormat(annotation)
		if !known {
			return "", unsupportedFormatDiag(annotation.Name, ctx.decl)
		}
		if family.temporal {
			// Temporal brands embed: the door deliberately keeps the
			// Temporal families out of jsFormat so the json-schema surface
			// never drags the Temporal lib in.
			if ctx.opts.Portable {
				return dialect("")
			}
			brandText, ok := ctx.temporalBrandText(annotation, family)
			if !ok {
				return "", unsupportedFormatDiag(annotation.Name, ctx.decl)
			}
			ctx.needs.useEmbedType = true
			return fmt.Sprintf("%s<%s>()", ctx.names.EmbedType, brandText), nil
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
		if !structuralParamsCarryStandard(structuralAnnotationParams(node)) {
			return ctx.schemaEmbedNode(node)
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
		if isRegExpNode(node) {
			return dialect("{jsType: 'RegExp'}")
		}
		// Temporal builtins fall through to the embed escape with the rest of
		// the class kinds: the door deliberately keeps Temporal out of the
		// jsType/jsFormat dialect so the json-schema surface never drags the
		// Temporal lib in.
		return ctx.schemaEmbedNode(node)
	case reflection.KindRegexp:
		return dialect("{jsType: 'RegExp'}")
	case reflection.KindEnum:
		return ctx.schemaEmbedNode(node)
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
		if !structuralParamsCarryStandard(structuralAnnotationParams(node)) {
			return ctx.schemaEmbedNode(node)
		}
		members, indexValue, diag := ctx.objectMembers(node)
		if diag != nil {
			return "", diag
		}
		if hasSignatureMembers(members) {
			return ctx.schemaEmbedNode(node)
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
		for _, member := range members {
			if member.readonly {
				// Standard readOnly is annotation-only by design (the door
				// dropped the modifier lift on purpose), and a dialect
				// keyword would tax every object translation — the embed
				// escape carries the modifier exactly instead.
				return ctx.schemaEmbedNode(node)
			}
		}
		var propertyParts []string
		var requiredParts []string
		for _, member := range members {
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
				Message: "labeled tuples are not convertible to json-schema yet (label-capable builders pending)"}
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
	case reflection.KindFunction, reflection.KindTemplateLiteral, reflection.KindObject:
		return ctx.schemaEmbedNode(node)
	}
	return "", unsupportedDiag(node, ctx.decl)
}

// liveSymbolName resolves the source-level name a node's live symbol (enum /
// user class) is spelled with, checking it is actually bound in this file —
// the reflected name is the DECLARATION name, which an aliased import
// (`import {Color as C}`) would not bind.
func (ctx *printContext) liveSymbolName(node *reflection.RunType, kindWord string) (string, *Diagnostic) {
	name := node.TypeName
	if name == "" && node.ClassRef != nil {
		name = node.ClassRef.Name
	}
	if name == "" {
		return "", unsupportedDiag(node, ctx.decl)
	}
	if ctx.inScope != nil && !ctx.inScope[name] {
		return "", &Diagnostic{Code: CodeUnsupportedKind, Severity: SeverityError, Decl: declLabel(ctx.decl),
			Message: fmt.Sprintf("%s %q is not in scope here (aliased imports of live symbols are not convertible — import it under its own name)", kindWord, name)}
	}
	return name, nil
}

// enumMemberFlag reports the `enumMember:` marker a single-member enum
// reference carries — the container name is not reflected, so member
// references refuse loudly for now.
func enumMemberFlag(node *reflection.RunType) bool {
	for _, flag := range node.Flags {
		if strings.HasPrefix(flag, "enumMember:") {
			return true
		}
	}
	return false
}

// enumSpelling resolves an enum node to its in-scope declaration name.
func (ctx *printContext) enumSpelling(node *reflection.RunType) (string, *Diagnostic) {
	if enumMemberFlag(node) {
		return "", &Diagnostic{Code: CodeUnsupportedKind, Severity: SeverityError, Decl: declLabel(ctx.decl),
			Message: "a single enum-member reference is not convertible yet (the reflected node does not carry the container name)"}
	}
	return ctx.liveSymbolName(node, "enum")
}

// classSpelling resolves a class node to its TYPE spelling (`User`,
// `Box<string>`, `Error`). Builtin names are global and skip the scope check;
// user classes must be bound under their declaration name.
func (ctx *printContext) classSpelling(node *reflection.RunType) (string, *Diagnostic) {
	var name string
	if node.ClassRef != nil && node.ClassRef.Builtin != "" {
		name = node.ClassRef.Builtin
	} else {
		liveName, diag := ctx.liveSymbolName(node, "class")
		if diag != nil {
			return "", diag
		}
		name = liveName
	}
	if len(node.Arguments) == 0 {
		return name, nil
	}
	var argumentTexts []string
	for _, argumentRef := range node.Arguments {
		argument := ctx.deref(argumentRef)
		argumentText, argumentDiag := ctx.typeExpr(argument)
		if argumentDiag != nil {
			return "", argumentDiag
		}
		argumentTexts = append(argumentTexts, argumentText)
	}
	return fmt.Sprintf("%s<%s>", name, strings.Join(argumentTexts, ", ")), nil
}

func isRegExpNode(node *reflection.RunType) bool {
	if node.Kind == reflection.KindRegexp {
		return true
	}
	return node.Kind == reflection.KindClass && node.ClassRef != nil && node.ClassRef.Builtin == "RegExp"
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
		Message: "mixed named properties + index signature is not convertible yet (see docs/done/format-conversion-completion.md)"}
}

// objectMember is one printable member: its source key spelling (quoted when
// not a safe identifier), flags, the dereferenced value node — or, for
// method / call-signature members, the signature-bearing node itself.
type objectMember struct {
	name          string
	key           string
	optional      bool
	readonly      bool
	child         *reflection.RunType
	signatureNode *reflection.RunType
	callSignature bool
}

// objectMembers collects an object shape's members: properties, method and
// call signatures (type-target printable; builders/schema escape the whole
// object), plus at most one STRING-keyed index signature (number/symbol keys
// await jsIndexKeys).
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
		if strings.HasPrefix(member.Name, "@@") {
			return nil, nil, &Diagnostic{Code: CodeUnsupportedKind, Severity: SeverityError, Decl: declLabel(ctx.decl),
				Message: fmt.Sprintf("symbol-keyed member %q is not convertible yet", member.Name)}
		}
		if member.NonEnumerable {
			// The @nonEnumerable JSDoc marker folds into the id but has no
			// spelling in any printed form — dropping it silently would move
			// the id, so the declaration refuses instead.
			return nil, nil, &Diagnostic{Code: CodeUnsupportedKind, Severity: SeverityError, Decl: declLabel(ctx.decl),
				Message: fmt.Sprintf("member %q is marked @nonEnumerable, which has no conversion spelling yet", member.Name)}
		}
		key := member.Name
		if !member.IsSafeName {
			key = quoteSingle(member.Name)
		}
		switch member.Kind {
		case reflection.KindCallSignature:
			members = append(members, &objectMember{signatureNode: member, callSignature: true})
			continue
		case reflection.KindMethodSignature, reflection.KindMethod:
			members = append(members, &objectMember{
				name:          member.Name,
				key:           key,
				optional:      member.Optional,
				readonly:      member.Readonly,
				signatureNode: member,
			})
			continue
		case reflection.KindPropertySignature, reflection.KindProperty:
		default:
			return nil, nil, &Diagnostic{Code: CodeUnsupportedKind, Severity: SeverityError, Decl: declLabel(ctx.decl),
				Message: fmt.Sprintf("object member %q (%s) is not convertible yet (see docs/done/format-conversion-completion.md)", member.Name, kindLabel(member.Kind))}
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

// hasSignatureMembers reports whether any member is a method/call signature.
func hasSignatureMembers(members []*objectMember) bool {
	for _, member := range members {
		if member.signatureNode != nil {
			return true
		}
	}
	return false
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
		return formatNumberLiteral(value)
	case float32:
		return formatNumberLiteral(float64(value))
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

// formatNumberLiteral renders a numeric literal value as TS source. The
// Infinity literal type has no keyword spelling — any overflowing literal
// (1e999) IS it, so that spelling round-trips exactly. NaN has no literal
// spelling at all and refuses.
func formatNumberLiteral(value float64) (string, bool) {
	switch {
	case math.IsNaN(value):
		return "", false
	case math.IsInf(value, 1):
		return "1e999", true
	case math.IsInf(value, -1):
		return "-1e999", true
	}
	return strconv.FormatFloat(value, 'g', -1, 64), true
}

// hasFlag reports whether the node carries the given free-form flag marker.
func hasFlag(node *reflection.RunType, flag string) bool {
	for _, candidate := range node.Flags {
		if candidate == flag {
			return true
		}
	}
	return false
}

// isBigIntLiteral reports the bigint literal encoding: a string payload
// tagged with the "bigint" flag.
func isBigIntLiteral(node *reflection.RunType) bool {
	return hasFlag(node, "bigint")
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
		Message: fmt.Sprintf("%s is not convertible yet (see docs/done/format-conversion-completion.md)", kindLabel(node.Kind))}
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
