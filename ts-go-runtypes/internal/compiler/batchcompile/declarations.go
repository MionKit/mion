package batchcompile

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/compiler"
	"github.com/microsoft/typescript-go/shim/core"
	"github.com/microsoft/typescript-go/shim/parser"
	"github.com/microsoft/typescript-go/shim/scanner"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/sourcerewrite"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// The .d.ts lane. tsc writes a `private` member as `private name;` with its type erased, which a consumer could only
// read as `any` (MKR016), so each member is written as `protected` instead: that keeps the type and the imports it
// uses, keeps the class nominal, and stays unreadable from outside. A member whose `protected` form fails the emit or
// needs a module the plain .d.ts did not, and the package does not depend on, stays `private`.

// memberKey names one class member across the source and the emitted .d.ts.
type memberKey struct {
	file, className, memberName string
}

// privateSplice is one `private` keyword the declaration emit writes as `protected`.
type privateSplice struct {
	key         memberKey
	replacement protocol.Replacement
}

// declarationPass is one declaration emit: its outputs per source file, and each spliced file's map back to the original.
type declarationPass struct {
	outputs     map[string]map[string]string
	maps        map[string]*protocol.SourceMap
	diagnostics []*ast.Diagnostic
	skipped     bool
}

// emitDeclarationFiles writes the .d.ts files: the source as written plus the quoted-value splices (valueSplices), then
// the `protected` rewrite on top for every member it does not break. It returns each spliced file's map back to the
// original, keyed by absolute path, so a .d.ts.map still points at the source as written.
func emitDeclarationFiles(cwd, tsconfigPath string, original *program.Program, valueSplices []protocol.Replacement, writeFile compiler.WriteFile) (map[string]*protocol.SourceMap, error) {
	// What tsc would write: the user's own errors, isolatedDeclarations included, come from here with true positions.
	chosen, err := emitDeclarationPass(cwd, tsconfigPath, original, valueSplices, nil)
	if err != nil {
		return nil, err
	}
	if chosen.skipped {
		return nil, emitSkipped("declaration emit", &compiler.EmitResult{EmitSkipped: true, Diagnostics: chosen.diagnostics}, cwd)
	}
	baseline := chosen
	privates := privateToProtectedSplices(cwd, original)
	// isolatedDeclarations exempts a private member from a written type but not a protected one; the baseline already
	// checked the source as written.
	var overrides *core.CompilerOptions
	if original.TS.Options().IsolatedDeclarations.IsTrue() {
		overrides = &core.CompilerOptions{IsolatedDeclarations: core.TSFalse}
	}
	dependencies := runtimeDependencies(cwd)
	// Each round keeps the pass or drops at least one splice, so it ends.
	for len(privates) > 0 {
		splices := append([]protocol.Replacement(nil), valueSplices...)
		for _, private := range privates {
			splices = append(splices, private.replacement)
		}
		pass, err := emitDeclarationPass(cwd, tsconfigPath, original, splices, overrides)
		if err != nil {
			return nil, err
		}
		var failing map[memberKey]bool
		if pass.skipped {
			// An error no rewritten member explains is not the rewrite's to fix: the baseline stands.
			if failing = membersHitBy(cwd, pass.diagnostics); !anyKept(privates, failing) {
				break
			}
		} else if failing = membersNeedingNewModules(baseline, pass, dependencies); !anyKept(privates, failing) {
			chosen = pass
			break
		}
		kept := privates[:0]
		for _, private := range privates {
			if !failing[private.key] {
				kept = append(kept, private)
			}
		}
		privates = kept
	}
	for _, outputs := range chosen.outputs {
		for outPath, text := range outputs {
			if err := writeFile(outPath, text, nil); err != nil {
				return nil, err
			}
		}
	}
	return chosen.maps, nil
}

// emitDeclarationPass emits every user file's .d.ts from the source plus splices, one file at a time so each output
// is known by its source.
func emitDeclarationPass(cwd, tsconfigPath string, original *program.Program, splices []protocol.Replacement, overrides *core.CompilerOptions) (*declarationPass, error) {
	// Keyed by absolute path: the splice sources may spell one file differently, and each overlay entry replaces the file.
	byFile := map[string][]protocol.Replacement{}
	for _, splice := range splices {
		abs := absOf(cwd, splice.File)
		byFile[abs] = append(byFile[abs], splice)
	}
	pass := &declarationPass{outputs: map[string]map[string]string{}, maps: map[string]*protocol.SourceMap{}}
	overlay := make(map[string]string, len(byFile))
	for abs, fileSplices := range byFile {
		sourceFile := original.SourceFile(abs)
		if sourceFile == nil {
			continue
		}
		text, sourceMap := sourcerewrite.Apply(abs, sourceFile.Text(), nil, fileSplices)
		overlay[abs] = text
		if sourceMap != nil {
			pass.maps[abs] = sourceMap
		}
	}
	// Nothing to splice: the first program is the source as written, and it is already checked.
	declarations := original
	if len(overlay) > 0 {
		var err error
		if declarations, err = program.New(program.Options{Cwd: cwd, TsconfigPath: tsconfigPath, Overlay: overlay, Overrides: overrides}); err != nil {
			return nil, fmt.Errorf("compile: declaration program: %w", err)
		}
	}
	for _, sourceFile := range userSourceFiles(declarations) {
		abs := absOf(cwd, sourceFile.FileName())
		outputs := map[string]string{}
		writeFile := func(fileName, text string, _ *compiler.WriteFileData) error {
			outputs[fileName] = text
			return nil
		}
		result := declarations.TS.Emit(context.Background(), compiler.EmitOptions{TargetSourceFile: sourceFile, EmitOnly: compiler.EmitOnlyDts, WriteFile: writeFile})
		pass.outputs[abs] = outputs
		if result != nil {
			pass.diagnostics = append(pass.diagnostics, result.Diagnostics...)
			pass.skipped = pass.skipped || result.EmitSkipped
		}
	}
	return pass, nil
}

