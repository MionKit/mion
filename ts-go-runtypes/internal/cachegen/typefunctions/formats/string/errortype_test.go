package string

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// The `errorType` roster: which emitters splice a failure mode into the pushed
// format error, and which deliberately leave it off. The mode VALUES are pinned
// on the JS side (formatErrorType.test.ts); these tests pin the emitted shape —
// the pure fn reached for, the `===''` compare on the validate lane, and the
// `errorType:` property on the errors lane.

func annotationOf(name string, params map[string]any) *reflection.FormatAnnotation {
	return &reflection.FormatAnnotation{Name: name, Params: params}
}

func mustContain(t *testing.T, lane, got string, wants ...string) {
	t.Helper()
	for _, want := range wants {
		if !strings.Contains(got, want) {
			t.Errorf("%s lane missing %q; got %q", lane, want, got)
		}
	}
}

func mustNotContain(t *testing.T, lane, got string, unwanted string) {
	t.Helper()
	if strings.Contains(got, unwanted) {
		t.Errorf("%s lane must not carry %q; got %q", lane, unwanted, got)
	}
}

// ── email, RFC path ──────────────────────────────────────────────────

func TestEmailRfc_ValidateComparesTheModeAgainstEmpty(t *testing.T) {
	ctx := newCardStubCtx()
	got := emailEmitter{}.EmitValidateCheck(annotationOf("email", map[string]any{"emailRfc": "ascii"}), "v", ctx)
	mustContain(t, "validate", got, "pf_isEmailAddress(v,{idn:false})===''")
}

func TestEmailRfc_ErrorsLaneReportsThePart(t *testing.T) {
	ctx := newCardStubCtx()
	got := emailEmitter{}.EmitValidationErrorsCheck(annotationOf("email", map[string]any{"emailRfc": "unicode"}), "v", "pth", "er", ctx)
	// One local holds the mode; the error carries it and keeps formatPath.
	mustContain(t, "errors", got,
		"const emMode0=pf_isEmailAddress(v,{idn:true})",
		"if (emMode0!=='')",
		"formatPath:['emailRfc']",
		"errorType:emMode0")
}

// A declared length bound that fails folds in as 'length' instead of running
// the engine, and the single error still names the mode.
func TestEmailRfc_LengthBoundFoldsInAsLength(t *testing.T) {
	ctx := newCardStubCtx()
	got := emailEmitter{}.EmitValidationErrorsCheck(annotationOf("email", map[string]any{"emailRfc": "ascii", "maxLength": 254.0}), "v", "pth", "er", ctx)
	mustContain(t, "errors", got, "? pf_isEmailAddress(v,{idn:false}) : 'length'", "errorType:emMode0")
}

// ── email, decomposition path ────────────────────────────────────────

func TestEmailStrict_EachHalfNamesItself(t *testing.T) {
	ctx := newCardStubCtx()
	params := map[string]any{
		"localPart": map[string]any{"maxLength": 64.0},
		"domain":    map[string]any{"maxLength": 253.0},
	}
	got := emailEmitter{}.EmitValidationErrorsCheck(annotationOf("email", params), "v", "pth", "er", ctx)
	mustContain(t, "errors", got,
		`formatPath:['@'],val:'Email missing @ symbol',errorType:"format"`,
		`name:'email',formatPath:['maxLength'],val:64,errorType:"localPart"`,
		// The domain half is told apart by its format NAME, not a tag.
		`name:'domain',formatPath:['maxLength'],val:253}`)
}

// ── email, pattern path: one way to fail, no errorType ───────────────

func TestEmailPattern_LeavesErrorTypeOff(t *testing.T) {
	ctx := newCardStubCtx()
	params := map[string]any{"pattern": map[string]any{"source": "^.+@.+$"}, "maxLength": 254.0}
	got := emailEmitter{}.EmitValidationErrorsCheck(annotationOf("email", params), "v", "pth", "er", ctx)
	mustNotContain(t, "errors", got, "errorType")
}

// ── domain, IDNA path ────────────────────────────────────────────────

func TestDomainIdna_ValidateComparesTheModeAgainstEmpty(t *testing.T) {
	ctx := newCardStubCtx()
	got := domainEmitter{}.EmitValidateCheck(annotationOf("domain", map[string]any{"idna": "ascii"}), "v", ctx)
	mustContain(t, "validate", got, "pf_isIdnHostname(v,{idn:false})===''")
}

func TestDomainIdna_ErrorsLaneReportsTheRule(t *testing.T) {
	ctx := newCardStubCtx()
	got := domainEmitter{}.EmitValidationErrorsCheck(annotationOf("domain", map[string]any{"idna": "unicode", "maxLength": 253.0}), "v", "pth", "er", ctx)
	mustContain(t, "errors", got,
		"const dnMode0=(",
		"? pf_isIdnHostname(v,{idn:true}) : 'length'",
		"if (dnMode0!=='')",
		"formatPath:['idna'],val:true,errorType:dnMode0")
}

