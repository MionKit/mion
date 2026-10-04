package convert_test

import (
	"maps"
	"slices"
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/runtype"
	"github.com/mionkit/mion/ts-go-runtypes/internal/convert"
)

// printDecls prints each named declaration of main.ts through the declaration printer into one standalone file.
func printDecls(t *testing.T, source string, names ...string) string {
	t.Helper()
	return printDeclsIn(t, map[string]string{"main.ts": source}, names...)
}

// printDeclsIn is printDecls over a full sources map; main.ts holds the declarations.
func printDeclsIn(t *testing.T, sources map[string]string, names ...string) string {
	t.Helper()
	prog, session, cwd := setupConvert(t, sources)
	defer session.Close()
	sourceFile := prog.SourceFile(tspath.ResolvePath(cwd, "main.ts"))
	typeChecker := session.Checker()
	printer := convert.NewDeclPrinter(session.Cache().NodeByID)
	exprs := map[string]string{}
	for _, statement := range sourceFile.Statements.Nodes {
		if statement.Kind != ast.KindTypeAliasDeclaration {
			continue
		}
		name := statement.Name().Text()
		if !slices.Contains(names, name) {
			continue
		}
		symbol := typeChecker.GetSymbolAtLocation(statement.Name())
		node := session.Cache().SerializeTopLevel(checker.Checker_getDeclaredTypeOfSymbol(typeChecker, symbol))
		text, err := printer.TypeToString(node)
		if err != nil {
			t.Fatalf("print %s: %v", name, err)
		}
		exprs[name] = text
	}
	taken := map[string]bool{}
	for _, name := range names {
		taken[name] = true
	}
	placed := convert.LayoutDecls(printer.Decls(), taken)
	spellings := map[string]string{}
	for _, entry := range placed {
		spellings[entry.Decl.Key] = entry.Spelling
	}
	spell := func(key string) string {
		if spelling, ok := spellings[key]; ok {
			return spelling
		}
		return printer.Decl(key).Name
	}
	lines := printer.FormatImports()
	for _, entry := range placed {
		lines = append(lines, convert.ReplaceDeclRefs(entry.Statement, spell))
	}
	for _, name := range names {
		lines = append(lines, "export type "+name+" = "+convert.ReplaceDeclRefs(exprs[name], spell)+";")
	}
	return strings.Join(lines, "\n") + "\n"
}

// assertDeclIDs: every printed declaration resolves to the id of the original it was printed from.
func assertDeclIDs(t *testing.T, source string, names ...string) string {
	t.Helper()
	return assertDeclIDsIn(t, map[string]string{"main.ts": source}, names...)
}

// assertDeclIDsIn is assertDeclIDs over a full sources map, the printed main.ts beside the same other files.
func assertDeclIDsIn(t *testing.T, sources map[string]string, names ...string) string {
	t.Helper()
	printed := printDeclsIn(t, sources, names...)
	withPrinted := maps.Clone(sources)
	withPrinted["main.ts"] = printed
	original := declIDsIn(t, sources)
	again := declIDsIn(t, withPrinted)
	for _, name := range names {
		if original[name] == "" || original[name] != again[name] {
			t.Errorf("%s: printed id %q, original %q\n%s", name, again[name], original[name], printed)
		}
	}
	return printed
}

func TestDeclPrinter_ClassKeepsItsIDWithMembersMethodsAndPrivateFields(t *testing.T) {
	printed := assertDeclIDs(t, `export declare class Money {
  #private;
  private hidden;
  private readonly sealed;
  protected cents: number;
  amount: number;
  readonly currency: string;
  get rounded(): number;
  get label(): string; set label(value: string);
  add(other: Money): Money;
  map<T>(fn: (value: number) => T): T[];
  onChange: (value: number) => void;
  maybe?(): void;
  static zero(): Money;
}
export type Wallet = {main: Money; history: Money[]};
`, "Wallet")
	if !strings.Contains(printed, "export declare class Money") || !strings.Contains(printed, "#private;") {
		t.Errorf("the class must print by its own name with its private marker:\n%s", printed)
	}
}

