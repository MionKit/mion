package operations

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
)

// expectedCanonicalKeyCount is a canary: when it trips, an operation changed, so re-confirm the collision guard holds.
// 19: 7 AxisNone ops, val + verr 3 each (3 numberModes), jsonEncoder 3 + jsonDecoder 3.
// +9: each CircularGuarded op adds one armed key per plain variant (val 3, verr 3, jsonEncoder 3).
// +12 each: vst / vest (`checkUnknowns`) and vuk / veuk (`checkUnionUnknowns`), 6 keys apiece like val / verr.
// vst / vest are what forced FnHashLen 3 → 4 (see fnhash.go).
// +1: restoreFromJsonClone (rjs), the stripping decode mirror of prepareForJsonClone.
const expectedCanonicalKeyCount = 19 + 9 + 1 + 1 + 12 + 12 + 1 // +1: the jsonSchema (jsc) document operation; +1: the classSerializerReg (csr) name card

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
	a := FnHashFor(validate, []string{"numberTypeof"}, "", false)
	b := FnHashFor(validate, []string{"numberTypeof"}, "", false)
	if a != b {
		t.Fatalf("FnHashFor not deterministic: %q vs %q", a, b)
	}
}

func TestCanonicalOptionOrderIndependent(t *testing.T) {
	validate, _ := ByName("validate")
	// Not a valid call-site set (both share one Group); it only checks the suffix ignores input order.
	forward := Canonical(validate, []string{"numberTypeof", "numberNotNaN"}, "", false)
	reverse := Canonical(validate, []string{"numberNotNaN", "numberTypeof"}, "", false)
	if forward != reverse {
		t.Fatalf("Canonical is option-order-dependent: %q vs %q", forward, reverse)
	}
	if FnHashFor(validate, []string{"numberTypeof", "numberNotNaN"}, "", false) != FnHashFor(validate, []string{"numberNotNaN", "numberTypeof"}, "", false) {
		t.Fatal("FnHashFor is option-order-dependent")
	}
}

func TestCanonicalDistinguishesOptionSets(t *testing.T) {
	validate, _ := ByName("validate")
	plain := FnHashFor(validate, nil, "", false)
	typeofMode := FnHashFor(validate, []string{"numberTypeof"}, "", false)
	notNaNMode := FnHashFor(validate, []string{"numberNotNaN"}, "", false)
	if plain == typeofMode || plain == notNaNMode || typeofMode == notNaNMode {
		t.Fatal("plain, numberTypeof and numberNotNaN validate must all hash differently")
	}
}

