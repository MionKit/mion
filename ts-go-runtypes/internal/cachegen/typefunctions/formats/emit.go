package formats

import "strconv"

// FormatErrCall emits a statement that pushes the canonical nested
// RTValidationError — `{expected, path, format: {name, formatPath, val}}` —
// onto the errors array. This is the shape the base validationErrors path
// (pf_newRunTypeErr) and consumers expect; a bare `{name, formatPath, val}`
// push would not conform to RTValidationError and is invisible to consumers
// reading `.path`/`.format`.
//
// Emitted INLINE as a small object-literal push rather than through a pure fn:
// the whole statement is a handful of bytes with no shared logic to factor out,
// so a `utl.getPureFn('rtFormats::formatErr')` indirection would cost more than
// it saves. (Built-in pure fns ARE now delivered on demand — the former
// `rt::formatErr` built-in was deleted as dead once this inline push replaced
// it — so the choice is size, not a delivery constraint.)
//
// paramValLiteral is the already-rendered JS value — a quoted string for
// the string formats; an unquoted number, the literal `true`, or a `…n`
// bigint literal for the numeric ones. pathExpr is the runtime path arg
// (`pth`); path is copied (`[...pth]`) so each pushed error owns its
// array. formatPath is `[paramName]`.
func FormatErrCall(pathExpr, errorsArr, expected, fmtName, paramName, paramValLiteral string) string {
	return FormatErrCallWith(pathExpr, errorsArr, expected, fmtName, paramName, paramValLiteral, "")
}

// FormatErrCallWith is FormatErrCall plus extra properties spliced verbatim
// into the emitted format object literal (e.g. ",isCurrency:true" — pure
// presentation metadata a format echoes onto its errors for the friendly
// renderer). extraFormatProps must be "" or start with a comma.
func FormatErrCallWith(pathExpr, errorsArr, expected, fmtName, paramName, paramValLiteral, extraFormatProps string) string {
	path := pathExpr
	if path == "" {
		path = "pth"
	}
	return errorsArr + ".push({expected:'" + expected + "',path:[..." + path + "]," +
		"format:{name:'" + fmtName + "',formatPath:['" + paramName + "'],val:" + paramValLiteral + extraFormatProps + "}})"
}

// FormatNumber stringifies a float64 in the same way JSON does
// (`1` vs `1.0` both → "1"). Used in the emitted JS source so the
// validator's bound matches what tsgo saw at type-resolution time.
func FormatNumber(value float64) string {
	if value == float64(int64(value)) {
		return strconv.FormatInt(int64(value), 10)
	}
	return strconv.FormatFloat(value, 'g', -1, 64)
}

// PureFnAlias is the `rtFormats`-namespace convenience wrapper over
// ctx.UsePureFn: it registers a pure-fn dependency, hoists the deduped
// `const pf_<fnName> = utl.getPureFn('rtFormats::<fnName>')` prologue line,
// and returns the alias the emitted body uses. filePath is the canonical
// source path the resolver registers the package's pure fns under — each
// format subpackage binds its own via a 1-line local wrapper. Transitive
// deps the wrapper fn calls internally are picked up by the JS-side pure-fn
// extractor, not declared here.
func PureFnAlias(ctx EmitContext, fnName, filePath string) string {
	return ctx.UsePureFn("rtFormats", fnName, filePath)
}
