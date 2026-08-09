package convert_test

import (
	"reflect"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/reflection"
)

// Every reflection.RunType field must be CLASSIFIED by the C6 projection:
// either compared (canonical.go copies it) or excluded with a documented
// reason. A new field failing here means canonical.go needs a decision.
func TestCanonicalCoversRunType(t *testing.T) {
	classified := map[string]bool{
		// Compared.
		"ID": true, "Kind": true, "SubKind": true, "Name": true,
		"Optional": true, "Readonly": true, "NonEnumerable": true,
		"Visibility": true, "IsAbstract": true, "IsStatic": true,
		"Literal": true, "DefaultVal": true, "Flags": true, "Description": true,
		"FormatAnnotation": true, "EnumVal": true, "Values": true,
		"ClassRef": true, "Overrides": true,
		"Child": true, "Index": true, "Return": true, "IndexT": true,
		"Parameters": true, "Children": true, "Arguments": true, "TypeMeta": true,
		"SchemaChecks": true,
		// Excluded on purpose (see canonical.go's header).
		"TypeName": true, "TypeArguments": true, "IsCircular": true,
		"NotSupported": true, "Family": true, "IsSafeName": true,
		"Position": true, "Extends": true, "ExtendsArguments": true,
		"Implements": true, "SafeUnionChildren": true, "UnionDiscriminators": true,
	}
	runTypeStruct := reflect.TypeOf(reflection.RunType{})
	for index := 0; index < runTypeStruct.NumField(); index++ {
		fieldName := runTypeStruct.Field(index).Name
		if !classified[fieldName] {
			t.Errorf("reflection.RunType field %q is not classified by the C6 canonical projection (canonical.go)", fieldName)
		}
	}
	checksClassified := map[string]bool{
		"Negations": true, "Contains": true, "PatternProps": true,
		"PropNames": true, "OneOf": true, "Unevaluated": true,
	}
	checksStruct := reflect.TypeOf(reflection.SchemaChecks{})
	for index := 0; index < checksStruct.NumField(); index++ {
		fieldName := checksStruct.Field(index).Name
		if !checksClassified[fieldName] {
			t.Errorf("reflection.SchemaChecks field %q is not classified by the C6 canonical projection (canonical.go)", fieldName)
		}
	}
}
