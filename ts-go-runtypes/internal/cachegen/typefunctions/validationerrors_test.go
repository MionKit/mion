package typefunctions

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// TestBaseKindGuard_ClassSubKinds — the errors lane gates a format's check on
// the base kind so a wrong-kind value reports only the base error. Every class
// used to take the Date guard, which silently hid the Map / Set size checks
// (`v instanceof Date` is never true for a Map).
func TestBaseKindGuard_ClassSubKinds(t *testing.T) {
	cases := []struct {
		name    string
		subKind reflection.ReflectionSubKind
		want    string
	}{
		{"map", reflection.SubKindMap, "v instanceof Map"},
		{"set", reflection.SubKindSet, "v instanceof Set"},
		{"date", reflection.SubKindDate, "v instanceof Date && !isNaN(v.getTime())"},
	}
	for _, tc := range cases {
		rt := &reflection.RunType{Kind: reflection.KindClass, SubKind: tc.subKind}
		if got := baseKindGuard(rt, "v", ""); got != tc.want {
			t.Errorf("%s: guard = %q, want %q", tc.name, got, tc.want)
		}
	}
}
