package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// nonEnumerableStackProp builds `{ok: number, stack?: bigint}` with `stack` guarded the way an Error's
// lib-inherited member is (id "obj").
func nonEnumerableStackProp() protocol.Dump {
	dump := bigintProp("stack", true)
	for _, rt := range dump.RunTypes {
		if rt.ID == "pp" {
			rt.NonEnumerable = true
		}
	}
	return dump
}

// Reading a native error's `stack` formats the whole trace (several microseconds per returned error), and a
// non-enumerable `stack` is dropped anyway. So the encoders that write by name run the own-enumerability
// test BEFORE they read the member: the read only happens for a key that is really sent.
func TestNonEnumerable_GuardRunsBeforeTheRead(t *testing.T) {
	guard := propertyIsEnumerableGuard("v", "stack")
	for _, fam := range []string{"prepareForJsonClone", "removeUnknownKeys"} {
		out := renderModule(t, nonEnumerableStackProp(), fam)
		if readFirst := "v.stack !== undefined && (" + guard; strings.Contains(out, readFirst) {
			t.Errorf("[%s] `v.stack` is read before the own-enumerability test; got:\n%s", fam, out)
		}
		if want := guard + " && v.stack !== undefined"; !strings.Contains(out, want) {
			t.Errorf("[%s] the optional write must test %q; got:\n%s", fam, want, out)
		}
	}
}

// The ordering applies to the guarded member only: an ordinary optional member keeps the bare read.
func TestNonEnumerable_OrdinaryMemberKeepsTheCheapTest(t *testing.T) {
	for _, fam := range []string{"prepareForJsonClone", "removeUnknownKeys"} {
		out := renderModule(t, bigintProp("stack", true), fam)
		if strings.Contains(out, propertyIsEnumerableGuard("v", "stack")) {
			t.Errorf("[%s] an ordinary member must not get the own-enumerability test; got:\n%s", fam, out)
		}
	}
}
