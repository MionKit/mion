package convert

// outside.go prints reflected types as standalone declarations for a published types package that ships another
// package's types instead of importing them. A named class or enum, a unique symbol key and a recursive shape
// become declarations of their own, referenced from printed text through placeholders the caller spells per file.

import (
	"fmt"
	"slices"
	"sort"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/shim/scanner"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// OutsideDeclKind names what an OutsideDecl declares.
type OutsideDeclKind int

const (
	OutsideClass OutsideDeclKind = iota
	OutsideEnum
	OutsideAlias
	OutsideSymbol
	// OutsideBuiltin is a platform class, spelled by the caller where it is declared and never printed.
	OutsideBuiltin
)

// OutsideDecl is one declaration printed text refers to. Body holds placeholders (OutsideRef) for the others.
type OutsideDecl struct {
	Key      string
	Kind     OutsideDeclKind
	Name     string
	NodeID   string
	Body     string
	abstract bool
}

// OutsidePrinter prints reflected nodes, collecting the declarations their text refers to.
type OutsidePrinter struct {
	resolve  func(id string) *reflection.RunType
	names    *nameTable
	decls    map[string]*OutsideDecl
	order    []string
	aliasIDs map[string]bool
	// failed holds the refusal of a declaration whose body could not print, returned to every later use of it.
	failed   map[string]*Diagnostic
	scanned  map[string]bool
	usedName map[string]int
	needs    importNeeds
}

// NewOutsidePrinter prints over the graph resolve serves (runtype.Cache.NodeByID).
func NewOutsidePrinter(resolve func(id string) *reflection.RunType) *OutsidePrinter {
	return &OutsidePrinter{
		resolve:  resolve,
		names:    &nameTable{RT: "RT", TF: "TF", TFT: "TFT", InferType: "InferType", GetRunType: "getRunType", TypeFormat: "TypeFormat", taken: map[string]bool{}},
		decls:    map[string]*OutsideDecl{},
		aliasIDs: map[string]bool{},
		failed:   map[string]*Diagnostic{},
		scanned:  map[string]bool{},
		usedName: map[string]int{},
	}
}

const outsideRefMark = "\x00"

// outsideDecl labels outside printing diagnostics, which name no source declaration.
var outsideDecl = &declaration{Name: "outside type"}

// OutsideRef is the placeholder printed text holds for the declaration under key.
func OutsideRef(key string) string { return outsideRefMark + key + outsideRefMark }

// ReplaceOutsideRefs spells every placeholder in text with spell.
func ReplaceOutsideRefs(text string, spell func(key string) string) string {
	var out strings.Builder
	for {
		start := strings.Index(text, outsideRefMark)
		if start < 0 {
			out.WriteString(text)
			return out.String()
		}
		end := strings.Index(text[start+1:], outsideRefMark)
		if end < 0 {
			out.WriteString(text)
			return out.String()
		}
		out.WriteString(text[:start])
		out.WriteString(spell(text[start+1 : start+1+end]))
		text = text[start+1+end+1:]
	}
}

// OutsideRefKeys lists the placeholder keys text holds, in order of first use.
func OutsideRefKeys(text string) []string {
	var keys []string
	seen := map[string]bool{}
	ReplaceOutsideRefs(text, func(key string) string {
		if !seen[key] {
			seen[key] = true
			keys = append(keys, key)
		}
		return ""
	})
	return keys
}

// Decl returns the declaration a placeholder key names.
func (printer *OutsidePrinter) Decl(key string) *OutsideDecl { return printer.decls[key] }

// Decls lists every declaration collected so far, in order of first use.
func (printer *OutsidePrinter) Decls() []*OutsideDecl {
	out := make([]*OutsideDecl, 0, len(printer.order))
	for _, key := range printer.order {
		out = append(out, printer.decls[key])
	}
	return out
}

// FormatImports are the import lines printed text needs for format brands.
func (printer *OutsidePrinter) FormatImports() []string {
	var lines []string
	if printer.needs.useTypeFormat {
		lines = append(lines, fmt.Sprintf("import type { TypeFormat } from '%s';", moduleCore))
	}
	if printer.needs.useTF {
		lines = append(lines, fmt.Sprintf("import type * as TF from '%s';", moduleFormats))
	}
	if printer.needs.useTFT {
		lines = append(lines, fmt.Sprintf("import type * as TFT from '%s';", moduleTemporal))
	}
	return lines
}

// Expr prints node as a type expression, declaring what it refers to.
func (printer *OutsidePrinter) Expr(node *reflection.RunType) (string, error) {
	node = printer.deref(node)
	if node == nil {
		return "", fmt.Errorf("no reflected type")
	}
	printer.scanCycles(node)
	ctx := printer.context(node.ID)
	if printer.aliasIDs[node.ID] {
		// A recursive shape is its alias, so every use of it shares one declaration.
		ctx.rootID = ""
	}
	text, diag := ctx.typeExpr(node)
	printer.needs.merge(ctx.needs)
	if diag != nil {
		return "", fmt.Errorf("%s", diag.Message)
	}
	return text, nil
}

func (printer *OutsidePrinter) context(rootID string) *printContext {
	return &printContext{names: printer.names, opts: Options{Target: TargetType}, decl: outsideDecl,
		resolve: printer.resolve, rootID: rootID, outside: printer}
}

func (printer *OutsidePrinter) deref(node *reflection.RunType) *reflection.RunType {
	if node != nil && node.Kind == reflection.KindRef {
		return printer.resolve(node.ID)
	}
	return node
}

// scanCycles marks the shapes a back-edge returns to: each prints once, as a named alias.
func (printer *OutsidePrinter) scanCycles(root *reflection.RunType) {
	onPath := map[string]bool{}
	var visit func(node *reflection.RunType)
	visit = func(node *reflection.RunType) {
		node = printer.deref(node)
		if node == nil || node.ID == "" {
			return
		}
		if onPath[node.ID] {
			if !isUserClass(node) && node.Kind != reflection.KindEnum {
				printer.aliasIDs[node.ID] = true
			}
			return
		}
		if printer.scanned[node.ID] {
			return
		}
		printer.scanned[node.ID] = true
		onPath[node.ID] = true
		node.EachRefSlot(visit)
		delete(onPath, node.ID)
	}
	visit(root)
}

func isUserClass(node *reflection.RunType) bool {
	return node.Kind == reflection.KindClass && node.ClassRef != nil && node.ClassRef.Builtin == "" && node.ClassRef.Name != ""
}

// claim returns base, or base suffixed, so two declarations of one kind never share a key name.
func (printer *OutsidePrinter) claim(base string) string {
	if !scanner.IsValidIdentifier(base) {
		base = "Type"
	}
	count := printer.usedName[base]
	printer.usedName[base] = count + 1
	if count == 0 {
		return base
	}
	return base + "$" + strconv.Itoa(count)
}

func (printer *OutsidePrinter) add(decl *OutsideDecl) {
	printer.decls[decl.Key] = decl
	printer.order = append(printer.order, decl.Key)
}

// fail drops a declaration whose body was refused, so no later use spells an empty one.
func (printer *OutsidePrinter) fail(key string, diag *Diagnostic) *Diagnostic {
	delete(printer.decls, key)
	printer.order = slices.DeleteFunc(printer.order, func(ordered string) bool { return ordered == key })
	printer.failed[key] = diag
	return diag
}

// aliasRef spells a reference to a recursive shape, declaring its alias on first use.
func (printer *OutsidePrinter) aliasRef(ctx *printContext, node *reflection.RunType) (string, *Diagnostic, bool) {
	if !printer.aliasIDs[node.ID] || (node.ID == ctx.rootID && len(ctx.walking) == 0) {
		return "", nil, false
	}
	key := "a:" + node.ID
	if diag := printer.failed[key]; diag != nil {
		return "", diag, true
	}
	if _, done := printer.decls[key]; !done {
		name := node.TypeName
		if name == "" {
			name = "Recursive"
		}
		decl := &OutsideDecl{Key: key, Kind: OutsideAlias, Name: printer.claim(name), NodeID: node.ID}
		printer.add(decl)
		body := printer.context(node.ID)
		text, diag := body.typeExpr(node)
		printer.needs.merge(body.needs)
		if diag != nil {
			return "", printer.fail(key, diag), true
		}
		decl.Body = text
	}
	return OutsideRef(key), nil, true
}

// classRef spells a user class, declaring it with its members on first use: its name and members make its id.
func (printer *OutsidePrinter) classRef(node *reflection.RunType) (string, *Diagnostic) {
	key := "c:" + node.ID
	if diag := printer.failed[key]; diag != nil {
		return "", diag
	}
	if _, done := printer.decls[key]; !done {
		decl := &OutsideDecl{Key: key, Kind: OutsideClass, Name: node.TypeName, NodeID: node.ID, abstract: printer.isAbstract(node)}
		if decl.Name == "" {
			decl.Name = node.ClassRef.Name
		}
		printer.add(decl)
		body := printer.context(node.ID)
		text, diag := body.classBody(node)
		printer.needs.merge(body.needs)
		if diag != nil {
			return "", printer.fail(key, diag)
		}
		decl.Body = text
	}
	return OutsideRef(key), nil
}

// isAbstract: an abstract member needs an abstract class, which the reflected class does not always say.
func (printer *OutsidePrinter) isAbstract(node *reflection.RunType) bool {
	if node.IsAbstract {
		return true
	}
	return slices.ContainsFunc(node.Children, func(member *reflection.RunType) bool {
		member = printer.deref(member)
		return member != nil && member.IsAbstract && !member.IsStatic
	})
}

// builtinRef spells a platform class through the caller, which knows where it is declared.
func (printer *OutsidePrinter) builtinRef(node *reflection.RunType) string {
	key := "b:" + node.ID
	if _, done := printer.decls[key]; !done {
		printer.add(&OutsideDecl{Key: key, Kind: OutsideBuiltin, Name: node.ClassRef.Builtin, NodeID: node.ID})
	}
	return OutsideRef(key)
}

// enumRef spells an enum, declaring it on first use: its name and members make its id.
func (printer *OutsidePrinter) enumRef(node *reflection.RunType) (string, *Diagnostic) {
	if node.TypeName == "" {
		return "", unsupportedDiag(node, outsideDecl)
	}
	key := "e:" + node.ID
	if _, done := printer.decls[key]; !done {
		names := make([]string, 0, len(node.EnumVal))
		for name := range node.EnumVal {
			names = append(names, name)
		}
		sort.Strings(names)
		parts := make([]string, 0, len(names))
		for _, name := range names {
			valueText, ok := enumValueText(node.EnumVal[name])
			if !ok {
				return "", unsupportedDiag(node, outsideDecl)
			}
			memberName := name
			if !scanner.IsValidIdentifier(name) {
				memberName = quoteSingle(name)
			}
			parts = append(parts, memberName+" = "+valueText)
		}
		printer.add(&OutsideDecl{Key: key, Kind: OutsideEnum, Name: node.TypeName, NodeID: node.ID, Body: "{ " + strings.Join(parts, ", ") + " }"})
	}
	return OutsideRef(key), nil
}

func enumValueText(value any) (string, bool) {
	switch typed := value.(type) {
	case string:
		return quoteSingle(typed), true
	case int64:
		return strconv.FormatInt(typed, 10), true
	case int:
		return strconv.Itoa(typed), true
	case float64:
		return formatNumberLiteral(typed)
	}
	return "", false
}

// wellKnownSymbols are the `Symbol.*` keys; any other symbol key is a declared unique symbol.
var wellKnownSymbols = map[string]bool{
	"asyncDispose": true, "asyncIterator": true, "dispose": true, "hasInstance": true, "isConcatSpreadable": true,
	"iterator": true, "match": true, "matchAll": true, "metadata": true, "replace": true, "search": true,
	"species": true, "split": true, "toPrimitive": true, "toStringTag": true, "unscopables": true,
}

// symbolKey spells a symbol member key; the id keeps only the symbol's declared name.
func (printer *OutsidePrinter) symbolKey(memberName string) (string, bool) {
	name := strings.TrimPrefix(memberName, "@@")
	if len(memberName) >= 2 && memberName[0] == 0xFE && memberName[1] == '@' {
		name = memberName[2:]
	}
	if !scanner.IsValidIdentifier(name) {
		return "", false
	}
	if wellKnownSymbols[name] {
		return "Symbol." + name, true
	}
	key := "s:" + name
	if _, done := printer.decls[key]; !done {
		printer.add(&OutsideDecl{Key: key, Kind: OutsideSymbol, Name: name})
	}
	return OutsideRef(key), true
}

// classBody prints a class's instance members; inherited ones are flattened in, statics left out (neither is in the id).
func (ctx *printContext) classBody(node *reflection.RunType) (string, *Diagnostic) {
	var parts []string
	if hasFlag(node, reflection.FlagPrivateFields) {
		parts = append(parts, "#private;")
	}
	members := make([]*reflection.RunType, 0, len(node.Children))
	for _, memberRef := range node.Children {
		member := ctx.deref(memberRef)
		if member == nil {
			return "", unsupportedDiag(node, ctx.decl)
		}
		if !member.IsStatic {
			members = append(members, member)
		}
	}
	// Merged declarations list their members in the order the compiler bound the files, which varies.
	sort.SliceStable(members, func(i, j int) bool { return members[i].Name < members[j].Name })
	for _, member := range members {
		text, diag := ctx.classMemberText(member)
		if diag != nil {
			return "", diag
		}
		parts = append(parts, text)
	}
	if len(parts) == 0 {
		return "{}", nil
	}
	return "{\n  " + strings.Join(parts, "\n  ") + "\n}", nil
}

func (ctx *printContext) classMemberText(member *reflection.RunType) (string, *Diagnostic) {
	if member.Kind == reflection.KindIndexSignature {
		text, diag := ctx.indexSignatureText(indexSignature{key: member.Index, value: member.Child, readonly: member.Readonly})
		return text + ";", diag
	}
	key, keyDiag := ctx.memberKey(member)
	if keyDiag != nil {
		return "", keyDiag
	}
	prefix := nonEnumerableTag(member.NonEnumerable)
	if member.Visibility != nil {
		switch *member.Visibility {
		case reflection.VisibilityProtected:
			prefix += "protected "
		case reflection.VisibilityPrivate:
			// A typeless `private x;` is how a `.d.ts` hides a private member's type; the id reads it as optional `any`.
			if child := ctx.deref(member.Child); child != nil && child.Kind == reflection.KindAny && member.Kind == reflection.KindProperty {
				return prefix + "private " + readonlyPrefix(member.Readonly) + key + ";", nil
			}
			prefix += "private "
		}
	}
	if member.IsAbstract {
		prefix += "abstract "
	}
	optionalMark := ""
	if member.Optional {
		optionalMark = "?"
	}
	switch member.Kind {
	case reflection.KindMethod, reflection.KindMethodSignature:
		paramsText, paramsDiag := ctx.parameterListText(member)
		if paramsDiag != nil {
			return "", paramsDiag
		}
		returnText, returnDiag := ctx.returnText(member)
		if returnDiag != nil {
			return "", returnDiag
		}
		if hasFlag(member, reflection.FlagField) || member.Readonly {
			return fmt.Sprintf("%s%s%s%s: (%s) => %s;", prefix, readonlyPrefix(member.Readonly), key, optionalMark, paramsText, returnText), nil
		}
		return fmt.Sprintf("%s%s%s(%s): %s;", prefix, key, optionalMark, paramsText, returnText), nil
	case reflection.KindProperty, reflection.KindPropertySignature:
		childText, childDiag := ctx.typeExpr(member.Child)
		if childDiag != nil {
			return "", childDiag
		}
		if hasFlag(member, reflection.FlagAccessor) {
			text := fmt.Sprintf("%sget %s(): %s;", prefix, key, childText)
			if !member.Readonly {
				text += fmt.Sprintf(" %sset %s(value: %s);", prefix, key, childText)
			}
			return text, nil
		}
		return fmt.Sprintf("%s%s%s%s: %s;", prefix, readonlyPrefix(member.Readonly), key, optionalMark, childText), nil
	}
	return "", unsupportedDiag(member, ctx.decl)
}

func (ctx *printContext) returnText(signature *reflection.RunType) (string, *Diagnostic) {
	if signature.Return == nil {
		return "void", nil
	}
	return ctx.typeExpr(signature.Return)
}

// memberKey spells a member's key: an identifier, a quoted string or, in outside printing, a symbol.
func (ctx *printContext) memberKey(member *reflection.RunType) (string, *Diagnostic) {
	if reflection.IsSymbolKeyedName(member.Name) {
		if ctx.outside != nil {
			if spelled, ok := ctx.outside.symbolKey(member.Name); ok {
				return "[" + spelled + "]", nil
			}
		}
		return "", &Diagnostic{Code: CodeUnsupportedKind, Severity: SeverityError, Decl: declLabel(ctx.decl),
			Message: fmt.Sprintf("symbol-keyed member %q is not convertible yet", member.Name)}
	}
	if member.IsSafeName {
		return member.Name, nil
	}
	return quoteSingle(member.Name), nil
}

// statement renders the declaration as an exported top-level statement under name, its placeholders unspelled.
func (decl *OutsideDecl) statement(name string) string {
	switch decl.Kind {
	case OutsideClass:
		abstract := ""
		if decl.abstract {
			abstract = "abstract "
		}
		return fmt.Sprintf("export declare %sclass %s %s", abstract, name, decl.Body)
	case OutsideEnum:
		return fmt.Sprintf("export declare enum %s %s", name, decl.Body)
	case OutsideAlias:
		return fmt.Sprintf("export type %s = %s;", name, decl.Body)
	case OutsideSymbol:
		return fmt.Sprintf("declare const %s: unique symbol;", name)
	}
	return ""
}

// OutsidePlaced is a declaration laid out in one file: Spelling is how that file names it.
type OutsidePlaced struct {
	Decl      *OutsideDecl
	Spelling  string
	Statement string
}

// LayoutOutsideFile names each declaration in one file; taken lists names the file already uses.
// A class or enum keeps the name its id needs, so a second one under that name goes in a namespace.
func LayoutOutsideFile(decls []*OutsideDecl, taken map[string]bool) []OutsidePlaced {
	used := map[string]bool{}
	for name := range taken {
		used[name] = true
	}
	symbols := map[string]bool{}
	out := make([]OutsidePlaced, 0, len(decls))
	free := func(base string) string {
		name := FreeName(base, func(candidate string) bool { return used[candidate] })
		used[name] = true
		return name
	}
	for _, decl := range decls {
		if decl.Kind != OutsideClass && decl.Kind != OutsideEnum {
			continue
		}
		if !used[decl.Name] {
			used[decl.Name] = true
			out = append(out, OutsidePlaced{Decl: decl, Spelling: decl.Name, Statement: decl.statement(decl.Name)})
			continue
		}
		// A namespace keeps the name the id needs for a second declaration under it.
		namespace := free(decl.Name)
		inner := strings.TrimPrefix(decl.statement(decl.Name), "export declare ")
		statement := fmt.Sprintf("export declare namespace %s {\n  %s\n}", namespace, strings.ReplaceAll(inner, "\n", "\n  "))
		out = append(out, OutsidePlaced{Decl: decl, Spelling: namespace + "." + decl.Name, Statement: statement})
	}
	for _, decl := range decls {
		switch decl.Kind {
		case OutsideAlias:
			name := free(decl.Name)
			out = append(out, OutsidePlaced{Decl: decl, Spelling: name, Statement: decl.statement(name)})
		case OutsideSymbol:
			if symbols[decl.Name] {
				continue
			}
			symbols[decl.Name] = true
			used[decl.Name] = true
			out = append(out, OutsidePlaced{Decl: decl, Spelling: decl.Name, Statement: decl.statement(decl.Name)})
		}
	}
	return out
}

// FreeName is base, or base suffixed `$2`, `$3`…, the first that taken does not hold.
func FreeName(base string, taken func(name string) bool) string {
	name := base
	for index := 2; taken(name); index++ {
		name = base + "$" + strconv.Itoa(index)
	}
	return name
}
