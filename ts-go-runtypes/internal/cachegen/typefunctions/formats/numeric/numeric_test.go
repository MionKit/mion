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

// TestNumberBinary_IntegerWidthLadder pins the int8/16/32 + float64
// fallback selection (getIntegerType + emitToBinary switch). The
// emitted DataView call width is the observable proof of the byte size.
func TestNumberBinary_IntegerWidthLadder(t *testing.T) {
	emitter := numberFormatEmitter{}
	cases := []struct {
		name   string
		params map[string]any
		want   string // substring the emitted encode must contain ("" = float64 fallback)
	}{
		{"uint8", map[string]any{"integer": true, "min": 0.0, "max": 255.0}, "setUint8"},
		{"uint16", map[string]any{"integer": true, "min": 0.0, "max": 65535.0}, "setUint16"},
		{"uint32", map[string]any{"integer": true, "min": 0.0, "max": 4294967295.0}, "setUint32"},
		{"int8", map[string]any{"integer": true, "min": -128.0, "max": 127.0}, "setInt8"},
		{"int16", map[string]any{"integer": true, "min": -32768.0, "max": 32767.0}, "setInt16"},
		{"int32", map[string]any{"integer": true, "min": -2147483648.0, "max": 2147483647.0}, "setInt32"},
		{"unbounded integer → float64", map[string]any{"integer": true}, ""},
		{"float → float64", map[string]any{"float": true}, ""},
		{"plain number → float64", map[string]any{}, ""},
		{"integer beyond int32 → float64", map[string]any{"integer": true, "min": 0.0, "max": 5000000000.0}, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			encode := emitter.EmitToBinary(annotation(numberFormatName, tc.params), "v", "Ser", nil)
			decode := emitter.EmitFromBinary(annotation(numberFormatName, tc.params), "Des", nil)
			if tc.want == "" {
				if encode != "" || decode != "" {
					t.Fatalf("expected float64 fallback (empty override); got encode=%q decode=%q", encode, decode)
				}
				return
			}
			if !strings.Contains(encode, tc.want) {
				t.Errorf("encode = %q, want substring %q", encode, tc.want)
			}
			// The decode side must use the matching getter (setUint8 → getUint8).
			getter := strings.Replace(tc.want, "set", "get", 1)
			if !strings.Contains(decode, getter) {
				t.Errorf("decode = %q, want substring %q", decode, getter)
			}
		})
	}
}

// TestBigIntBinary_RangeSelection pins the 64-bit packing decision: both
// min AND max must be present, UInt64 takes precedence over Int64, and
// out-of-range / partial-bound brands fall back to the string base arm.
func TestBigIntBinary_RangeSelection(t *testing.T) {
	emitter := bigintFormatEmitter{}
	cases := []struct {
		name   string
		params map[string]any
		want   string // "" = string fallback
	}{
		{"int64 full range", map[string]any{"min": "-9223372036854775808n", "max": "9223372036854775807n"}, "setBigInt64"},
		{"uint64 full range", map[string]any{"min": "0n", "max": "18446744073709551615n"}, "setBigUint64"},
		{"small non-negative range → uint64 wins", map[string]any{"min": "0n", "max": "255n"}, "setBigUint64"},
		{"only min → string fallback", map[string]any{"min": "0n"}, ""},
		{"only max → string fallback", map[string]any{"max": "100n"}, ""},
		{"beyond uint64 → string fallback", map[string]any{"min": "0n", "max": "99999999999999999999999n"}, ""},
		{"no params → string fallback", map[string]any{}, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			encode := emitter.EmitToBinary(annotation(bigintFormatName, tc.params), "v", "Ser", nil)
			decode := emitter.EmitFromBinary(annotation(bigintFormatName, tc.params), "Des", nil)
			if tc.want == "" {
				if encode != "" || decode != "" {
					t.Fatalf("expected string fallback (empty override); got encode=%q decode=%q", encode, decode)
				}
				return
			}
			if !strings.Contains(encode, tc.want) {
				t.Errorf("encode = %q, want substring %q", encode, tc.want)
			}
			getter := strings.Replace(tc.want, "set", "get", 1)
			if !strings.Contains(decode, getter) {
				t.Errorf("decode = %q, want substring %q", decode, getter)
			}
		})
	}
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

// TestNumberValidate_FloatIsAnnotationOnly pins that the `float` tag never
// becomes a failable predicate: whole values (2.0) are legal floats, so a
// float-only annotation emits NO validate condition and NO error statement
// (the tag only steers mock generation and binary packing).
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
	// A fractional multipleOf is ALLOWED (JSON Schema permits any positive
	// number, e.g. 0.01 on a money field); only a non-positive one is an error.
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

// TestNumberFormat_IsCurrencyEcho pins the isCurrency presentation param: it
// adds NO validate predicate and NO binary-width change, but every emitted
// validation error carries `isCurrency:true` inside its format payload — the
// discriminator the friendly i18n renderer uses to render the violated bound
// as money.
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

	// No param invariant and no binary-width change.
	if msgs := emitter.ValidateParams(annotation(numberFormatName, currency)); len(msgs) != 0 {
		t.Errorf("isCurrency has no param invariants; got %v", msgs)
	}
	cents := map[string]any{"integer": true, "min": 0.0, "max": 255.0, "isCurrency": true}
	if got := emitter.EmitToBinary(annotation(numberFormatName, cents), "v", "Ser", nil); !strings.Contains(got, "setUint8") {
		t.Errorf("binary ladder unaffected by isCurrency; got %q", got)
	}
}
