// Package all blank-imports every concrete format-emitter package so their init()s register with
// formats.Registry; it is the single place a new format subtree gets wired up. Each import names the
// JS-side mirror it shadows, so keep that line when adding one.
package all

import (
	// JS mirrors: packages/run-types/src/formats/datetime/
	_ "github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats/datetime"
	// JS mirrors: packages/run-types/src/formats/numberFormats.ts and bigintFormats.ts
	_ "github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats/numeric"
	// JS mirrors: packages/run-types/src/formats/string/
	_ "github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats/string"
	// JS mirror: packages/run-types/src/formats/structural.ts (the JSON Schema door's uniqueItems /
	// maxItems / minProperties / maxProperties / additionalProperties: false lowering)
	_ "github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats/structural"
)
