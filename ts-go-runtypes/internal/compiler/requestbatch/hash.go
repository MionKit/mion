package requestbatch

import (
	"crypto/sha256"
	"encoding/base64"
	"strconv"
	"strings"
)

// BatchIdPrefix marks an injected batch id so it can never be mistaken for a route id or a pure-fn key.
const BatchIdPrefix = "b_"

// routeIdSeparator is injective over route ids: a property name can never contain `,`, so two different
// route lists never share a hash input.
const routeIdSeparator = ","

// mappingSeparator ends the route list and separates the mappings; neither a route id nor a mapper key holds a newline.
const mappingSeparator = "\n"

// batchIdLength carries 84 bits of the sha256 digest, the size purefunctions.CodeHash uses, so a collision
// between two real batches stays theoretical. A rolling hash would not do: its 32-bit state caps the
// distinct ids at four billion however long the printed string is.
const batchIdLength = 14

// BatchId derives the deterministic id of a batch from its ORDERED route ids and its mappings, so the same
// routes with different `inputFrom` mappers are two batches and never compete for one server-side plan.
// Deliberately NO version salt and NO collision dictionary: the id is a wire contract between the client
// bundle carrying it and the server build registering the plan under it, two separately built artifacts, so
// it must not move with the binary version the way typeIDs do, and they share no dictionary to extend.
func BatchId(routeIds []string, mappings []Mapping) string {
	sum := sha256.Sum256([]byte(batchIdInput(routeIds, mappings)))
	return BatchIdPrefix + base64.RawURLEncoding.EncodeToString(sum[:])[:batchIdLength]
}

// batchIdInput renders the definition the id stands for, the mappings in canonical order.
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
