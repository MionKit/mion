package numeric

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// annotation is a small helper to build a FormatAnnotation for tests.
func annotation(name string, params map[string]any) *reflection.FormatAnnotation {
	return &reflection.FormatAnnotation{Name: name, Params: params}
}

// TestBigIntParam_StripsTrailingN verifies bigint params parse whether or
// not they carry tsgo's trailing `n`, and that emitted literals always do.
func TestBigIntParam_StripsTrailingN(t *testing.T) {
	for _, raw := range []string{"123n", "123"} {
		literal, ok := bigIntLiteral(map[string]any{"max": raw}, "max")
		if !ok || literal != "123n" {
			t.Errorf("bigIntLiteral(%q) = %q, %v; want \"123n\", true", raw, literal, ok)
		}
		value, ok := readBigIntParam(map[string]any{"max": raw}, "max")
		if !ok || value.Int64() != 123 {
			t.Errorf("readBigIntParam(%q) = %v, %v; want 123, true", raw, value, ok)
		}
	}
	// Meta-object form { val: "0n" } unwraps to the inner value.
	literal, ok := bigIntLiteral(map[string]any{"min": map[string]any{"val": "0n"}}, "min")
	if !ok || literal != "0n" {
		t.Errorf("meta-object bigIntLiteral = %q, %v; want \"0n\", true", literal, ok)
	}
}

// TestBigIntValidate_EmitsBigintLiterals checks the validate comparison uses
// `n`-suffixed literals and the modulo uses `=== 0n`.
func TestBigIntValidate_EmitsBigintLiterals(t *testing.T) {
	emitter := bigintFormatEmitter{}
	got := emitter.EmitValidateCheck(annotation(bigintFormatName, map[string]any{"max": "100n", "multipleOf": "5n"}), "v", nil)
	for _, want := range []string{"v <= 100n", "(v % 5n === 0n)"} {
		if !strings.Contains(got, want) {
			t.Errorf("validate = %q, want substring %q", got, want)
		}
	}
}

// TestNumberValidate_FloatIsAnnotationOnly: 2.0 is a legal float, so `float` emits no validate or error check.
func TestNumberValidate_FloatIsAnnotationOnly(t *testing.T) {
	emitter := numberFormatEmitter{}
	floatOnly := annotation(numberFormatName, map[string]any{"float": true})
	if validate := emitter.EmitValidateCheck(floatOnly, "v", nil); validate != "" {
		t.Errorf("float-only annotation must emit no validate condition, got %q", validate)
	}
	if errs := emitter.EmitValidationErrorsCheck(floatOnly, "v", "pth", "er", nil); errs != "" {
		t.Errorf("float-only annotation must emit no error statements, got %q", errs)
	}
}

// TestNumberValidate_IntegerAndMultipleOf checks integer + multipleOf emit
// the right predicates and the validationErrors `val` for integer is `true`.
func TestNumberValidate_IntegerAndMultipleOf(t *testing.T) {
	emitter := numberFormatEmitter{}
	params := map[string]any{"integer": true, "multipleOf": 5.0}
	validate := emitter.EmitValidateCheck(annotation(numberFormatName, params), "v", nil)
	for _, want := range []string{"Number.isInteger(v)", "(v % 5 === 0)"} {
		if !strings.Contains(validate, want) {
			t.Errorf("validate = %q, want substring %q", validate, want)
		}
	}
	errs := emitter.EmitValidationErrorsCheck(annotation(numberFormatName, params), "v", "pth", "er", nil)
	if !strings.Contains(errs, "'integer'],val:true") {
		t.Errorf("validationErrors = %q, want integer error val:true", errs)
	}
}

// TestNumberValidate_FractionalMultipleOf: 19.99 / 0.01 is 1998.9999999999998, so Number.isInteger would reject it.
func TestNumberValidate_FractionalMultipleOf(t *testing.T) {
	emitter := numberFormatEmitter{}
	cases := []struct {
		name   string
		params map[string]any
		want   string
	}{
		{"default tolerance", map[string]any{"multipleOf": 0.01},
			"(Math.abs(v / 0.01 - Math.round(v / 0.01)) <= Math.abs(v / 0.01) * 8.881784197001252e-16)"},
		{"custom tolerance", map[string]any{"multipleOf": 0.01, "multipleOfTolerance": 1e-9},
			"(Math.abs(v / 0.01 - Math.round(v / 0.01)) <= Math.abs(v / 0.01) * 1e-09)"},
		{"whole step on a plain number", map[string]any{"multipleOf": 5.0}, "(v % 5 === 0)"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			validate := emitter.EmitValidateCheck(annotation(numberFormatName, tc.params), "v", nil)
			if validate != tc.want {
				t.Errorf("validate = %q, want %q", validate, tc.want)
			}
			errs := emitter.EmitValidationErrorsCheck(annotation(numberFormatName, tc.params), "v", "pth", "er", nil)
			if !strings.Contains(errs, "if (!"+tc.want+")") {
				t.Errorf("validationErrors = %q, want the same check %q", errs, tc.want)
			}
		})
	}
}

