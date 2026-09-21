package purefunctions

import (
	"crypto/sha256"
	"encoding/base64"
	"regexp"
	"strings"
)

// bodyHashLength keeps enough base64url characters of the sha256 digest to make a collision
// between two bodies of one build implausible, while emitted modules stay readable.
const bodyHashLength = 14

var horizontalWhitespace = regexp.MustCompile(`[ \t]+`)

// CodeHash hashes ONLY the normalized code, with no id prefix, so two structurally
// identical bodies collapse to one entry.
func CodeHash(code string) string {
	normalized := strings.TrimSpace(horizontalWhitespace.ReplaceAllString(code, " "))
	sum := sha256.Sum256([]byte(normalized))
	return base64.RawURLEncoding.EncodeToString(sum[:])[:bodyHashLength]
}
