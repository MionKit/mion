package formats

import "strconv"

// FormatErrCall pushes the canonical nested RTValidationError `{expected, path, format: {name, formatPath, val}}`.
// A bare `{name, formatPath, val}` push is invisible to consumers reading `.path` / `.format`.
// Inlined rather than routed through a pure fn: a handful of bytes with no shared logic to factor out.
// paramValLiteral is the already-rendered JS value; path is copied (`[...pth]`) so each pushed error owns its array.
func FormatErrCall(pathExpr, errorsArr, expected, fmtName, paramName, paramValLiteral string) string {
	return FormatErrCallWith(pathExpr, errorsArr, expected, fmtName, paramName, paramValLiteral, "")
}

// FormatErrCallWith is FormatErrCall plus properties spliced verbatim into the format object literal (e.g. ",isCurrency:true").
// extraFormatProps must be "" or start with a comma.
func FormatErrCallWith(pathExpr, errorsArr, expected, fmtName, paramName, paramValLiteral, extraFormatProps string) string {
	path := pathExpr
	if path == "" {
		path = "pth"
	}
	return errorsArr + ".push({expected:'" + expected + "',path:[..." + path + "]," +
		"format:{name:'" + fmtName + "',formatPath:['" + paramName + "'],val:" + paramValLiteral + extraFormatProps + "}})"
}

// FormatErrorTypeProp renders the optional `errorType` property: WHICH way the format failed, for a format with more than one way.
// typeExpr is a JS EXPRESSION, so a format that only knows the mode at runtime can pass the call that yields it.
// Every mode is mirrored by the `*ErrorType` unions in packages/run-types/src/formats/string and by `FormatErrorsOf<T>`; add a mode in all three.
//
//	creditCard  'format' | 'checksum' | 'network'      (network only with `networks`)
//	email       RFC path (`emailRfc`): 'format' | 'localPart' | 'domain' |
//	            'addressLiteral' | 'length'; decomposition path (`localPart` /
//	            `domain`): 'format' (no '@'), 'localPart'; the domain half reports
//	            under the `domain` name with that format's modes.
//	domain      IDNA path (`idna`): 'label' | 'punycode' | 'bidi' | 'length';
//	            decomposition path (`names` / `tld`): 'label' | 'tld'.
//	ip          'address' | 'port', ONLY with `allowPort`.
//
// Every other format omits it: it pushes ONE error per violated param and the formatPath tail already names it.
// errorType names a PART or a RULE, never a bound: a whole-value bound (a domain's maxParts) names itself through formatPath.
func FormatErrorTypeProp(typeExpr string) string {
	return ",errorType:" + typeExpr
}

// FormatNumber stringifies a float64 the way JSON does (`1.0` → "1"), so the emitted bound matches what tsgo saw.
func FormatNumber(value float64) string {
	if value == float64(int64(value)) {
		return strconv.FormatInt(int64(value), 10)
	}
	return strconv.FormatFloat(value, 'g', -1, 64)
}

// PureFnAlias wraps ctx.UsePureFn for the format emitters; `id` is a generated purefnids constant.
// Transitive deps the pure fn calls internally are picked up by the extractor, not declared here.
func PureFnAlias(ctx EmitContext, id string) string {
	return ctx.UsePureFn(id)
}
