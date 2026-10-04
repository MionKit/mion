package apitypes

// outside.go prints the types the API reaches in other packages into the types package, so a client installs none of
// them: each use is replaced by a reference to a declaration under _outside/, printed from the reflected type, which
// keeps its id. The tsconfig libraries and the mion packages stay imports.

import (
	"fmt"
	"maps"
	"path/filepath"
	"slices"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/scanner"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/runtype"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/runtype/typeid"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/convert"
	"github.com/mionkit/mion/ts-go-runtypes/internal/tsimports"
)

// outsideDir holds the printed declarations, one file per package.
const outsideDir = "_outside"

// sharedOutside holds printed declarations no single package owns.
const sharedOutside = "_shared"

type originKind int

const (
	originProject originKind = iota
	originPlatform
	originMion
	originOutside
)

type origin struct {
	kind originKind
	pkg  string
}

type outsideState struct {
	cache      *runtype.Cache
	printer    *convert.DeclPrinter
	statements map[*ast.Node]bool
	reaches    map[*ast.Node]*origin
	// uses are the aliases a replaced use points at, by key; homes is the package each declaration ships in.
	uses  map[string]*convert.PrintedDecl
	homes map[string]string
	// projectDecls are project classes and enums printed text names, by key: their kept file and exported name.
	projectDecls map[string]projectDecl
	warnings     map[string]bool
	// environment and libs are the tsconfig libraries kept code reads, for the entry's reference lines.
	environment map[string]bool
	libs        map[string]bool
}

type projectDecl struct {
	file *fileInfo
	// pkg is the mion package a class or enum is imported from, when no project file declares it.
	pkg  string
	name string
}

func newOutsideState(trimmer *trimmer) *outsideState {
	cache := runtype.NewCache(trimmer.checker, runtype.Options{})
	cache.KeepTypes()
	markerOpts := marker.WithDefaults(marker.Options{})
	markerOpts.FS = trimmer.program.FS
	markerOpts.Cwd = trimmer.cwd
	cache.SetMarkerOptions(markerOpts)
	cache.SetEnvironment(trimmer.program.EnvironmentFile)
	return &outsideState{
		cache: cache, printer: convert.NewDeclPrinter(cache.NodeByID),
		statements: map[*ast.Node]bool{}, reaches: map[*ast.Node]*origin{},
		uses: map[string]*convert.PrintedDecl{}, homes: map[string]string{}, projectDecls: map[string]projectDecl{},
		warnings: map[string]bool{}, environment: map[string]bool{}, libs: map[string]bool{},
	}
}

// originOf says where a symbol is declared; one declaration in another package makes it that package's.
func (trimmer *trimmer) originOf(symbol *ast.Symbol) origin {
	if symbol == nil {
		return origin{kind: originProject}
	}
	if symbol.Flags&ast.SymbolFlagsAlias != 0 {
		symbol = trimmer.checker.GetAliasedSymbol(symbol)
	}
	if symbol == nil || symbol.Flags&ast.SymbolFlagsTypeParameter != 0 {
		return origin{kind: originProject}
	}
	found := origin{kind: originProject}
	for _, declaration := range symbol.Declarations {
		current := trimmer.originOfFile(ast.GetSourceFileOfNode(declaration))
		if current.kind == originOutside {
			return current
		}
		if current.kind > found.kind {
			found = current
		}
	}
	return found
}

func (trimmer *trimmer) originOfFile(sourceFile *ast.SourceFile) origin {
	if sourceFile == nil {
		return origin{kind: originProject}
	}
	fileName := filepath.Clean(sourceFile.FileName())
	if trimmer.files[fileName] != nil || filepath.Dir(fileName) == trimmer.declarationDir {
		return origin{kind: originProject}
	}
	if typeid.IsBundledLibFile(sourceFile.FileName()) {
		if trimmer.outside != nil {
			trimmer.outside.libs[libName(fileName)] = true
		}
		return origin{kind: originPlatform}
	}
	name, _ := marker.PackageOfFile(fileName, nil)
	if trimmer.program.EnvironmentFile(sourceFile) {
		if trimmer.outside != nil && name != "" {
			trimmer.outside.environment[name] = true
		}
		return origin{kind: originPlatform}
	}
	if strings.HasPrefix(name, "@mionjs/") {
		return origin{kind: originMion, pkg: name}
	}
	if name == "" {
		return origin{kind: originProject}
	}
	return origin{kind: originOutside, pkg: name}
}

