package convert_test

import (
	"reflect"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// The C6 projection's classification of reflection.RunType, shared with the
// printer-coverage tripwire (print_coverage_test.go): a COMPARED field carries
// information conversion must preserve, an EXCLUDED one is authoring trail or
// a derived pass's output (see canonical.go's header for the per-field
// reasons).
var canonicalCompared = map[string]bool{
	"ID": true, "Kind": true, "SubKind": true, "Name": true,
	"Optional": true, "Readonly": true, "NonEnumerable": true,
	"Visibility": true, "IsAbstract": true, "IsStatic": true,
	"Literal": true, "DefaultVal": true, "Flags": true, "Description": true,
	"FormatAnnotation": true, "EnumVal": true, "Values": true,
	"ClassRef": true, "Overrides": true,
	"Child": true, "Index": true, "Return": true, "IndexT": true,
	"Parameters": true, "Children": true, "Arguments": true, "TypeMeta": true,
	"SchemaChecks": true,
}

var canonicalExcluded = map[string]bool{
	"TypeName": true, "TypeArguments": true, "IsCircular": true,
	"NotSupported": true, "Family": true, "IsSafeName": true,
	"Position": true, "Extends": true, "ExtendsArguments": true,
	"Implements": true, "SafeUnionChildren": true, "UnionDiscriminators": true,
}

// Every SchemaChecks field is compared (all three are sentinel-lifted schema
// constraints — information by definition).
var canonicalChecksCompared = map[string]bool{
	"Contains": true, "PatternProps": true, "PropNames": true,
}

// Every reflection.RunType field must be CLASSIFIED by the C6 projection:
// either compared (canonical.go copies it) or excluded with a documented
// reason. A new field failing here means canonical.go needs a decision.
func TestCanonicalCoversRunType(t *testing.T) {
	runTypeStruct := reflect.TypeOf(reflection.RunType{})
	for index := 0; index < runTypeStruct.NumField(); index++ {
		fieldName := runTypeStruct.Field(index).Name
		if !canonicalCompared[fieldName] && !canonicalExcluded[fieldName] {
			t.Errorf("reflection.RunType field %q is not classified by the C6 canonical projection (canonical.go)", fieldName)
		}
		if canonicalCompared[fieldName] && canonicalExcluded[fieldName] {
			t.Errorf("reflection.RunType field %q is classified both compared and excluded", fieldName)
		}
	}
	checksStruct := reflect.TypeOf(reflection.SchemaChecks{})
	for index := 0; index < checksStruct.NumField(); index++ {
		fieldName := checksStruct.Field(index).Name
		if !canonicalChecksCompared[fieldName] {
			t.Errorf("reflection.SchemaChecks field %q is not classified by the C6 canonical projection (canonical.go)", fieldName)
		}
	}
}
