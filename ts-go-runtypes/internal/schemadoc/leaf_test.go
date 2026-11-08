package schemadoc

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// TestLeafFormat_GeneratorKeepsTheGenericSpelling: public `generator` prints via TF.String; a non-public key demotes.
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
