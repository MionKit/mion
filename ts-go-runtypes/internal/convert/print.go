// print.go — the printing machinery the three target printers share. Each
// printer is a pure walk from a reflection RunType node (plus the name table,
// the run's declaration set and the ref-resolve closure) to source text; no
// checker access, so they test in isolation. This file holds the walk context
// (printContext: cycle guard, reference resolution, import needs), printDecl,
// and every helper two or more targets consume — the target cores live in
// printtype.go and printbuilder.go. Shapes with no native
// spelling in a target ride the `getRunType<T>()` escape on builders;
// anything with no spelling at all
// reports CNV001 and the declaration stays untouched.
//
// Every reflection.RunType field must be printed, refused, or excused — the
// TestPrintersCoverRunType tripwire (print_coverage_test.go) fails on a field
// the printers neither consume nor account for, the way the unevaluated*
// slots once slipped through.
package convert

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
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
	// escapeCycle records that a refusal fired because embedded type text
	// (a getRunType escape) needed to close a cycle — the one refusal class a
	// type-form declaration recovers from by printing the LAZY PAIR instead
	// (printLazyPair). Call sites and the type target keep refusing.
	escapeCycle bool
	// innerCycle records that the walk met a cycle closing BELOW the root:
	// typically a partner inlined because it cycles back through this
	// declaration that ALSO cycles to itself (`interface A {b: B[]}
	// interface B {b?: B[]; a?: A}` closes on the shared `B[]` node).
	// `RT.self()` binds the root only, so no value spelling closes that
	// inner knot. Like escapeCycle, a type-form declaration recovers by
	// printing the LAZY PAIR (the real name closes it); call sites and
	// const-form input keep refusing.
	innerCycle bool
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
		ctx.innerCycle = true
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
				ctx.escapeCycle = true
				return "", &Diagnostic{Code: CodeUnsupportedKind, Severity: SeverityError, Decl: declLabel(ctx.decl),
					Message: "self-referential type inside an embedded type expression is not convertible"}, true
			}
			return ctx.selfName, nil, true
		case TargetBuilders:
			ctx.usedSelf = true
			ctx.needs.useRT = true
			return ctx.names.RT + ".self()", nil, true
		}
		return "", nil, false
	}
	entry, exists := ctx.set.Table[node.ID]
	if !exists || entry.TypeName == "" || !referenceWorthy(node) {
		return "", nil, false
	}
	if ctx.reaches(node.ID, ctx.rootID) {
		// The referenced declaration cycles back here.
		if target != TargetType {
			// A name reference would make the printed const's type
			// self-referential (TS rejects it), so the partner inlines and the
			// cycle closes at the root instead.
			return "", nil, false
		}
		if ctx.selfName == "" && ctx.opts.Target == TargetBuilders {
			// Embedded type text in a BUILDERS conversion (a getRunType escape
			// / negation embed): after conversion the referenced name resolves
			// through `InferType<typeof partnerRT>`, and the partner's const
			// joins this very cycle — the converted aliases are EAGER, so
			// TypeScript silently collapses the knot to `any` and the printed
			// code type-erases the schema (found by the elision fuzz lane).
			// No spelling closes a cycle inside embedded text, so refuse
			// loudly like the direct self-back-edge above.
			ctx.escapeCycle = true
			return "", &Diagnostic{Code: CodeUnsupportedKind, Severity: SeverityError, Decl: declLabel(ctx.decl),
				Message: fmt.Sprintf("self-referential type inside an embedded type expression is not convertible (the reference to %s cycles back through this declaration)", entry.TypeName)}, true
		}
		// The pure type target keeps the name — its output leaves every
		// declaration a REAL type, and real type references resolve lazily,
		// so the cycle stays legal TS.
	}
	return ctx.refSpelling(entry, target)
}

