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

func TestCheckFriendly_EnrichTextUnknownField(t *testing.T) {
	rt := objectRT(map[string]*reflection.RunType{"name": stringRT()})
	view := newFakeView().
		obj("name", newFakeView().str("rt$label", "Name")).
		obj("nope", newFakeView().str("rt$label", "Nope"))

	findings := enrichment.CheckFriendly(rt, view, nil)

	var enrichTextUnknownField *enrichment.Finding
	for i := range findings {
		if findings[i].Code == "enrich-text-unknown-field" {
			enrichTextUnknownField = &findings[i]
		}
	}
	if enrichTextUnknownField == nil {
		t.Fatalf("expected enrich-text-unknown-field for unknown field; got %v", findingCodes(findings))
	}
	if enrichTextUnknownField.Severity != enrichment.Error {
		t.Errorf("enrich-text-unknown-field severity = %v, want Error", enrichTextUnknownField.Severity)
	}
	if enrichTextUnknownField.Path != "nope" {
		t.Errorf("enrich-text-unknown-field path = %q, want %q", enrichTextUnknownField.Path, "nope")
	}
}

func TestCheckFriendly_EnrichTextUnknownPlaceholderBadPlaceholder(t *testing.T) {
	rt := objectRT(map[string]*reflection.RunType{"name": stringRT()})
	view := newFakeView().obj("name", newFakeView().
		obj("rt$errors", newFakeView().str("type", "must be a $[nope] for $[label]")))

	findings := enrichment.CheckFriendly(rt, view, nil)

	codes := findingCodes(findings)
	if !contains(codes, "enrich-text-unknown-placeholder") {
		t.Fatalf("expected enrich-text-unknown-placeholder for bad placeholder; got %v", codes)
	}
	// `$[label]` is valid — exactly one enrich-text-unknown-placeholder (for `$[nope]`).
	count := 0
	for _, code := range codes {
		if code == "enrich-text-unknown-placeholder" {
			count++
		}
	}
	if count != 1 {
		t.Errorf("enrich-text-unknown-placeholder count = %d, want 1 (only $[nope] is bad)", count)
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

func TestCheckFriendly_EnrichTextUnknownErrorKeyUnknownConstraint(t *testing.T) {
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
			str("maxLength", "too long"))) // NOT declared — enrich-text-unknown-error-key

	findings := enrichment.CheckFriendly(rt, view, nil)

	var enrichTextUnknownErrorKey []enrichment.Finding
	for _, finding := range findings {
		if finding.Code == "enrich-text-unknown-error-key" {
			enrichTextUnknownErrorKey = append(enrichTextUnknownErrorKey, finding)
		}
	}
	if len(enrichTextUnknownErrorKey) != 1 {
		t.Fatalf("expected exactly one enrich-text-unknown-error-key (maxLength); got %v", findings)
	}
	if enrichTextUnknownErrorKey[0].Severity != enrichment.Warning {
		t.Errorf("enrich-text-unknown-error-key severity = %v, want Warning", enrichTextUnknownErrorKey[0].Severity)
	}
	if enrichTextUnknownErrorKey[0].Path != "code.rt$errors.maxLength" {
		t.Errorf("enrich-text-unknown-error-key path = %q, want %q", enrichTextUnknownErrorKey[0].Path, "code.rt$errors.maxLength")
	}
}

// TestCheckFriendly_EnrichTextUnknownErrorKeyPresentationParam pins the presentation-param carve
// out: `isCurrency` is the one number param with NO failable constraint, so it
// never becomes a valid `rt$errors` key — authoring one is flagged enrich-text-unknown-error-key exactly
// like any other undeclared constraint.
func TestCheckFriendly_EnrichTextUnknownErrorKeyPresentationParam(t *testing.T) {
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
			str("isCurrency", "not money"))) // presentation metadata — enrich-text-unknown-error-key

	findings := enrichment.CheckFriendly(rt, view, nil)
	var enrichTextUnknownErrorKey []enrichment.Finding
	for _, finding := range findings {
		if finding.Code == "enrich-text-unknown-error-key" {
			enrichTextUnknownErrorKey = append(enrichTextUnknownErrorKey, finding)
		}
	}
	if len(enrichTextUnknownErrorKey) != 1 {
		t.Fatalf("expected exactly one enrich-text-unknown-error-key (isCurrency); got %v", findings)
	}
	if enrichTextUnknownErrorKey[0].Path != "price.rt$errors.isCurrency" {
		t.Errorf("enrich-text-unknown-error-key path = %q, want %q", enrichTextUnknownErrorKey[0].Path, "price.rt$errors.isCurrency")
	}
}