// libName is the `/// <reference lib>` name of a default lib file (`lib.dom.d.ts` → `dom`).
func libName(fileName string) string {
	return strings.TrimSuffix(strings.TrimPrefix(filepath.Base(fileName), "lib."), ".d.ts")
}

// typeUse is what one arm reads off a node that names a type.
type typeUse struct {
	// found is where the named type is declared; a `typeof` a project value typed outside counts as outside.
	found origin
	// name is the node the use resolves through, nil for an import type.
	name     *ast.Node
	hint     string
	heritage bool
}

// visitTypeUse is the one switch over the nodes that name a type, as TypeScript's visitDeclarationSubtree; file may be nil.
func (trimmer *trimmer) visitTypeUse(file *fileInfo, node *ast.Node) (typeUse, bool) {
	switch node.Kind {
	case ast.KindTypeReference:
		return trimmer.transformTypeReference(node), true
	case ast.KindExpressionWithTypeArguments:
		return trimmer.transformExpressionWithTypeArguments(node), true
	case ast.KindImportType:
		return trimmer.transformImportType(file, node), true
	case ast.KindTypeQuery:
		return trimmer.transformTypeQuery(node), true
	}
	return typeUse{}, false
}

func (trimmer *trimmer) transformTypeReference(node *ast.Node) typeUse {
	name := rightmost(node.AsTypeReferenceNode().TypeName)
	return typeUse{found: trimmer.originOf(trimmer.checker.GetSymbolAtLocation(name)), name: name, hint: identifierHint(name.Text())}
}

// transformExpressionWithTypeArguments reads an `extends` / `implements` clause, which needs an imported binding.
func (trimmer *trimmer) transformExpressionWithTypeArguments(node *ast.Node) typeUse {
	name := node.Expression()
	if name.Kind == ast.KindPropertyAccessExpression {
		name = name.Name()
	}
	use := typeUse{found: trimmer.originOf(trimmer.checker.GetSymbolAtLocation(name)), name: name, heritage: true, hint: "Printed"}
	if ast.IsIdentifier(name) {
		use.hint = identifierHint(name.Text())
	}
	return use
}

func (trimmer *trimmer) transformImportType(file *fileInfo, node *ast.Node) typeUse {
	importType := node.AsImportTypeNode()
	use := typeUse{found: origin{kind: originProject}, hint: "Printed"}
	if qualifier := importType.Qualifier; qualifier != nil {
		use.hint = identifierHint(rightmost(qualifier).Text())
	}
	if file == nil || importType.Argument == nil || importType.Argument.Kind != ast.KindLiteralType {
		return use
	}
	literal := importType.Argument.AsLiteralTypeNode().Literal
	if trimmer.resolveModule(file, moduleText(literal)) != nil {
		return use
	}
	if symbol := trimmer.checker.GetSymbolAtLocation(literal); symbol != nil {
		use.found = trimmer.originOf(symbol)
	}
	return use
}

// transformTypeQuery reads `typeof x…`; a project value declared as an outside type counts as that type, so it never ships.
func (trimmer *trimmer) transformTypeQuery(node *ast.Node) typeUse {
	exprName := node.AsTypeQueryNode().ExprName
	parts := []string{}
	for name := exprName; name != nil; {
		if name.Kind == ast.KindQualifiedName {
			parts = append([]string{name.AsQualifiedName().Right.Text()}, parts...)
			name = name.AsQualifiedName().Left
			continue
		}
		parts = append([]string{name.Text()}, parts...)
		break
	}
	name := ast.GetFirstIdentifier(exprName)
	symbol := trimmer.checker.GetSymbolAtLocation(name)
	use := typeUse{found: trimmer.originOf(symbol), name: name, hint: identifierHint(strings.Join(parts, "_"))}
	if use.found.kind != originProject || symbol == nil {
		return use
	}
	if symbol.Flags&ast.SymbolFlagsAlias != 0 {
		symbol = trimmer.checker.GetAliasedSymbol(symbol)
	}
	for _, declaration := range symbol.Declarations {
		if reached := trimmer.reachesOutside(declaration); reached != nil {
			use.found = *reached
			return use
		}
	}
	return use
}

