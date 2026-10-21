package typefunctions

import (
	"reflect"
	"testing"
)

// TestRTCode_HasNoThrowMessageChannel pins the single source of alwaysThrow text: module.go renders it at the root.
// A per-site message field on RTCode would have no reader and would silently diverge from that rendered text.
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