// refSpelling renders a table reference in the requested target, resolving
// the cross-file spelling and recording import needs.
func (ctx *printContext) refSpelling(entry RefTarget, target Target) (string, *Diagnostic, bool) {
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
			ctx.needs.addForeign(foreignNeed{moduleSpec: ctx.bindings.moduleFor(entry.File), typeName: entry.TypeName, typeOnly: true})
		}
	}
	switch target {
	case TargetType:
		return spelling, nil, true
	case TargetBuilders:
		ctx.needs.useGetRunType = true
		return fmt.Sprintf("%s<%s>()", ctx.names.GetRunType, spelling), nil, true
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
			if (ctx.escapeCycle || ctx.innerCycle) && decl.Form == TargetType && decl.Name != "" {
				// Embedded type text (a getRunType escape) needed to close a
				// cycle, or an inlined partner cycles to ITSELF. No value
				// spelling exists — `RT.self()` cannot appear inside type text
				// and binds the root only, and a converted name resolves
				// through an EAGER `InferType<typeof constRT>` chain that
				// collapses the knot to `any` — so print the LAZY PAIR instead:
				// keep the declaration a REAL type (real names resolve lazily)
				// and add a `getRunType<Name>()` handle const beside it.
				return printLazyPair(resolved, opts, names, fileCtx)
			}
			return nil, diag
		}
		if ctx.usedSelf {
			// RT.circular ties the knot through Recursive<Body>, whose Self
			// substitution instantiates a TUPLE's slots eagerly, so a cycle
			// closing on a tuple slot has no `RT.circular` spelling (the
			// substitution unrolls).
			// A NAMED type-form declaration recovers through the LAZY PAIR,
			// which sidesteps the substitution entirely (the type stays real).
			// Only call sites still refuse on the shape (their copy lives in
			// printCallSite).
			if diag := ctx.eagerTupleCycleDiag(resolved.Node, decl, "RT.circular"); diag != nil {
				if decl.Form == TargetType && decl.Name != "" {
					return printLazyPair(resolved, opts, names, fileCtx)
				}
				return nil, diag
			}
			ctx.needs.useRT = true
			builderExpr = fmt.Sprintf("%s.circular(%s)", ctx.names.RT, builderExpr)
		}
		return assembleConstDecl(decl, names, exportPrefix, builderExpr, ctx.needs)
	}
	return nil, &Diagnostic{Code: CodeUnsupportedKind, Severity: SeverityError, Decl: declLabel(decl), Message: "unknown target"}
}

