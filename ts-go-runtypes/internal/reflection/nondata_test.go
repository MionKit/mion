package reflection

import "testing"

// TestNonDataOf pins the DataOnly classes, one row per kind or shape, the data kinds included.
func TestNonDataOf(t *testing.T) {
	callSignature := &RunType{ID: "cs", Kind: KindCallSignature}
	resolve := func(ref *RunType) *RunType {
		if ref.Kind == KindRef && ref.ID == "cs" {
			return callSignature
		}
		return ref
	}
	cases := []struct {
		name    string
		node    *RunType
		nonData NonData
	}{
		{"function", &RunType{Kind: KindFunction}, NonDataFunction},
		{"method", &RunType{Kind: KindMethod}, NonDataFunction},
		{"method signature", &RunType{Kind: KindMethodSignature}, NonDataFunction},
		{"call signature", &RunType{Kind: KindCallSignature}, NonDataFunction},
		{"callable interface", &RunType{Kind: KindObjectLiteral, Children: []*RunType{NewRef("cs")}}, NonDataFunction},
		{"symbol", &RunType{Kind: KindSymbol}, NonDataSymbol},
		{"unique symbol", &RunType{Kind: KindLiteral, Flags: []string{"symbol"}}, NonDataSymbol},
		{"never", &RunType{Kind: KindNever}, NonDataNever},
		{"Promise", &RunType{Kind: KindPromise}, NonDataOpaque},
		{"RegExp", &RunType{Kind: KindRegexp}, NonDataOpaque},
		{"typed array", &RunType{Kind: KindClass, SubKind: SubKindNonSerializable}, NonDataOpaque},
		{"string", &RunType{Kind: KindString}, Data},
		{"string literal", &RunType{Kind: KindLiteral}, Data},
		{"plain interface", &RunType{Kind: KindObjectLiteral, Children: []*RunType{{Kind: KindPropertySignature}}}, Data},
		{"Date", &RunType{Kind: KindClass, SubKind: SubKindDate}, Data},
		{"Map", &RunType{Kind: KindClass, SubKind: SubKindMap}, Data},
		{"user class", &RunType{Kind: KindClass}, Data},
		{"property", &RunType{Kind: KindProperty}, Data},
		{"parameter", &RunType{Kind: KindParameter}, Data},
	}
	for _, testCase := range cases {
		if got := NonDataOf(testCase.node, resolve); got != testCase.nonData {
			t.Errorf("%s: NonDataOf = %d, want %d", testCase.name, got, testCase.nonData)
		}
	}
}

// Without a resolver a callable interface's call signature ref stays unread, so the node reads as data.
func TestNonDataOf_UnresolvedCallSignatureRef(t *testing.T) {
	if got := NonDataOf(&RunType{Kind: KindObjectLiteral, Children: []*RunType{NewRef("cs")}}, nil); got != Data {
		t.Errorf("NonDataOf with no resolver = %d, want Data", got)
	}
}

// TestPopulateFamilySetsNotSupported — a method member node is flagged
// notSupported, while its data sibling AND the method's own parameter /
// return children are NOT (only the node itself carries the flag, never
// its children).
func TestPopulateFamilySetsNotSupported(t *testing.T) {
	dataProp := &RunType{ID: "a", Kind: KindPropertySignature, Name: "a", Child: NewRef("s")}
	methodParam := &RunType{ID: "p", Kind: KindParameter, Name: "x", Child: NewRef("s")}
	methodReturn := &RunType{ID: "r", Kind: KindString}
	method := &RunType{
		ID:         "f",
		Kind:       KindMethodSignature,
		Name:       "f",
		Parameters: []*RunType{methodParam},
		Return:     methodReturn,
	}
	root := &RunType{
		ID:       "root",
		Kind:     KindObjectLiteral,
		Children: []*RunType{dataProp, method},
	}

	PopulateFamily(root, nil)

	if root.NotSupported {
		t.Error("object literal root should not be notSupported")
	}
	if dataProp.NotSupported {
		t.Error("data property should not be notSupported")
	}
	if !method.NotSupported {
		t.Error("method signature should be notSupported")
	}
	if methodParam.NotSupported {
		t.Error("method parameter (child of a notSupported node) must NOT be flagged")
	}
	if methodReturn.NotSupported {
		t.Error("method return (child of a notSupported node) must NOT be flagged")
	}
}
