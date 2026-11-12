package typefunctions

// The bigint wire form is a plain decimal string, `-?[0-9]+`; every bigint literal emitted and every
// bigint restored at runtime is held to that exact shape here.

// IsDecimalInteger reports whether text is `-?[0-9]+`, the only spelling a bigint literal or param may
// take in emitted code (a bigint literal is emitted unquoted, so its shape is asserted, never trusted).
func IsDecimalInteger(text string) bool {
	if text == "" {
		return false
	}
	start := 0
	if text[0] == '-' {
		start = 1
		if len(text) == 1 {
			return false
		}
	}
	for i := start; i < len(text); i++ {
		if text[i] < '0' || text[i] > '9' {
			return false
		}
	}
	return true
}

// bigintWireRegexVar hoists the bigint wire-form check into the closure prologue once and returns its name.
// `BigInt()` also accepts ”, whitespace, hex and binary (`BigInt(”)` is `0n`), so the decoders convert
// only the exact wire form and leave anything else in place for validate to refuse.
func bigintWireRegexVar(ctx *EmitContext) string {
	const name = "reBigWire"
	if !ctx.HasContextItem(name) {
		ctx.SetContextItem(name, "const "+name+" = /^-?[0-9]+$/")
	}
	return name
}

// bigintRestoreCode: `v` becomes a bigint only from its exact wire string or a
// whole number (the one lenient spelling parse promises); anything else stays.
func bigintRestoreCode(v string, ctx *EmitContext) string {
	re := bigintWireRegexVar(ctx)
	return v + " = typeof " + v + " === 'string' ? (" + re + ".test(" + v + ") ? BigInt(" + v + ") : " + v + ") : Number.isInteger(" + v + ") ? BigInt(" + v + ") : " + v
}
