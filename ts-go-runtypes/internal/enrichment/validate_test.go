package enrichment_test

import (
	"sort"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/enrichment"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// fakeView is a hand-built enrichment.LiteralView for unit tests — no Program
// required. strings holds the string-literal-valued keys; objects holds the
// nested object-literal-valued keys. order preserves declaration order across
// both maps.
type fakeView struct {
	order   []string
	strings map[string]string
	objects map[string]*fakeView
}

func newFakeView() *fakeView {
	return &fakeView{strings: map[string]string{}, objects: map[string]*fakeView{}}
}

func (view *fakeView) str(key, value string) *fakeView {
	view.order = append(view.order, key)
	view.strings[key] = value
	return view
}

func (view *fakeView) obj(key string, child *fakeView) *fakeView {
	view.order = append(view.order, key)
	view.objects[key] = child
	return view
}

func (view *fakeView) Keys() []string { return view.order }

func (view *fakeView) Child(key string) enrichment.LiteralView {
	child, ok := view.objects[key]
	if !ok || child == nil {
		return nil
	}
	return child
}

func (view *fakeView) StringValue(key string) (string, bool) {
	value, ok := view.strings[key]
	return value, ok
}

// objectRT builds an object-literal RunType from a set of named property
// children. Each child is a PropertySignature wrapping the given field node.
func objectRT(fields map[string]*reflection.RunType) *reflection.RunType {
	rt := &reflection.RunType{Kind: reflection.KindObjectLiteral}
	names := make([]string, 0, len(fields))
	for name := range fields {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		rt.Children = append(rt.Children, &reflection.RunType{
			Kind:       reflection.KindPropertySignature,
			Name:       name,
			IsSafeName: true,
			Child:      fields[name],
		})
	}
	return rt
}

func stringRT() *reflection.RunType { return &reflection.RunType{Kind: reflection.KindString} }

func findingCodes(findings []enrichment.Finding) []string {
	codes := make([]string, 0, len(findings))
	for _, finding := range findings {
		codes = append(codes, finding.Code)
	}
	return codes
}

func TestCheckFriendly_FT002UnknownField(t *testing.T) {
	rt := objectRT(map[string]*reflection.RunType{"name": stringRT()})
	view := newFakeView().
		obj("name", newFakeView().str("rt$label", "Name")).
		obj("nope", newFakeView().str("rt$label", "Nope"))

	findings := enrichment.CheckFriendly(rt, view, nil)

	var ft002 *enrichment.Finding
	for i := range findings {
		if findings[i].Code == "FT002" {
			ft002 = &findings[i]
		}
	}
	if ft002 == nil {
		t.Fatalf("expected FT002 for unknown field; got %v", findingCodes(findings))
	}
	if ft002.Severity != enrichment.Error {
		t.Errorf("FT002 severity = %v, want Error", ft002.Severity)
	}
	if ft002.Path != "nope" {
		t.Errorf("FT002 path = %q, want %q", ft002.Path, "nope")
	}
}

func TestCheckFriendly_FT005BadPlaceholder(t *testing.T) {
	rt := objectRT(map[string]*reflection.RunType{"name": stringRT()})
	view := newFakeView().obj("name", newFakeView().
		obj("rt$errors", newFakeView().str("type", "must be a $[nope] for $[label]")))

	findings := enrichment.CheckFriendly(rt, view, nil)

	codes := findingCodes(findings)
	if !contains(codes, "FT005") {
		t.Fatalf("expected FT005 for bad placeholder; got %v", codes)
	}
	// `$[label]` is valid — exactly one FT005 (for `$[nope]`).
	count := 0
	for _, code := range codes {
		if code == "FT005" {
			count++
		}
	}
	if count != 1 {
		t.Errorf("FT005 count = %d, want 1 (only $[nope] is bad)", count)
	}
}

func TestCheckFriendly_Clean(t *testing.T) {
	rt := objectRT(map[string]*reflection.RunType{"name": stringRT(), "email": stringRT()})
	view := newFakeView().
		str("rt$label", "User").
		obj("name", newFakeView().
			str("rt$label", "Name").
			obj("rt$errors", newFakeView().str("type", "$[label] is required"))).
		obj("email", newFakeView().str("rt$label", "Email"))

	findings := enrichment.CheckFriendly(rt, view, nil)
	if len(findings) != 0 {
		t.Fatalf("clean map produced findings: %v", findings)
	}
}

func TestCheckFriendly_FT003UnknownConstraint(t *testing.T) {
	// A string field branded with a FormatString carrying a minLength param —
	// `type`, `rt$default`, and `minLength` are the only valid rt$errors keys.
	formatted := &reflection.RunType{
		Kind: reflection.KindString,
		FormatAnnotation: &reflection.FormatAnnotation{
			Name:   "stringFormat",
			Params: map[string]any{"minLength": 3},
		},
	}
	rt := objectRT(map[string]*reflection.RunType{"code": formatted})
	view := newFakeView().obj("code", newFakeView().
		obj("rt$errors", newFakeView().
			str("type", "bad type").
			str("minLength", "too short"). // declared constraint — OK
			str("maxLength", "too long"))) // NOT declared — FT003

	findings := enrichment.CheckFriendly(rt, view, nil)

	var ft003 []enrichment.Finding
	for _, finding := range findings {
		if finding.Code == "FT003" {
			ft003 = append(ft003, finding)
		}
	}
	if len(ft003) != 1 {
		t.Fatalf("expected exactly one FT003 (maxLength); got %v", findings)
	}
	if ft003[0].Severity != enrichment.Warning {
		t.Errorf("FT003 severity = %v, want Warning", ft003[0].Severity)
	}
	if ft003[0].Path != "code.rt$errors.maxLength" {
		t.Errorf("FT003 path = %q, want %q", ft003[0].Path, "code.rt$errors.maxLength")
	}
}

// TestCheckFriendly_FT003PresentationParam pins the presentation-param carve
// out: `isCurrency` is the one number param with NO failable constraint, so it
// never becomes a valid `rt$errors` key — authoring one is flagged FT003 exactly
// like any other undeclared constraint.
func TestCheckFriendly_FT003PresentationParam(t *testing.T) {
	formatted := &reflection.RunType{
		Kind: reflection.KindNumber,
		FormatAnnotation: &reflection.FormatAnnotation{
			Name:   "numberFormat",
			Params: map[string]any{"max": 100, "isCurrency": true},
		},
	}
	rt := objectRT(map[string]*reflection.RunType{"price": formatted})
	view := newFakeView().obj("price", newFakeView().
		obj("rt$errors", newFakeView().
			str("type", "bad type").
			str("max", "too much").          // declared constraint — OK
			str("isCurrency", "not money"))) // presentation metadata — FT003

	findings := enrichment.CheckFriendly(rt, view, nil)
	var ft003 []enrichment.Finding
	for _, finding := range findings {
		if finding.Code == "FT003" {
			ft003 = append(ft003, finding)
		}
	}
	if len(ft003) != 1 {
		t.Fatalf("expected exactly one FT003 (isCurrency); got %v", findings)
	}
	if ft003[0].Path != "price.rt$errors.isCurrency" {
		t.Errorf("FT003 path = %q, want %q", ft003[0].Path, "price.rt$errors.isCurrency")
	}
}

func TestCheckFriendly_FunctionFormErrorsSkipped(t *testing.T) {
	// A function-form `rt$errors` is not an object literal, so Child("rt$errors")
	// returns nil and FT003/FT005 are skipped — no findings for the field.
	rt := objectRT(map[string]*reflection.RunType{"name": stringRT()})
	view := newFakeView().obj("name", newFakeView().str("rt$errors", "(failed) => 'x'"))

	findings := enrichment.CheckFriendly(rt, view, nil)
	if len(findings) != 0 {
		t.Fatalf("function-form rt$errors should be skipped; got %v", findings)
	}
}

func TestCheckMock_MD001UnknownField(t *testing.T) {
	rt := objectRT(map[string]*reflection.RunType{"name": stringRT()})
	view := newFakeView().
		obj("name", newFakeView().str("pool", "ignored")).
		obj("ghost", newFakeView())

	findings := enrichment.CheckMock(rt, view, nil)

	var md001 *enrichment.Finding
	for i := range findings {
		if findings[i].Code == "MD001" {
			md001 = &findings[i]
		}
	}
	if md001 == nil {
		t.Fatalf("expected MD001 for unknown mock field; got %v", findingCodes(findings))
	}
	if md001.Severity != enrichment.Error {
		t.Errorf("MD001 severity = %v, want Error", md001.Severity)
	}
	if md001.Path != "ghost" {
		t.Errorf("MD001 path = %q, want %q", md001.Path, "ghost")
	}
}

func TestCheckMock_MetaKeysNotFlagged(t *testing.T) {
	// `pool`, `min`, `max`, `rt$optional` are reserved mock keys — never flagged
	// as unknown fields even though they aren't properties of the type.
	rt := objectRT(map[string]*reflection.RunType{"age": {Kind: reflection.KindNumber}})
	view := newFakeView().
		str("rt$optional", "1").
		obj("age", newFakeView().str("min", "0").str("max", "120").str("pool", "[]"))

	findings := enrichment.CheckMock(rt, view, nil)
	if len(findings) != 0 {
		t.Fatalf("reserved mock keys should not be flagged; got %v", findings)
	}
}

func TestCheckFriendly_NestedAndArray(t *testing.T) {
	// Nested object + array element: an unknown key at depth flags FT002 with a
	// dotted path through `rt$items`.
	inner := objectRT(map[string]*reflection.RunType{"city": stringRT()})
	addresses := &reflection.RunType{Kind: reflection.KindArray, Child: inner}
	rt := objectRT(map[string]*reflection.RunType{"addresses": addresses})

	view := newFakeView().obj("addresses", newFakeView().
		obj("rt$items", newFakeView().
			obj("city", newFakeView().str("rt$label", "City")).
			obj("zip", newFakeView().str("rt$label", "Zip")))) // zip not a property

	findings := enrichment.CheckFriendly(rt, view, nil)
	var ft002 *enrichment.Finding
	for i := range findings {
		if findings[i].Code == "FT002" {
			ft002 = &findings[i]
		}
	}
	if ft002 == nil {
		t.Fatalf("expected FT002 in nested array element; got %v", findingCodes(findings))
	}
	if ft002.Path != "addresses.rt$items.zip" {
		t.Errorf("FT002 path = %q, want %q", ft002.Path, "addresses.rt$items.zip")
	}
}

func TestCheckFriendly_NestedObjectErrorsNotDoubled(t *testing.T) {
	// A nested-OBJECT field's own `rt$errors` must be checked exactly once — not
	// once by the parent and again when the object node is walked. One bad
	// placeholder in profile.rt$errors must yield exactly one FT005, never two.
	inner := objectRT(map[string]*reflection.RunType{"email": stringRT()})
	rt := objectRT(map[string]*reflection.RunType{"profile": inner})

	view := newFakeView().obj("profile", newFakeView().
		obj("rt$errors", newFakeView().str("type", "bad $[nope]")).
		obj("email", newFakeView().str("rt$label", "Email")))

	findings := enrichment.CheckFriendly(rt, view, nil)
	count := 0
	for _, finding := range findings {
		if finding.Code == "FT005" {
			count++
		}
	}
	if count != 1 {
		t.Fatalf("nested-object rt$errors should yield exactly one FT005, got %d: %v", count, findings)
	}
}

// formatStringRT builds a string field branded with a FormatString carrying the
// given params — its declared constraint keys become valid rt$errors keys.
func formatStringRT(params map[string]any) *reflection.RunType {
	return &reflection.RunType{
		Kind:             reflection.KindString,
		FormatAnnotation: &reflection.FormatAnnotation{Name: "stringFormat", Params: params},
	}
}

func TestCheckFriendly_PluralLeafClean(t *testing.T) {
	// A plural object on a count-bearing constraint with valid CLDR arms and a
	// mandatory `other` is clean; per-arm placeholders are validated.
	rt := objectRT(map[string]*reflection.RunType{"name": formatStringRT(map[string]any{"minLength": 2})})
	view := newFakeView().obj("name", newFakeView().
		obj("rt$errors", newFakeView().
			str("type", "must be text").
			obj("minLength", newFakeView().
				str("one", "at least $[val] character").
				str("other", "at least $[val] characters"))))

	findings := enrichment.CheckFriendly(rt, view, nil)
	if len(findings) != 0 {
		t.Fatalf("clean plural leaf produced findings: %v", findings)
	}
}

func TestCheckFriendly_FT006MissingOther(t *testing.T) {
	rt := objectRT(map[string]*reflection.RunType{"name": formatStringRT(map[string]any{"minLength": 2})})
	view := newFakeView().obj("name", newFakeView().
		obj("rt$errors", newFakeView().
			obj("minLength", newFakeView().str("one", "at least $[val]"))))

	findings := enrichment.CheckFriendly(rt, view, nil)
	var ft006 *enrichment.Finding
	for i := range findings {
		if findings[i].Code == "FT006" {
			ft006 = &findings[i]
		}
	}
	if ft006 == nil {
		t.Fatalf("expected FT006 for a plural without `other`; got %v", findingCodes(findings))
	}
	if ft006.Severity != enrichment.Error {
		t.Errorf("FT006 severity = %v, want Error", ft006.Severity)
	}
	if ft006.Path != "name.rt$errors.minLength" {
		t.Errorf("FT006 path = %q, want %q", ft006.Path, "name.rt$errors.minLength")
	}
}

func TestCheckFriendly_FT007UnknownArm(t *testing.T) {
	rt := objectRT(map[string]*reflection.RunType{"name": formatStringRT(map[string]any{"minLength": 2})})
	view := newFakeView().obj("name", newFakeView().
		obj("rt$errors", newFakeView().
			obj("minLength", newFakeView().
				str("other", "chars").
				str("lots", "way too many")))) // not a CLDR category

	findings := enrichment.CheckFriendly(rt, view, nil)
	var ft007 *enrichment.Finding
	for i := range findings {
		if findings[i].Code == "FT007" {
			ft007 = &findings[i]
		}
	}
	if ft007 == nil {
		t.Fatalf("expected FT007 for a non-CLDR arm; got %v", findingCodes(findings))
	}
	if ft007.Severity != enrichment.Warning {
		t.Errorf("FT007 severity = %v, want Warning", ft007.Severity)
	}
	if ft007.Path != "name.rt$errors.minLength.lots" {
		t.Errorf("FT007 path = %q, want %q", ft007.Path, "name.rt$errors.minLength.lots")
	}
}

func TestCheckFriendly_FT008PluralOnNonCountBearing(t *testing.T) {
	// `pattern` carries no count: a plural object there has dead arms.
	rt := objectRT(map[string]*reflection.RunType{"email": formatStringRT(map[string]any{"pattern": "x"})})
	view := newFakeView().obj("email", newFakeView().
		obj("rt$errors", newFakeView().
			obj("pattern", newFakeView().str("one", "x").str("other", "y"))))

	findings := enrichment.CheckFriendly(rt, view, nil)
	var ft008 *enrichment.Finding
	for i := range findings {
		if findings[i].Code == "FT008" {
			ft008 = &findings[i]
		}
	}
	if ft008 == nil {
		t.Fatalf("expected FT008 for a plural on a non-count-bearing constraint; got %v", findingCodes(findings))
	}
	if ft008.Severity != enrichment.Warning {
		t.Errorf("FT008 severity = %v, want Warning", ft008.Severity)
	}
}

func TestCheckFriendly_FT005InsidePluralArm(t *testing.T) {
	rt := objectRT(map[string]*reflection.RunType{"name": formatStringRT(map[string]any{"minLength": 2})})
	view := newFakeView().obj("name", newFakeView().
		obj("rt$errors", newFakeView().
			obj("minLength", newFakeView().
				str("one", "bad $[nope]").
				str("other", "fine $[val]"))))

	findings := enrichment.CheckFriendly(rt, view, nil)
	var ft005 []enrichment.Finding
	for _, finding := range findings {
		if finding.Code == "FT005" {
			ft005 = append(ft005, finding)
		}
	}
	if len(ft005) != 1 {
		t.Fatalf("expected exactly one FT005 inside the plural arm; got %v", findings)
	}
	if ft005[0].Path != "name.rt$errors.minLength.one" {
		t.Errorf("FT005 path = %q, want %q", ft005[0].Path, "name.rt$errors.minLength.one")
	}
}

func TestCheckFriendly_FT005FormatTokens(t *testing.T) {
	// The colon-form `$[val:kind:name]` named-format tokens were REMOVED
	// (bounds render type-driven — Currency / date formats — with plain
	// `$[val]`): every leftover colon token flags FT005 so migrating templates
	// get a pointer, while a literal colon in prose (`ratio 3:1`) outside a
	// token never trips.
	rt := objectRT(map[string]*reflection.RunType{"price": formatStringRT(map[string]any{"max": 100})})
	view := newFakeView().obj("price", newFakeView().
		obj("rt$errors", newFakeView().
			str("type", "removed $[val:number:currency] but ratio 3:1 is prose").
			str("max", "removed $[label:number:currency] and $[val:nope:x], plain $[val] fine")))

	findings := enrichment.CheckFriendly(rt, view, nil)
	var ft005 []enrichment.Finding
	for _, finding := range findings {
		if finding.Code == "FT005" {
			ft005 = append(ft005, finding)
		}
	}
	if len(ft005) != 3 {
		t.Fatalf("expected three FT005 (every leftover colon token), got %v", findings)
	}
	for _, finding := range ft005 {
		if !strings.Contains(finding.Message, "no longer supported") {
			t.Errorf("FT005 message should point at the removal; got %q", finding.Message)
		}
	}
}

func contains(haystack []string, needle string) bool {
	for _, item := range haystack {
		if item == needle {
			return true
		}
	}
	return false
}

func TestCheckFriendly_FT011ReservedProperty(t *testing.T) {
	// A source-type property named rt$… collides with the reserved enrichment
	// meta prefix — Error, whatever the authored literal looks like.
	rt := objectRT(map[string]*reflection.RunType{"rt$label": stringRT(), "name": stringRT()})
	view := newFakeView().obj("name", newFakeView().str("rt$label", "Name"))

	findings := enrichment.CheckFriendly(rt, view, nil)

	var ft011 *enrichment.Finding
	for i := range findings {
		if findings[i].Code == "FT011" {
			ft011 = &findings[i]
		}
	}
	if ft011 == nil {
		t.Fatalf("expected FT011 for reserved property; got %v", findingCodes(findings))
	}
	if ft011.Severity != enrichment.Error {
		t.Errorf("FT011 severity = %v, want Error", ft011.Severity)
	}
	if ft011.Path != "rt$label" {
		t.Errorf("FT011 path = %q, want %q", ft011.Path, "rt$label")
	}
}

func TestCheckMock_MD011ReservedProperty(t *testing.T) {
	rt := objectRT(map[string]*reflection.RunType{"rt$optional": stringRT()})
	view := newFakeView()

	findings := enrichment.CheckMock(rt, view, nil)

	found := false
	for _, finding := range findings {
		if finding.Code == "MD011" && finding.Severity == enrichment.Error && finding.Path == "rt$optional" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected MD011 Error at rt$optional; got %v", findingCodes(findings))
	}
}

func TestCheckFriendly_PlainDollarPropertyIsOrdinaryField(t *testing.T) {
	// The bare `$` prefix is NOT reserved: a property named $label is an
	// ordinary child field — addressable, no FT002/FT011.
	rt := objectRT(map[string]*reflection.RunType{"$label": stringRT()})
	view := newFakeView().obj("$label", newFakeView().str("rt$label", "Dollar label"))

	findings := enrichment.CheckFriendly(rt, view, nil)

	for _, finding := range findings {
		if finding.Code == "FT002" || finding.Code == "FT011" {
			t.Fatalf("a plain $-property must be an ordinary field; got %s at %s", finding.Code, finding.Path)
		}
	}
}

func TestReservedPropertyCollisions_NestedPaths(t *testing.T) {
	rt := objectRT(map[string]*reflection.RunType{
		"profile": objectRT(map[string]*reflection.RunType{"rt$errors": stringRT()}),
		"name":    stringRT(),
	})

	collisions := enrichment.ReservedPropertyCollisions(rt, nil)

	if len(collisions) != 1 || collisions[0] != "profile.rt$errors" {
		t.Fatalf("collisions = %v, want [profile.rt$errors]", collisions)
	}
	if clean := enrichment.ReservedPropertyCollisions(objectRT(map[string]*reflection.RunType{"name": stringRT()}), nil); len(clean) != 0 {
		t.Fatalf("clean type reported collisions: %v", clean)
	}
}
