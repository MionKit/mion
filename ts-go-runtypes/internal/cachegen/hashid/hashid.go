// Package hashid produces the short, JavaScript-friendly ids the generated
// modules are named and keyed by: a string of the requested length whose
// first character is a letter (so an id is a valid JS identifier when used
// as a binding name) and whose remaining characters are letters and digits.
//
// Every printed character carries fresh information. The input is folded
// into a 128-bit state (two independent 64-bit lanes over the same bytes,
// each passed through a standard 64-bit finalizer), and the characters are
// the base-62 digits of that state, so a longer id is a stronger id up to
// twenty characters: about 24 bits at 4 characters, 42 at 7, 48 at 8, 64
// at 11. The earlier single 32-bit lane printed the same four billion
// values however long the id was.
//
// Contracts the rest of the resolver relies on:
//
//   - determinism: the same input always prints the same id, at any length
//   - prefix stability: QuickHash(x, n) is a prefix of QuickHash(x, m) for
//     n < m, so ids at two lengths stay recognisable next to each other
//   - fixed length through Dict: every id is exactly the requested length.
//     Two distinct inputs landing on one hash is a Collision the caller is
//     told about, never a silently longer id — with the two lanes above
//     that is a genuinely rare event, so failing costs nothing in practice.
package hashid

import (
	"fmt"
)

const (
	alphaChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
	hashChars  = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

	// DefaultLength is the hash length for type ids (literals included).
	DefaultLength = 7

	// The two lanes fold the input bytes with different seeds and different
	// odd multipliers (FNV-1a's, and the 64-bit golden ratio), so an input
	// pair colliding in one lane has no reason to collide in the other.
	laneASeed  = uint64(0xcbf29ce484222325)
	laneAPrime = uint64(0x100000001b3)
	laneBSeed  = uint64(0x27d4eb2f165667c5)
	laneBPrime = uint64(0x9e3779b97f4a7c15)

	// digitsPerWord is how many base-62 characters one finalized 64-bit word
	// yields: 62^10 < 2^64, so ten digits are drawn from real bits.
	digitsPerWord = 10
)

// QuickHash computes a deterministic short alphanumeric string from input.
// First character is from `alphaChars` (letters only) so the result is a
// valid JS identifier prefix.
func QuickHash(input string, length int) string {
	return QuickHashSalted("", input, length)
}

// QuickHashSalted is QuickHash over the byte sequence salt+input without
// materializing the concatenation: the lanes consume the salt bytes first,
// so the result is byte-identical to QuickHash(salt+input). Lets
// Dict.UniqueSalted avoid retaining a salted copy of every id.
func QuickHashSalted(salt, input string, length int) string {
	if length < 1 {
		length = 1
	}
	laneA, laneB := laneASeed, laneBSeed
	for i := 0; i < len(salt); i++ {
		laneA, laneB = feed(laneA, laneB, salt[i])
	}
	for i := 0; i < len(input); i++ {
		laneA, laneB = feed(laneA, laneB, input[i])
	}
	result := make([]byte, 0, length)
	stream := newWordStream(finalize(laneA), finalize(laneB))
	for position := 0; position < length; position++ {
		result = append(result, stream.charAt(position))
	}
	return string(result)
}

// feed folds one byte into both lanes: xor-then-multiply on the FNV prime for
// the first, multiply-then-add on the golden-ratio multiplier for the second.
func feed(laneA, laneB uint64, value byte) (uint64, uint64) {
	return (laneA ^ uint64(value)) * laneAPrime, laneB*laneBPrime + uint64(value) + 1
}

// finalize is MurmurHash3's 64-bit finalizer: it spreads every input bit over
// the whole word, so the base-62 digits taken from the low end are uniform
// even for short inputs, where a bare rolling product stays small.
func finalize(word uint64) uint64 {
	word ^= word >> 33
	word *= 0xff51afd7ed558ccd
	word ^= word >> 33
	word *= 0xc4ceb9fe1a85ec53
	word ^= word >> 33
	return word
}

// wordStream hands out the 64-bit words the characters are drawn from: the
// two finalized lanes first (128 fresh bits, twenty characters), then words
// derived from those for the rare id longer than that.
type wordStream struct {
	words []uint64
}

func newWordStream(first, second uint64) *wordStream {
	return &wordStream{words: []uint64{first, second}}
}

func (stream *wordStream) word(index int) uint64 {
	for len(stream.words) <= index {
		count := uint64(len(stream.words))
		previous, beforePrevious := stream.words[len(stream.words)-1], stream.words[len(stream.words)-2]
		stream.words = append(stream.words, finalize(previous^beforePrevious+count*laneBPrime))
	}
	return stream.words[index]
}

// charAt prints the character at `position`: the base-62 digits of each word
// in order, except position 0, which is a letter so the id is an identifier.
func (stream *wordStream) charAt(position int) byte {
	word := stream.word(position / digitsPerWord)
	digit := position % digitsPerWord
	if position == 0 {
		return alphaChars[word%uint64(len(alphaChars))]
	}
	if position < digitsPerWord {
		// the first word gave its lowest digit to the letter, in base 52
		word /= uint64(len(alphaChars))
		digit--
	}
	for ; digit > 0; digit-- {
		word /= uint64(len(hashChars))
	}
	return hashChars[word%uint64(len(hashChars))]
}

// Collision reports that two distinct inputs land on the same hash at the
// requested length. The caller turns it into a user-facing diagnostic, so it
// carries both sides plus the length that was asked for.
type Collision struct {
	// Hash is the short id both inputs want.
	Hash string
	// ID is the incoming input; Owner already holds Hash.
	ID    string
	Owner string
	// Length is the hash length the collision happened at.
	Length int
}

func (collision *Collision) Error() string {
	return fmt.Sprintf("hashid: %q and %q both hash to %q at length %d",
		collision.Owner, collision.ID, collision.Hash, collision.Length)
}

// Dict is a stateful deduplicator that maps structural ids to short hash
// ids of exactly the requested length. Two distinct inputs landing on one
// hash is reported as a *Collision, never resolved by growing the id.
// NOT safe for concurrent use.
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
// `length` make the second call fail with a *Collision.
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
	hash := QuickHashSalted(salt, id, length)
	owner, taken := dict.entries[hash]
	if taken && owner != id {
		// A DIFFERENT input already holds this hash. Growing the length here
		// would hand the two inputs ids of different lengths with nobody told,
		// so the caller hears about it instead and can raise the length for
		// the whole run.
		return "", &Collision{Hash: hash, ID: id, Owner: owner, Length: length}
	}
	// `taken && owner == id` is an idempotent hit the reverse map somehow
	// missed (shouldn't happen, but the write below repairs it).
	dict.entries[hash] = id
	dict.reverse[id] = hash
	return hash, nil
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
