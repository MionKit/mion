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
	// A name this file cannot SPELL is not a conversion failure — it is just a
	// name. Inlining the structure says the same thing (structurally identical,
	// so the id cannot move), which is what the --portable branch above already
	// does. Two ways the name is unspellable: the declaring file does not export
	// it, and this file has no import that reaches it — the latter is the common
	// case for a type the reflection graph reached STRUCTURALLY rather than
	// through anything this file wrote. Both used to refuse (CNV004), which
	// stopped 430 of the suite's own files from converting for no better reason
	// than a lost name.
	if entry.File != ctx.currentFile && !entry.Exported {
		return "", nil, false
	}
	spelling := entry.TypeName
	if ctx.bindings != nil {
		resolved, keepLocal, needsImport, ok := ctx.bindings.spellForTarget(entry, ctx.currentFile)
		if !ok {
			return "", nil, false
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
			// RT.circular ties the knot through Recursive<Body>, whose Self
			// substitution walks every container with a homomorphic map —
			// MERGING container-level sentinel intersections (structural format
			// brands, contains/pattern/propertyNames/unevaluated checks, tuple
			// label carriers), so the value-first spelling resolves a DIFFERENT
			// id than the type-first declaration (found by the FE roundtrip
			// fuzz lane; the underlying Recursive limitation is filed in
			// docs/todos/). Primitive and Date brands survive the substitution
			// untouched, so only container payloads refuse.
			if payload := ctx.circularLossyPayload(resolved.Node); payload != "" {
				return nil, &Diagnostic{Code: CodeUnsupportedKind, Severity: SeverityError, Decl: declLabel(decl),
					Message: fmt.Sprintf("%s inside a recursive type is not convertible to builders (RT.circular cannot carry it through the self-substitution)", payload)}
			}
			if diag := ctx.eagerTupleCycleDiag(resolved.Node, decl, "RT.circular"); diag != nil {
				return nil, diag
			}
			ctx.needs.useRT = true
			builderExpr = fmt.Sprintf("%s.circular(%s)", ctx.names.RT, builderExpr)
		}
		return assembleConstDecl(decl, names, exportPrefix, builderExpr, ctx.needs)

	case TargetJSONSchema:
		schemaExpr, diag := ctx.schemaExpr(resolved.Node)
		if diag != nil {
			return nil, diag
		}
		// `{$ref: '#'}` recovers its type the same way RT.circular does, so the
		// eager tuple slot defeats it identically.
		if refDiag := ctx.eagerTupleCycleDiag(resolved.Node, decl, "a {$ref: '#'} back-reference"); refDiag != nil {
			return nil, refDiag
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

// genericParamKeys lists each generic family's PUBLIC params surface
// (StringParamsValueFirst / NumberParams / BigIntParams). A reflected
// annotation carrying any OTHER key — a preset-internal engine flag like the
// regex family's `isRegex` — cannot be spelled through the generic builder or
// alias: `TF.string({isRegex: …})` is an ExactParams type error that resolves
// a DIFFERENT brand (the roundtrip fuzz lane caught the id moving). Those
// annotations take the exact TypeFormat-constructor escape instead, which
// carries the params verbatim. Pinned by the chain + fuzz id oracles: a key
// added to a params interface without a row here only ever DEMOTES that
// annotation to the (always-correct) exact spelling.
var genericParamKeys = map[string]map[string]bool{
	"stringFormat": setOf("maxLength", "minLength", "length", "pattern", "allowedChars", "disallowedChars",
		"allowedValues", "disallowedValues", "mockSamples", "contentEncoding", "contentMediaType",
		"trim", "lowercase", "uppercase", "capitalize", "replace", "replaceAll"),
	"numberFormat": setOf("integer", "float", "min", "max", "lt", "gt", "multipleOf",
		"minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "isCurrency"),
	"bigintFormat": setOf("min", "max", "lt", "gt", "multipleOf",
		"minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum"),
}

func setOf(keys ...string) map[string]bool {
	out := make(map[string]bool, len(keys))
	for _, key := range keys {
		out[key] = true
	}
	return out
}

// leafFormat resolves a node's annotation to a printable leaf family; false
// when the annotation is structural (formattedArray/formattedObject, handled
// at the kind branches) or unknown. uuid resolves through its version param;
// uuidParamsless strips the version key from the printed params (the preset
// alias already carries it). A generic family whose params include a key
// outside its public surface resolves as `exact` (see genericParamKeys).
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
	if spellable := genericParamKeys[annotation.Name]; spellable != nil {
		for key := range annotation.Params {
			if !spellable[key] {
				return formatFamily{exact: true, base: family.base, bigintParams: family.bigintParams}, annotation.Params, true
			}
		}
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
		Message: fmt.Sprintf("format family %q is not convertible yet (see https://runtypes.pages.dev/guide/converting-forms)", name)}
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
// The parallel label slices carry each slot's projected label; `labeled` is
// true only when EVERY slot is labeled (the TS grammar — all or none), so a
// partially-labeled shape (hand-rolled sentinel abuse) stays unprintable.
type tupleShape struct {
	required       []*reflection.RunType
	optional       []*reflection.RunType
	rest           *reflection.RunType
	requiredLabels []string
	optionalLabels []string
	restLabel      string
	labeled        bool
}

// tupleMembers partitions a tuple node's members. False when the member
// layout is one the printers cannot express (interleaved optionals).
func (ctx *printContext) tupleMembers(node *reflection.RunType) (*tupleShape, bool) {
	shape := &tupleShape{}
	memberCount, labelCount := 0, 0
	for _, memberRef := range node.Children {
		member := ctx.deref(memberRef)
		if member == nil {
			return nil, false
		}
		inner := ctx.deref(member.Child)
		if inner == nil {
			return nil, false
		}
		memberCount++
		if member.Name != "" {
			labelCount++
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
			shape.restLabel = member.Name
		case member.Optional:
			if shape.rest != nil {
				return nil, false
			}
			shape.optional = append(shape.optional, inner)
			shape.optionalLabels = append(shape.optionalLabels, member.Name)
		default:
			if len(shape.optional) > 0 || shape.rest != nil {
				return nil, false
			}
			shape.required = append(shape.required, inner)
			shape.requiredLabels = append(shape.requiredLabels, member.Name)
		}
	}
	shape.labeled = memberCount > 0 && labelCount == memberCount
	if labelCount > 0 && labelCount != memberCount {
		// Partially labeled — no printable spelling on any target.
		return nil, false
	}
	return shape, true
}

// sortArms sorts a union's RENDERED arm texts into the canonical
// path-independent order (plain text sort, stable). The checker's internal
// union member order is a function of the source FORM — type-id creation
// order differs between the type, builders and schema programs of one
// declaration — so printing the Children order verbatim made the printed
// union depend on the conversion path (the roundtrip fixpoint oracle caught
// `t0 | t1` flipping to `t1 | t0` across chains). The rendered text is a pure
// function of the node, so its sort order is the same in every program — and,
// unlike an id sort, reads naturally (`'draft' | 'live'`).
func sortArms(arms []string) []string {
	sort.Strings(arms)
	return arms
}

// circularLossyPayload walks a circular declaration's reachable graph for the
// two payloads the RT.circular spelling still cannot carry across
// `Recursive<Body>`'s Self substitution. Every other container-level sentinel
// (structural format brands, contains / patternProperties / propertyNames /
// unevaluated / negation slots, fixed-arity tuple labels) now survives it: the
// substitution returns a non-recursing node verbatim and rebuilds a recursing
// one piece by piece (packages/ts-runtypes/src/builders/static.ts). What
// remains are the shapes whose BASE TypeScript cannot separate from the
// sentinel intersection, so the payload cannot be re-attached after
// substituting inside it:
//
//   - a `oneOf` whose branch list reaches the cycle while at least one branch
//     is a primitive / Date / RegExp: the branch tuple rides EVERY arm, and a
//     primitive arm passes through the substitution untouched, so that copy
//     keeps an unsubstituted Self;
//   - a labeled tuple with an OPTIONAL or REST slot that the cycle runs
//     through: without a single literal arity there is no slot-by-slot rebuild,
//     and the homomorphic map folds the label carrier into the tuple.
//
// Returns a description of the first offending payload, or "" when the body is
// convertible.
func (ctx *printContext) circularLossyPayload(root *reflection.RunType) string {
	visited := map[string]bool{}
	var walk func(node *reflection.RunType) string
	walk = func(node *reflection.RunType) string {
		node = ctx.deref(node)
		if node == nil || visited[node.ID] {
			return ""
		}
		visited[node.ID] = true
		if len(node.OneOf) > 0 && ctx.reachesCycle(node) {
			for _, branchRef := range node.OneOf {
				branch := ctx.deref(branchRef)
				if branch == nil {
					continue
				}
				switch branch.Kind {
				case reflection.KindString, reflection.KindNumber, reflection.KindBoolean,
					reflection.KindBigInt, reflection.KindLiteral, reflection.KindSymbol:
					return "an exclusive union (oneOf) with a primitive branch"
				case reflection.KindClass:
					// Date and RegExp are the two class shapes the substitution
					// returns verbatim, so their branch copy keeps a raw Self.
					if branch.SubKind == reflection.SubKindDate || isRegExpNode(branch) {
						return "an exclusive union (oneOf) with a Date or RegExp branch"
					}
				}
			}
		}
		found := ""
		node.EachRefSlot(func(child *reflection.RunType) {
			if found == "" {
				found = walk(child)
			}
		})
		return found
	}
	return walk(root)
}

// unionArms visits a node's arms when it is a union, and nothing otherwise.
// Both eager walks below share it: a conditional / alias resolution distributes
// over a union immediately, so an arm never hides a self-reference.
func (ctx *printContext) unionArms(node *reflection.RunType, visit func(arm *reflection.RunType)) {
	if node.Kind != reflection.KindUnion {
		return
	}
	for _, armRef := range node.Children {
		if arm := ctx.deref(armRef); arm != nil {
			visit(arm)
		}
	}
}

// eagerTupleCycleDiag refuses a declaration whose cycle closes on a tuple slot,
// naming the back-reference the target would have used. Nil when the shape is
// convertible.
func (ctx *printContext) eagerTupleCycleDiag(root *reflection.RunType, decl *declaration, backReference string) *Diagnostic {
	if !ctx.selfLandsInEagerTupleSlot(root) {
		return nil
	}
	return &Diagnostic{Code: CodeUnsupportedKind, Severity: SeverityError, Decl: declLabel(decl),
		Message: fmt.Sprintf("a cycle that closes on a tuple slot is not convertible "+
			"(TypeScript instantiates a tuple's slots eagerly, so %s cannot tie the knot there) — "+
			"put the recursion behind an object, array, Map, Set or function slot", backReference)}
}

// selfLandsInEagerTupleSlot reports whether the declaration's own back-edge sits
// in a TUPLE SLOT that `Recursive<Body>` instantiates EAGERLY.
//
// A tuple is the one container the value-first form cannot tie a knot through.
// Every other slot defers — an object member, an array element, a Map / Set /
// Promise argument, a function parameter or return — so `RT.circular` walks
// past it and the knot closes. A homomorphic map over a TUPLE instead computes
// every slot type up front, so `Recursive<Body>` unrolls itself until
// TypeScript gives up (TS2589). Nested tuples chain that eagerness; a union arm
// inherits it (the substitution distributes).
//
// Converting such a declaration anyway emitted a builder whose inferred type
// kept a raw `Self`: the declaration silently changed identity and would not
// convert back. The type and JSON Schema forms carry it fine, since
// `type Pair = [number, Pair]` is an ordinary deferred alias.
func (ctx *printContext) selfLandsInEagerTupleSlot(root *reflection.RunType) bool {
	seen := map[string]bool{}
	var walk func(node *reflection.RunType, crossedTuple bool) bool
	walk = func(node *reflection.RunType, crossedTuple bool) bool {
		node = ctx.deref(node)
		if node == nil {
			return false
		}
		if node.ID == ctx.rootID && crossedTuple {
			return true
		}
		// A node first reached WITHOUT a tuple slot must stay walkable once one
		// has been crossed, so the visited key carries the flag.
		key := node.ID
		if crossedTuple {
			key += "!"
		}
		if seen[key] {
			return false
		}
		seen[key] = true
		found := false
		ctx.unionArms(node, func(arm *reflection.RunType) {
			if !found {
				found = walk(arm, crossedTuple)
			}
		})
		if found || node.Kind != reflection.KindTuple {
			return found
		}
		shape, ok := ctx.tupleMembers(node)
		if !ok {
			return false
		}
		slots := append(append([]*reflection.RunType{}, shape.required...), shape.optional...)
		if shape.rest != nil {
			slots = append(slots, shape.rest)
		}
		for _, slot := range slots {
			if walk(slot, true) {
				return true
			}
		}
		return false
	}
	return walk(root, false)
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

// isSymbolKeyedName reports whether a member name is a SYMBOL key rather than
// a string one. Two spellings reach here: tsgo's late-bound form
// `\xFE@<declarationName>@<symbolId>` (the same prefix
// cachegen/runtype/serialize.go's stableMemberName strips), and the `@@name`
// form. Only the second used to be checked, so a genuinely symbol-keyed member
// printed as a STRING property whose key was the mangled internal spelling —
// a different type, silently, with a moved id and an exit code of 0.
func isSymbolKeyedName(name string) bool {
	if strings.HasPrefix(name, "@@") {
		return true
	}
	return len(name) >= 2 && name[0] == 0xFE && name[1] == '@'
}

// reachesCycle reports whether this node's subtree takes part in the
// declaration's cycle. A carrier sitting entirely OFF the cycle holds no Self
// after substitution, so it converts unharmed and must not be refused.
func (ctx *printContext) reachesCycle(node *reflection.RunType) bool {
	seen := map[string]bool{}
	var reaches func(current *reflection.RunType) bool
	reaches = func(current *reflection.RunType) bool {
		current = ctx.deref(current)
		if current == nil || seen[current.ID] {
			return false
		}
		seen[current.ID] = true
		if current.IsCircular {
			return true
		}
		found := false
		current.EachRefSlot(func(child *reflection.RunType) {
			if !found {
				found = reaches(child)
			}
		})
		return found
	}
	return reaches(node)
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
			return fmt.Sprintf("%s.OneOf<[%s]>", ctx.names.RT, strings.Join(sortArms(branches), ", ")), nil
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
			return rt(fmt.Sprintf("oneOf([%s])", strings.Join(sortArms(branches), ", ")))
		}
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
		// Labeled tuples print the slot form (`RT.tuple([RT.slot('x', …)])`),
		// unlabeled ones the plain array form — the labels are id data, so
		// the two spellings must never mix.
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
		requiredText, diag := renderList(shape.required, shape.requiredLabels)
		if diag != nil {
			return "", diag
		}
		call := fmt.Sprintf("tuple(%s", requiredText)
		if len(shape.optional) > 0 || shape.rest != nil {
			optionalText, optDiag := renderList(shape.optional, shape.optionalLabels)
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
			if shape.labeled {
				restText = fmt.Sprintf("%s.slot(%s, %s)", ctx.names.RT, quoteSingle(shape.restLabel), restText)
			}
			call += ", " + restText
		}
		return rt(call + ")")
	case reflection.KindFunction:
		// All-required named parameters print the slot form
		// (`RT.func([RT.slot('event', …)], ret)`), which converges with the
		// written signature (parameter names fold into the id). Optional /
		// rest / defaulted parameters have no id-exact value-first spelling —
		// the type-argument escape carries those.
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

// funcSlotForm renders a function node as `RT.func([RT.slot(…)…], ret)` when
// every parameter is named, required, non-rest and default-free — the shape
// whose value-first id equals the written signature's. printable=false hands
// anything else back to the escape.
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
		// Zero params: the no-params overload spells `() => R` exactly.
		if returnNode != nil && returnNode.Kind == reflection.KindVoid {
			return ctx.names.RT + ".func()", true, nil
		}
		returnText, returnDiag := ctx.builderExpr(node.Return)
		if returnDiag != nil {
			return "", false, returnDiag
		}
		return fmt.Sprintf("%s.func([], %s)", ctx.names.RT, returnText), true, nil
	}
	returnText, returnDiag := ctx.builderExpr(node.Return)
	if returnDiag != nil {
		return "", false, returnDiag
	}
	return fmt.Sprintf("%s.func([%s], %s)", ctx.names.RT, strings.Join(slotParts, ", "), returnText), true, nil
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
		return ctx.schemaMetaText(node)
	}
	return ctx.schemaExprCore(node)
}

// schemaMetaText renders a `base & {…}` metadata intersection as the `jsMeta`
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
			Message: "a metadata intersection has no standard 2020-12 spelling; drop --portable to use the jsMeta dialect keyword"}
	}
	return fmt.Sprintf("{jsMeta: {base: %s, meta: [%s]}}", baseText, strings.Join(metaTexts, ", ")), nil
}

