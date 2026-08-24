package datetime

import (
	"github.com/mionkit/ts-runtypes/internal/cachegen/typefunctions/formats"
)

// dateTimePureFnFilePath is the canonical source path the resolver
// registers the date/time pure fns under (pf_isDateString_*,
// pf_isTimeString_*, pf_relativeNowMs, pf_*StrToMs). Matches the file
// where the JS-side `registerPureFnFactory('rtFormats::…', …)` calls
// live — keep these in sync when either side moves. (The string-format
// pure fns stay at ../string/string-formats-pure-fns.ts; only the
// date/time ones moved here.)
const dateTimePureFnFilePath = "packages/ts-runtypes/src/formats/datetime/dateTime-pure-fns.ts"

// pureFnAlias binds this package's pure-fn source path into the shared
// formats.PureFnAlias helper.
func pureFnAlias(ctx formats.EmitContext, fnName string) string {
	return formats.PureFnAlias(ctx, fnName, dateTimePureFnFilePath)
}
