package reflection

// MustValidateJson reports whether a kind's JSON decoder REBUILDS its value from a different wire form, and
// therefore must check the wire shape before it converts.
//
// The decode contract: a decoder converts only the exact form the encoder writes (a Date from a string, a
// bigint from a whole-number string, a Map or Set from an array, a union from its `[index, value]` envelope)
// and leaves anything else untouched for validate to refuse. The union is the one kind that refuses instead
// (the typed `[mion]` union error): a bare value is never its wire form, and left in place validate could
// accept it through a member it was never encoded as. Validation runs on the RESTORED value, so the decoder is
// the only thing between attacker-controlled JSON and a constructor: `new Date(true)` is epoch 1, `BigInt("")`
// is `0n`, `new Set(null)` is an empty set, `v[1]` of `null` throws a raw TypeError.
//
// A NEW kind whose decoder calls a constructor on a wire value must be added here, and its arm must guard with
// `typeof`, `Array.isArray`, `Number.isInteger` or the bigint wire regex on the SAME variable it converts. Two
// checks fail otherwise: TestMustValidateJson_* in cachegen/typefunctions (per kind, per road) and the GC-GUARD
// generated-code oracle on the JS side (hand-written corpus plus the secgen fuzz lane).
func MustValidateJson(rt *RunType) bool {
	if rt == nil {
		return false
	}
	switch rt.Kind {
	case KindBigInt, KindUnion:
		return true
	case KindLiteral:
		for _, flag := range rt.Flags {
			if flag == "bigint" {
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
