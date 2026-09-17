package typefunctions

import "github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"

// pureFnAliases maps a pure fn's NAME (the half of its id after `#`) to the
// short alias used in emitted factory bodies. The alias becomes the local
// variable bound to `utl.getPureFn('<id>')`; shortening it cuts bytes per
// occurrence in both the body STRING and the createRTFn closure. The id itself
// is always fully quoted — factory bodies must stay self-contained (they are
// rebuilt via `new Function('utl', code)`), and per-entry tuple args evaluate in
// their own module scope, so there is no shared-skeleton const to reference.
var pureFnAliases = map[string]string{
	"newRunTypeErr":           "nRT",
	"getUnknownKeysFromArray": "gUKFA",
	"hasUnknownKeysFromArray": "hUKFA",
	"countEnumKeys":           "cntEK",
	"findCycle":               "fc",
}

// pureFnAliasFor returns the emitter-side local-variable alias for the pure fn
// an id names: the short alias when the table has one, otherwise the name
// itself. Names are unique within the package that owns them, so two references
// in one body can never collapse onto one alias.
func pureFnAliasFor(id string) string {
	_, name, ok := purefunctions.SplitID(id)
	if !ok {
		return id
	}
	if alias, aliased := pureFnAliases[name]; aliased {
		return alias
	}
	return name
}
