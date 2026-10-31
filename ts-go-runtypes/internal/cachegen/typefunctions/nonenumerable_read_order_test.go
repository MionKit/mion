package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// nonEnumerableStackProp is `{ok: number, stack?: bigint}` (id "obj") with `stack` guarded like an Error's lib member.
func nonEnumerableStackProp() protocol.Dump {
	dump := bigintProp("stack", true)
	for _, rt := range dump.RunTypes {
		if rt.ID == "pp" {
			rt.NonEnumerable = true
		}
	}
	return dump
}

// Reading a native error's `stack` formats the whole trace, so the own-enumerability test must run before the read.
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

func TestNonEnumerable_OrdinaryMemberKeepsTheCheapTest(t *testing.T) {
	for _, fam := range []string{"prepareForJsonClone", "removeUnknownKeys"} {
		out := renderModule(t, bigintProp("stack", true), fam)
		if strings.Contains(out, propertyIsEnumerableGuard("v", "stack")) {
			t.Errorf("[%s] an ordinary member must not get the own-enumerability test; got:\n%s", fam, out)
		}
	}
}
