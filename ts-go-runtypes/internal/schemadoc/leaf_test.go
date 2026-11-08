package schemadoc

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// TestLeafFormat_GeneratorKeepsTheGenericSpelling: `generator` is a public String param, so a format carrying one
// still prints through TF.String, while a key outside the public surface demotes to the exact constructor.
func TestLeafFormat_GeneratorKeepsTheGenericSpelling(t *testing.T) {
	withGenerator, _, ok := LeafFormat(&reflection.FormatAnnotation{Name: "stringFormat", Params: map[string]any{"generator": "lastName"}})
	if !ok || withGenerator.Exact {
		t.Fatalf("a generator must keep the generic spelling, got %+v ok=%v", withGenerator, ok)
	}
	internal, _, _ := LeafFormat(&reflection.FormatAnnotation{Name: "stringFormat", Params: map[string]any{"isRegex": true}})
	if !internal.Exact {
		t.Fatal("control: a preset-internal key demotes to the exact spelling")
	}
}