// TestRejectCircularForksHash pins the new contract: rejectCircular forks a
// CircularGuarded op's fnHash across every axis (validate options, none, json
// strategy) and is orthogonal to the other options — while leaving a
// non-guarded op untouched.
func TestRejectCircularForksHash(t *testing.T) {
	validate, _ := ByName("validate")
	verr, _ := ByName("validationErrors")
	jsonEncoder, _ := ByName("jsonEncoder")
	formatTransform, _ := ByName("formatTransform") // not CircularGuarded

	forks := func(name string, op Operation, options []string, strategy string) {
		plain := FnHashFor(op, options, strategy, false)
		armed := FnHashFor(op, options, strategy, true)
		if plain == armed {
			t.Fatalf("%s: rejectCircular did not fork the fnHash (%q)", name, plain)
		}
	}
	forks("validate", validate, nil, "")
	forks("validate|NT", validate, []string{"numberTypeof"}, "")
	forks("validationErrors", verr, nil, "")
	forks("jsonEncoder|clone", jsonEncoder, nil, "clone")
	forks("jsonEncoder|mutate", jsonEncoder, nil, "mutate")

	// A non-guarded op ignores rejectCircular entirely.
	if FnHashFor(formatTransform, nil, "", false) != FnHashFor(formatTransform, nil, "", true) {
		t.Fatal("formatTransform is not CircularGuarded; rejectCircular must be a no-op")
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
		"validate":            "validate",
		"validationErrors":    "validationErrors",
		"jsonEncoder":         "jsonEncoder",
		"jsonDecoder":         "jsonDecoder",
		"removeUnknownKeys":   "removeUnknownKeys",
		"prepareForJsonClone": "prepareForJsonClone",
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
	// Retired family tags must stay unreachable as FnKeys, so a stale `'verr'` is a build error (MKR014), not silence.
	for _, retired := range []string{"val", "verr", "pj", "pjs", "rjs", "huk"} {
		if _, ok := ByFnKey(retired); ok {
			t.Errorf("retired family tag %q must not resolve as an FnKey", retired)
		}
	}
}

// TestFnKeysAreReadable pins the two-vocabulary split: the marker token (FnKey)
// is readable and the emitted family tag stays short. Letting the two namespaces
// merge again is the failure mode this guards - a tag reused as a token would
// make the mion adapter's tag-to-key projection silently correct for one family
// and wrong for the rest.
func TestFnKeysAreReadable(t *testing.T) {
	tags := map[string]bool{}
	for _, op := range All() {
		if op.FamilyTag != "" {
			tags[op.FamilyTag] = true
		}
	}
	seen := map[string]string{}
	for _, op := range All() {
		if op.FnKey == "" {
			t.Errorf("operation %q has no FnKey: every operation must be nameable in a marker", op.Name)
			continue
		}
		if previous, taken := seen[op.FnKey]; taken {
			t.Errorf("FnKey %q is claimed by both %q and %q", op.FnKey, previous, op.Name)
		}
		seen[op.FnKey] = op.Name
		if tags[op.FnKey] {
			t.Errorf("FnKey %q collides with an emitted family tag: marker tokens and family tags are separate vocabularies", op.FnKey)
		}
	}
}

func TestByFamilyTag(t *testing.T) {
	op, ok := ByFamilyTag("pj")
	if !ok || op.Name != "prepareForJsonMutate" {
		t.Fatalf("ByFamilyTag(\"pj\") = %+v, %v; want prepareForJsonMutate", op, ok)
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

// TestSuggestFnKey pins MKR015's did-you-mean: a RETIRED family tag must suggest its own family, not the closest name.
func TestSuggestFnKey(t *testing.T) {
	retired := map[string]string{
		"val":  "validate",
		"verr": "validationErrors",
		"pjs":  "prepareForJsonClone",
		"rjs":  "restoreFromJsonClone",
	}
	for tag, want := range retired {
		if got := SuggestFnKey(tag); got != want {
			t.Errorf("SuggestFnKey(%q) = %q, want %q", tag, got, want)
		}
	}
	// A near miss on a real name still resolves.
	if got := SuggestFnKey("validationError"); got != "validationErrors" {
		t.Errorf("SuggestFnKey(\"validationError\") = %q, want validationErrors", got)
	}
	// Nothing close reports nothing rather than guessing.
	for _, nonsense := range []string{"", "zzzzzzzzzzzz", "notAFamilyAtAll"} {
		if got := SuggestFnKey(nonsense); got != "" {
			t.Errorf("SuggestFnKey(%q) = %q, want no suggestion", nonsense, got)
		}
	}
}

// TestEveryOperationIsDocumented pins the docs catalog's input. The page is
// generated from this registry, so an operation added without a description
// would render as a blank row on the public site rather than fail anything.
func TestEveryOperationIsDocumented(t *testing.T) {
	for _, op := range All() {
		if op.Doc == "" {
			t.Errorf("operation %q has no Doc: every function the catalog page lists needs its one-line description", op.Name)
			continue
		}
		// A description is a sentence for a reader, not a restatement of the name.
		if len(op.Doc) < 20 {
			t.Errorf("operation %q has a Doc too short to say anything: %q", op.Name, op.Doc)
		}
		if op.Doc[len(op.Doc)-1] != '.' {
			t.Errorf("operation %q Doc should read as a sentence and end with a period: %q", op.Name, op.Doc)
		}
	}
}

// TestEveryPublicOperationNamesItsFactory pins the other half of the catalog row: every
// operation a user can reach has a createX, so only non-Public plumbing leaves Factory empty.
func TestEveryPublicOperationNamesItsFactory(t *testing.T) {
	for _, op := range All() {
		if op.Public && op.Factory == "" {
			t.Errorf("public operation %q should name the createX factory that compiles it", op.Name)
		}
	}
}

// TestEveryPublicCallIsDistinct: operations sharing a factory need distinct CallOptions, or the catalog shows one call twice.
func TestEveryPublicCallIsDistinct(t *testing.T) {
	seen := map[string]string{}
	for _, op := range All() {
		if !op.Public || op.Axis == AxisJsonStrategy {
			continue
		}
		call := op.Factory + " " + op.CallOptions
		if other, ok := seen[call]; ok {
			t.Errorf("operations %q and %q share the call %q: give one of them CallOptions", other, op.Name, call)
		}
		seen[call] = op.Name
	}
}
