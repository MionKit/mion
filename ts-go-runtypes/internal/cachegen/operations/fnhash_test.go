package operations

import (
	"testing"

	"github.com/mionkit/ts-runtypes/internal/constants"
)

// expectedCanonicalKeyCount is a canary. Base set = 53: 12 AxisNone ops × 1,
// huk's 2 HasUnknownKeysOptions subsets, val+verr's 16 ValidateOptions subsets
// each (32; 4 options — noLiterals, noIsArrayCheck, numberTypeof, numberNotNaN —
// → 2^4), jsonEncoder's 4 + jsonDecoder's 3 strategies (7). On top, the four
// CircularGuarded ops fork on rejectCircular, ADDING one armed key per plain
// variant: val +16, verr +16, tb +1, jsonEncoder +4 = +37. If this trips, an
// operation (or the circular fork) changed without updating the count (and you
// should re-confirm the collision guard still holds).
//
// +64: the fused validators vst / vest (the `{checkUnknowns: true}` families).
// Each carries the SAME shape as its plain twin — 16 ValidateOptions subsets plus
// 16 armed rejectCircular forks — so 32 keys apiece. Adding them is what forced
// FnHashLen 3 → 4 (see fnhash.go).
//
// +3: the createParseFn families — parse / parseStrip / parseFail. AxisNone
// and not CircularGuarded (a JSON.parse output cannot hold a cycle), so one key
// each; the undeclared-key strategy is the operation, not an axis (see the
// registry).
const expectedCanonicalKeyCount = 53 + 37 + 1 + 1 + 64 + 3 // +1: the jsonSchema (jsc) document operation; +1: the classSerializerReg (csr) name card

func TestFnHashCollisionFree(t *testing.T) {
	// Runs at init too, but assert here so the failure is a test, not a panic.
	mustBeCollisionFree()

	keys := allCanonicalKeys()
	if len(keys) != expectedCanonicalKeyCount {
		t.Fatalf("canonical key count = %d, want %d (operation set changed?)", len(keys), expectedCanonicalKeyCount)
	}

	seen := make(map[string]string, len(keys))
	for _, key := range keys {
		hash := FnHash(key)
		if len(hash) != FnHashLen {
			t.Errorf("FnHash(%q) = %q has length %d, want %d", key, hash, len(hash), FnHashLen)
		}
		if other, dup := seen[hash]; dup {
			t.Errorf("collision: %q and %q both hash to %q", other, key, hash)
		}
		seen[hash] = key
	}
}

func TestFnHashDeterministic(t *testing.T) {
	validate, _ := ByName("validate")
	a := FnHashFor(validate, []string{"noLiterals"}, "", false)
	b := FnHashFor(validate, []string{"noLiterals"}, "", false)
	if a != b {
		t.Fatalf("FnHashFor not deterministic: %q vs %q", a, b)
	}
}

func TestCanonicalOptionOrderIndependent(t *testing.T) {
	validate, _ := ByName("validate")
	forward := Canonical(validate, []string{"noLiterals", "noIsArrayCheck"}, "", false)
	reverse := Canonical(validate, []string{"noIsArrayCheck", "noLiterals"}, "", false)
	if forward != reverse {
		t.Fatalf("Canonical is option-order-dependent: %q vs %q", forward, reverse)
	}
	if FnHashFor(validate, []string{"noLiterals", "noIsArrayCheck"}, "", false) != FnHashFor(validate, []string{"noIsArrayCheck", "noLiterals"}, "", false) {
		t.Fatal("FnHashFor is option-order-dependent")
	}
}

func TestCanonicalDistinguishesOptionSets(t *testing.T) {
	validate, _ := ByName("validate")
	plain := FnHashFor(validate, nil, "", false)
	noLiterals := FnHashFor(validate, []string{"noLiterals"}, "", false)
	if plain == noLiterals {
		t.Fatal("plain and noLiterals validate must hash differently")
	}
}