func rightmost(name *ast.Node) *ast.Node {
	if name != nil && name.Kind == ast.KindQualifiedName {
		return name.AsQualifiedName().Right
	}
	return name
}

// reachesOutside reports the outside package a project value or alias is declared as (`declare const users: PgTable<…>`).
// A type built around an outside type does not count.
func (trimmer *trimmer) reachesOutside(declaration *ast.Node) *origin {
	if found, done := trimmer.outside.reaches[declaration]; done {
		return found
	}
	trimmer.outside.reaches[declaration] = nil
	var found *origin
	var typeNode *ast.Node
	switch declaration.Kind {
	case ast.KindVariableDeclaration, ast.KindTypeAliasDeclaration:
		typeNode = declaration.Type()
	}
	for typeNode != nil && typeNode.Kind == ast.KindParenthesizedType {
		typeNode = typeNode.AsParenthesizedTypeNode().Type
	}
	if typeNode != nil {
		file := trimmer.files[filepath.Clean(ast.GetSourceFileOfNode(typeNode).FileName())]
		if use, isUse := trimmer.visitTypeUse(file, typeNode); isUse {
			if file != nil && use.found.kind == originOutside {
				found = &use.found
			}
			if name := use.name; found == nil && name != nil {
				symbol := trimmer.checker.GetSymbolAtLocation(name)
				if symbol != nil && symbol.Flags&ast.SymbolFlagsAlias != 0 {
					symbol = trimmer.checker.GetAliasedSymbol(symbol)
				}
				if symbol != nil && trimmer.originOf(symbol).kind == originProject {
					for _, next := range symbol.Declarations {
						if found = trimmer.reachesOutside(next); found != nil {
							break
						}
					}
				}
			}
		}
	}
	trimmer.outside.reaches[declaration] = found
	return found
}

// printOutsideUses replaces each outside type use in a kept statement by a reference to its printed declaration.
func (trimmer *trimmer) printOutsideUses(current *item) {
	if trimmer.outside == nil || current.statement == nil || trimmer.outside.statements[current.statement] {
		return
	}
	switch current.kind {
	case itemDeclaration, itemAlways, itemMember:
	default:
		return
	}
	if isMemberBlock(current.statement) {
		return
	}
	trimmer.outside.statements[current.statement] = true
	file := current.file
	var walk func(node *ast.Node) bool
	walk = func(node *ast.Node) bool {
		if file.inHole(node) {
			return false
		}
		if typeUse, isUse := trimmer.visitTypeUse(file, node); isUse && typeUse.found.kind == originOutside {
			use := climbUse(node)
			if use != node && hasFreeTypeParameters(trimmer.checker, use) {
				// `X[K]` under a mapped `K` cannot print, `X` alone can.
				use = node
			}
			if trimmer.replaceUse(file, use, typeUse) {
				return false
			}
		}
		node.ForEachChild(walk)
		return false
	}
	walk(current.statement)
}

// climbUse widens a use to the indexed access read off it, so `(typeof table)["$row"]` prints the row, not the table.
func climbUse(node *ast.Node) *ast.Node {
	for node.Parent != nil {
		parent := node.Parent
		switch {
		case parent.Kind == ast.KindParenthesizedType:
		case parent.Kind == ast.KindIndexedAccessType && parent.AsIndexedAccessTypeNode().ObjectType == node:
		default:
			return node
		}
		node = parent
	}
	return node
}

