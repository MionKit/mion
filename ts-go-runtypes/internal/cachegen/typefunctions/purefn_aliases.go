package typefunctions

import (
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnids"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
)

// pureFnAliases maps a pure fn's id to the short alias used in emitted factory
// bodies. The alias becomes the local variable bound to `utl.getPureFn('<id>')`;
// shortening it cuts bytes per occurrence in both the body STRING and the
// createRTFn closure. The id itself is always fully quoted — factory bodies must
// stay self-contained (they are rebuilt via `new Function('utl', code)`), and
// per-entry tuple args evaluate in their own module scope, so there is no
// shared-skeleton const to reference.
//
// Keyed by the generated id constants rather than by a spelled-out name: an id
// is a hash of the body, so it moves whenever the pure fn is edited, and only
// the constants move with it.
var pureFnAliases = map[string]string{
	purefnids.NewRunTypeErr:           "nRT",
	purefnids.GetUnknownKeysFromArray: "gUKFA",
	purefnids.HasUnknownKeysFromArray: "hUKFA",
	purefnids.CountEnumKeys:           "cntEK",
	purefnids.FindCycle:               "fc",
}

// pureFnAliasFor returns the emitter-side local-variable alias for the pure fn
// an id names: the short alias when the table has one, otherwise the id's hash
// made safe to declare. Hashes are unique per body, so two references in one
// body can never collapse onto one alias.
func pureFnAliasFor(id string) string {
	if alias, aliased := pureFnAliases[id]; aliased {
		return alias
	}
	_, hash, ok := purefunctions.SplitID(id)
	if !ok {
		return identifierSafe(id)
	}
	return identifierSafe(hash)
}

// identifierSafe renders a hash as something JavaScript will accept as a
// variable name. A base64url hash carries `-`, which no identifier may hold,
// and can begin with a digit. `$` is not in the base64url alphabet, so swapping
// it in keeps distinct hashes distinct.
func identifierSafe(hash string) string {
	safe := strings.ReplaceAll(hash, "-", "$")
	if safe == "" || (safe[0] >= '0' && safe[0] <= '9') {
		return "_" + safe
	}
	return safe
}
