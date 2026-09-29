package resolver_test

// The removeUnknownKeys rules through the real scan, each at the root and one object deeper, in paired call shapes.

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

const rukImport = "import {createRemoveUnknownKeysFn} from '@mionjs/run-types';\n"

// rukScan scans one file and returns the response with every rendered entry module.
func rukScan(t *testing.T, source string) protocol.Response {
	t.Helper()
	resolver := setupInline(t, map[string]string{"site.ts": rukImport + source})
	response := resolver.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"site.ts"}, IncludeEntryModules: true})
	if response.Error != "" {
		t.Fatalf("scan: %s", response.Error)
	}
	return response
}

func hasCode(response protocol.Response, code string) bool {
	for _, diagnostic := range response.Diagnostics {
		if diagnostic.Code == code {
			return true
		}
	}
	return false
}

func expectCode(t *testing.T, response protocol.Response, code string) {
	t.Helper()
	if !hasCode(response, code) {
		t.Errorf("expected %s, got %v", code, codesOf(response))
	}
}

func expectNoCode(t *testing.T, response protocol.Response, code string) {
	t.Helper()
	if hasCode(response, code) {
		t.Errorf("unexpected %s, got %v", code, codesOf(response))
	}
}

func expectSource(t *testing.T, response protocol.Response, fragment string) {
	t.Helper()
	if sources := allEntrySources(response); !strings.Contains(sources, fragment) {
		t.Errorf("generated code lacks %q:\n%s", fragment, sources)
	}
}

// ---- symbol-keyed members under a [k: symbol] signature ---------------------------------------------------

const symbolBagSame = `const tag = Symbol('tag');
export interface Bag { name: string; [k: symbol]: {n: number}; [tag]: {n: number} }
`

const symbolBagWider = `const tag = Symbol('tag');
export interface Bag { name: string; [k: symbol]: {n: number}; [tag]: {n: number; m: string} }
`

func TestRemoveUnknownKeys_SymbolMemberSameTypeAsSignature_Static(t *testing.T) {
	response := rukScan(t, symbolBagSame+"export const strip = createRemoveUnknownKeysFn<Bag>();\n")
	expectNoCode(t, response, diagnostics.CodeRUKSymbolKeyedMember)
	expectSource(t, response, "Object.getOwnPropertySymbols(v)")
}

func TestRemoveUnknownKeys_SymbolMemberSameTypeAsSignature_Value(t *testing.T) {
	response := rukScan(t, symbolBagSame+"declare const bag: Bag;\nexport const strip = createRemoveUnknownKeysFn(bag);\n")
	expectNoCode(t, response, diagnostics.CodeRUKSymbolKeyedMember)
	expectSource(t, response, "Object.getOwnPropertySymbols(v)")
}

// The signature's value type would drop `m`, so a wider named member refuses instead.
func TestRemoveUnknownKeys_SymbolMemberWiderThanSignature_Static(t *testing.T) {
	response := rukScan(t, symbolBagWider+"export const strip = createRemoveUnknownKeysFn<Bag>();\n")
	expectCode(t, response, diagnostics.CodeRUKSymbolKeyedMember)
}

func TestRemoveUnknownKeys_SymbolMemberWiderThanSignature_Value(t *testing.T) {
	response := rukScan(t, symbolBagWider+"declare const bag: Bag;\nexport const strip = createRemoveUnknownKeysFn(bag);\n")
	expectCode(t, response, diagnostics.CodeRUKSymbolKeyedMember)
}

func TestRemoveUnknownKeys_SymbolMemberWiderThanSignature_Nested(t *testing.T) {
	response := rukScan(t, symbolBagWider+"export const strip = createRemoveUnknownKeysFn<{bag: Bag}>();\n")
	expectCode(t, response, diagnostics.CodeRUKSymbolKeyedMember)
}

