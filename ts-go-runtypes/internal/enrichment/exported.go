package enrichment

import "github.com/microsoft/typescript-go/shim/ast"

// ExportedTypeNames returns the exported top-level type names of sourceFile, in declaration order, deduplicated.
// OpEnrich intersects them with the demanded type names, since a RunType carries no declaration file to map a name back to.
// The declaration kinds mirror findTypeNameNode's set plus enum.
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