// TestValidateParams covers the spec-faithful invariants (including the
// filter(Boolean) quirk where a 0 bound escapes the range checks).
func TestValidateParams(t *testing.T) {
	number := numberFormatEmitter{}
	bigint := bigintFormatEmitter{}

	if errs := number.ValidateParams(annotation(numberFormatName, map[string]any{"integer": true, "float": true})); len(errs) == 0 {
		t.Error("expected integer+float conflict")
	}
	// A lower (or upper) edge is inclusive OR exclusive, never both — min+gt
	// and max+lt are mutually exclusive (XOR).
	if errs := number.ValidateParams(annotation(numberFormatName, map[string]any{"min": 1.0, "gt": 2.0})); len(errs) == 0 {
		t.Error("expected min+gt mutual-exclusivity error")
	}
	if errs := number.ValidateParams(annotation(numberFormatName, map[string]any{"max": 10.0, "lt": 5.0})); len(errs) == 0 {
		t.Error("expected max+lt mutual-exclusivity error")
	}
	// Inversion of a lower-vs-upper pair is also rejected.
	if errs := number.ValidateParams(annotation(numberFormatName, map[string]any{"gt": 5.0, "lt": 2.0})); len(errs) == 0 {
		t.Error("expected gt>=lt ordering error")
	}
	if errs := number.ValidateParams(annotation(numberFormatName, map[string]any{"integer": true, "multipleOf": 0.5})); len(errs) == 0 {
		t.Error("expected integer+fractional multipleOf error")
	}
	if errs := number.ValidateParams(annotation(numberFormatName, map[string]any{"integer": true, "multipleOf": 5.0})); len(errs) != 0 {
		t.Errorf("expected integer+whole multipleOf to be accepted, got %v", errs)
	}
	// multipleOfTolerance only applies to a fractional step, and must sit in (0, 1).
	if errs := number.ValidateParams(annotation(numberFormatName, map[string]any{"multipleOf": 0.01, "multipleOfTolerance": 1e-9})); len(errs) != 0 {
		t.Errorf("expected tolerance with fractional multipleOf to be accepted, got %v", errs)
	}
	for _, params := range []map[string]any{
		{"multipleOfTolerance": 1e-9},
		{"multipleOf": 5.0, "multipleOfTolerance": 1e-9},
		{"multipleOf": 0.01, "multipleOfTolerance": 0.0},
		{"multipleOf": 0.01, "multipleOfTolerance": 1.0},
		{"multipleOf": 0.01, "multipleOfTolerance": -1e-9},
	} {
		if errs := number.ValidateParams(annotation(numberFormatName, params)); len(errs) == 0 {
			t.Errorf("expected multipleOfTolerance error for %v", params)
		}
	}
	// A fractional multipleOf is allowed: JSON Schema permits any positive number (0.01 on a money field).
	if errs := number.ValidateParams(annotation(numberFormatName, map[string]any{"multipleOf": 2.5})); len(errs) != 0 {
		t.Errorf("expected fractional multipleOf to be accepted, got %v", errs)
	}
	if errs := number.ValidateParams(annotation(numberFormatName, map[string]any{"multipleOf": 0.0})); len(errs) == 0 {
		t.Error("expected multipleOf-must-be-positive error")
	}
	// `float` is annotation-only (never failable) so it composes with multipleOf.
	if errs := number.ValidateParams(annotation(numberFormatName, map[string]any{"multipleOf": 5.0, "float": true})); len(errs) != 0 {
		t.Errorf("expected multipleOf+float to be accepted (float is annotation-only), got %v", errs)
	}
	// The filter(Boolean) quirk: {min:0, gt:0} both falsy → no error.
	if errs := number.ValidateParams(annotation(numberFormatName, map[string]any{"min": 0.0, "gt": 0.0})); len(errs) != 0 {
		t.Errorf("expected no error for {min:0, gt:0} (filter(Boolean) quirk), got %v", errs)
	}
	// bigint: multipleOf <= 0 rejected.
	if errs := bigint.ValidateParams(annotation(bigintFormatName, map[string]any{"multipleOf": "0n"})); len(errs) == 0 {
		t.Error("expected bigint multipleOf>0 error")
	}
	if errs := bigint.ValidateParams(annotation(bigintFormatName, map[string]any{"min": "10n", "max": "5n"})); len(errs) == 0 {
		t.Error("expected bigint min>max error")
	}
}

// TestNumberFormat_IsCurrencyEcho: isCurrency adds no predicate; its errors carry it so i18n shows the bound as money.
func TestNumberFormat_IsCurrencyEcho(t *testing.T) {
	emitter := numberFormatEmitter{}
	plain := map[string]any{"max": 100.0}
	currency := map[string]any{"max": 100.0, "isCurrency": true}

	// No validate predicate: the check expressions are identical.
	if got, want := emitter.EmitValidateCheck(annotation(numberFormatName, currency), "v", nil),
		emitter.EmitValidateCheck(annotation(numberFormatName, plain), "v", nil); got != want {
		t.Errorf("isCurrency must not change validation: %q vs %q", got, want)
	}

	// Every emitted error echoes the flag; a plain number never does.
	withFlag := emitter.EmitValidationErrorsCheck(annotation(numberFormatName, currency), "v", "pth", "errs", nil)
	if !strings.Contains(withFlag, ",isCurrency:true}") {
		t.Errorf("currency errors must echo isCurrency; got %q", withFlag)
	}
	if !strings.Contains(withFlag, "name:'numberFormat'") {
		t.Errorf("the format name stays numberFormat; got %q", withFlag)
	}
	without := emitter.EmitValidationErrorsCheck(annotation(numberFormatName, plain), "v", "pth", "errs", nil)
	if strings.Contains(without, "isCurrency") {
		t.Errorf("plain number errors must not carry the flag: %q", without)
	}

	if msgs := emitter.ValidateParams(annotation(numberFormatName, currency)); len(msgs) != 0 {
		t.Errorf("isCurrency has no param invariants; got %v", msgs)
	}
}
