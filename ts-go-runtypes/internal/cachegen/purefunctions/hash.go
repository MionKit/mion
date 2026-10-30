package purefunctions

import (
	"crypto/sha256"
	"encoding/base64"
	"regexp"
	"strings"
)

// bodyHashLength keeps 60 bits: no plausible collision within one package; every body naming an id pays per character.
const bodyHashLength = 10

var horizontalWhitespace = regexp.MustCompile(`[ \t]+`)

// CodeHash hashes ONLY the normalized code, with no id prefix, so two structurally
// identical bodies collapse to one entry.
func CodeHash(code string) string {
	normalized := strings.TrimSpace(horizontalWhitespace.ReplaceAllString(code, " "))
	sum := sha256.Sum256([]byte(normalized))
	return base64.RawURLEncoding.EncodeToString(sum[:])[:bodyHashLength]
}
