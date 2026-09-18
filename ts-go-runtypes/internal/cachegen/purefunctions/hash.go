package purefunctions

import (
	"crypto/sha256"
	"encoding/base64"
	"regexp"
	"strings"
)

// bodyHashLength is how many base64url characters of the sha256 digest a body
// hash keeps. Fourteen is enough to make a collision between two bodies of one
// build implausible while keeping emitted modules readable.
const bodyHashLength = 14

var horizontalWhitespace = regexp.MustCompile(`[ \t]+`)

// CodeHash hashes ONLY the normalized code, with no id prefix. It is the name
// half of the id rule for a registration bound to no identifier (a callback
// handed straight to a wrapper) and for an `overrideX<T>(pureFn)` override,
// neither of which has a name to build on. Same normalize and length as
// BodyHash, so two structurally identical bodies collapse to one entry.
func CodeHash(code string) string {
	normalized := strings.TrimSpace(horizontalWhitespace.ReplaceAllString(code, " "))
	sum := sha256.Sum256([]byte(normalized))
	return base64.RawURLEncoding.EncodeToString(sum[:])[:bodyHashLength]
}
