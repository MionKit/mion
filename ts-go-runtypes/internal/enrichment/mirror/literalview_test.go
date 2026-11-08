package mirror

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/enrichment"
)

// TestASTLiteralView_ItemsAndMemberName reads a real mirror literal: rt$slots elements (a non-object element is a nil
// view) and a `GEN.x` member's name.
func TestASTLiteralView_ItemsAndMemberName(t *testing.T) {
	view := parseDesiredObject("{rt$slots: [{pool: []}, 3, {pool: [], generator: GEN.lastName}], city: {generator: 'city'}}")
	if view == nil {
		t.Fatal("failed to parse")
	}
	literal := NewASTLiteralView(view.node)
	items := literal.Items("rt$slots")
	if len(items) != 3 || items[0] == nil || items[1] != nil || items[2] == nil {
		t.Fatalf("want object, nil, object views, got %v", items)
	}
	if name, ok := items[2].MemberName("generator"); !ok || name != "lastName" {
		t.Fatalf("want member lastName, got %q %v", name, ok)
	}
	if _, ok := items[2].StringValue("generator"); ok {
		t.Fatal("a member is not a string literal")
	}
	if _, ok := literal.Child("city").MemberName("generator"); ok {
		t.Fatal("a string literal is not a member")
	}
	if literal.Items("city") != nil {
		t.Fatal("an object is not an array literal")
	}
	var _ enrichment.LiteralView = literal
}