func userSourceFiles(prog *program.Program) []*ast.SourceFile {
	var files []*ast.SourceFile
	for _, sourceFile := range prog.TS.SourceFiles() {
		if sourceFile != nil && !sourceFile.IsDeclarationFile && !prog.TS.IsSourceFileFromExternalLibrary(sourceFile) {
			files = append(files, sourceFile)
		}
	}
	return files
}

// privateToProtectedSplices returns one splice per `private` keyword of a field, method, accessor or constructor
// parameter property. A `private constructor` stays: it erases nothing.
func privateToProtectedSplices(cwd string, original *program.Program) []privateSplice {
	var out []privateSplice
	for _, sourceFile := range userSourceFiles(original) {
		abs := absOf(cwd, sourceFile.FileName())
		eachClassMember(sourceFile, func(className string, member *ast.Node) {
			if keyword := privateModifier(member); keyword != nil {
				start := scanner.GetTokenPosOfNode(keyword, sourceFile, false)
				out = append(out, privateSplice{
					key:         memberKey{abs, className, memberName(member)},
					replacement: protocol.Replacement{File: sourceFile.FileName(), Start: start, End: keyword.End(), Text: "protected"},
				})
			}
		})
	}
	return out
}

// eachClassMember visits every field, method and accessor of every class in a file, and each constructor parameter
// property, which a .d.ts writes as a field.
func eachClassMember(sourceFile *ast.SourceFile, visit func(className string, member *ast.Node)) {
	var walk func(node *ast.Node) bool
	walk = func(node *ast.Node) bool {
		if ast.IsClassLike(node) {
			className := ""
			if name := node.Name(); name != nil && name.Kind == ast.KindIdentifier {
				className = name.Text()
			}
			for _, member := range node.Members() {
				switch member.Kind {
				case ast.KindPropertyDeclaration, ast.KindMethodDeclaration, ast.KindGetAccessor, ast.KindSetAccessor:
					visit(className, member)
				case ast.KindConstructor:
					for _, parameter := range member.Parameters() {
						visit(className, parameter)
					}
				}
			}
		}
		node.ForEachChild(walk)
		return false
	}
	sourceFile.AsNode().ForEachChild(walk)
}

func privateModifier(node *ast.Node) *ast.Node {
	for _, modifier := range node.ModifierNodes() {
		if modifier.Kind == ast.KindPrivateKeyword {
			return modifier
		}
	}
	return nil
}

func memberName(member *ast.Node) string {
	if name := member.Name(); name != nil && name.Kind == ast.KindIdentifier {
		return name.Text()
	}
	return ""
}

func anyKept(privates []privateSplice, failing map[memberKey]bool) bool {
	for _, private := range privates {
		if failing[private.key] {
			return true
		}
	}
	return false
}

// membersHitBy names the class members the declaration diagnostics point into.
func membersHitBy(cwd string, diagnostics []*ast.Diagnostic) map[memberKey]bool {
	hit := map[memberKey]bool{}
	for _, diagnostic := range diagnostics {
		sourceFile := diagnostic.File()
		if sourceFile == nil {
			continue
		}
		abs := absOf(cwd, sourceFile.FileName())
		eachClassMember(sourceFile, func(className string, member *ast.Node) {
			if diagnostic.Pos() >= member.Pos() && diagnostic.Pos() < member.End() {
				hit[memberKey{abs, className, memberName(member)}] = true
			}
		})
	}
	return hit
}

// membersNeedingNewModules names the members whose `protected` form makes a .d.ts reference a module the plain one did
// not, which a consumer of the package would then need: a relative file or a runtime dependency is fine.
func membersNeedingNewModules(baseline, pass *declarationPass, dependencies map[string]bool) map[memberKey]bool {
	failing := map[memberKey]bool{}
	for abs, outputs := range pass.outputs {
		for outPath, text := range outputs {
			if !strings.HasSuffix(outPath, ".d.ts") {
				continue
			}
			emitted := parseDeclaration(outPath, text)
			before := moduleReferences(parseDeclaration(outPath, baseline.outputs[abs][outPath]))
			fresh := map[string]bool{}
			for module := range moduleReferences(emitted) {
				if !before[module] && !providedTo(module, dependencies) {
					fresh[module] = true
				}
			}
			if len(fresh) == 0 {
				continue
			}
			names, everyMember := namesFrom(emitted, fresh)
			eachClassMember(emitted, func(className string, member *ast.Node) {
				if everyMember || referencesAny(member, names, fresh) {
					failing[memberKey{abs, className, memberName(member)}] = true
				}
			})
		}
	}
	return failing
}

