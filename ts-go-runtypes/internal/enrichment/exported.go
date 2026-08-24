package enrichment

import "github.com/microsoft/typescript-go/shim/ast"

// ExportedTypeNames returns the names of every EXPORTED type-alias, interface,
// class, and enum declared at the top level of sourceFile, in declaration order
// (deduplicated). It is the plugin-sync mapping primitive: a RunType carries no
// declaration-file field, so the OpEnrich daemon op cannot map a demanded type
// NAME back to the file that declares it. Instead it walks each candidate source
// file's exported declarations here and intersects them with the session's
// demanded type names — enriching exactly the types a file both declares and a
// marker call actually requested, with no clutter for undemanded types.
//
// It mirrors findTypeNameNode's declaration-kind set (alias / interface / class)
// plus enum, and gates on the syntactic `export` modifier the same way
// GetCombinedModifierFlags does elsewhere in the tree.
func ExportedTypeNames(sourceFile *ast.SourceFile) []string {
	if sourceFile == nil {
		return nil
	}
	root := sourceFile.AsNode()
	if root == nil {
		return nil
	}
	var names []string
	seen := map[string]bool{}
	for _, statement := range root.Statements() {
		if statement == nil {
			continue
		}
		switch {
		case ast.IsTypeAliasDeclaration(statement),
			ast.IsInterfaceDeclaration(statement),
			ast.IsClassDeclaration(statement),
			ast.IsEnumDeclaration(statement):
		default:
			continue
		}
		if ast.GetCombinedModifierFlags(statement)&ast.ModifierFlagsExport == 0 {
			continue
		}
		nameNode := statement.Name()
		if nameNode == nil {
			continue
		}
		name := nameNode.Text()
		if name == "" || seen[name] {
			continue
		}
		seen[name] = true
		names = append(names, name)
	}
	return names
}