// printLazyPair renders the lazy-pair builders spelling for a type-form
// declaration whose cycle only closes through embedded type text: the
// declaration reprinted as a canonical type alias (the recursion closes on its
// own REAL name, exactly as the type target prints it) plus a
// `const <name>RT = getRunType<Name>();` value handle. recognizeFile pairs the
// two statements back into one builders-form declaration, so re-running the
// builders target is a byte no-op and the type target collapses the pair.
func printLazyPair(resolved *resolvedDecl, opts Options, names *nameTable, fileCtx *fileContext) (*printedDecl, *Diagnostic) {
	decl := resolved.Decl
	ctx := &printContext{names: names, opts: opts, decl: decl, resolve: resolved.Resolve,
		set: fileCtx.set, bindings: fileCtx.bindings, inScope: fileCtx.inScope,
		currentFile: fileCtx.path, rootID: resolved.Node.ID, selfName: decl.Name}
	typeExpr, diag := ctx.typeExpr(resolved.Node)
	if diag != nil {
		return nil, diag
	}
	constName := names.deriveConstName(decl.Name)
	if constName == "" {
		return nil, &Diagnostic{Code: CodeNameCollision, Severity: SeverityError, Decl: declLabel(decl),
			Message: fmt.Sprintf("no free const name derivable from %q", decl.Name)}
	}
	exportPrefix := ""
	if decl.Exported {
		exportPrefix = "export "
	}
	ctx.needs.useGetRunType = true
	text := fmt.Sprintf("%stype %s = %s;\n%sconst %s = %s<%s>();",
		exportPrefix, decl.Name, typeExpr, exportPrefix, constName, names.GetRunType, decl.Name)
	return &printedDecl{text: text, needs: ctx.needs}, nil
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

// exactBrandType renders the exact TypeFormat constructor for an annotation:
// no defaults merge, provably the reflected brand.
func (ctx *printContext) exactBrandType(annotation *reflection.FormatAnnotation, family formatFamily) (string, bool) {
	paramsText, ok := printFormatParams(annotation.Params, family.BigintParams)
	if !ok {
		return "", false
	}
	ctx.needs.useTypeFormat = true
	return fmt.Sprintf("%s<%s, %s, %s>", ctx.names.TypeFormat, family.Base, quoteSingle(annotation.Name), paramsText), true
}

// structuralParamsPubliclySpellable reports whether a structural annotation's
// literal params can be reconstructed through the PUBLIC params bags
// (FormattedArrayParams / FormattedObjectParams, formats/structural.ts). A
// payload outside that surface — `uniqueItems: false` (the bag declares
// `uniqueItems?: true`), or an unknown key from a hand-spelled sentinel —
// must ride the exact raw-brand spelling instead: the generic bag either
// fails to compile or resolves a DIFFERENT id (the `isRegex` precedent,
// TestChain_RegexPresetEscapesGenericSpelling).
func structuralParamsPubliclySpellable(annotation *reflection.FormatAnnotation) bool {
	if annotation == nil {
		return true
	}
	isNumber := func(value any) bool { _, ok := value.(float64); return ok }
	isStringList := func(value any) bool {
		list, ok := value.([]any)
		if !ok {
			return false
		}
		for _, item := range list {
			if _, ok := item.(string); !ok {
				return false
			}
		}
		return true
	}
	var allowed map[string]func(any) bool
	switch annotation.Name {
	case "formattedArray":
		allowed = map[string]func(any) bool{
			"minItems":    isNumber,
			"maxItems":    isNumber,
			"uniqueItems": func(value any) bool { flag, ok := value.(bool); return ok && flag },
		}
	case "formattedObject":
		allowed = map[string]func(any) bool{
			"minProperties":  isNumber,
			"maxProperties":  isNumber,
			"closed":         isStringList,
			"closedPatterns": isStringList,
			"additionalOwn":  isStringList,
		}
	default:
		return true
	}
	for key, value := range annotation.Params {
		check, known := allowed[key]
		if !known || !check(value) {
			return false
		}
	}
	return true
}

// rawStructuralBrandType spells a structural brand whose params sit outside
// the public bag surface as the raw sentinel intersection
// (`Base & TF.StructuralBrand<'formattedArray', {…}>`) — byte-honest with the
// reflected annotation, so the id cannot move. Child-carrying slots beside
// such a payload have no raw spelling that carries them too, so they refuse.
func (ctx *printContext) rawStructuralBrandType(node *reflection.RunType, baseText string) (string, *Diagnostic) {
	if len(node.Contains) > 0 || len(node.PatternProps) > 0 || len(node.PropNames) > 0 {
		return "", &Diagnostic{Code: CodeUnsupportedKind, Severity: SeverityError, Decl: declLabel(ctx.decl),
			Message: "structural params outside the public builder surface beside contains/patternProperties/propertyNames are not convertible"}
	}
	paramsText, ok := printFormatParams(node.FormatAnnotation.Params, false)
	if !ok {
		return "", unsupportedDiag(node, ctx.decl)
	}
	ctx.needs.useTF = true
	return fmt.Sprintf("%s & %s.StructuralBrand<%s, %s>", baseText, ctx.names.TF, quoteSingle(node.FormatAnnotation.Name), paramsText), nil
}

// structuralSubPrinter renders a child node in the current target's dialect —
// the printer method threaded into the structural helpers.
type structuralSubPrinter func(node *reflection.RunType) (string, *Diagnostic)

// structuralParts renders a node's structural payload (brand params +
// contains / patternProperties / propertyNames) as sorted `key: value` parts.
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

// closedParts renders the closedness params: both targets
// carry the exact `closed` / `closedPatterns` lists verbatim.
func (ctx *printContext) closedParts(node *reflection.RunType, params map[string]any, target Target, parts *[]string) *Diagnostic {
	closedValue, hasClosed := params["closed"]
	closedPatternsValue, hasClosedPatterns := params["closedPatterns"]
	if !hasClosed && !hasClosedPatterns {
		return nil
	}
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
	ctx.escapeCycle = ctx.escapeCycle || sub.escapeCycle
	return text, diag
}

// unsupportedFormatDiag reports a format family this phase cannot print.
func unsupportedFormatDiag(name string, decl *declaration) *Diagnostic {
	return &Diagnostic{Code: CodeUnsupportedKind, Severity: SeverityError, Decl: declLabel(decl),
		Message: fmt.Sprintf("format family %q is not convertible yet (see https://mion.pages.dev/runtypes/guide/source-conversion)", name)}
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

// indexSignature is one `[key: K]: V` member.
type indexSignature struct {
	key   *reflection.RunType
	value *reflection.RunType
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
				Message: fmt.Sprintf("object member %q (%s) is not convertible yet (see https://mion.pages.dev/runtypes/guide/source-conversion)", member.Name, kindLabel(member.Kind))}
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

// hasFlag reports whether the node carries the given free-form flag marker.
func hasFlag(node *reflection.RunType, flag string) bool {
	for _, candidate := range node.Flags {
		if candidate == flag {
			return true
		}
	}
	return false
}

// unsupportedDiag reports a kind outside the current printer coverage.
func unsupportedDiag(node *reflection.RunType, decl *declaration) *Diagnostic {
	return &Diagnostic{Code: CodeUnsupportedKind, Severity: SeverityError, Decl: declLabel(decl),
		Message: fmt.Sprintf("%s is not convertible yet (see https://mion.pages.dev/runtypes/guide/source-conversion)", kindLabel(node.Kind))}
}
