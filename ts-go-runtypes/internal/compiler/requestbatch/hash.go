package requestbatch

import (
	"crypto/sha256"
	"encoding/base64"
	"strconv"
	"strings"
)

// BatchIdPrefix marks an injected batch id so it can never be mistaken for a
// route id or a pure-fn key.
const BatchIdPrefix = "b_"

// routeIdSeparator joins the ordered route ids into the hash input. A route id
// is a `/`-joined property chain and a property name can never contain `,`,
// so the join is injective: two different route lists never share an input.
const routeIdSeparator = ","

// mappingSeparator ends the route list and separates the mappings that follow
// it; neither a route id nor a mapper key can contain a newline.
const mappingSeparator = "\n"

// batchIdLength is the number of base64url characters kept from the sha256
// digest: 14 characters carry 84 bits, the same size the pure-fn keys use
// (purefunctions.CodeHash), so a collision between two real batches is a
// theoretical event, not a practical one. A short rolling hash would not do:
// its 32-bit state caps the distinct ids at four billion however long the
// printed string is.
const batchIdLength = 14

// BatchId derives the deterministic id of a batch from its ORDERED route ids
// and its input mappings (in canonical order, every field). Two call sites
// naming the same routes with different `inputFrom` mappers, a common shape
// (the same routes with different filters), are two batches with two ids, so
// they never compete for one server-side plan.
//
// Deliberately NO version salt and NO collision dictionary: the id is a wire
// contract between two separately built artifacts (the client bundle carrying
// the injected id and the server build registering the plan under it), so it
// must not move with the binary version the way typeIDs do, and it cannot be
// dictionary-extended because the two builds share no dictionary. The digest
// is wide enough that a collision is theoretical; the whole-program check
// still reports one as BAT003 rather than shipping a silently wrong plan.
func BatchId(routeIds []string, mappings []Mapping) string {
	sum := sha256.Sum256([]byte(batchIdInput(routeIds, mappings)))
	return BatchIdPrefix + base64.RawURLEncoding.EncodeToString(sum[:])[:batchIdLength]
}

// batchIdInput renders the definition the id stands for: the route list, then
// one line per mapping in canonical order.
func batchIdInput(routeIds []string, mappings []Mapping) string {
	var input strings.Builder
	input.WriteString(strings.Join(routeIds, routeIdSeparator))
	sorted := append([]Mapping(nil), mappings...)
	sortMappings(sorted)
	for _, mapping := range sorted {
		input.WriteString(mappingSeparator)
		input.WriteString(mapping.FromId)
		input.WriteString(">")
		input.WriteString(mapping.ToId)
		input.WriteString("#")
		input.WriteString(strconv.Itoa(mapping.ParamIndex))
		input.WriteString("@")
		input.WriteString(mapping.MapperKey)
	}
	return input.String()
}