func parseDeclaration(fileName, text string) *ast.SourceFile {
	return parser.ParseSourceFile(ast.SourceFileParseOptions{FileName: fileName, Path: tspath.Path(fileName)}, text, core.ScriptKindTS)
}

// typesPrefix marks a `/// <reference types>` name among module specifiers.
const typesPrefix = "types:"

// moduleReferences lists every module a .d.ts names: imports, re-exports, `import("x")` types and reference types.
func moduleReferences(sourceFile *ast.SourceFile) map[string]bool {
	modules := map[string]bool{}
	for _, reference := range sourceFile.TypeReferenceDirectives {
		modules[typesPrefix+reference.FileName] = true
	}
	var walk func(node *ast.Node) bool
	walk = func(node *ast.Node) bool {
		if module := moduleOf(node); module != "" {
			modules[module] = true
		}
		node.ForEachChild(walk)
		return false
	}
	sourceFile.AsNode().ForEachChild(walk)
	return modules
}

func moduleOf(node *ast.Node) string {
	switch node.Kind {
	case ast.KindImportDeclaration, ast.KindExportDeclaration:
		if specifier := node.ModuleSpecifier(); specifier != nil && specifier.Kind == ast.KindStringLiteral {
			return specifier.Text()
		}
	case ast.KindImportType:
		if argument := node.AsImportTypeNode().Argument; argument != nil && argument.Kind == ast.KindLiteralType {
			if literal := argument.AsLiteralTypeNode().Literal; literal != nil && literal.Kind == ast.KindStringLiteral {
				return literal.Text()
			}
		}
	}
	return ""
}

// namesFrom collects the local names the imports of the given modules bind. A new reference-types directive binds no
// name a member could be traced by, so it marks every member.
func namesFrom(sourceFile *ast.SourceFile, modules map[string]bool) (map[string]bool, bool) {
	names := map[string]bool{}
	everyMember := false
	for module := range modules {
		if strings.HasPrefix(module, typesPrefix) {
			everyMember = true
		}
	}
	for _, statement := range sourceFile.Statements.Nodes {
		if statement.Kind != ast.KindImportDeclaration || !modules[moduleOf(statement)] {
			continue
		}
		if clause := statement.ImportClause(); clause != nil {
			collectIdentifiers(clause, names)
		}
	}
	return names, everyMember
}

func collectIdentifiers(node *ast.Node, names map[string]bool) {
	if node.Kind == ast.KindIdentifier {
		names[node.Text()] = true
	}
	node.ForEachChild(func(child *ast.Node) bool {
		collectIdentifiers(child, names)
		return false
	})
}

func referencesAny(member *ast.Node, names, modules map[string]bool) bool {
	found := false
	var walk func(node *ast.Node) bool
	walk = func(node *ast.Node) bool {
		if (node.Kind == ast.KindIdentifier && names[node.Text()]) || modules[moduleOf(node)] {
			found = true
		}
		return found || node.ForEachChild(walk)
	}
	member.ForEachChild(walk)
	return found
}

// providedTo reports whether a consumer of the package gets the module with it: a relative file, or a runtime
// dependency (dependencies, peerDependencies, optionalDependencies), its @types twin included.
func providedTo(module string, dependencies map[string]bool) bool {
	if strings.HasPrefix(module, ".") || strings.HasPrefix(module, "/") {
		return true
	}
	if name, isTypes := strings.CutPrefix(module, typesPrefix); isTypes {
		return dependencies[name] || dependencies["@types/"+name]
	}
	name := strings.TrimPrefix(module, "node:")
	if name != module {
		return dependencies["@types/node"]
	}
	parts := strings.SplitN(name, "/", 3)
	if strings.HasPrefix(name, "@") && len(parts) > 1 {
		name = parts[0] + "/" + parts[1]
	} else {
		name = parts[0]
	}
	return dependencies[name] || dependencies["@types/"+name]
}

// runtimeDependencies reads the nearest package.json at or above cwd; none means no dependency is assumed.
func runtimeDependencies(cwd string) map[string]bool {
	dependencies := map[string]bool{}
	for dir := cwd; ; dir = filepath.Dir(dir) {
		content, err := os.ReadFile(filepath.Join(dir, "package.json"))
		if err == nil {
			var manifest map[string]json.RawMessage
			if json.Unmarshal(content, &manifest) == nil {
				for _, field := range []string{"dependencies", "peerDependencies", "optionalDependencies"} {
					var listed map[string]string
					if json.Unmarshal(manifest[field], &listed) == nil {
						for name := range listed {
							dependencies[name] = true
						}
					}
				}
			}
			return dependencies
		}
		if parent := filepath.Dir(dir); parent == dir {
			return dependencies
		}
	}
}
