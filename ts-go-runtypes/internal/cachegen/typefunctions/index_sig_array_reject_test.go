package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// Regression for the verr/validate record-vs-array disagreement: the
// `validationErrors` (verr) family under-reported a non-plain-object input (an
// array, Map, Set, Date, …) against a record / index-signature type. `validate`
// carries an array-rejection brand guard for index-signature objects
// (`!Array.isArray(v) && Object.prototype.toString.call(v) === '[object
// Object]'`), but `validationErrors` did not — so `validate([])` returned false
// while `getValidationErrors([])` returned zero errors, breaking the
// createValidateFn/createGetValidationErrorsFn agreement invariant (fuzz oracle O4).
//
// The root cause: emitObjectValidationErrors tracked `allOptional` +
// `hasContributingChild` but NOT `hasIndexSig`, so the guard was skipped for a
// record whose index-signature child contributes a (non-optional) value check.
// This pins that both families emit the guard for a record, keeping them in
// lockstep.

// recordOf builds `Record<string, V>` — an objectLiteral whose single child is a
// string-keyed index signature carrying the supplied value RunType.
func recordOf(value *protocol.RunType) protocol.Dump {
	str := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	idx := &protocol.RunType{ID: "idx", Kind: protocol.KindIndexSignature, Index: makeRef("str"), Child: makeRef(value.ID)}
	obj := &protocol.RunType{ID: "obj", Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{makeRef("idx")}}
	return protocol.Dump{RunTypes: []*protocol.RunType{str, value, idx, obj}}
}

// arrayRejectGuard is the brand check both families splice onto an
// index-signature object's shape gate to reject arrays / Date / Map / Set.
const arrayRejectGuard = "!Array.isArray(v) && Object.prototype.toString.call(v) === '[object Object]'"

func TestIndexSig_ValidationErrorsRejectsNonPlainObject(t *testing.T) {
	cases := map[string]*protocol.RunType{
		"Record<string, number>": {ID: "num", Kind: protocol.KindNumber},
		"Record<string, Date>":   {ID: "dat", Kind: protocol.KindClass, SubKind: protocol.SubKindDate},
	}
	for name, value := range cases {
		t.Run(name, func(t *testing.T) {
			dump := recordOf(value)
			// The verr (validationErrors) family MUST carry the guard — this is
			// the fix. Without it, a for-in over an empty array enumerates no
			// keys, the per-key value check is vacuously satisfied, and zero
			// errors are reported while validate returns false.
			verrOut := renderModule(t, dump, "validationErrors")
			if !strings.Contains(verrOut, arrayRejectGuard) {
				t.Errorf("[%s] validationErrors object emit must reject non-plain objects with the brand guard %q so it agrees with validate on []; got:\n%s", name, arrayRejectGuard, verrOut)
			}
			// The validate family always carried the guard — assert parity so
			// the two families can't silently drift apart again.
			valOut := renderModule(t, dump, "validate")
			if !strings.Contains(valOut, arrayRejectGuard) {
				t.Errorf("[%s] validate object emit is expected to carry the brand guard %q; got:\n%s", name, arrayRejectGuard, valOut)
			}
		})
	}
}
