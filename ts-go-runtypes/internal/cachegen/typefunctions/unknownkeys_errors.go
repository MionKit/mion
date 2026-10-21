package typefunctions

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnids"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// callUnknownKeyErr appends a 'never' error for an unknown key; `extra` is the key VARIABLE, the key being a runtime value.
func callUnknownKeyErr(ctx *EmitContext, extra string) string {
	key := ctx.UsePureFn(purefnids.NewRunTypeErr)
	pthArg := ctx.ArgName("pλth")
	errArg := ctx.ArgName("εrr")
	args := []string{pthArg, errArg, quoteJS("never")}
	if path := ctx.AccessPathLiteral(extra); path != "" {
		args = append(args, path)
	}
	return key + "(" + strings.Join(args, ",") + ")"
}

// emitParentUnknownKeyErrors pushes one `{path, expected: 'never'}` per undeclared key for `validationErrorsStrict`;
// "" when an index signature declares every key or the shape declares no names.
// ⚠️ THE CALLER OWNS THE OBJECT GUARD: the fused family already sits inside emitObjectValidationErrors' guard, and a
// second one would emit on every object node, which strictObjectKeyAssertion also avoids on validate.
// Pinned by TestCheckUnknowns_DoesNotDoubleGuardObjects.
func emitParentUnknownKeyErrors(rt *reflection.RunType, ctx *EmitContext) string {
	if objectHasIndexSignatureChild(rt, ctx) {
		return ""
	}
	unknownValue := callCheckUnknownPropertiesForHas(rt, ctx, true)
	if unknownValue == "" {
		return ""
	}
	unknownVar := ctx.NextLocalVar("unk")
	keyVar := ctx.NextLocalVar("ky")
	return "const " + unknownVar + " = " + unknownValue + ";" +
		"if (" + unknownVar + ") {for (const " + keyVar + " of " + unknownVar + ") {" + callUnknownKeyErr(ctx, keyVar) + "}}"
}
