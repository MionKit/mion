package reflection

import "testing"

// TestIsNotSupportedKind — the "non-data" set is flagged; data kinds (including
// the validation-supported Promise and serialisable classes) are not.
func TestIsNotSupportedKind(t *testing.T) {
	notSupported := []struct {
		kind    ReflectionKind
		subKind ReflectionSubKind
	}{
		{KindNever, SubKindNone},
		{KindSymbol, SubKindNone},
		{KindFunction, SubKindNone},
		{KindMethod, SubKindNone},
		{KindMethodSignature, SubKindNone},
		{KindCallSignature, SubKindNone},
		{KindRegexp, SubKindNone}, // a pattern is code, not data
		{KindClass, SubKindNonSerializable},
	}
	for _, testCase := range notSupported {
		if !IsNotSupportedKind(testCase.kind, testCase.subKind) {
			t.Errorf("IsNotSupportedKind(%v,%v) = false, want true", testCase.kind, testCase.subKind)
		}
	}

	supported := []struct {
		kind    ReflectionKind
		subKind ReflectionSubKind
	}{
		{KindString, SubKindNone},
		{KindNumber, SubKindNone},
		{KindObjectLiteral, SubKindNone},
		{KindPromise, SubKindNone},   // validation-supported → data
		{KindClass, SubKindDate},     // Date → data
		{KindClass, SubKindMap},      // Map → data
		{KindClass, SubKindNone},     // plain serialisable class → data
		{KindProperty, SubKindNone},  // a member wrapper is not itself non-data
		{KindParameter, SubKindNone}, // function params are data slots
	}
	for _, testCase := range supported {
		if IsNotSupportedKind(testCase.kind, testCase.subKind) {
			t.Errorf("IsNotSupportedKind(%v,%v) = true, want false", testCase.kind, testCase.subKind)
		}
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

	PopulateFamily(root)

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