// rukStatic builds `createRemoveUnknownKeysFn<T>(undefined, options)` after decls; rukValue the value-first twin.
func rukStatic(t *testing.T, decls, typ, options string) protocol.Response {
	t.Helper()
	return rukScan(t, decls+"\nexport const strip = createRemoveUnknownKeysFn<"+typ+">(undefined"+options+");\n")
}

func rukValue(t *testing.T, decls, typ, options string) protocol.Response {
	t.Helper()
	return rukScan(t, decls+"\ndeclare const value: "+typ+";\nexport const strip = createRemoveUnknownKeysFn(value"+options+");\n")
}

const shareOption = ", {sharedValues: 'share'}"
const refuseOption = ", {sharedValues: 'refuse'}"

// ---- classes ------------------------------------------------------------------------------------------------

const onlyMethodsClass = `export class OnlyMethods { twice(n: number): number { return n * 2; } }`

func TestRemoveUnknownKeys_MethodOnlyClassKeepsPrototype_Static(t *testing.T) {
	response := rukStatic(t, onlyMethodsClass, "OnlyMethods", "")
	expectSource(t, response, "Object.create(Object.getPrototypeOf(v))")
	expectCode(t, response, diagnostics.CodeRUKMethodDropped)
}

func TestRemoveUnknownKeys_MethodOnlyClassKeepsPrototype_Value(t *testing.T) {
	response := rukValue(t, onlyMethodsClass, "OnlyMethods", "")
	expectSource(t, response, "Object.create(Object.getPrototypeOf(v))")
	expectCode(t, response, diagnostics.CodeRUKMethodDropped)
}

func TestRemoveUnknownKeys_MethodOnlyClassKeepsPrototype_Nested(t *testing.T) {
	expectSource(t, rukStatic(t, onlyMethodsClass, "{inner: OnlyMethods}", ""), "Object.create(Object.getPrototypeOf(")
}

const indexedClass = `export class Scores { [player: string]: number; best = 1; }`

func TestRemoveUnknownKeys_IndexedClassKeepsPrototype_Static(t *testing.T) {
	response := rukStatic(t, indexedClass, "Scores", "")
	expectSource(t, response, "const _r = Object.create(Object.getPrototypeOf(v));for (const ")
}

func TestRemoveUnknownKeys_IndexedClassKeepsPrototype_Value(t *testing.T) {
	expectSource(t, rukValue(t, indexedClass, "Scores", ""), "const _r = Object.create(Object.getPrototypeOf(v));for (const ")
}

func TestRemoveUnknownKeys_IndexedClassKeepsPrototype_Nested(t *testing.T) {
	expectSource(t, rukStatic(t, indexedClass, "{scores: Scores}", ""), "Object.create(Object.getPrototypeOf(")
}

const symbolSigClass = `export class Bag { [key: symbol]: string; name = ''; }`

func TestRemoveUnknownKeys_ClassWithSymbolSignature_Static(t *testing.T) {
	response := rukStatic(t, symbolSigClass, "Bag", "")
	expectSource(t, response, "Object.create(Object.getPrototypeOf(v))")
	expectSource(t, response, "Object.getOwnPropertySymbols(v)")
}

func TestRemoveUnknownKeys_ClassWithSymbolSignature_Value(t *testing.T) {
	expectSource(t, rukValue(t, symbolSigClass, "Bag", ""), "Object.getOwnPropertySymbols(v)")
}

// A getter with a setter stays on the prototype: assigning it on the copy would run the setter.
const accessorClass = `export class Profile { first = ''; get label(): string { return this.first; } set label(value: string) { this.first = value; } }`

func assertAccessorNotAssigned(t *testing.T, response protocol.Response) {
	t.Helper()
	if strings.Contains(allEntrySources(response), "'label'") {
		t.Errorf("the accessor must not be assigned on the copy:\n%s", allEntrySources(response))
	}
	expectCode(t, response, diagnostics.CodeRUKMethodDropped)
}