// TestRejectCircularForksHash pins the new contract: rejectCircular forks a
// CircularGuarded op's fnHash across every axis (validate options, none, json
// strategy) and is orthogonal to the other options — while leaving a
// non-guarded op untouched.
func TestRejectCircularForksHash(t *testing.T) {
	validate, _ := ByName("validate")
	verr, _ := ByName("validationErrors")
	toBinary, _ := ByName("toBinary")
	jsonEncoder, _ := ByName("jsonEncoder")
	fromBinary, _ := ByName("fromBinary") // not CircularGuarded

	forks := func(name string, op Operation, options []string, strategy string) {
		plain := FnHashFor(op, options, strategy, false)
		armed := FnHashFor(op, options, strategy, true)
		if plain == armed {
			t.Fatalf("%s: rejectCircular did not fork the fnHash (%q)", name, plain)
		}
	}
	forks("validate", validate, nil, "")
	forks("validate|NL", validate, []string{"noLiterals"}, "")
	forks("validationErrors", verr, nil, "")
	forks("toBinary", toBinary, nil, "")
	forks("jsonEncoder|clone", jsonEncoder, nil, "clone")
	forks("jsonEncoder|mutate", jsonEncoder, nil, "mutate")

	// A non-guarded op ignores rejectCircular entirely.
	if FnHashFor(fromBinary, nil, "", false) != FnHashFor(fromBinary, nil, "", true) {
		t.Fatal("fromBinary is not CircularGuarded; rejectCircular must be a no-op")
	}
}

// TestFnHash_StableAcrossVersions pins the version-INDEPENDENCE contract: an
// fnHash is a pure function of its canonical key, never of constants.Version.
// This is the inverse of the old TestFnHashVersionSensitive — the version now
// lives ONLY in the typeId half of every `<fnHash>_<typeId>` key (see
// runtype/version_test.go for the typeId side, and
// runtype.TestCompositeKey_DiffersAcrossVersions for the composite key that
// still moves across versions through that half). Keeping fn-hashes stable is
// what lets a consumer pin `family → prefix` once and never re-pin on a bump.
func TestFnHash_StableAcrossVersions(t *testing.T) {
	original := constants.Version
	defer func() { constants.Version = original }()

	constants.Version = "v1.test"
	one := FnHash("validate|")
	constants.Version = "v2.test"
	two := FnHash("validate|")
	if one != two {
		t.Fatalf("FnHash must be version-independent: %q != %q across versions", one, two)
	}
}

func TestByFnKey(t *testing.T) {
	cases := map[string]string{
		"val":         "validate",
		"verr":        "validationErrors",
		"jsonEncoder": "jsonEncoder",
		"jsonDecoder": "jsonDecoder",
		"tb":          "toBinary",
	}
	for fnKey, wantName := range cases {
		op, ok := ByFnKey(fnKey)
		if !ok {
			t.Errorf("ByFnKey(%q) not found", fnKey)
			continue
		}
		if op.Name != wantName {
			t.Errorf("ByFnKey(%q).Name = %q, want %q", fnKey, op.Name, wantName)
		}
	}
	// A marker names an operation by its FnKey (the tag "pj"), never by its
	// canonical Name — so the Name must not resolve as an FnKey.
	if _, ok := ByFnKey("prepareForJson"); ok {
		t.Error("operation name prepareForJson must not be reachable by FnKey (its FnKey is \"pj\")")
	}
}

func TestByFamilyTag(t *testing.T) {
	op, ok := ByFamilyTag("pj")
	if !ok || op.Name != "prepareForJson" {
		t.Fatalf("ByFamilyTag(\"pj\") = %+v, %v; want prepareForJson", op, ok)
	}
	// Composite operations have no family tag and must not be indexed.
	if _, ok := ByFamilyTag(""); ok {
		t.Error("empty family tag must not resolve")
	}
}

func TestPlainHashMatchesDefaultVariant(t *testing.T) {
	validate, _ := ByName("validate")
	if PlainHash("validate") != FnHashFor(validate, nil, "", false) {
		t.Fatal("PlainHash must equal the default-variant fnHash")
	}
	// jsonEncoder's plain form is its default strategy.
	jsonEncoder, _ := ByName("jsonEncoder")
	if PlainHash("jsonEncoder") != FnHashFor(jsonEncoder, nil, jsonEncoder.DefaultStrategy, false) {
		t.Fatal("PlainHash for a composite must equal its default-strategy fnHash")
	}
}
