package typefunctions

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/diskcache"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/operations"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// unionKeysDump — `{a: string} | {b: number}`, two object members, so the union-keys check runs.
// unionDumpOneObject — `{a: string} | number`, one key-bearing member, so it must not.
func unionKeysDump(members ...*reflection.RunType) protocol.Dump {
	str := &reflection.RunType{ID: "str1", Kind: reflection.KindString}
	num := &reflection.RunType{ID: "num1", Kind: reflection.KindNumber}
	propA := &reflection.RunType{ID: "pa1", Kind: reflection.KindPropertySignature, Name: "a", IsSafeName: true, Child: &reflection.RunType{Kind: reflection.KindRef, ID: "str1"}}
	propB := &reflection.RunType{ID: "pb1", Kind: reflection.KindPropertySignature, Name: "b", IsSafeName: true, Child: &reflection.RunType{Kind: reflection.KindRef, ID: "num1"}}
	objA := &reflection.RunType{ID: "oa1", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{{Kind: reflection.KindRef, ID: "pa1"}}}
	objB := &reflection.RunType{ID: "ob1", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{{Kind: reflection.KindRef, ID: "pb1"}}}
	refs := make([]*reflection.RunType, 0, len(members))
	for _, member := range members {
		refs = append(refs, &reflection.RunType{Kind: reflection.KindRef, ID: member.ID})
	}
	union := &reflection.RunType{ID: "uni1", Kind: reflection.KindUnion, Children: refs}
	return protocol.Dump{RunTypes: []*reflection.RunType{str, num, propA, propB, objA, objB, union}}
}

func twoObjectUnion() protocol.Dump {
	dump := unionKeysDump(&reflection.RunType{ID: "oa1"}, &reflection.RunType{ID: "ob1"})
	return dump
}

func oneObjectUnion() protocol.Dump {
	return unionKeysDump(&reflection.RunType{ID: "oa1"}, &reflection.RunType{ID: "num1"})
}

// blankFnHash replaces every emitted `<4-char hash>_` prefix with a fixed token, so two FAMILIES' renders of the
// same type can be compared character by character; only the hash differs when the bodies agree.
func blankFnHash(rendered string) string {
	return fnHashPrefix.ReplaceAllString(rendered, "FN_")
}

var fnHashPrefix = regexp.MustCompile(`\b[A-Za-z0-9]{4}_`)

func renderUnion(t *testing.T, key string, dump protocol.Dump) string {
	t.Helper()
	lookup := newFakeLookup()
	lookup.set("uni1", "1:union")
	lookup.set("oa1", "1:objectA")
	lookup.set("ob1", "1:objectB")
	return joinEntries(t, FamilyByKey(key).Collect(dump, RenderOpts{Store: diskcache.New(t.TempDir(), "fp1"), Lookup: lookup}, nil))
}

// The whole contract in one test: on a qualifying union the union-keys body differs from the plain one, and on
// every other shape it is IDENTICAL, not merely equivalent. Behavioural equality can hide a check that runs and
// happens to pass; body equality cannot.
func TestUnionKeys_BodyDiffersOnlyWhereTheCheckRuns(t *testing.T) {
	two := twoObjectUnion()
	if plain, union := blankFnHash(renderUnion(t, "validate", two)), blankFnHash(renderUnion(t, "validateUnionKeys", two)); plain == union {
		t.Fatalf("two object members: the check never reached the body:\n%s", union)
	}
	one := oneObjectUnion()
	plain, union := blankFnHash(renderUnion(t, "validate", one)), blankFnHash(renderUnion(t, "validateUnionKeys", one))
	if plain != union {
		t.Fatalf("one key-bearing member: the check ran anyway\nplain:\n%s\nunion:\n%s", plain, union)
	}
}

// The check belongs to the UNION arm. A plain object compiled under this family must come out byte-identical to
// the plain family's, or the option has quietly become checkUnknowns.
func TestUnionKeys_PlainObjectIsUntouched(t *testing.T) {
	dump := strictDump()
	lookup := newFakeLookup()
	lookup.set("obj1", "1:object")
	opts := RenderOpts{Store: diskcache.New(t.TempDir(), "fp1"), Lookup: lookup}
	plain := blankFnHash(joinEntries(t, FamilyByKey("validate").Collect(dump, opts, nil)))
	union := blankFnHash(joinEntries(t, FamilyByKey("validateUnionKeys").Collect(dump, opts, nil)))
	if plain != union {
		t.Fatalf("a plain object picked up a key check\nplain:\n%s\nunion:\n%s", plain, union)
	}
	fused := blankFnHash(joinEntries(t, FamilyByKey("validateStrict").Collect(dump, opts, nil)))
	if fused == plain {
		t.Fatalf("control failed: validateStrict should differ from plain on this shape:\n%s", fused)
	}
}

// Families, not variants, and being disk-cacheable under their own tag is half the reason (module.go gates the
// write on an empty variant suffix). vuk.json and veuk.json sit beside val.json for the same type id.
func TestUnionKeys_DiskCacheRoundTrip(t *testing.T) {
	for _, family := range []struct{ key, tag string }{
		{"validateUnionKeys", "vuk"},
		{"validationErrorsUnionKeys", "veuk"},
	} {
		t.Run(family.key, func(t *testing.T) {
			root := t.TempDir()
			store := diskcache.New(root, "fp1")
			lookup := newFakeLookup()
			lookup.set("uni1", "1:union")
			lookup.set("oa1", "1:objectA")
			lookup.set("ob1", "1:objectB")
			dump := twoObjectUnion()
			opts := RenderOpts{Store: store, Lookup: lookup}

			first := joinEntries(t, FamilyByKey(family.key).Collect(dump, opts, nil))
			if _, err := os.Stat(filepath.Join(root, "fp1", "uni1", family.tag+".json")); err != nil {
				t.Fatalf("expected a cache file for tag %q: %v", family.tag, err)
			}
			if again := joinEntries(t, FamilyByKey(family.key).Collect(dump, opts, nil)); again != first {
				t.Errorf("warm render drifted:\n%s\n---\n%s", first, again)
			}
		})
	}
}

// The error twin must ask THIS family's validator, or it reports nothing for a value its own validator rejects.
func TestUnionKeys_ErrorsDelegateToTheirOwnValidator(t *testing.T) {
	body := renderUnion(t, "validationErrorsUnionKeys", twoObjectUnion())
	want := "utl.getRT(\\'" + operations.VariantHash("validateUnionKeys", nil) + "_uni1\\')"
	if !strings.Contains(body, want) {
		t.Fatalf("expected the union arm to delegate to %s:\n%s", want, body)
	}
	plainHash := operations.VariantHash("validate", nil)
	if strings.Contains(body, "utl.getRT(\\'"+plainHash+"_uni1\\')") {
		t.Fatalf("the errors family delegates to the PLAIN validator:\n%s", body)
	}
}
