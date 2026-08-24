// Package hashid ports the quickHash algorithm to Go: a 32-bit-modular
// rolling hash that produces short alphanumeric strings whose first character
// is a letter (so the result is a valid JS identifier when used as a binding
// name). On collisions the length grows by 2 per attempt and the previous
// hash is used as a seed so the new value is a prefix-shared extension.
//
// We mirror the reference algorithm semantically (PRIME=37, alpha-first char,
// collision-extends-by-2) without claiming byte-for-byte equivalence with the
// JS implementation. The only contracts that matter here are:
//
//   - idempotence: hashing the same input twice within one Dict yields the same hash
//   - uniqueness: distinct inputs yield distinct hashes (collision-extension guarantees this)
//
// See (ref: packages/core/src/pureFns/quickHash.ts).
package hashid

import (
	"errors"
	"fmt"
)

const (
	alphaChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
	hashChars  = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	prime      = uint32(37)

	// DefaultLength is the starting hash length for type ids (literals included).
	DefaultLength = 7

	// hashIncrement: collision attempt N grows the length by N*hashIncrement.
	hashIncrement = 2
	// MaxCollisions caps how many times we'll grow before giving up.
	MaxCollisions = 22
)

// QuickHash computes a deterministic short alphanumeric string from input.
// First character is from `alphaChars` (letters only) so the result is a
// valid JS identifier prefix. `prev` lets a collision-extension continue
// the previous hash chain rather than restart — pass "" for a fresh hash.
func QuickHash(input string, length int, prev string) string {
	return QuickHashSalted("", input, length, prev)
}

// QuickHashSalted is QuickHash over the byte sequence salt+input without
// materializing the concatenation — the rolling hash consumes the salt
// bytes first, so the result is byte-identical to QuickHash(salt+input).
// Lets Dict.UniqueSalted avoid retaining a salted copy of every id.
func QuickHashSalted(salt, input string, length int, prev string) string {
	if length < 1 {
		length = 1
	}
	var hash uint32
	// Go's uint32 multiplication wraps mod 2^32 — same low-32 bits as
	// JS's Math.imul + `>>> 0`. ASCII inputs only (our structural ids
	// are all ASCII) so byte-indexing matches charCodeAt semantics.
	for i := 0; i < len(salt); i++ {
		hash = hash*prime + uint32(salt[i])
	}
	for i := 0; i < len(input); i++ {
		hash = hash*prime + uint32(input[i])
	}
	result := []byte(prev)
	// First character: from the 52-letter alphabet so the hash is a valid
	// JS identifier when used as a variable name.
	hash = hash * prime
	if len(result) == 0 {
		result = append(result, alphaChars[hash%uint32(len(alphaChars))])
	}
	// Remaining characters: from the 62-char alphanumeric alphabet.
	for len(result) < length {
		hash = hash * prime
		result = append(result, hashChars[hash%uint32(len(hashChars))])
	}
	if len(result) > length {
		result = result[:length]
	}
	return string(result)
}

// Dict is a stateful deduplicator that maps structural ids to short hash
// ids, growing the hash length on collision so distinct inputs always
// produce distinct outputs. NOT safe for concurrent use.
type Dict struct {
	// entries: hash → original input id. Used to detect collisions.
	entries map[string]string
	// reverse: original input id → assigned hash. Used for idempotence.
	reverse map[string]string
}

// New creates an empty Dict.
func New() *Dict {
	return &Dict{
		entries: make(map[string]string),
		reverse: make(map[string]string),
	}
}

// Unique returns a unique hash for `id`. Repeat calls with the same `id`
// return the same hash. Two distinct ids that hash to the same string at
// `length` cause the second call to extend the length and re-hash.
func (dict *Dict) Unique(id string, length int) (string, error) {
	return dict.UniqueSalted("", id, length)
}

// UniqueSalted is Unique with the hash computed over salt+id while the
// dictionary stores only the bare `id`. The salt MUST be constant for the
// lifetime of one Dict (ours is the binary-version prefix) — entries from
// different salts would otherwise collide on the same key space. Storing
// the unsalted id halves the retained text per entry: the id string
// shares its backing bytes with the caller's copy instead of pinning a
// fresh salted concatenation.
func (dict *Dict) UniqueSalted(salt, id string, length int) (string, error) {
	if existing, ok := dict.reverse[id]; ok {
		return existing, nil
	}
	if length < 1 {
		length = DefaultLength
	}
	hash := QuickHashSalted(salt, id, length, "")
	counter := 1
	for {
		owner, taken := dict.entries[hash]
		if !taken {
			dict.entries[hash] = id
			dict.reverse[id] = hash
			return hash, nil
		}
		if owner == id {
			// Idempotent hit — somehow the reverse map didn't catch it
			// (shouldn't happen, but guard anyway).
			dict.reverse[id] = hash
			return hash, nil
		}
		// Collision: grow length and continue the hash chain.
		length += counter * hashIncrement
		hash = QuickHashSalted(salt, id, length, hash)
		counter++
		if counter > MaxCollisions {
			return "", fmt.Errorf("hashid: too many collisions for %q (last hash %q)", id, hash)
		}
	}
}

// Has reports whether `hash` is already assigned in this Dict.
func (dict *Dict) Has(hash string) bool {
	_, ok := dict.entries[hash]
	return ok
}

// Lookup returns the original structural id for a given hash, or "" if absent.
func (dict *Dict) Lookup(hash string) string {
	return dict.entries[hash]
}

// Reset clears the dictionary. Useful for tests.
func (dict *Dict) Reset() {
	dict.entries = make(map[string]string)
	dict.reverse = make(map[string]string)
}

// ErrTooManyCollisions is returned by Unique when the maximum collision
// retry count is exceeded.
var ErrTooManyCollisions = errors.New("hashid: too many collisions")
