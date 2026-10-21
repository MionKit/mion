package datetime

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
)

// pureFnAlias is formats.PureFnAlias, for the date/time emitters that pick their pure fn from a format layout.
func pureFnAlias(ctx formats.EmitContext, id string) string {
	return formats.PureFnAlias(ctx, id)
}
