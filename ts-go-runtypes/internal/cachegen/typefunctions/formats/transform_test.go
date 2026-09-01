package formats

import (
	"strings"
	"testing"
)

func transformParams(block map[string]any) map[string]any {
	return map[string]any{"maxLength": float64(8), TransformParamsKey: block}
}

// TestEmitStringTransform_OrderAndIdentity — the chain follows the documented
// order (trim, replace, replaceAll, lowercase, uppercase, capitalize) and an
// empty or absent block is identity.
func TestEmitStringTransform_OrderAndIdentity(t *testing.T) {
	if got := EmitStringTransform(map[string]any{"maxLength": float64(8)}, "v"); got != "" {
		t.Errorf("no transform block must be identity; got %q", got)
	}
	if got := EmitStringTransform(transformParams(map[string]any{}), "v"); got != "" {
		t.Errorf("empty transform block must be identity; got %q", got)
	}
	if got := EmitStringTransform(transformParams(map[string]any{"trim": false, "lowercase": false}), "v"); got != "" {
		t.Errorf("false flags must be identity; got %q", got)
	}
	// The OLD flat spelling is not read any more.
	if got := EmitStringTransform(map[string]any{"trim": true, "lowercase": true}, "v"); got != "" {
		t.Errorf("flat flags must be ignored; got %q", got)
	}
	all := transformParams(map[string]any{
		"capitalize": true,
		"uppercase":  true,
		"lowercase":  true,
		"replaceAll": map[string]any{"searchValue": "-", "replaceValue": ""},
		"replace":    map[string]any{"searchValue": " ", "replaceValue": "_"},
		"trim":       true,
	})
	got := EmitStringTransform(all, "v")
	want := `(v.replace(" ", "_").replaceAll("-", "").trim().toLowerCase().toUpperCase().charAt(0).toUpperCase() + v.replace(" ", "_").replaceAll("-", "").trim().toLowerCase().toUpperCase().slice(1))`
	if got != want {
		t.Errorf("chain order:\n got %q\nwant %q", got, want)
	}
}

// TestValidateTransformParams — the FMT002 shape check is the only guard
// against a typo inside the block, so it must reject unknown keys.
func TestValidateTransformParams(t *testing.T) {
	cases := []struct {
		name   string
		params map[string]any
		want   string // substring of the one expected message, "" for valid
	}{
		{"absent", map[string]any{"maxLength": float64(8)}, ""},
		{"empty block", transformParams(map[string]any{}), ""},
		{"flags", transformParams(map[string]any{"trim": true, "lowercase": true}), ""},
		{"replaceAll", transformParams(map[string]any{"replaceAll": map[string]any{"searchValue": "a", "replaceValue": "b"}}), ""},
		{"extra key allowed", transformParams(map[string]any{"stripSeparators": true}), ""},
		{"not an object", map[string]any{TransformParamsKey: true}, "`transform` must be an object"},
		{"unknown key", transformParams(map[string]any{"trimm": true}), "unknown `transform` key `trimm`"},
		{"flag not a boolean", transformParams(map[string]any{"trim": "yes"}), "`transform.trim` must be a boolean"},
		{"replace missing replaceValue", transformParams(map[string]any{"replace": map[string]any{"searchValue": "a"}}), "`transform.replace` needs"},
		{"replaceAll not an object", transformParams(map[string]any{"replaceAll": "a"}), "`transform.replaceAll` needs"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			messages := ValidateTransformParams(tc.params, "FormatX", "stripSeparators")
			if tc.want == "" {
				if len(messages) != 0 {
					t.Errorf("params %v should be accepted; got %v", tc.params, messages)
				}
				return
			}
			if len(messages) != 1 || !strings.Contains(messages[0], tc.want) || !strings.HasPrefix(messages[0], "FormatX: ") {
				t.Errorf("params %v: want one message containing %q with the label prefix; got %v", tc.params, tc.want, messages)
			}
		})
	}
	// An extra key is only allowed when the caller names it.
	if messages := ValidateTransformParams(transformParams(map[string]any{"stripSeparators": true}), "FormatX"); len(messages) != 1 {
		t.Errorf("stripSeparators must be rejected for a format that does not name it; got %v", messages)
	}
}
