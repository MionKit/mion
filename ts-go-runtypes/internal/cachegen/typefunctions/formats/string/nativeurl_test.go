package string

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

func urlObjectAnnotation(params map[string]any) *reflection.FormatAnnotation {
	return &reflection.FormatAnnotation{Name: "nativeUrl", Params: params}
}

func TestUrlObject_ValidateParamsMessagesNameTheUrlType(t *testing.T) {
	cases := []struct {
		name   string
		params map[string]any
	}{
		{"transform", map[string]any{"transform": map[string]any{"lowercase": true}}},
		{"max below min", map[string]any{"minLength": 20, "maxLength": 5}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			messages := nativeUrlEmitter{}.ValidateParams(urlObjectAnnotation(tc.params))
			if len(messages) != 1 {
				t.Fatalf("params %v: want one message, got %v", tc.params, messages)
			}
			if !strings.HasPrefix(messages[0], "Url: ") {
				t.Errorf("message %q should start with %q", messages[0], "Url: ")
			}
		})
	}
}