func TestDeclPrinter_InheritedMembersFlattenIntoTheClass(t *testing.T) {
	assertDeclIDs(t, `export declare class Base { id: string; touch(at: Date): void }
export declare class Item extends Base { name: string }
export type Holder = {item: Item};
`, "Holder")
}

func TestDeclPrinter_ErrorSubclassKeepsItsGuardedMembers(t *testing.T) {
	assertDeclIDs(t, `export declare class AppError extends Error { code: number }
export type Failure = {error: AppError};
`, "Failure")
}

func TestDeclPrinter_EnumsAndEnumMembers(t *testing.T) {
	printed := assertDeclIDs(t, `export enum Role { Admin = 'admin', User = 'user' }
export enum Level { Low, High = 5 }
export type Access = {role: Role; level: Level; admin: Role.Admin};
`, "Access")
	if !strings.Contains(printed, "export declare enum Role") {
		t.Errorf("the enum must print by its own name:\n%s", printed)
	}
}

func TestDeclPrinter_UniqueSymbolKeysAndWellKnownSymbols(t *testing.T) {
	printed := assertDeclIDs(t, `declare const brand: unique symbol;
export type UserId = string & {[brand]: 'UserId'};
export interface Bag { [Symbol.iterator](): Iterator<number>; size: number }
export type Holder = {id: UserId; bag: Bag};
`, "Holder")
	if !strings.Contains(printed, "declare const brand: unique symbol;") {
		t.Errorf("a symbol key must declare its symbol under the same name:\n%s", printed)
	}
}

func TestDeclPrinter_RecursiveShapesPrintAsNamedAliases(t *testing.T) {
	assertDeclIDs(t, `export interface TreeNode { value: string; children: TreeNode[]; parent?: TreeNode }
export type Json = string | number | boolean | null | Json[] | {[key: string]: Json};
export type Holder = {tree: TreeNode; json: Json};
`, "Holder")
}

// TestDeclPrinter_AMutualCycleKeepsItsIDsFromEitherEnd: the serializer flags whichever end it met first, and either flag closes the cycle.
func TestDeclPrinter_AMutualCycleKeepsItsIDsFromEitherEnd(t *testing.T) {
	assertDeclIDs(t, `export interface Order { lines: Line[] }
export interface Line { order: Order; sku: string }
export type FromOrder = {order: Order};
`, "FromOrder")
	assertDeclIDs(t, `export interface Order { lines: Line[] }
export interface Line { order: Order; sku: string }
export type FromLine = {line: Line};
`, "FromLine")
}

func TestDeclPrinter_GenericsPrintTheirInstantiation(t *testing.T) {
	assertDeclIDs(t, `export interface Page<T> { items: T[]; total: number; first(): T | undefined }
export declare class Box<T> { value: T; get<K>(key: K): T }
export type Holder = {users: Page<{id: string}>; box: Box<number>; other: Box<string>};
`, "Holder")
}

func TestDeclPrinter_NonEnumerableMembers(t *testing.T) {
	assertDeclIDs(t, `export interface Meta {
  /** @nonEnumerable */
  cached?: string;
  name: string;
}
export type Holder = {meta: Meta};
`, "Holder")
}

func TestDeclPrinter_NativesFormatsTuplesAndFunctions(t *testing.T) {
	printed := assertDeclIDs(t, `import type * as TF from '@mionjs/run-types/formats';
export interface Event {
  at: Date;
  tags: Set<string>;
  scores: Map<string, number>;
  link: URL;
  email: TF.Email;
  pair: readonly [name: string, count?: number];
  handler: (input: string, ...rest: number[]) => Promise<boolean>;
  data: Uint8Array;
  [key: string]: unknown;
}
export type Holder = {event: Event};
`, "Holder")
	if !strings.Contains(printed, "import type { TypeFormat } from '@mionjs/run-types';") {
		t.Errorf("a format brand needs its import:\n%s", printed)
	}
}

