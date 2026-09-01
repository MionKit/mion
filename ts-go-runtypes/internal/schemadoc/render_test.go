package schemadoc

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// The renderer-ONLY behaviors: everything the convert printer refuses but the
// document renderer must degrade or spell on its own ($defs cycles, structural
// classes, enum value lists, method drops, warnings). The shared-subset
// spellings are pinned against the printer by the parity tests in
// internal/convert (corpus + seeded fuzz leg), not here.

func derefOver(nodes map[string]*reflection.RunType) func(*reflection.RunType) *reflection.RunType {
	return func(node *reflection.RunType) *reflection.RunType {
		if resolved, ok := nodes[node.ID]; ok {
			return resolved
		}
		return nil
	}
}

func property(name string, optional bool, child *reflection.RunType) *reflection.RunType {
	return &reflection.RunType{Kind: reflection.KindProperty, Name: name, IsSafeName: true, Optional: optional, Child: child}
}

func TestRender_RootCycleClosesWithRootRef(t *testing.T) {
	root := &reflection.RunType{Kind: reflection.KindObjectLiteral, ID: "rootA"}
	root.Children = []*reflection.RunType{
		property("value", false, &reflection.RunType{Kind: reflection.KindString}),
		property("next", true, &reflection.RunType{Kind: reflection.KindRef, ID: "rootA"}),
	}
	doc := RenderDocument(root, derefOver(map[string]*reflection.RunType{"rootA": root}))
	expected := "{type: 'object', properties: {value: {type: 'string'}, next: {$ref: '#'}}, required: ['value']}"
	if doc.Source != expected {
		t.Errorf("root cycle document mismatch:\n--- got ---\n%s\n--- want ---\n%s", doc.Source, expected)
	}
	if len(doc.Warnings) != 0 {
		t.Errorf("unexpected warnings: %v", doc.Warnings)
	}
}

func TestRender_NestedCycleRidesDefs(t *testing.T) {
	nested := &reflection.RunType{Kind: reflection.KindObjectLiteral, ID: "nodeB"}
	nested.Children = []*reflection.RunType{
		property("back", true, &reflection.RunType{Kind: reflection.KindRef, ID: "nodeB"}),
	}
	root := &reflection.RunType{Kind: reflection.KindObjectLiteral, ID: "rootA", Children: []*reflection.RunType{
		property("child", false, &reflection.RunType{Kind: reflection.KindRef, ID: "nodeB"}),
	}}
	doc := RenderDocument(root, derefOver(map[string]*reflection.RunType{"rootA": root, "nodeB": nested}))
	expected := "{type: 'object', properties: {child: {type: 'object', properties: {back: {$ref: '#/$defs/nodeB'}}}}, " +
		"required: ['child'], $defs: {'nodeB': {type: 'object', properties: {back: {$ref: '#/$defs/nodeB'}}}}}"
	if doc.Source != expected {
		t.Errorf("nested cycle document mismatch:\n--- got ---\n%s\n--- want ---\n%s", doc.Source, expected)
	}
}

func TestRender_UserClassRendersStructurally(t *testing.T) {
	class := &reflection.RunType{Kind: reflection.KindClass, ID: "classC", TypeName: "Invoice"}
	class.Children = []*reflection.RunType{
		property("id", false, &reflection.RunType{Kind: reflection.KindString}),
		{Kind: reflection.KindMethod, Name: "total", IsSafeName: true}, // not data — drops
	}
	doc := RenderDocument(class, derefOver(map[string]*reflection.RunType{"classC": class}))
	expected := "{type: 'object', properties: {id: {type: 'string'}}, required: ['id']}"
	if doc.Source != expected {
		t.Errorf("class document mismatch:\n--- got ---\n%s\n--- want ---\n%s", doc.Source, expected)
	}
}

func TestRender_EnumSpellsItsValueList(t *testing.T) {
	enum := &reflection.RunType{Kind: reflection.KindEnum, Values: []any{float64(2), "green"}}
	doc := RenderDocument(enum, nil)
	expected := "{enum: ['green', 2]}"
	if doc.Source != expected {
		t.Errorf("enum document mismatch:\n--- got ---\n%s\n--- want ---\n%s", doc.Source, expected)
	}
}

func TestRender_UnknownFormatDegradesWithWarning(t *testing.T) {
	node := &reflection.RunType{Kind: reflection.KindString, FormatAnnotation: &reflection.FormatAnnotation{Name: "mysteryFormat"}}
	doc := RenderDocument(node, nil)
	if doc.Source != "{}" {
		t.Errorf("expected the honest under-constraint {}, got %s", doc.Source)
	}
	if len(doc.Warnings) != 1 || !strings.Contains(doc.Warnings[0].Message, "mysteryFormat") {
		t.Errorf("expected one warning naming the format, got %v", doc.Warnings)
	}
}

func TestRender_SymbolKeyedMembersDrop(t *testing.T) {
	root := &reflection.RunType{Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{
		property("kept", false, &reflection.RunType{Kind: reflection.KindBoolean}),
		property("@@secret", false, &reflection.RunType{Kind: reflection.KindString}),
	}}
	doc := RenderDocument(root, nil)
	expected := "{type: 'object', properties: {kept: {type: 'boolean'}}, required: ['kept']}"
	if doc.Source != expected {
		t.Errorf("symbol-key document mismatch:\n--- got ---\n%s\n--- want ---\n%s", doc.Source, expected)
	}
}
