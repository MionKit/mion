package typefunctions

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// Pins the NS-propagation rule in the validate splices (found by the elision
// fuzz lane): a structural-format constraint (contains / patternProperties /
// propertyNames) attached to a base that compiled to the CodeNS sentinel (an
// unsupported member — a symbol — bubbled up from a positional child) must
// PROPAGATE the sentinel so the walker escalates to the alwaysThrow lane,
// never turn the graceful degrade into a resolver panic. The array shape is
// the documented positional NS bubble; PropNames rides the same node purely to
// drive the (kind-agnostic) splice — the wild trigger was an object.
func TestValidateSplices_PropagateNSBase(t *testing.T) {
	symbolElem := func() *reflection.RunType {
		return &reflection.RunType{ID: "nssym", Kind: reflection.KindSymbol}
	}
	cases := []struct {
		name string
		rt   *reflection.RunType
	}{
		{"contains", &reflection.RunType{ID: "nsarr1", Kind: reflection.KindArray,
			Child: symbolElem(),
			SchemaChecks: reflection.SchemaChecks{
				Contains: []*reflection.ContainsCheck{{Child: &reflection.RunType{ID: "nsnum", Kind: reflection.KindNumber}, Min: 1, Max: -1}},
			},
		}},
		{"propertyNames", &reflection.RunType{ID: "nsarr2", Kind: reflection.KindArray,
			Child: symbolElem(),
			SchemaChecks: reflection.SchemaChecks{
				PropNames: []*reflection.RunType{{ID: "nsstr", Kind: reflection.KindString}},
			},
		}},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			defer func() {
				if recovered := recover(); recovered != nil {
					t.Fatalf("validate emit panicked on an NS base with %s: %v", testCase.name, recovered)
				}
			}()
			walker := NewWalker(testCase.rt, "val_"+testCase.rt.ID, ValidateEmitter{})
			_, _, isUnsupported := walker.Compile()
			if !isUnsupported {
				t.Fatalf("expected the NS sentinel to escalate to unsupported, got a compiled body")
			}
		})
	}
}
