package runtype

import (
	"reflect"
	"testing"

	"github.com/microsoft/typescript-go/shim/checker"
)

// TestMappedTypeLayoutMatchesChecker pins mappedTypeLayout to the real
// checker.MappedType field layout. A typescript-go bump that reorders or
// resizes the struct makes the unsafe field reads silently wrong — this test
// turns that into a loud failure (field names, offsets, and total size must
// all agree).
func TestMappedTypeLayoutMatchesChecker(t *testing.T) {
	real := reflect.TypeFor[checker.MappedType]()
	mirror := reflect.TypeFor[mappedTypeLayout]()
	if real.NumField() != mirror.NumField() {
		t.Fatalf("field count drift: checker.MappedType has %d fields, mirror has %d", real.NumField(), mirror.NumField())
	}
	for i := 0; i < real.NumField(); i++ {
		realField, mirrorField := real.Field(i), mirror.Field(i)
		if realField.Name != mirrorField.Name {
			t.Errorf("field %d name drift: checker.MappedType.%s vs mirror.%s", i, realField.Name, mirrorField.Name)
		}
		if realField.Offset != mirrorField.Offset {
			t.Errorf("field %q offset drift: checker.MappedType=%d mirror=%d", realField.Name, realField.Offset, mirrorField.Offset)
		}
	}
	if real.Size() != mirror.Size() {
		t.Errorf("size drift: checker.MappedType=%d mirror=%d", real.Size(), mirror.Size())
	}
}
