package mirror

import (
	"reflect"
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/enrichment"
)

// mustParse parses a mirror file that is expected to be valid, failing the test
// on a parse error — the in-package convenience wrapper now that ParseMirror
// returns an error.
func mustParse(t *testing.T, mirrorPath, src string) *Index {
	t.Helper()
	index, err := ParseMirror(mirrorPath, []byte(src))
	if err != nil {
		t.Fatalf("ParseMirror(%q) error: %v", mirrorPath, err)
	}
	return index
}

// TestParseMirror_IndexConsts indexes consts by their @rtType id (with the
// @rtIds child map) and falls back to the var name when no marker is present.
func TestParseMirror_IndexConsts(t *testing.T) {
	src := "import type { User } from '../../models/user';\n" +
		"import type { FriendlyType, MockData } from '@ts-runtypes/core';\n" +
		"\n" +
		"/** @rtType User#abc1234 @rtIds {name: string#n1, age: number#a2} */\n" +
		"export const friendlyUser: FriendlyType<User> = {\n" +
		"  rt$label: 'User',\n" +
		"  name: { rt$label: 'Name' },\n" +
		"  age: { rt$label: 'Age' },\n" +
		"};\n" +
		"\n" +
		"export const mockUser: MockData<User> = {\n" +
		"  name: { pool: ['Alice'] },\n" +
		"};\n"

	index := mustParse(t, "/rt/gen/models/user.ts", src)

	// friendlyUser is indexed by its (@rtType id, friendly form).
	friendly, ok := index.byTypeForm[typeFormKey("abc1234", true)]
	if !ok {
		t.Fatalf("friendlyUser not indexed by (@rtType id, friendly); consts=%d", len(index.consts))
	}
	if friendly.varName != "friendlyUser" || !friendly.isFriendly {
		t.Errorf("friendly entry = %+v", friendly)
	}
	if friendly.typeID != "abc1234" {
		t.Errorf("typeID = %q, want abc1234", friendly.typeID)
	}
	wantChildIDs := map[string]string{"name": "n1", "age": "a2"}
	if !reflect.DeepEqual(friendly.childIDs, wantChildIDs) {
		t.Errorf("childIDs = %v, want %v", friendly.childIDs, wantChildIDs)
	}
	if friendly.body == nil {
		t.Errorf("friendly body should be an object literal")
	}

	// mockUser has no marker → indexed by its var name only.
	mock, ok := index.byVar["mockUser"]
	if !ok {
		t.Fatalf("mockUser not indexed by var name; consts=%d", len(index.consts))
	}
	if mock.isFriendly {
		t.Errorf("mockUser should be a mock entry")
	}

	// Byte ranges are sane: the friendly entry's range must contain its var name
	// and span a `{ … }` body within the file.
	slice := src[friendly.tokenStart:friendly.end]
	if !strings.HasPrefix(slice, "export const friendlyUser") {
		t.Errorf("token range does not start at the const: %q", slice[:min(40, len(slice))])
	}
	leading := src[friendly.fullStart:friendly.tokenStart]
	if !strings.Contains(leading, "@rtType") {
		t.Errorf("leading-comment range should hold the JSDoc marker: %q", leading)
	}
}

// TestParseMirror_DuplicateTypeIDKeepsFirst: two consts of the same form
// carrying the SAME @rtType id is hand-edit corruption — byTypeForm keeps the
// FIRST (no silent last-write-wins), and the duplicate stays reachable by var
// name. This is the C5 guard.
func TestParseMirror_DuplicateTypeIDKeepsFirst(t *testing.T) {
	src := "/** @rtType User#dupID */\n" +
		"export const friendlyUserA: FriendlyType<User> = { rt$label: 'A' };\n" +
		"/** @rtType User#dupID */\n" +
		"export const friendlyUserB: FriendlyType<User> = { rt$label: 'B' };\n"

	index := mustParse(t, "/rt/gen/user.ts", src)
	entry, ok := index.byTypeForm[typeFormKey("dupID", true)]
	if !ok {
		t.Fatalf("dupID not indexed at all")
	}
	if entry.varName != "friendlyUserA" {
		t.Errorf("byTypeForm should keep the FIRST const; got %q", entry.varName)
	}
	// The duplicate is still reachable via the var-name fallback.
	if index.byVar["friendlyUserB"] == nil {
		t.Errorf("duplicate const should stay reachable by var name")
	}
}

// TestParseMirror_IndexImports indexes the source breadcrumb, the DSL import,
// and cross-file value imports, with the breadcrumb clause byte range.
func TestParseMirror_IndexImports(t *testing.T) {
	src := "import type { User, Post } from '../../models/user';\n" +
		"import type { FriendlyType, MockData } from '@ts-runtypes/core';\n" +
		"import { friendlyAddress, mockAddress } from './address';\n" +
		"export const friendlyUser: FriendlyType<User> = { rt$label: '' };\n"

	index := mustParse(t, "/rt/gen/models/user.ts", src)

	if index.breadcrumb == nil {
		t.Fatalf("breadcrumb not indexed")
	}
	if !reflect.DeepEqual(index.breadcrumb.names, []string{"User", "Post"}) {
		t.Errorf("breadcrumb names = %v", index.breadcrumb.names)
	}
	if index.breadcrumb.specifier != "../../models/user" {
		t.Errorf("breadcrumb specifier = %q", index.breadcrumb.specifier)
	}
	// The clause range must bound exactly the `User, Post` names.
	clause := src[index.breadcrumb.clauseStart:index.breadcrumb.clauseEnd]
	if clause != "User, Post" {
		t.Errorf("breadcrumb clause = %q, want %q", clause, "User, Post")
	}

	if index.dslImport == nil {
		t.Errorf("DSL import not indexed")
	}
	if len(index.valueImports) != 1 {
		t.Fatalf("want 1 value import; got %d", len(index.valueImports))
	}
	if !reflect.DeepEqual(index.valueImports[0].names, []string{"friendlyAddress", "mockAddress"}) {
		t.Errorf("value import names = %v", index.valueImports[0].names)
	}
}