// replaceUse prints a use and cuts it for a reference; false keeps it as written, its package a peer.
func (trimmer *trimmer) replaceUse(file *fileInfo, use *ast.Node, typeUse typeUse) bool {
	found := typeUse.found
	label := strings.TrimSpace(file.text[scanner.GetTokenPosOfNode(use, file.source, false):use.End()])
	keep := func(reason string) bool {
		trimmer.outside.warnings[fmt.Sprintf("%s: `%s` from %s stays an import, so %s stays a peer dependency: %s", trimmer.relative(file.path), label, found.pkg, found.pkg, reason)] = true
		return false
	}
	if hasFreeTypeParameters(trimmer.checker, use) {
		return keep("it uses a type parameter, which a printed type cannot keep")
	}
	heritage := typeUse.heritage
	if heritage && !ast.IsExternalModule(file.source) {
		return keep("a script file cannot import the printed class it extends")
	}
	tsType := checker.Checker_getTypeFromTypeNode(trimmer.checker, use)
	if tsType != nil && tsType.Flags()&checker.TypeFlagsSubstitution != 0 {
		// A conditional's true branch narrows the type it names; the use still names that type.
		tsType = tsType.AsSubstitutionType().BaseType()
	}
	if tsType == nil {
		return keep("it has no type")
	}
	node := trimmer.outside.cache.SerializeTopLevel(tsType)
	text, err := trimmer.outside.printer.TypeToString(node)
	if err != nil {
		return keep(err.Error())
	}
	key := ""
	if decl := trimmer.outside.printer.Decl(strings.Trim(text, "\x00")); decl != nil && text == convert.DeclRef(decl.Key) &&
		(decl.Kind == convert.DeclClass || decl.Kind == convert.DeclEnum || decl.Kind == convert.DeclAlias) {
		// A use that is one named declaration points at it rather than at an alias of it.
		key = decl.Key
	} else {
		key = "u:" + node.ID
		if _, exists := trimmer.outside.uses[key]; !exists {
			trimmer.outside.uses[key] = &convert.PrintedDecl{Key: key, Kind: convert.DeclAlias, Name: typeUse.hint, NodeID: node.ID, Body: text}
			trimmer.outside.homes[key] = found.pkg
		}
	}
	if heritage {
		key = heritageMark + key
	}
	// The range starts with the use's leading trivia, as a read's node does, so nothing inside it counts as read.
	tokenStart := scanner.GetTokenPosOfNode(use, file.source, false)
	file.holes = append(file.holes, textRange{start: use.Pos(), end: use.End(), text: file.text[use.Pos():tokenStart] + convert.DeclRef(key)})
	return true
}

// heritageMark prefixes a key an `extends` clause spells, which needs an imported binding rather than an import type.
const heritageMark = "h|"

// hasFreeTypeParameters: a printed type is fully instantiated, so a use naming a type parameter cannot be printed.
func hasFreeTypeParameters(typeChecker *checker.Checker, use *ast.Node) bool {
	found := false
	var walk func(node *ast.Node) bool
	walk = func(node *ast.Node) bool {
		if node.Kind == ast.KindThisType {
			found = true
		}
		if node.Kind == ast.KindTypeReference {
			if symbol := typeChecker.GetSymbolAtLocation(rightmost(node.AsTypeReferenceNode().TypeName)); symbol != nil && symbol.Flags&ast.SymbolFlagsTypeParameter != 0 {
				found = true
			}
		}
		if !found {
			node.ForEachChild(walk)
		}
		return found
	}
	walk(use)
	return found
}

func identifierHint(text string) string {
	var out strings.Builder
	for _, char := range text {
		if scanner.IsIdentifierPart(char) {
			out.WriteRune(char)
		}
	}
	if out.Len() == 0 || !scanner.IsIdentifierStart([]rune(out.String())[0]) {
		return "Printed" + out.String()
	}
	return out.String()
}

// decl returns the declaration a key names, a use alias or one the printer collected.
func (state *outsideState) decl(key string) *convert.PrintedDecl {
	if decl, ok := state.uses[key]; ok {
		return decl
	}
	return state.printer.Decl(key)
}

