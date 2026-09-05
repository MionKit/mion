package hashid

import (
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

// uniqueness: 10k synthetic structural-id strings produce 10k distinct hashes
// (collision-extension grows the length when two inputs collide).
func TestUnique_NoCollisionsOver10k(t *testing.T) {
	d := New()
	seen := make(map[string]string, 10000)
	for i := 0; i < 10000; i++ {
		id := "type-" + strconv.Itoa(i*7919) // any deterministic distinct stream
		hash, err := d.Unique(id, 6)
		if err != nil {
			t.Fatalf("unique %q: %v", id, err)
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
		h := QuickHash("input-"+strconv.Itoa(i), 6, "")
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
		h := QuickHash("hello", n, "")
		if len(h) != n {
			t.Fatalf("length %d: got %d (%q)", n, len(h), h)
		}
	}
}

// extension via prev: a longer hash from a colliding input shares the
// shorter hash as prefix (so users can correlate them in logs).
func TestQuickHash_PrevExtension(t *testing.T) {
	short := QuickHash("hello", 6, "")
	long := QuickHash("hello", 8, short)
	if !strings.HasPrefix(long, short) {
		t.Fatalf("extension does not share prefix: short=%q long=%q", short, long)
	}
}

// every printed character is fresh information: the pair that collided in
// the old 32-bit lane (97*37+69 == 98*37+32) prints different ids at every
// length, and 20k inputs share no 7-char or 10-char id at all.
func TestQuickHash_EveryCharacterCounts(t *testing.T) {
	for _, n := range []int{4, 7, 10} {
		if QuickHash("aE", n, "") == QuickHash("b ", n, "") {
			t.Fatalf("length %d: the old lane collision survives", n)
		}
	}
	for _, n := range []int{7, 10} {
		seen := make(map[string]string, 20000)
		for i := 0; i < 20000; i++ {
			input := "structural-id-" + strconv.Itoa(i*104729)
			hash := QuickHash(input, n, "")
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
		tails[QuickHash("input-"+strconv.Itoa(i), 20, "")[10:20]] = true
	}
	if len(tails) != 1000 {
		t.Fatalf("second-lane characters are not distinct: %d/1000", len(tails))
	}
}

// an extension is byte-identical to a fresh hash of the longer length, and a
// salted hash equals the hash of the concatenation.
func TestQuickHash_ExtensionEqualsFreshAndSaltIsConcatenation(t *testing.T) {
	short := QuickHash("hello", 7, "")
	if extended, fresh := QuickHash("hello", 13, short), QuickHash("hello", 13, ""); extended != fresh {
		t.Fatalf("extension %q != fresh %q", extended, fresh)
	}
	if QuickHash("v1|hello", 9, "") != QuickHashSalted("v1|", "hello", 9, "") {
		t.Fatalf("salted hash differs from the concatenation")
	}
	if QuickHash("hello", 3, "hello12") != "hel" {
		t.Fatalf("a prev longer than the length must be truncated")
	}
}

// the dictionary resolves a genuine collision by extending, never by giving up.
func TestUnique_ResolvesCollisionByExtension(t *testing.T) {
	d := New()
	first, err := d.Unique("aE", 1)
	if err != nil {
		t.Fatal(err)
	}
	second, err := d.Unique("b ", 1)
	if err != nil {
		t.Fatal(err)
	}
	if first == second || !strings.HasPrefix(second, QuickHash("b ", 1, "")) {
		t.Fatalf("collision not resolved: %q / %q", first, second)
	}
}
