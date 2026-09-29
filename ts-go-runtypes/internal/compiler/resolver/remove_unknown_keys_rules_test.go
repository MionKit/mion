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
