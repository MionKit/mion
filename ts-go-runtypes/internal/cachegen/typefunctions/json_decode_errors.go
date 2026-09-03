package typefunctions

import "strings"

// The JSON restore arms rebuild a value ONLY from the form the encoder writes
// (a Date from its ISO string, a bigint from its decimal string, a Map from
// its entries array) and THROW on anything else: `new Date(null)` is the
// epoch, `BigInt(true)` is 1n and `new Set(null)` is an empty set, so a
// pass-through would either launder junk into a valid value or hand validate
// a value it may or may not refuse. Same pattern as the flat-union decoder
// (flatUnionDecodeErrorVar): the message is hoisted ONCE per factory into the
// closure prologue and the arm's else branch is a bare `throw new Error(name)`,
// so the happy path pays nothing beyond the `typeof` / `Array.isArray` it
// already had. A plain Error, not RTParseError: `parse` wraps whatever the
// restore throws into its deserialize arm, and a typed decoder error is a
// compile option of its own, not something every arm should pre-wrap.
//
// Message shape, shared with the union decoder: "Can not json decode <what>:
// expected <wire form> or <the restored type>".

// jsonDecodeErrorVar returns the prologue const carrying the message for
// `what`, registering it on first use.
func jsonDecodeErrorVar(ctx *EmitContext, what, expected string) string {
	name := "jd" + identifierOf(what) + "Err"
	if !ctx.HasContextItem(name) {
		ctx.SetContextItem(name, "const "+name+" = 'Can not json decode "+what+": expected "+expected+"'")
	}
	return name
}

// jsonDecodeGuard emits `if (<test>) {<then>} else if (!(<already>)) {throw
// new Error(<errVar>)}`: the wire-form check in front of a transform, with the
// throw on the cold branch. `already` recognises a value that is ALREADY the
// restored type (a live Date, a bigint, a Map), which `parse` promises to
// accept as-is: parsing its own output must succeed (parse.test.ts). Empty
// `already` (arrays: the wire form IS the restored form) throws on anything
// but the wire form. Statement-shaped so it composes with the property /
// tuple / loop bodies around it exactly like the Map / Set arm always has.
func jsonDecodeGuard(test, then, already, errVar string) RTCode {
	elseArm := " else {throw new Error(" + errVar + ")}"
	if already != "" {
		elseArm = " else if (!(" + already + ")) {throw new Error(" + errVar + ")}"
	}
	return RTCode{Code: "if (" + test + ") {" + then + "}" + elseArm, Type: CodeS}
}

// identifierOf keeps the letters and digits of a display name, first one
// upper-cased, so it can sit inside a JS identifier ("Temporal.PlainDate" →
// "TemporalPlainDate", "bigint" → "Bigint").
func identifierOf(name string) string {
	var out strings.Builder
	for _, ch := range name {
		if (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') {
			if out.Len() == 0 && ch >= 'a' && ch <= 'z' {
				ch -= 'a' - 'A'
			}
			out.WriteRune(ch)
		}
	}
	return out.String()
}
