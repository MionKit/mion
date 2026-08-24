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