// placeOutside decides where each printed declaration ships; a project class or enum it names is kept instead.
// It returns true when that kept something new, so marking runs again.
func (trimmer *trimmer) placeOutside() bool {
	state := trimmer.outside
	keptMore := false
	for _, key := range state.reachedKeys(trimmer) {
		if _, placed := state.homes[key]; placed {
			continue
		}
		decl := state.decl(key)
		switch decl.Kind {
		case convert.DeclUniqueSymbol, convert.DeclBuiltin:
			// Declared in each file that spells it, or where the platform declares it.
			state.homes[key] = ""
			continue
		}
		symbol := state.declSymbol(decl)
		found := trimmer.originOf(symbol)
		switch {
		case (decl.Kind == convert.DeclClass || decl.Kind == convert.DeclEnum) && found.kind == originProject:
			if project, ok := trimmer.exportedProjectDecl(symbol, decl.Name); ok {
				state.projectDecls[key] = project
				state.homes[key] = ""
				for _, provider := range trimmer.provide(project.file, project.name, map[string]bool{}) {
					if !provider.kept {
						trimmer.keep(provider, nil)
						keptMore = true
					}
				}
				continue
			}
			state.homes[key] = sharedOutside
		case (decl.Kind == convert.DeclClass || decl.Kind == convert.DeclEnum) && found.kind == originMion:
			state.projectDecls[key] = projectDecl{pkg: found.pkg, name: decl.Name}
			state.homes[key] = ""
			trimmer.externals[found.pkg] = true
		case found.kind == originOutside:
			state.homes[key] = found.pkg
		default:
			state.homes[key] = sharedOutside
		}
	}
	return keptMore
}

// reachedKeys lists every declaration key the replaced uses reach, through the bodies they print.
func (state *outsideState) reachedKeys(trimmer *trimmer) []string {
	var queue []string
	for _, file := range trimmer.sortedFiles() {
		for _, hole := range file.holes {
			for _, key := range convert.DeclRefKeys(hole.text) {
				queue = append(queue, strings.TrimPrefix(key, heritageMark))
			}
		}
	}
	seen := map[string]bool{}
	var out []string
	for len(queue) > 0 {
		key := queue[0]
		queue = queue[1:]
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, key)
		if decl := state.decl(key); decl != nil {
			queue = append(queue, convert.DeclRefKeys(decl.Body)...)
		}
	}
	return out
}

// declSymbol is the symbol a printed declaration came from: a class, an enum, or the alias a recursive shape names.
func (state *outsideState) declSymbol(decl *convert.PrintedDecl) *ast.Symbol {
	tsType := state.cache.TypeByID(decl.NodeID)
	if tsType == nil {
		return nil
	}
	if alias := checker.Type_alias(tsType); alias != nil && decl.Kind == convert.DeclAlias {
		return alias.Symbol()
	}
	return tsType.Symbol()
}

// exportedProjectDecl finds the kept project file exporting a class or enum under its own name.
func (trimmer *trimmer) exportedProjectDecl(symbol *ast.Symbol, name string) (projectDecl, bool) {
	if symbol == nil {
		return projectDecl{}, false
	}
	for _, declaration := range symbol.Declarations {
		file := trimmer.files[filepath.Clean(ast.GetSourceFileOfNode(declaration).FileName())]
		if file == nil {
			continue
		}
		if len(trimmer.provide(file, name, map[string]bool{})) > 0 {
			return projectDecl{file: file, name: name}, true
		}
	}
	return projectDecl{}, false
}

// outsideFile is the slash path, under the declaration dir, of the file a package's printed declarations ship in.
func outsideFile(pkg string) string {
	return outsideDir + "/" + pkg + ".d.ts"
}

// moduleSpecifier is the relative import path from one slash path to another .d.ts, as a client resolves it.
func moduleSpecifier(from, to string) string {
	return strings.TrimSuffix(relativePath(from, to), ".d.ts") + ".js"
}

// relativePath is the `/// <reference path>` from one slash path to another file; a dot-folder target still gets `./`.
func relativePath(from, to string) string {
	rel, _ := filepath.Rel(filepath.Dir(filepath.FromSlash(from)), filepath.FromSlash(to))
	rel = filepath.ToSlash(rel)
	if !strings.HasPrefix(rel, "./") && !strings.HasPrefix(rel, "../") {
		rel = "./" + rel
	}
	return rel
}

