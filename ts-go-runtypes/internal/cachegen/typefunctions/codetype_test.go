package typefunctions

import (
	"reflect"
	"testing"
)

// TestRTCode_HasNoThrowMessageChannel pins the single source of alwaysThrow
// text: an emitter returns a bare CodeNS sentinel and module.go renders the
// message at the root from the leaf's diag code. A per-site message field on
// RTCode has no reader and would silently diverge from that rendered text.
func TestRTCode_HasNoThrowMessageChannel(t *testing.T) {
	want := []string{"Code", "Type"}
	rtCode := reflect.TypeOf(RTCode{})
	got := make([]string, rtCode.NumField())
	for i := range got {
		got[i] = rtCode.Field(i).Name
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("RTCode fields = %v, want %v", got, want)
	}
}