func TestCheckFriendly_FunctionFormErrorsSkipped(t *testing.T) {
	// A function-form `rt$errors` is not an object literal, so Child("rt$errors")
	// returns nil and enrich-text-unknown-error-key/enrich-text-unknown-placeholder are skipped — no findings for the field.
	rt := objectRT(map[string]*reflection.RunType{"name": stringRT()})
	view := newFakeView().obj("name", newFakeView().str("rt$errors", "(failed) => 'x'"))

	findings := enrichment.CheckFriendly(rt, view, nil)
	if len(findings) != 0 {
		t.Fatalf("function-form rt$errors should be skipped; got %v", findings)
	}
}

func TestCheckMock_EnrichMockUnknownField(t *testing.T) {
	rt := objectRT(map[string]*reflection.RunType{"name": stringRT()})
	view := newFakeView().
		obj("name", newFakeView().str("pool", "ignored")).
		obj("ghost", newFakeView())

	findings := enrichment.CheckMock(rt, view, nil)

	var enrichMockUnknownField *enrichment.Finding
	for i := range findings {
		if findings[i].Code == "enrich-mock-unknown-field" {
			enrichMockUnknownField = &findings[i]
		}
	}
	if enrichMockUnknownField == nil {
		t.Fatalf("expected enrich-mock-unknown-field for unknown mock field; got %v", findingCodes(findings))
	}
	if enrichMockUnknownField.Severity != enrichment.Error {
		t.Errorf("enrich-mock-unknown-field severity = %v, want Error", enrichMockUnknownField.Severity)
	}
	if enrichMockUnknownField.Path != "ghost" {
		t.Errorf("enrich-mock-unknown-field path = %q, want %q", enrichMockUnknownField.Path, "ghost")
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
	// Nested object + array element: an unknown key at depth flags enrich-text-unknown-field with a
	// dotted path through `rt$items`.
	inner := objectRT(map[string]*reflection.RunType{"city": stringRT()})
	addresses := &reflection.RunType{Kind: reflection.KindArray, Child: inner}
	rt := objectRT(map[string]*reflection.RunType{"addresses": addresses})

	view := newFakeView().obj("addresses", newFakeView().
		obj("rt$items", newFakeView().
			obj("city", newFakeView().str("rt$label", "City")).
			obj("zip", newFakeView().str("rt$label", "Zip")))) // zip not a property

	findings := enrichment.CheckFriendly(rt, view, nil)
	var enrichTextUnknownField *enrichment.Finding
	for i := range findings {
		if findings[i].Code == "enrich-text-unknown-field" {
			enrichTextUnknownField = &findings[i]
		}
	}
	if enrichTextUnknownField == nil {
		t.Fatalf("expected enrich-text-unknown-field in nested array element; got %v", findingCodes(findings))
	}
	if enrichTextUnknownField.Path != "addresses.rt$items.zip" {
		t.Errorf("enrich-text-unknown-field path = %q, want %q", enrichTextUnknownField.Path, "addresses.rt$items.zip")
	}
}

func TestCheckFriendly_NestedObjectErrorsNotDoubled(t *testing.T) {
	// A nested-OBJECT field's own `rt$errors` must be checked exactly once — not
	// once by the parent and again when the object node is walked. One bad
	// placeholder in profile.rt$errors must yield exactly one enrich-text-unknown-placeholder, never two.
	inner := objectRT(map[string]*reflection.RunType{"email": stringRT()})
	rt := objectRT(map[string]*reflection.RunType{"profile": inner})

	view := newFakeView().obj("profile", newFakeView().
		obj("rt$errors", newFakeView().str("type", "bad $[nope]")).
		obj("email", newFakeView().str("rt$label", "Email")))

	findings := enrichment.CheckFriendly(rt, view, nil)
	count := 0
	for _, finding := range findings {
		if finding.Code == "enrich-text-unknown-placeholder" {
			count++
		}
	}
	if count != 1 {
		t.Fatalf("nested-object rt$errors should yield exactly one enrich-text-unknown-placeholder, got %d: %v", count, findings)
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

func TestCheckFriendly_EnrichTextPluralMissingOther(t *testing.T) {
	rt := objectRT(map[string]*reflection.RunType{"name": formatStringRT(map[string]any{"minLength": 2})})
	view := newFakeView().obj("name", newFakeView().
		obj("rt$errors", newFakeView().
			obj("minLength", newFakeView().str("one", "at least $[val]"))))

	findings := enrichment.CheckFriendly(rt, view, nil)
	var enrichTextPluralMissingOther *enrichment.Finding
	for i := range findings {
		if findings[i].Code == "enrich-text-plural-missing-other" {
			enrichTextPluralMissingOther = &findings[i]
		}
	}
	if enrichTextPluralMissingOther == nil {
		t.Fatalf("expected enrich-text-plural-missing-other for a plural without `other`; got %v", findingCodes(findings))
	}
	if enrichTextPluralMissingOther.Severity != enrichment.Error {
		t.Errorf("enrich-text-plural-missing-other severity = %v, want Error", enrichTextPluralMissingOther.Severity)
	}
	if enrichTextPluralMissingOther.Path != "name.rt$errors.minLength" {
		t.Errorf("enrich-text-plural-missing-other path = %q, want %q", enrichTextPluralMissingOther.Path, "name.rt$errors.minLength")
	}
}

func TestCheckFriendly_EnrichTextUnknownPluralArm(t *testing.T) {
	rt := objectRT(map[string]*reflection.RunType{"name": formatStringRT(map[string]any{"minLength": 2})})
	view := newFakeView().obj("name", newFakeView().
		obj("rt$errors", newFakeView().
			obj("minLength", newFakeView().
				str("other", "chars").
				str("lots", "way too many")))) // not a CLDR category

	findings := enrichment.CheckFriendly(rt, view, nil)
	var enrichTextUnknownPluralArm *enrichment.Finding
	for i := range findings {
		if findings[i].Code == "enrich-text-unknown-plural-arm" {
			enrichTextUnknownPluralArm = &findings[i]
		}
	}
	if enrichTextUnknownPluralArm == nil {
		t.Fatalf("expected enrich-text-unknown-plural-arm for a non-CLDR arm; got %v", findingCodes(findings))
	}
	if enrichTextUnknownPluralArm.Severity != enrichment.Warning {
		t.Errorf("enrich-text-unknown-plural-arm severity = %v, want Warning", enrichTextUnknownPluralArm.Severity)
	}
	if enrichTextUnknownPluralArm.Path != "name.rt$errors.minLength.lots" {
		t.Errorf("enrich-text-unknown-plural-arm path = %q, want %q", enrichTextUnknownPluralArm.Path, "name.rt$errors.minLength.lots")
	}
}

func TestCheckFriendly_EnrichTextPluralWithoutCountPluralOnNonCountBearing(t *testing.T) {
	// `pattern` carries no count: a plural object there has dead arms.
	rt := objectRT(map[string]*reflection.RunType{"email": formatStringRT(map[string]any{"pattern": "x"})})
	view := newFakeView().obj("email", newFakeView().
		obj("rt$errors", newFakeView().
			obj("pattern", newFakeView().str("one", "x").str("other", "y"))))

	findings := enrichment.CheckFriendly(rt, view, nil)
	var enrichTextPluralWithoutCount *enrichment.Finding
	for i := range findings {
		if findings[i].Code == "enrich-text-plural-without-count" {
			enrichTextPluralWithoutCount = &findings[i]
		}
	}
	if enrichTextPluralWithoutCount == nil {
		t.Fatalf("expected enrich-text-plural-without-count for a plural on a non-count-bearing constraint; got %v", findingCodes(findings))
	}
	if enrichTextPluralWithoutCount.Severity != enrichment.Info {
		t.Errorf("enrich-text-plural-without-count severity = %v, want Info (advice, the catalog level)", enrichTextPluralWithoutCount.Severity)
	}
}

func TestCheckFriendly_EnrichTextUnknownPlaceholderInsidePluralArm(t *testing.T) {
	rt := objectRT(map[string]*reflection.RunType{"name": formatStringRT(map[string]any{"minLength": 2})})
	view := newFakeView().obj("name", newFakeView().
		obj("rt$errors", newFakeView().
			obj("minLength", newFakeView().
				str("one", "bad $[nope]").
				str("other", "fine $[val]"))))

	findings := enrichment.CheckFriendly(rt, view, nil)
	var enrichTextUnknownPlaceholder []enrichment.Finding
	for _, finding := range findings {
		if finding.Code == "enrich-text-unknown-placeholder" {
			enrichTextUnknownPlaceholder = append(enrichTextUnknownPlaceholder, finding)
		}
	}
	if len(enrichTextUnknownPlaceholder) != 1 {
		t.Fatalf("expected exactly one enrich-text-unknown-placeholder inside the plural arm; got %v", findings)
	}
	if enrichTextUnknownPlaceholder[0].Path != "name.rt$errors.minLength.one" {
		t.Errorf("enrich-text-unknown-placeholder path = %q, want %q", enrichTextUnknownPlaceholder[0].Path, "name.rt$errors.minLength.one")
	}
}

func TestCheckFriendly_EnrichTextUnknownPlaceholderColonTokens(t *testing.T) {
	// A colon inside a token makes it unknown; a literal colon in prose (`ratio 3:1`) never trips.
	rt := objectRT(map[string]*reflection.RunType{"price": formatStringRT(map[string]any{"max": 100})})
	view := newFakeView().obj("price", newFakeView().
		obj("rt$errors", newFakeView().
			str("type", "bad $[val:number:currency] but ratio 3:1 is prose").
			str("max", "bad $[label:number:currency] and $[val:nope:x], plain $[val] fine")))

	findings := enrichment.CheckFriendly(rt, view, nil)
	var enrichTextUnknownPlaceholder []enrichment.Finding
	for _, finding := range findings {
		if finding.Code == "enrich-text-unknown-placeholder" {
			enrichTextUnknownPlaceholder = append(enrichTextUnknownPlaceholder, finding)
		}
	}
	if len(enrichTextUnknownPlaceholder) != 3 {
		t.Fatalf("expected three enrich-text-unknown-placeholder (every colon token), got %v", findings)
	}
	for _, finding := range enrichTextUnknownPlaceholder {
		if !strings.Contains(finding.Message, "unknown placeholder") {
			t.Errorf("enrich-text-unknown-placeholder message should name an unknown placeholder; got %q", finding.Message)
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

func TestCheckFriendly_EnrichTextReservedPrefix(t *testing.T) {
	// A source-type property named rt$… collides with the reserved enrichment
	// meta prefix — Error, whatever the authored literal looks like.
	rt := objectRT(map[string]*reflection.RunType{"rt$label": stringRT(), "name": stringRT()})
	view := newFakeView().obj("name", newFakeView().str("rt$label", "Name"))

	findings := enrichment.CheckFriendly(rt, view, nil)

	var enrichTextReservedPrefix *enrichment.Finding
	for i := range findings {
		if findings[i].Code == "enrich-text-reserved-prefix" {
			enrichTextReservedPrefix = &findings[i]
		}
	}
	if enrichTextReservedPrefix == nil {
		t.Fatalf("expected enrich-text-reserved-prefix for reserved property; got %v", findingCodes(findings))
	}
	if enrichTextReservedPrefix.Severity != enrichment.Error {
		t.Errorf("enrich-text-reserved-prefix severity = %v, want Error", enrichTextReservedPrefix.Severity)
	}
	if enrichTextReservedPrefix.Path != "rt$label" {
		t.Errorf("enrich-text-reserved-prefix path = %q, want %q", enrichTextReservedPrefix.Path, "rt$label")
	}
}

func TestCheckMock_EnrichMockReservedPrefix(t *testing.T) {
	rt := objectRT(map[string]*reflection.RunType{"rt$optional": stringRT()})
	view := newFakeView()

	findings := enrichment.CheckMock(rt, view, nil)

	found := false
	for _, finding := range findings {
		if finding.Code == "enrich-mock-reserved-prefix" && finding.Severity == enrichment.Error && finding.Path == "rt$optional" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected enrich-mock-reserved-prefix Error at rt$optional; got %v", findingCodes(findings))
	}
}

func TestCheckFriendly_PlainDollarPropertyIsOrdinaryField(t *testing.T) {
	// The bare `$` prefix is NOT reserved: a property named $label is an
	// ordinary child field — addressable, no enrich-text-unknown-field/enrich-text-reserved-prefix.
	rt := objectRT(map[string]*reflection.RunType{"$label": stringRT()})
	view := newFakeView().obj("$label", newFakeView().str("rt$label", "Dollar label"))

	findings := enrichment.CheckFriendly(rt, view, nil)

	for _, finding := range findings {
		if finding.Code == "enrich-text-unknown-field" || finding.Code == "enrich-text-reserved-prefix" {
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

// TestCheckFriendly_EnrichTextUnknownErrorKeyNeverFailingParam: a param with no error (separators, float) is no valid key.
func TestCheckFriendly_EnrichTextUnknownErrorKeyNeverFailingParam(t *testing.T) {
	cases := map[string]*reflection.RunType{
		"separators": {Kind: reflection.KindString, FormatAnnotation: &reflection.FormatAnnotation{Name: "creditCard", Params: map[string]any{"separators": " -"}}},
		"float":      {Kind: reflection.KindNumber, FormatAnnotation: &reflection.FormatAnnotation{Name: "numberFormat", Params: map[string]any{"float": true}}},
	}
	for key, field := range cases {
		t.Run(key, func(t *testing.T) {
			rt := objectRT(map[string]*reflection.RunType{"field": field})
			view := newFakeView().obj("field", newFakeView().obj("rt$errors", newFakeView().str("type", "bad").str(key, "never shown")))
			if !hasFinding(enrichment.CheckFriendly(rt, view, nil), "enrich-text-unknown-error-key", "field.rt$errors."+key) {
				t.Fatalf("expected enrich-text-unknown-error-key on %s", key)
			}
		})
	}
}

// TestCheckFriendly_EnrichTextMissingMessageMissingKey: a missing key the field can fail on warns, unless rt$default is used.
func TestCheckFriendly_EnrichTextMissingMessageMissingKey(t *testing.T) {
	field := &reflection.RunType{Kind: reflection.KindNumber, FormatAnnotation: &reflection.FormatAnnotation{Name: "numberFormat", Params: map[string]any{"min": 0.0, "max": 10.0}}}
	rt := objectRT(map[string]*reflection.RunType{"age": field})

	partial := newFakeView().obj("age", newFakeView().obj("rt$errors", newFakeView().str("type", "bad").str("min", "too low")))
	findings := enrichment.CheckFriendly(rt, partial, nil)
	var missing []string
	for _, finding := range findings {
		if finding.Code == "enrich-text-missing-message" {
			missing = append(missing, finding.Args...)
			if finding.Severity != enrichment.Warning || finding.Path != "age.rt$errors" {
				t.Errorf("enrich-text-missing-message = %+v, want a Warning at age.rt$errors", finding)
			}
		}
	}
	if len(missing) != 1 || missing[0] != "max" {
		t.Fatalf("enrich-text-missing-message keys = %v, want [max]; findings %v", missing, findings)
	}

	catchAll := newFakeView().obj("age", newFakeView().obj("rt$errors", newFakeView().str("rt$default", "invalid age")))
	if hasFinding(enrichment.CheckFriendly(rt, catchAll, nil), "enrich-text-missing-message", "age.rt$errors") {
		t.Fatal("rt$default covers every key, so no enrich-text-missing-message")
	}
}

func hasFinding(findings []enrichment.Finding, code, path string) bool {
	for _, finding := range findings {
		if finding.Code == code && finding.Path == path {
			return true
		}
	}
	return false
}
