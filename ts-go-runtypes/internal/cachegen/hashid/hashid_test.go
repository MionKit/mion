package hashid

import (
	"errors"
	"strconv"
	"strings"
	"testing"
)

// idempotence: same input → same hash, no matter how many times we ask.
func TestUnique_Idempotent(t *testing.T) {
	d := New()
	for i := 0; i < 100; i++ {
		id := "type" + strconv.Itoa(i)
		first, err := d.Unique(id, 6)
		if err != nil {
			t.Fatalf("unique[1] %q: %v", id, err)
		}
		second, err := d.Unique(id, 6)
		if err != nil {
			t.Fatalf("unique[2] %q: %v", id, err)
		}
		if first != second {
			t.Fatalf("idempotence broken for %q: %s != %s", id, first, second)
		}
	}
}

// uniqueness at the default length: 10k synthetic structural-id strings
// produce 10k distinct hashes, all exactly DefaultLength long. Run at the
// length real builds use — the dictionary no longer grows ids, so this is
// what a project of that size actually gets.
func TestUnique_NoCollisionsOver10k(t *testing.T) {
	d := New()
	seen := make(map[string]string, 10000)
	for i := 0; i < 10000; i++ {
		id := "type-" + strconv.Itoa(i*7919) // any deterministic distinct stream
		hash, err := d.Unique(id, DefaultLength)
		if err != nil {
			t.Fatalf("unique %q: %v", id, err)
		}
		if len(hash) != DefaultLength {
			t.Fatalf("id %q got length %d, want %d (%q)", id, len(hash), DefaultLength, hash)
		}
		if other, dup := seen[hash]; dup {
			t.Fatalf("collision: hash %q shared by %q and %q", hash, id, other)
		}
		seen[hash] = id
	}
}

// hashes are always valid JS identifier prefixes (start with a letter).
func TestQuickHash_FirstCharIsLetter(t *testing.T) {
	for i := 0; i < 1000; i++ {
		h := QuickHash("input-"+strconv.Itoa(i), 6)
		if !strings.ContainsRune(alphaChars, rune(h[0])) {
			t.Fatalf("first char of %q is not a letter", h)
		}
		if len(h) != 6 {
			t.Fatalf("expected length 6, got %d for %q", len(h), h)
		}
	}
}

// hash output respects the requested length.
func TestQuickHash_Length(t *testing.T) {
	for _, n := range []int{4, 6, 8, 10, 16, 24} {
		h := QuickHash("hello", n)
		if len(h) != n {
			t.Fatalf("length %d: got %d (%q)", n, len(h), h)
		}
	}
}

// prefix stability: the id at a shorter length is a prefix of the id at a
// longer one, so the same input stays recognisable when a project raises
// hashLength.
func TestQuickHash_PrefixStable(t *testing.T) {
	short := QuickHash("hello", 6)
	long := QuickHash("hello", 8)
	if !strings.HasPrefix(long, short) {
		t.Fatalf("lengths do not share a prefix: short=%q long=%q", short, long)
	}
}

// every printed character is fresh information: the pair that collided in
// the old 32-bit lane (97*37+69 == 98*37+32) prints different ids at every
// length, and 20k inputs share no 7-char or 10-char id at all.
func TestQuickHash_EveryCharacterCounts(t *testing.T) {
	for _, n := range []int{4, 7, 10} {
		if QuickHash("aE", n) == QuickHash("b ", n) {
			t.Fatalf("length %d: the old lane collision survives", n)
		}
	}
	for _, n := range []int{7, 10} {
		seen := make(map[string]string, 20000)
		for i := 0; i < 20000; i++ {
			input := "structural-id-" + strconv.Itoa(i*104729)
			hash := QuickHash(input, n)
			if other, dup := seen[hash]; dup {
				t.Fatalf("length %d: %q shared by %q and %q", n, hash, input, other)
			}
			seen[hash] = input
		}
	}
	// characters beyond the first word come from the second lane, not from a
	// re-spelling of the first: they differ across inputs too
	tails := make(map[string]bool)
	for i := 0; i < 1000; i++ {
		tails[QuickHash("input-"+strconv.Itoa(i), 20)[10:20]] = true
	}
	if len(tails) != 1000 {
		t.Fatalf("second-lane characters are not distinct: %d/1000", len(tails))
	}
}

// a salted hash equals the hash of the concatenation, which is what lets the
// dictionary fold the binary version in without keeping a salted copy of
// every id.
func TestQuickHash_SaltIsConcatenation(t *testing.T) {
	if QuickHash("v1|hello", 9) != QuickHashSalted("v1|", "hello", 9) {
		t.Fatalf("salted hash differs from the concatenation")
	}
}

// collidingPair finds two distinct inputs that print the same id at `length`.
// Deterministic sweep: length 1 has only 52 possible ids (the first character
// is a letter), so a pair always turns up within the first handful of tries.
func collidingPair(t *testing.T, length int) (string, string) {
	t.Helper()
	seen := make(map[string]string)
	for i := 0; i < 1000; i++ {
		input := "collide-" + strconv.Itoa(i)
		hash := QuickHash(input, length)
		if owner, dup := seen[hash]; dup {
			return owner, input
		}
		seen[hash] = input
	}
	t.Fatalf("no colliding pair at length %d in 1000 inputs", length)
	return "", ""
}

// a genuine collision FAILS, naming both sides. Growing the id instead would
// hand the two inputs ids of different lengths with nobody told.
func TestUnique_CollisionIsAnError(t *testing.T) {
	owner, incoming := collidingPair(t, 1)
	d := New()
	first, err := d.Unique(owner, 1)
	if err != nil {
		t.Fatalf("first insert must succeed: %v", err)
	}
	second, err := d.Unique(incoming, 1)
	if err == nil {
		t.Fatalf("expected a collision for %q, got id %q", incoming, second)
	}
	if second != "" {
		t.Fatalf("a failed insert must return no id, got %q", second)
	}
	var collision *Collision
	if !errors.As(err, &collision) {
		t.Fatalf("expected a *Collision, got %T: %v", err, err)
	}
	if collision.Hash != first || collision.Owner != owner || collision.ID != incoming || collision.Length != 1 {
		t.Fatalf("collision does not name both sides: %+v (first=%q)", collision, first)
	}
	// The loser is not recorded, so the dictionary still describes only what it
	// actually assigned.
	if dict := d.Lookup(first); dict != owner {
		t.Fatalf("hash %q should still belong to %q, got %q", first, owner, dict)
	}
}

// every assigned id is exactly the requested length, at every length and even
// once the dictionary is busy.
func TestUnique_EveryIdHasTheRequestedLength(t *testing.T) {
	for _, length := range []int{4, 7, 11} {
		d := New()
		for i := 0; i < 500; i++ {
			hash, err := d.Unique("length-"+strconv.Itoa(i), length)
			if err != nil {
				t.Fatalf("length %d: %v", length, err)
			}
			if len(hash) != length {
				t.Fatalf("length %d: got %d (%q)", length, len(hash), hash)
			}
		}
	}
}