func TestRemoveUnknownKeys_AccessorNotAssigned_Static(t *testing.T) {
	assertAccessorNotAssigned(t, rukStatic(t, accessorClass, "Profile", ""))
}

func TestRemoveUnknownKeys_AccessorNotAssigned_Value(t *testing.T) {
	assertAccessorNotAssigned(t, rukValue(t, accessorClass, "Profile", ""))
}

func TestRemoveUnknownKeys_AccessorNotAssigned_Nested(t *testing.T) {
	assertAccessorNotAssigned(t, rukStatic(t, accessorClass, "{profile: Profile}", ""))
}

const fieldClass = `export class Widget { id = 1; onChange = (): number => 1; }`

func TestRemoveUnknownKeys_FunctionFieldShared_Static(t *testing.T) {
	response := rukStatic(t, fieldClass, "Widget", "")
	expectSource(t, response, "] = v.onChange;")
	expectCode(t, response, diagnostics.CodeRUKFunctionPropDropped)
}

func TestRemoveUnknownKeys_FunctionFieldShared_Value(t *testing.T) {
	expectSource(t, rukValue(t, fieldClass, "Widget", ""), "] = v.onChange;")
}

func TestRemoveUnknownKeys_FunctionFieldShared_Nested(t *testing.T) {
	expectCode(t, rukStatic(t, fieldClass, "{widget: Widget}", ""), diagnostics.CodeRUKFunctionPropDropped)
}

// ---- symbol keys ----------------------------------------------------------------------------------------------

const symbolMethodClass = `export class Countdown { from = 3; [Symbol.iterator]() { return [3, 2, 1].values(); } }`

func TestRemoveUnknownKeys_SymbolKeyedClassMethodStaysOnPrototype_Static(t *testing.T) {
	response := rukStatic(t, symbolMethodClass, "Countdown", "")
	expectNoCode(t, response, diagnostics.CodeRUKSymbolKeyedMember)
	expectCode(t, response, diagnostics.CodeRUKMethodDropped)
}

func TestRemoveUnknownKeys_SymbolKeyedClassMethodStaysOnPrototype_Value(t *testing.T) {
	expectNoCode(t, rukValue(t, symbolMethodClass, "Countdown", ""), diagnostics.CodeRUKSymbolKeyedMember)
}

const optionalSymbolMember = `const tag = Symbol('tag');
export interface Tagged { id: string; [tag]?: string }`

func TestRemoveUnknownKeys_OptionalSymbolMemberRefused_Static(t *testing.T) {
	expectCode(t, rukStatic(t, optionalSymbolMember, "Tagged", ""), diagnostics.CodeRUKSymbolKeyedMember)
}

func TestRemoveUnknownKeys_OptionalSymbolMemberRefused_Value(t *testing.T) {
	expectCode(t, rukValue(t, optionalSymbolMember, "Tagged", ""), diagnostics.CodeRUKSymbolKeyedMember)
}

// ---- values the copy can only share, per position and per sharedValues mode ---------------------------------------

var sharedPositions = []struct {
	name, typ, warning string
}{
	{"array element", "(() => void)[]", diagnostics.CodeRUKFunctionPropDropped},
	{"tuple element", "[() => void]", diagnostics.CodeRUKFunctionPropDropped},
	{"Map value", "Map<string, () => void>", diagnostics.CodeRUKFunctionPropDropped},
	{"Set value", "Set<RegExp>", diagnostics.CodeRUKNonSerializablePropDrop},
	{"index signature value", "{[key: string]: () => void}", diagnostics.CodeRUKFunctionPropDropped},
	{"union member", "string | (() => void)", diagnostics.CodeRUKFunctionPropDropped},
	{"callable interface root", "{(a: number): string; tag: string}", diagnostics.CodeRUKFunctionPropDropped},
	{"Promise property", "{when: Promise<number>}", diagnostics.CodeRUKNonSerializablePropDrop},
}

