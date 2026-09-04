package reflection

// MustValidateJson reports whether a kind's JSON decoder REBUILDS its value from a
// different wire form, and therefore must check the wire shape before it converts.
//
// The decode contract: a decoder converts only the exact form the encoder writes
// (a Date from a string, a bigint from a whole-number string, a Map or Set from an
// array, a union from its `[index, value]` envelope) and leaves anything else
// untouched for validate to refuse. Validation runs on the RESTORED value, after
// decode, so the decoder is the only thing standing between attacker-controlled
// JSON and a constructor: `new Date(true)` is epoch 1, `BigInt(”)` is `0n`,
// `new Set(null)` is an empty set, `v[1]` of `null` throws a raw TypeError.
//
// Every kind listed here is pinned by two checks that fail when a transforming
// arm ships without its guard: TestMustValidateJson_* in cachegen/typefunctions
// (per kind, per road) and the GC-GUARD generated-code oracle on the JS side (over
// every emitted decoder body, hand-written corpus + the secgen fuzz lane). A NEW
// kind whose decoder calls a constructor on a wire value must be added here, and
// its arm must guard with `typeof`, `Array.isArray`, `Number.isInteger` or the
// bigint wire regex on the SAME variable it converts.
func MustValidateJson(rt *RunType) bool {
	if rt == nil {
		return false
	}
	switch rt.Kind {
	case KindBigInt, KindUnion:
		return true
	case KindLiteral:
		for _, flag := range rt.Flags {
			if flag == "bigint" || flag == "symbol" {
				return true
			}
		}
		return false
	case KindClass:
		if _, ok := TemporalInfoBySubKind(rt.SubKind); ok {
			return true
		}
		return rt.SubKind == SubKindDate || rt.SubKind == SubKindMap || rt.SubKind == SubKindSet
	}
	return false
}