// ── domain, decomposition path ───────────────────────────────────────

func TestDomainStrict_LabelsAndTldNameThemselves(t *testing.T) {
	ctx := newCardStubCtx()
	params := map[string]any{
		"names":    map[string]any{"maxLength": 63.0},
		"tld":      map[string]any{"minLength": 2.0},
		"maxParts": 4.0,
	}
	got := domainEmitter{}.EmitValidationErrorsCheck(annotationOf("domain", params), "v", "pth", "er", ctx)
	mustContain(t, "errors", got,
		`formatPath:['hyphen'],val:'name',errorType:"label"`,
		`formatPath:['maxLength'],val:63,errorType:"label"`,
		`formatPath:['minLength'],val:2,errorType:"tld"`)
	// A whole-name bound names itself through formatPath and carries no part.
	mustContain(t, "errors", got, "formatPath:['maxParts'],val:4}")
}

// Inside an email, the domain half's errors carry the `domain` format name;
// its label / tld checks name themselves and its whole-domain bound stays bare.
func TestEmailStrict_NestedDomainKeepsLabelAndTld(t *testing.T) {
	ctx := newCardStubCtx()
	params := map[string]any{
		"localPart": map[string]any{"minLength": 1.0},
		"domain": map[string]any{
			"maxLength": 253.0,
			"names":     map[string]any{"maxLength": 63.0},
			"tld":       map[string]any{"minLength": 2.0},
		},
	}
	got := emailEmitter{}.EmitValidationErrorsCheck(annotationOf("email", params), "v", "pth", "er", ctx)
	mustContain(t, "errors", got,
		`name:'domain',formatPath:['maxLength'],val:253}`,
		`name:'domain',formatPath:['maxLength'],val:63,errorType:"label"`,
		`name:'domain',formatPath:['minLength'],val:2,errorType:"tld"`)
}

// ── ip ───────────────────────────────────────────────────────────────

func TestIp_ValidateComparesTheModeAgainstEmpty(t *testing.T) {
	ctx := newCardStubCtx()
	got := ipEmitter{}.EmitValidateCheck(annotationOf("ip", map[string]any{"version": "any"}), "v", ctx)
	mustContain(t, "validate", got, "pf_isIPV4(v,", "==='' || pf_isIPV6(v,", "==='')")
}

// Without allowPort there is exactly one way to fail: no errorType, no local.
func TestIp_NoPortLeavesErrorTypeOff(t *testing.T) {
	ctx := newCardStubCtx()
	got := ipEmitter{}.EmitValidationErrorsCheck(annotationOf("ip", map[string]any{"version": 4.0}), "v", "pth", "er", ctx)
	mustNotContain(t, "errors", got, "errorType")
	mustContain(t, "errors", got, "if (!(pf_isIPV4(v,", "formatPath:['version'],val:4}")
}

func TestIpWithPort_PinnedVersionReportsTheMode(t *testing.T) {
	ctx := newCardStubCtx()
	got := ipEmitter{}.EmitValidationErrorsCheck(annotationOf("ip", map[string]any{"version": 6.0, "allowPort": true}), "v", "pth", "er", ctx)
	mustContain(t, "errors", got,
		"const ipMode0=pf_isIPV6(v,",
		"if (ipMode0!=='')",
		"formatPath:['version'],val:6,errorType:ipMode0")
}

// Under 'any' both parsers get a say; a 'port' from either wins.
func TestIpWithPort_AnyVersionLetsPortWin(t *testing.T) {
	ctx := newCardStubCtx()
	got := ipEmitter{}.EmitValidationErrorsCheck(annotationOf("ip", map[string]any{"version": "any", "allowPort": true}), "v", "pth", "er", ctx)
	mustContain(t, "errors", got,
		"const ipMode40=pf_isIPV4(v,",
		"const ipMode60=ipMode40==='' ? '' : pf_isIPV6(v,",
		"ipMode40==='port' || ipMode60==='port' ? 'port' : 'address'",
		"formatPath:['version'],val:'any',errorType:ipMode0")
}

// ── url: a pattern format, one way to fail per param ─────────────────

func TestUrl_LeavesErrorTypeOff(t *testing.T) {
	ctx := newCardStubCtx()
	params := map[string]any{"pattern": map[string]any{"source": "^https?://"}, "maxLength": 2048.0}
	got := urlEmitter{}.EmitValidationErrorsCheck(annotationOf("url", params), "v", "pth", "er", ctx)
	mustNotContain(t, "errors", got, "errorType")
}