// renderOutside writes the printed declaration files and spells every reference, the project files' included.
func (trimmer *trimmer) renderOutside(files map[string]string) error {
	state := trimmer.outside
	byHome := map[string][]*convert.PrintedDecl{}
	for _, key := range state.reachedKeys(trimmer) {
		if home := state.homes[key]; home != "" {
			byHome[home] = append(byHome[home], state.decl(key))
		}
	}
	// A symbol key is declared in each file that spells it, never imported.
	spellings := map[string]map[string]string{}
	homeOf := map[string]string{}
	statements := map[string][]convert.PlacedDecl{}
	// The format imports every printed file may hold bind these names.
	formatBindings := map[string]bool{"TypeFormat": true, "TF": true, "TFT": true}
	homes := make([]string, 0, len(byHome))
	for home := range byHome {
		homes = append(homes, home)
	}
	sort.Strings(homes)
	for _, home := range homes {
		decls := byHome[home]
		for _, decl := range decls {
			for _, key := range convert.DeclRefKeys(decl.Body) {
				if referenced := state.decl(key); referenced != nil && referenced.Kind == convert.DeclUniqueSymbol {
					decls = append(decls, referenced)
				}
			}
		}
		placed := convert.LayoutDecls(decls, formatBindings)
		statements[home] = placed
		spellings[home] = map[string]string{}
		for _, entry := range placed {
			spellings[home][entry.Decl.Key] = entry.Spelling
			if entry.Decl.Kind != convert.DeclUniqueSymbol {
				homeOf[entry.Decl.Key] = home
			}
		}
	}
	for _, home := range homes {
		if _, taken := files[outsideFile(home)]; taken {
			return fmt.Errorf("api types: the project emits %s, which the printed declarations of %s need", outsideFile(home), home)
		}
	}
	spellFrom := func(from string, bindings map[string]string) func(string) string {
		return func(key string) string {
			heritage := strings.HasPrefix(key, heritageMark)
			key = strings.TrimPrefix(key, heritageMark)
			decl := state.decl(key)
			switch {
			case decl == nil:
				return "unknown"
			case decl.Kind == convert.DeclUniqueSymbol:
				return decl.Name
			case decl.Kind == convert.DeclBuiltin:
				return trimmer.builtinSpelling(decl)
			}
			if project, ok := state.projectDecls[key]; ok {
				if project.file == nil {
					return fmt.Sprintf("import(%q).%s", project.pkg, project.name)
				}
				target := trimmer.relative(project.file.path)
				if heritage {
					return bindings[moduleSpecifier(from, target)+"#"+project.name]
				}
				return fmt.Sprintf("import(%q).%s", moduleSpecifier(from, target), project.name)
			}
			home := homeOf[key]
			spelling := spellings[home][key]
			target := outsideFile(home)
			if target == from {
				return spelling
			}
			if heritage {
				return bindings[moduleSpecifier(from, target)+"#"+spelling]
			}
			return fmt.Sprintf("import(%q).%s", moduleSpecifier(from, target), spelling)
		}
	}
	for path, text := range files {
		bindings, imports := trimmer.heritageBindings(path, text, spellings, homeOf)
		text = convert.ReplaceDeclRefs(text, spellFrom(path, bindings))
		files[path] = insertImports(text, imports)
	}
	for _, home := range homes {
		path := outsideFile(home)
		var lines []string
		lines = append(lines, state.printer.FormatImports()...)
		for _, entry := range statements[home] {
			lines = append(lines, convert.ReplaceDeclRefs(entry.Statement, spellFrom(path, nil)))
		}
		files[path] = strings.Join(lines, "\n") + "\nexport {};\n"
	}
	return nil
}

// heritageBindings imports what a file's `extends` clauses name, each under a name the file leaves free.
func (trimmer *trimmer) heritageBindings(path, text string, spellings map[string]map[string]string, homeOf map[string]string) (map[string]string, []string) {
	bindings := map[string]string{}
	var imports []string
	for _, key := range convert.DeclRefKeys(text) {
		if !strings.HasPrefix(key, heritageMark) {
			continue
		}
		key = strings.TrimPrefix(key, heritageMark)
		var target, spelling string
		if project, ok := trimmer.outside.projectDecls[key]; ok && project.file != nil {
			target, spelling = trimmer.relative(project.file.path), project.name
		} else {
			home := homeOf[key]
			target, spelling = outsideFile(home), spellings[home][key]
		}
		specifier := moduleSpecifier(path, target)
		if _, done := bindings[specifier+"#"+spelling]; done {
			continue
		}
		head, rest, qualified := strings.Cut(spelling, ".")
		local := freeName(text, head)
		imports = append(imports, tsimports.Render(specifier, "", []tsimports.Binding{{Imported: head, Local: local}}))
		if qualified {
			local += "." + rest
		}
		bindings[specifier+"#"+spelling] = local
		text += " " + local
	}
	return bindings, imports
}

