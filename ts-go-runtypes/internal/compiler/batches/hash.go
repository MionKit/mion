package batches

import (
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/hashid"
)

// BatchIdPrefix marks an injected batch id so it can never be mistaken for a
// route id or a pure-fn key.
const BatchIdPrefix = "b_"

// routeIdSeparator joins the ordered route ids into the hash input. A route id
// is a `/`-joined property chain and a property name can never contain `,`,
// so the join is injective: two different route lists never share an input.
const routeIdSeparator = ","

// BatchId derives the deterministic id of a batch from its ORDERED route ids.
//
// Deliberately NO version salt and NO collision dictionary: the id is a wire
// contract between two separately built artifacts (the client bundle carrying
// the injected id and the server build registering the plan under it), so it
// must not move with the binary version the way typeIDs do, and it cannot be
// dictionary-extended because the two builds share no dictionary. A collision
// between two different route lists is reported as BAT004 instead.
func BatchId(routeIds []string) string {
	return BatchIdPrefix + hashid.QuickHash(strings.Join(routeIds, routeIdSeparator), hashid.DefaultLength, "")
}