// TestParseConstMarkers parses @rtType + @rtIds from a leading comment.
func TestParseConstMarkers(t *testing.T) {
	typeID, childIDs := parseConstMarkers("/** @rtType User#9f3a @rtIds {name: string#a1, age: number#b2, address: Address#c3} */")
	if typeID != "9f3a" {
		t.Errorf("typeID = %q, want 9f3a", typeID)
	}
	want := map[string]string{"name": "a1", "age": "b2", "address": "c3"}
	if !reflect.DeepEqual(childIDs, want) {
		t.Errorf("childIDs = %v, want %v", childIDs, want)
	}

	// No markers → empties.
	noID, noChild := parseConstMarkers("// just a plain comment")
	if noID != "" || noChild != nil {
		t.Errorf("expected empties; got %q / %v", noID, noChild)
	}
}

// TestMarkerComment renders a deterministic, parse-round-tripping JSDoc marker
// (sorted @rtIds keys), and omits the comment entirely when there is no id.
func TestMarkerComment(t *testing.T) {
	got := MarkerComment(enrichment.NamedConst{TypeName: "User", TypeID: "9f3a", ChildIDs: map[string]string{"age": "b2", "name": "a1"}})
	want := "/** @rtType User#9f3a @rtIds {age: b2, name: a1} */\n"
	if got != want {
		t.Errorf("MarkerComment = %q, want %q", got, want)
	}

	// Round-trip: parseConstMarkers recovers the same id + map.
	typeID, childIDs := parseConstMarkers(got)
	if typeID != "9f3a" {
		t.Errorf("round-trip typeID = %q", typeID)
	}
	if !reflect.DeepEqual(childIDs, map[string]string{"age": "b2", "name": "a1"}) {
		t.Errorf("round-trip childIDs = %v", childIDs)
	}

	// No id → no marker.
	if MarkerComment(enrichment.NamedConst{TypeName: "User"}) != "" {
		t.Errorf("expected empty marker for empty typeID")
	}

	// No childIDs → @rtType only.
	if MarkerComment(enrichment.NamedConst{TypeName: "User", TypeID: "abc"}) != "/** @rtType User#abc */\n" {
		t.Errorf("marker without childIDs = %q", MarkerComment(enrichment.NamedConst{TypeName: "User", TypeID: "abc"}))
	}

	// PARSING TOLERANCE: a legacy marker carrying the retired `@rtI18n <locale>
	// from '<spec>'` clause (written by the pre-src-derived translate driver)
	// still parses its @rtType/@rtIds — a reconcile over an old translation file
	// simply rewrites the marker without the clause.
	legacyI18n := "/** @rtType User#9f3a @rtIds {name: a1} @rtI18n pl from '../../friendly/models/user' */\n"
	typeID, childIDs = parseConstMarkers(legacyI18n)
	if typeID != "9f3a" || !reflect.DeepEqual(childIDs, map[string]string{"name": "a1"}) {
		t.Errorf("legacy @rtI18n marker round-trip = %q / %v", typeID, childIDs)
	}
}

// TestHasCamelSuffix gates friendly*/mock*/<locale>_friendly* var recognition
// on a CamelCase suffix (leading locale segments count as friendly-form).
func TestHasCamelSuffix(t *testing.T) {
	cases := map[string]bool{
		"friendlyUser":       true,
		"mockUser":           true,
		"friendly":           false,
		"mock":               false,
		"friendlyx":          false,
		"mockish":            false,
		"mockA":              true,
		"es_friendlyUser":    true,
		"pt_BR_friendlyUser": true,
		"es_friendlyx":       false,
		"_friendlyUser":      false,
	}
	for name, want := range cases {
		got := isFriendlyVar(name) || isMockVar(name)
		if got != want {
			t.Errorf("recognized(%q) = %v, want %v", name, got, want)
		}
	}
}

// TestTranslationVarNames covers the locale-prefix predicate + the forward
// var-name mapping (BCP-47 separators sanitized to underscores).
func TestTranslationVarNames(t *testing.T) {
	if TranslationVarName("pt-BR", "friendlyUser") != "pt_BR_friendlyUser" {
		t.Errorf("TranslationVarName = %q", TranslationVarName("pt-BR", "friendlyUser"))
	}
	if isTranslationVar("friendlyUser") || !isTranslationVar("es_friendlyUser") {
		t.Errorf("isTranslationVar misclassifies")
	}
}