// TestDeclPrinter_ARefusedClassBodyRefusesEveryUse: a class whose body cannot print is never left as an empty declaration.
func TestDeclPrinter_ARefusedClassBodyRefusesEveryUse(t *testing.T) {
	prog, session, cwd := setupConvert(t, map[string]string{"main.ts": `import type {TypeFormat} from '@mionjs/run-types';
export declare class Odd { value: TypeFormat<string, 'notAFormat', {}> }
export type First = {odd: Odd};
export type Second = {again: Odd};
`})
	defer session.Close()
	sourceFile := prog.SourceFile(tspath.ResolvePath(cwd, "main.ts"))
	printer := convert.NewDeclPrinter(session.Cache().NodeByID)
	for _, statement := range sourceFile.Statements.Nodes {
		if statement.Kind != ast.KindTypeAliasDeclaration {
			continue
		}
		symbol := session.Checker().GetSymbolAtLocation(statement.Name())
		node := session.Cache().SerializeTopLevel(checker.Checker_getDeclaredTypeOfSymbol(session.Checker(), symbol))
		if text, err := printer.TypeToString(node); err == nil {
			t.Errorf("%s must refuse like the first use, printed %q", statement.Name().Text(), text)
		}
	}
	if decls := printer.Decls(); len(decls) != 0 {
		t.Errorf("a refused class leaves no declaration, got %+v", decls[0])
	}
}

// TestDeclPrinter_TheCacheKeepsCheckerTypesOnlyWhenAsked: a build's cache never pins checker types past a program swap.
func TestDeclPrinter_TheCacheKeepsCheckerTypesOnlyWhenAsked(t *testing.T) {
	prog, session, cwd := setupConvert(t, map[string]string{"main.ts": "export type H = {a: string};\n"})
	defer session.Close()
	statement := prog.SourceFile(tspath.ResolvePath(cwd, "main.ts")).Statements.Nodes[0]
	tsType := checker.Checker_getDeclaredTypeOfSymbol(session.Checker(), session.Checker().GetSymbolAtLocation(statement.Name()))
	plain := runtype.NewCache(session.Checker(), runtype.Options{})
	if plain.TypeByID(plain.AssignID(tsType)) != nil {
		t.Errorf("a cache that did not ask keeps no checker type")
	}
	keeping := runtype.NewCache(session.Checker(), runtype.Options{})
	keeping.KeepTypes()
	id := keeping.AssignID(tsType)
	if keeping.TypeByID(id) != tsType {
		t.Errorf("a cache that asked keeps the type behind each id")
	}
	keeping.Rebind(session.Checker())
	if keeping.TypeByID(id) != nil {
		t.Errorf("a program swap drops the kept types")
	}
}

func TestDeclPrinter_AbstractClassesAndClassIndexSignatures(t *testing.T) {
	printed := assertDeclIDs(t, `export declare abstract class Shape {
  [key: string]: unknown;
  readonly [index: number]: string;
  abstract area(): number;
  name: string;
}
export declare class Square extends Shape { area(): number; side: number }
export type Holder = {shape: Shape; square: Square};
`, "Holder")
	assertContainsAll(t, printed, "export declare abstract class Shape", "readonly [key: number]: string;", "abstract area(): number;")
}

func assertContainsAll(t *testing.T, text string, wanted ...string) {
	t.Helper()
	for _, fragment := range wanted {
		if !strings.Contains(text, fragment) {
			t.Errorf("missing %q in:\n%s", fragment, text)
		}
	}
}

// TestDeclPrinter_LayoutKeepsTheNamesTheFileAlreadyBinds: a printed class named like a format import moves into a namespace.
func TestDeclPrinter_LayoutKeepsTheNamesTheFileAlreadyBinds(t *testing.T) {
	placed := convert.LayoutDecls([]*convert.PrintedDecl{{Key: "c:1", Kind: convert.DeclClass, Name: "TF", Body: "{}"}}, map[string]bool{"TF": true})
	if len(placed) != 1 || placed[0].Spelling != "TF$2.TF" || !strings.Contains(placed[0].Statement, "namespace TF$2") {
		t.Errorf("got %+v", placed)
	}
}