// schemaExprCore is schemaExpr past the deref / declRef / cycle-guard preamble
// and past the metadata split, so schemaMetaText can ask for a node's base
// spelling without re-running any of it.
func (ctx *printContext) schemaExprCore(node *reflection.RunType) (string, *Diagnostic) {
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
		// The negated FORMAT rides jsNot, not the standard `not` keyword: that
		// one runs the door's kind-complement algebra, so `{type: 'number',
		// not: {…}}` peels into the six-arm name-set union and collapses to
		// `never` rather than reaching the first-class `Not<F>`. Two different
		// operations that happen to share a word.
		negatedText, negDiag := ctx.schemaExpr(node.Negations[0])
		if negDiag != nil {
			return "", negDiag
		}
		return dialect(fmt.Sprintf("{jsNot: %s}", negatedText))
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
		// jsFormat carries the annotation's OWN name + full params verbatim
		// (uuid included — the door rebuilds the brand from the pair), so the
		// schema spelling never depends on the preset tables.
		paramsText, ok := printFormatParams(annotation.Params, family.bigintParams)
		if !ok {
			return "", unsupportedFormatDiag(annotation.Name, ctx.decl)
		}
		// JSON has no bigint, so the bigint family's bounds ride as DIGIT
		// STRINGS and the door lifts the literal types back out of them.
		if family.bigintParams {
			digitsText, ok := printBigintParamsAsDigits(annotation.Params)
			if !ok {
				return "", unsupportedFormatDiag(annotation.Name, ctx.decl)
			}
			return dialect(fmt.Sprintf("{jsFormat: {name: %s, params: %s}}", quoteSingle(annotation.Name), digitsText))
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
			// A bigint literal rides its DIGITS: `const` cannot hold it (JSON
			// has no bigint, and a digit string there would read as a string
			// literal), so it gets its own keyword and the door lifts the
			// literal type back with `infer … extends bigint`.
			digits, ok := node.Literal.(string)
			if !ok {
				return "", unsupportedDiag(node, ctx.decl)
			}
			return dialect(fmt.Sprintf("{jsBigint: %s}", quoteSingle(strings.TrimSuffix(digits, "n"))))
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
		// The eight Temporal builtins spell as data, under the JS global's own
		// qualified name. The door resolves the row through the formats
		// surface's guarded base map, so naming Temporal here never forces the
		// Temporal lib on a json-schema consumer.
		if info, isTemporal := reflection.TemporalInfoBySubKind(node.SubKind); isTemporal {
			return dialect(fmt.Sprintf("{jsType: %s}", quoteSingle(info.Builtin)))
		}
		// A user class or any other class kind keeps the escape: its identity
		// is nominal, so only the live symbol can carry it.
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
		if !structuralParamsCarryStandard(structuralAnnotationParams(node)) {
			return ctx.schemaEmbedNode(node)
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
		// else — so those ride the jsIndexes dialect keyword, each signature as
		// its own key/value schema pair.
		jsIndexesText := ""
		if len(indexes) > 1 || (len(indexes) == 1 && indexes[0].key.Kind != reflection.KindString) {
			indexesText, indexesDiag, ok := ctx.jsIndexesText(indexes)
			if indexesDiag != nil {
				return "", indexesDiag
			}
			if !ok {
				return ctx.schemaEmbedNode(node)
			}
			if ctx.opts.Portable {
				return "", &Diagnostic{Code: CodePortableDialect, Severity: SeverityError, Decl: declLabel(ctx.decl),
					Message: "a non-string index signature has no standard 2020-12 spelling; drop --portable to use the jsIndexes dialect keyword"}
			}
			jsIndexesText = indexesText
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
		if jsIndexesText != "" {
			schemaBag = ", " + jsIndexesText + schemaBag
		}
		additionalText := ""
		if len(indexes) > 0 {
			valueText, valueDiag := ctx.schemaExpr(indexes[0].value)
			if valueDiag != nil {
				return "", valueDiag
			}
			if len(members) == 0 {
				return fmt.Sprintf("{type: 'object', additionalProperties: %s%s}", valueText, schemaBag), nil
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
		// A readonly member rides the jsReadonly dialect keyword, named the way
		// `required` names its own. Standard `readOnly` is NOT the same thing:
		// 2020-12 declares it non-constraining and the door lifts nothing from
		// it, so it would silently drop the modifier and move the id.
		if len(readonlyParts) > 0 && ctx.opts.Portable {
			return "", &Diagnostic{Code: CodePortableDialect, Severity: SeverityError, Decl: declLabel(ctx.decl),
				Message: "a readonly member has no standard 2020-12 spelling; drop --portable to use the jsReadonly dialect keyword"}
		}
		out := "{type: 'object'"
		// An index-only shape has no members to name, and an empty `properties`
		// would just be noise beside the jsIndexes pairs that carry it.
		if len(propertyParts) > 0 {
			out += fmt.Sprintf(", properties: {%s}", strings.Join(propertyParts, ", "))
		}
		if len(requiredParts) > 0 {
			out += fmt.Sprintf(", required: [%s]", strings.Join(requiredParts, ", "))
		}
		if len(readonlyParts) > 0 {
			out += fmt.Sprintf(", jsReadonly: [%s]", strings.Join(readonlyParts, ", "))
		}
		return out + additionalText + schemaBag + "}", nil
	case reflection.KindTuple:
		shape, ok := ctx.tupleMembers(node)
		if !ok {
			return "", unsupportedDiag(node, ctx.decl)
		}
		if shape.labeled && ctx.opts.Portable {
			// jsLabels is RunTypes dialect — labels have no standard keyword.
			return "", &Diagnostic{Code: CodePortableDialect, Severity: SeverityError, Decl: declLabel(ctx.decl),
				Message: "tuple slot labels have no standard 2020-12 spelling; drop --portable to use the jsLabels dialect keyword"}
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
			// Slot labels ride the jsLabels dialect keyword, one literal per
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
			out += fmt.Sprintf(", jsLabels: [%s]", strings.Join(quoted, ", "))
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
		// prefixItems / minItems / items / jsLabels vocabulary a written tuple
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
		return dialect("{jsType: 'object'}")
	}
	return "", unsupportedDiag(node, ctx.decl)
}

// functionSchemaText renders a function node as the `jsFunction` dialect
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
		paramsText += fmt.Sprintf(", jsLabels: [%s]", strings.Join(quoted, ", "))
	}
	paramsText += "}"
	return fmt.Sprintf("{jsFunction: {params: %s, return: %s}}", paramsText, returnText), nil, true
}

// jsIndexesText renders a set of index signatures as the `jsIndexes` dialect
// keyword — one `{key, value}` pair per signature, both sides ordinary schemas,
// which the door turns back into that many index signatures. ok=false hands the
// node to the embed escape when a key has no schema spelling of its own.
func (ctx *printContext) jsIndexesText(indexes []indexSignature) (string, *Diagnostic, bool) {
	pairs := make([]string, 0, len(indexes))
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
	}
	return fmt.Sprintf("jsIndexes: [%s]", strings.Join(pairs, ", ")), nil, true
}

// templateSchemaText renders a template literal node as the `jsTemplate`
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
	return fmt.Sprintf("{jsTemplate: {texts: [%s], placeholders: [%s]}}",
		strings.Join(quotedTexts, ", "), strings.Join(placeholderTexts, ", ")), true
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

// indexSignature is one `[key: K]: V` member.
type indexSignature struct {
	key   *reflection.RunType
	value *reflection.RunType
}

// plainStringIndex reports the shape the value-first `record(...)` and the
// schema's `additionalProperties` can both say directly: exactly one index
// signature, string-keyed, with no named members beside it.
func plainStringIndex(members []*objectMember, indexes []indexSignature) bool {
	return len(indexes) == 1 && len(members) == 0 && indexes[0].key.Kind == reflection.KindString
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

// objectMembers collects an object shape's members: properties, method and
// call signatures (type-target printable; builders/schema escape the whole
// object), plus every index signature. Shapes only the TYPE form can spell
// (a non-string key, several signatures, an index beside named members) are
// returned rather than refused — the other two targets escape them.
func (ctx *printContext) objectMembers(node *reflection.RunType) ([]*objectMember, []indexSignature, *Diagnostic) {
	var members []*objectMember
	var indexes []indexSignature
	for _, memberRef := range node.Children {
		member := ctx.deref(memberRef)
		if member == nil {
			return nil, nil, unsupportedDiag(node, ctx.decl)
		}
		if member.Kind == reflection.KindIndexSignature {
			indexKey := ctx.deref(member.Index)
			indexValue := ctx.deref(member.Child)
			if indexKey == nil || indexValue == nil {
				return nil, nil, unsupportedDiag(node, ctx.decl)
			}
			// Non-string keys, several signatures, and named members beside an
			// index all SPELL fine as a type — only the value-first and schema
			// forms lack a word for them, and those escape (see indexShape).
			indexes = append(indexes, indexSignature{key: indexKey, value: indexValue})
			continue
		}
		if isSymbolKeyedName(member.Name) {
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
				Message: fmt.Sprintf("object member %q (%s) is not convertible yet (see https://runtypes.pages.dev/guide/converting-forms)", member.Name, kindLabel(member.Kind))}
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
	return members, indexes, nil
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
		Message: fmt.Sprintf("%s is not convertible yet (see https://runtypes.pages.dev/guide/converting-forms)", kindLabel(node.Kind))}
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
