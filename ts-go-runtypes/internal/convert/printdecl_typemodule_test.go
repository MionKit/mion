package convert_test

import (
	"slices"
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/convert"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// typeModules prints the named aliases of main.ts and every module they reach, keyed by type id, placeholders as T_<id>.
func typeModules(t *testing.T, source string, names ...string) (roots map[string]string, modules map[string]string) {
	t.Helper()
	prog, session, cwd := setupConvert(t, map[string]string{"main.ts": source})
	defer session.Close()
	sourceFile := prog.SourceFile(tspath.ResolvePath(cwd, "main.ts"))
	typeChecker := session.Checker()
	printer := convert.NewTypeModulePrinter(session.Cache().NodeByID)
	spell := func(key string) string {
		id, ok := convert.TypeModuleID(key)
		if !ok {
			t.Fatalf("unexpected placeholder %q", key)
		}
		return "T_" + id
	}
	roots, modules = map[string]string{}, map[string]string{}
	var queue []*reflection.RunType
	for _, statement := range sourceFile.Statements.Nodes {
		if statement.Kind != ast.KindTypeAliasDeclaration || !slices.Contains(names, statement.Name().Text()) {
			continue
		}
		symbol := typeChecker.GetSymbolAtLocation(statement.Name())
		node := session.Cache().SerializeTopLevel(checker.Checker_getDeclaredTypeOfSymbol(typeChecker, symbol))
		roots[statement.Name().Text()] = node.ID
		queue = append(queue, node)
	}
	for len(queue) > 0 {
		node := queue[0]
		queue = queue[1:]
		if _, done := modules[node.ID]; done {
			continue
		}
		text, _, err := printer.TypeModuleText(node)
		if err != nil {
			t.Fatalf("print %s: %v", node.ID, err)
		}
		modules[node.ID] = convert.ReplaceDeclRefs(text, spell)
		for _, key := range convert.DeclRefKeys(text) {
			id, _ := convert.TypeModuleID(key)
			queue = append(queue, session.Cache().NodeByID(id))
		}
	}
	return roots, modules
}

const typeModuleSource = `
export interface Address { street: string; zip: number; tags?: string[] }
export class Account { constructor(public id: number, public opened: Date, private secret: string) {} close(): void {} }
export enum Role { Admin = 'admin', User = 'user' }
export interface User {
  id: number; name: string; email?: string; createdAt: Date; address: Address; account: Account; role: Role;
  lookup: Map<string, Address>; greet(): string; onClick: () => void; [Symbol.iterator]: () => Iterator<number>;
}
export interface TreeNode { value: string; children: TreeNode[] }
export type U = User; export type A = Address; export type T = TreeNode; export type R = Role; export type C = Account;
`

func TestTypeModulePrinter_ChildrenAreReferences(t *testing.T) {
	roots, modules := typeModules(t, typeModuleSource, "U", "A")
	user, address := modules[roots["U"]], roots["A"]
	if strings.Count(user, "T_"+address) != 2 {
		t.Errorf("Address should print once, referenced twice from User:\n%s", user)
	}
	if strings.Contains(user, "street") {
		t.Errorf("a child's members leaked into its parent:\n%s", user)
	}
	if !strings.Contains(user, "createdAt: Date") || !strings.Contains(user, "lookup: Map<string, T_"+address+">") {
		t.Errorf("platform classes should print inline:\n%s", user)
	}
	if got := modules[address]; got != "{street: string; tags?: T_"+idOfArray(t, modules, "string")+"; zip: number}" {
		t.Errorf("Address module = %q", got)
	}
}

func TestTypeModulePrinter_DataOnly(t *testing.T) {
	roots, modules := typeModules(t, typeModuleSource, "U", "R", "C")
	user := modules[roots["U"]]
	for _, dropped := range []string{"greet", "onClick", "Symbol", "iterator"} {
		if strings.Contains(user, dropped) {
			t.Errorf("non-data member %q printed:\n%s", dropped, user)
		}
	}
	if got := modules[roots["R"]]; got != "'admin' | 'user'" {
		t.Errorf("enum module = %q, want its value union", got)
	}
	if got := modules[roots["C"]]; got != "{id: number; opened: Date}" {
		t.Errorf("class module = %q, want its public data members", got)
	}
}

func TestTypeModulePrinter_RecursionClosesThroughAReference(t *testing.T) {
	roots, modules := typeModules(t, typeModuleSource, "T")
	tree := roots["T"]
	children := ""
	for id, text := range modules {
		if text == "T_"+tree+"[]" {
			children = id
		}
	}
	if children == "" || modules[tree] != "{children: T_"+children+"; value: string}" {
		t.Errorf("recursive modules:\n%v", modules)
	}
}

// idOfArray finds the module printing `<item>[]`.
func idOfArray(t *testing.T, modules map[string]string, item string) string {
	t.Helper()
	for id, text := range modules {
		if text == item+"[]" {
			return id
		}
	}
	t.Fatalf("no %s[] module in %v", item, modules)
	return ""
}