// freeName is base, or base suffixed, so it names nothing text already names.
func freeName(text, base string) string {
	return convert.MakeUniqueName(base, func(name string) bool { return containsWord(text, name) })
}

func containsWord(text, word string) bool {
	for start := 0; ; {
		index := strings.Index(text[start:], word)
		if index < 0 {
			return false
		}
		index += start
		before, after := index-1, index+len(word)
		if (before < 0 || !scanner.IsIdentifierPart(rune(text[before]))) && (after >= len(text) || !scanner.IsIdentifierPart(rune(text[after]))) {
			return true
		}
		start = index + 1
	}
}

// insertImports puts import lines after a file's leading comments and reference lines.
func insertImports(text string, imports []string) string {
	if len(imports) == 0 {
		return text
	}
	lines := strings.SplitAfter(text, "\n")
	at := 0
	for at < len(lines) && (strings.HasPrefix(strings.TrimSpace(lines[at]), "///") || strings.TrimSpace(lines[at]) == "") {
		at++
	}
	return strings.Join(lines[:at], "") + strings.Join(imports, "\n") + "\n" + strings.Join(lines[at:], "")
}

// builtinSpelling names a platform class where it is declared: a global by name, an ambient module's through it.
func (trimmer *trimmer) builtinSpelling(decl *convert.PrintedDecl) string {
	symbol := trimmer.outside.declSymbol(decl)
	if symbol != nil {
		// Records the library the client must load for it.
		trimmer.originOf(symbol)
		for _, declaration := range symbol.Declarations {
			for parent := declaration.Parent; parent != nil; parent = parent.Parent {
				if parent.Kind == ast.KindModuleDeclaration && parent.Name() != nil && parent.Name().Kind == ast.KindStringLiteral {
					return fmt.Sprintf("import(%q).%s", parent.Name().Text(), symbol.Name)
				}
			}
		}
	}
	return decl.Name
}

// referenceLines make a client load the same platform types: each reached package's tsconfig `types` entry as written,
// and each reached non-ES lib (`dom`); ES libs follow the client's own target.
func (state *outsideState) referenceLines(typesEntries []string) []string {
	var lines []string
	for _, pkg := range slices.Sorted(maps.Keys(state.environment)) {
		lines = append(lines, fmt.Sprintf("/// <reference types=%q />", typesEntryFor(pkg, typesEntries)))
	}
	for _, lib := range slices.Sorted(maps.Keys(state.libs)) {
		if !strings.HasPrefix(lib, "es") && !strings.HasPrefix(lib, "decorators") {
			lines = append(lines, fmt.Sprintf("/// <reference lib=%q />", lib))
		}
	}
	return lines
}

// typesEntryFor is the tsconfig `types` entry that loads pkg (`vite/client` for vite), else the name pkg loads by.
func typesEntryFor(pkg string, typesEntries []string) string {
	for _, entry := range typesEntries {
		parts := strings.Split(entry, "/")
		root := parts[0]
		if strings.HasPrefix(entry, "@") && len(parts) > 1 {
			root = parts[0] + "/" + parts[1]
		}
		if pkg == root || pkg == "@types/"+strings.ReplaceAll(strings.TrimPrefix(root, "@"), "/", "__") {
			return entry
		}
	}
	return typesReference(pkg)
}

// typesReference is the `types` name a package loads by: `@types/node` → `node`, `@types/a__b` → `@a/b`.
func typesReference(pkg string) string {
	name, ok := strings.CutPrefix(pkg, "@types/")
	if !ok {
		return pkg
	}
	if scope, rest, scoped := strings.Cut(name, "__"); scoped {
		return "@" + scope + "/" + rest
	}
	return name
}
