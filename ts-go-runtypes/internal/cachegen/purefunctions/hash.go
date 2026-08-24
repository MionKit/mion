package purefunctions

import (
	"crypto/sha256"
	"encoding/base64"
	"regexp"
	"strings"
)

// bodyHashLength matches the reference BODY_HASH_LENGTH constant
// (ref: packages/devtools/src/vite-plugin/constants.ts:8). Kept here
// rather than in internal/constants/ because it's tightly coupled to
// the hash algorithm — changing one without the other silently breaks
// cross-toolchain artifact loading.
const bodyHashLength = 14

var horizontalWhitespace = regexp.MustCompile(`[ \t]+`)

// BodyHash mirrors the reference algorithm byte-for-byte:
//
//	sha256(namespace + functionName + normalize(code)).Base64URL()[:14]
//
// where normalize collapses runs of spaces/tabs to a single space and trims
// leading/trailing whitespace. Newlines inside the body are preserved (we
// only collapse horizontal whitespace).
//
// Source ref: packages/devtools/src/vite-plugin/extractPureFn.ts:439-443.
func BodyHash(namespace, functionName, code string) string {
	normalized := strings.TrimSpace(horizontalWhitespace.ReplaceAllString(code, " "))
	sum := sha256.Sum256([]byte(namespace + functionName + normalized))
	return base64.RawURLEncoding.EncodeToString(sum[:])[:bodyHashLength]
}

// CodeHash hashes ONLY the normalized code, with no namespace/functionName
// prefix. It exists for the `overrideX<T>(pureFn)` override path, where the
// pure-fn's name IS derived from its body hash (`cfn::<CodeHash(body)>`), so
// BodyHash's functionName input can't depend on a name that doesn't exist yet.
// Same normalize + length as BodyHash so two structurally-identical override
// bodies collapse to one `cfn::` entry (content-addressed dedup).
func CodeHash(code string) string {
	normalized := strings.TrimSpace(horizontalWhitespace.ReplaceAllString(code, " "))
	sum := sha256.Sum256([]byte(normalized))
	return base64.RawURLEncoding.EncodeToString(sum[:])[:bodyHashLength]
}