func TestRemoveUnknownKeys_SharedValueWarnsByDefault_Static(t *testing.T) {
	for _, position := range sharedPositions {
		t.Run(position.name, func(t *testing.T) {
			response := rukStatic(t, "", position.typ, "")
			expectCode(t, response, position.warning)
			expectNoCode(t, response, diagnostics.CodeRUKSharedRefused)
		})
	}
}

func TestRemoveUnknownKeys_SharedValueWarnsByDefault_Value(t *testing.T) {
	for _, position := range sharedPositions {
		t.Run(position.name, func(t *testing.T) {
			expectCode(t, rukValue(t, "", position.typ, ""), position.warning)
		})
	}
}

func TestRemoveUnknownKeys_SharedValueWarnsByDefault_Nested(t *testing.T) {
	for _, position := range sharedPositions {
		t.Run(position.name, func(t *testing.T) {
			expectCode(t, rukStatic(t, "", "{inner: "+position.typ+"}", ""), position.warning)
		})
	}
}

func TestRemoveUnknownKeys_SharedValueQuietWhenShareAsked_Static(t *testing.T) {
	for _, position := range sharedPositions {
		t.Run(position.name, func(t *testing.T) {
			response := rukStatic(t, "", position.typ, shareOption)
			expectCode(t, response, diagnostics.CodeRUKSharedAsAsked)
			expectNoCode(t, response, position.warning)
		})
	}
}

func TestRemoveUnknownKeys_SharedValueQuietWhenShareAsked_Value(t *testing.T) {
	for _, position := range sharedPositions {
		t.Run(position.name, func(t *testing.T) {
			expectCode(t, rukValue(t, "", position.typ, shareOption), diagnostics.CodeRUKSharedAsAsked)
		})
	}
}

func TestRemoveUnknownKeys_SharedValueQuietWhenShareAsked_Nested(t *testing.T) {
	for _, position := range sharedPositions {
		t.Run(position.name, func(t *testing.T) {
			expectCode(t, rukStatic(t, "", "{inner: "+position.typ+"}", shareOption), diagnostics.CodeRUKSharedAsAsked)
		})
	}
}

func TestRemoveUnknownKeys_SharedValueRefused_Static(t *testing.T) {
	for _, position := range sharedPositions {
		t.Run(position.name, func(t *testing.T) {
			expectCode(t, rukStatic(t, "", position.typ, refuseOption), diagnostics.CodeRUKSharedRefused)
		})
	}
}

func TestRemoveUnknownKeys_SharedValueRefused_Value(t *testing.T) {
	for _, position := range sharedPositions {
		t.Run(position.name, func(t *testing.T) {
			expectCode(t, rukValue(t, "", position.typ, refuseOption), diagnostics.CodeRUKSharedRefused)
		})
	}
}

func TestRemoveUnknownKeys_SharedValueRefused_Nested(t *testing.T) {
	for _, position := range sharedPositions {
		t.Run(position.name, func(t *testing.T) {
			expectCode(t, rukStatic(t, "", "{inner: "+position.typ+"}", refuseOption), diagnostics.CodeRUKSharedRefused)
		})
	}
}

// A spread or const preset reaches the scanner like a literal.
func TestRemoveUnknownKeys_SharedValuesFromPreset(t *testing.T) {
	for name, source := range map[string]string{
		"spread":       "const preset = {sharedValues: 'refuse'} as const;\nexport const strip = createRemoveUnknownKeysFn<{fn: () => void}>(undefined, {...preset});\n",
		"const object": "const preset = {sharedValues: 'refuse'} as const;\nexport const strip = createRemoveUnknownKeysFn<{fn: () => void}>(undefined, preset);\n",
		"template":     "export const strip = createRemoveUnknownKeysFn<{fn: () => void}>(undefined, {sharedValues: `refuse`});\n",
	} {
		t.Run(name, func(t *testing.T) {
			expectCode(t, rukScan(t, source), diagnostics.CodeRUKSharedRefused)
		})
	}
}
