package main

import (
	"reflect"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/enrichment"
	"github.com/mionkit/mion/ts-go-runtypes/internal/enrichment/enrichgen"
	"github.com/mionkit/mion/ts-go-runtypes/internal/enrichment/mirror"
)

// TestGroupByDeclFile buckets a topologically-ordered closure by declaration
// file, preserving order, and falls back to the target file for empty DeclFile.
func TestGroupByDeclFile(t *testing.T) {
	closure := []enrichment.NamedConst{
		{TypeName: "Address", DeclFile: "/src/address.ts", FriendlyVar: "friendlyAddress", MockVar: "mockAddress"},
		{TypeName: "User", DeclFile: "/src/user.ts", FriendlyVar: "friendlyUser", MockVar: "mockUser"},
		{TypeName: "Anon", DeclFile: "", FriendlyVar: "friendlyAnon", MockVar: "mockAnon"},
	}

	groups := enrichgen.GroupByDeclFile(closure, "/src/user.ts", false)
	if len(groups) != 2 {
		t.Fatalf("want 2 groups (address.ts, user.ts); got %d: %+v", len(groups), groups)
	}
	// Address group (first appearance) precedes the user group.
	if groups[0].DeclFile != "/src/address.ts" || len(groups[0].Consts) != 1 {
		t.Errorf("group 0 = %+v, want address.ts with 1 const", groups[0])
	}
	// The empty-DeclFile const falls back to /src/user.ts, joining User's group.
	if groups[1].DeclFile != "/src/user.ts" || len(groups[1].Consts) != 2 {
		t.Errorf("group 1 = %+v, want user.ts with 2 consts", groups[1])
	}

	// forceSingle collapses everything into one group keyed by the fallback.
	single := enrichgen.GroupByDeclFile(closure, "/out.ts", true)
	if len(single) != 1 || single[0].DeclFile != "/out.ts" || len(single[0].Consts) != 3 {
		t.Errorf("forceSingle should yield one group of 3 at /out.ts; got %+v", single)
	}
}

// TestReferencedVars extracts only the friendly*/mock* const-var identifiers
// (camelCase suffix), ignoring meta keys and lowercase field names.
func TestReferencedVars(t *testing.T) {
	body := "{\n  rt$label: '',\n  address: friendlyAddress,\n  billing: mockBilling,\n  note: {rt$label: ''},\n  mockish: 'x',\n}"
	got := mirror.ReferencedVars(body)
	want := []string{"friendlyAddress", "mockBilling"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("ReferencedVars = %v, want %v", got, want)
	}
}

// TestCrossFileImportLines renders one deterministic import line per target
// mirror, vars sorted, specifiers relative to the importing mirror file.
func TestCrossFileImportLines(t *testing.T) {
	fromMirror := "/rt/gen/models/user.ts"
	importsByMirror := map[string]map[string]bool{
		"/rt/gen/models/address.ts": {"mockAddress": true, "friendlyAddress": true},
		"/rt/gen/billing/card.ts":   {"friendlyCard": true},
	}
	lines := mirror.CrossFileImportLines(fromMirror, importsByMirror)
	want := []string{
		"import { friendlyCard } from '../billing/card';\n",
		"import { friendlyAddress, mockAddress } from './address';\n",
	}
	if !reflect.DeepEqual(lines, want) {
		t.Errorf("CrossFileImportLines =\n%v\nwant\n%v", lines, want)
	}
}

// TestConstTypeNames returns distinct source type names in emission order.
func TestConstTypeNames(t *testing.T) {
	consts := []enrichment.NamedConst{
		{TypeName: "User"},
		{TypeName: "Address"},
		{TypeName: "User"}, // duplicate (e.g. friendly + mock split) — deduped
		{TypeName: ""},     // anonymous — skipped
	}
	got := mirror.ConstTypeNames(consts)
	want := []string{"User", "Address"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("ConstTypeNames = %v, want %v", got, want)
	}
}
