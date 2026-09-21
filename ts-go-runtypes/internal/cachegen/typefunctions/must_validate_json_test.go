package typefunctions

import (
	"regexp"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// The MustValidateJson contract (reflection/must_validate_json.go): a JSON
// decoder converts only the exact wire form and leaves anything else for
// validate. Two directions, both over the rendered restoreFromJsonMutate and
// compactFromJson bodies:
//
//   - every kind the table flags renders a guard on the SAME variable before
//     every constructor call it makes;
//   - every constructor call any kind renders belongs to a flagged kind, so a
//     new transforming arm cannot ship without joining the table.
//
// The JS side runs the same predicate over every emitted decoder body as the
// GC-GUARD generated-code oracle (hand-written corpus + the secgen fuzz lane).

var jsonDecodeFamilies = []string{"restoreFromJsonMutate", "compactFromJson", "restoreFromJsonClone"}

// transformCalls capture the wire variable a constructor is called on.
var transformCalls = []*regexp.Regexp{
	regexp.MustCompile(`new Date\((\w+)\)`),
	regexp.MustCompile(`BigInt\((\w+)\)`),
	regexp.MustCompile(`Temporal\.\w+\.from\((\w+)\)`),
	regexp.MustCompile(`new Map\((\w+)\)`),
	regexp.MustCompile(`new Set\((\w+)\)`),
	regexp.MustCompile(`Symbol\((\w+)\.substring\(`),
	// the union envelope unwrap assigns a variable from its own second slot
	regexp.MustCompile(`(\S+) = (\S+)\[1\];`),
}

// guardedBefore reports whether a wire-shape check on `name` precedes offset
// `at` in the body.
func guardedBefore(body string, at int, name string) bool {
	before := body[:at]
	for _, guard := range []string{
		"typeof " + name + " ===",
		"Array.isArray(" + name + ")",
		".test(" + name + ")",
		"Number.isInteger(" + name + ")",
	} {
		if strings.Contains(before, guard) {
			return true
		}
	}
	return false
}

// unguardedCalls lists every transform call in body whose variable carries no
// guard before it.
func unguardedCalls(body string) []string {
	var out []string
	for _, call := range transformCalls {
		for _, match := range call.FindAllStringSubmatchIndex(body, -1) {
			if !isTransform(body, match) {
				continue
			}
			name := body[match[2]:match[3]]
			if !guardedBefore(body, match[0], name) {
				out = append(out, body[match[0]:match[1]])
			}
		}
	}
	return out
}

// isTransform drops the one pattern that can also match a plain read: the
// envelope unwrap is `x = x[1]`, a tuple member read is `const x1 = x[1]`.
func isTransform(body string, match []int) bool {
	if len(match) < 6 {
		return true
	}
	return body[match[2]:match[3]] == body[match[4]:match[5]]
}

func countCalls(body string) int {
	total := 0
	for _, call := range transformCalls {
		for _, match := range call.FindAllStringSubmatchIndex(body, -1) {
			if isTransform(body, match) {
				total++
			}
		}
	}
	return total
}

func mkTemporal(subKind reflection.ReflectionSubKind) *reflection.RunType {
	return &reflection.RunType{ID: "tmp", Kind: reflection.KindClass, SubKind: subKind}
}

func mkIterable(subKind reflection.ReflectionSubKind, item *reflection.RunType) protocol.Dump {
	col := &reflection.RunType{ID: "col", Kind: reflection.KindClass, SubKind: subKind, Children: []*reflection.RunType{makeRef(item.ID)}}
	return protocol.Dump{RunTypes: []*reflection.RunType{item, col}}
}

// flaggedDumps: one dump per kind MustValidateJson flags, keyed by the root id.
func flaggedDumps() map[string]protocol.Dump {
	dumps := map[string]protocol.Dump{
		"big":  {RunTypes: []*reflection.RunType{{ID: "big", Kind: reflection.KindBigInt}}},
		"dat":  {RunTypes: []*reflection.RunType{mkDate()}},
		"lbig": {RunTypes: []*reflection.RunType{{ID: "lbig", Kind: reflection.KindLiteral, Literal: "12", Flags: []string{"bigint"}}}},
		"col":  mkIterable(reflection.SubKindSet, mkStr()),
	}
	mapDump := mkIterable(reflection.SubKindMap, mkStr())
	mapDump.RunTypes[1].ID = "map"
	mapDump.RunTypes[1].Children = []*reflection.RunType{makeRef("str"), makeRef("str")}
	dumps["map"] = mapDump
	for _, info := range reflection.OrderableTemporalInfos() {
		tmp := mkTemporal(info.SubKind)
		tmp.ID = "tmp" + info.Name
		dumps[tmp.ID] = protocol.Dump{RunTypes: []*reflection.RunType{tmp}}
	}
	union := unionDump(mkDate(), mkStr())
	dumps["uni"] = union
	return dumps
}

// symbolLiteralDump is the shape the resolver emits for `typeof sym` where
// `const sym = Symbol('x')`.
func symbolLiteralDump() protocol.Dump {
	return protocol.Dump{RunTypes: []*reflection.RunType{
		{ID: "lsym", Kind: reflection.KindLiteral, Literal: map[string]any{"symbol": "x"}, Flags: []string{"symbol"}},
	}}
}

func TestMustValidateJson_FlagsEveryTransformingKind(t *testing.T) {
	for id, dump := range flaggedDumps() {
		root := dump.RunTypes[len(dump.RunTypes)-1]
		if !reflection.MustValidateJson(root) {
			t.Errorf("%s: MustValidateJson must flag kind %v subKind %v", id, root.Kind, root.SubKind)
		}
	}
	for _, plain := range []*reflection.RunType{mkStr(), {ID: "num", Kind: reflection.KindNumber}, {ID: "obj", Kind: reflection.KindObjectLiteral}} {
		if reflection.MustValidateJson(plain) {
			t.Errorf("%s: a kind that never converts a wire value must not be flagged", plain.ID)
		}
	}
}

func TestMustValidateJson_EveryFlaggedArmIsGuarded(t *testing.T) {
	for id, dump := range flaggedDumps() {
		for _, fam := range jsonDecodeFamilies {
			body := renderModule(t, dump, fam)
			if bad := unguardedCalls(body); len(bad) > 0 {
				t.Errorf("[%s %s] a transform runs on an unchecked wire value: %v\n%s", fam, id, bad, body)
			}
		}
	}
}

func TestMustValidateJson_ATransformOnlyAppearsUnderAFlaggedKind(t *testing.T) {
	unflagged := []protocol.Dump{
		{RunTypes: []*reflection.RunType{mkStr()}},
		{RunTypes: []*reflection.RunType{{ID: "num", Kind: reflection.KindNumber}}},
		{RunTypes: []*reflection.RunType{{ID: "bool", Kind: reflection.KindBoolean}}},
		objWithProp(mkStr(), true),
		{RunTypes: []*reflection.RunType{mkStr(), {ID: "arr", Kind: reflection.KindArray, Child: makeRef("str")}}},
		unionDump(mkStr(), &reflection.RunType{ID: "num", Kind: reflection.KindNumber}),
		symbolLiteralDump(),
	}
	for _, dump := range unflagged {
		for _, fam := range jsonDecodeFamilies {
			body := renderModule(t, dump, fam)
			if n := countCalls(body); n > 0 {
				root := dump.RunTypes[len(dump.RunTypes)-1]
				t.Errorf("[%s %s] renders %d wire transform(s) but MustValidateJson does not flag it:\n%s", fam, root.ID, n, body)
			}
		}
	}
}

func TestMustValidateJson_UnionEnvelopeIsLeftForValidateWhenNotAnArray(t *testing.T) {
	body := renderModule(t, unionDump(mkDate(), mkStr()), "restoreFromJsonMutate")
	if !strings.Contains(body, "if (Array.isArray(v) && v.length === 2) {const ") {
		t.Errorf("the union envelope unwrap must be guarded on the wire shape; got:\n%s", body)
	}
}

// A symbol literal has no wire form at all: a rebuilt Symbol() is never the
// symbol the literal type names, so no decoder converts one.
func TestMustValidateJson_SymbolLiteralHasNoWireForm(t *testing.T) {
	if reflection.MustValidateJson(symbolLiteralDump().RunTypes[0]) {
		t.Error("a symbol literal converts nothing, so it must not be flagged")
	}
	for _, fam := range jsonDecodeFamilies {
		body := renderModule(t, symbolLiteralDump(), fam)
		if strings.Contains(body, "Symbol:") || strings.Contains(body, "Symbol(") {
			t.Errorf("[%s] a symbol literal must emit no rebuild; got:\n%s", fam, body)
		}
	}
}
