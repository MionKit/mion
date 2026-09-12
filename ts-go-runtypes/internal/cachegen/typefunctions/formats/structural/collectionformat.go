// formattedSet / formattedMap — the builtin collection classes on the
// COLLECTION keywords. A Set is an array on the wire and a Map is an array of
// `[key, value]` pairs, so both count with `minItems` / `maxItems` (read off
// `.size`) and both take `uniqueItems`, through the same `rt::uniqueItems` pure
// fn the array family calls: it iterates with `for…of`, so a Set needs no
// adapter, and a Map's own arm there compares the `[key, value]` PAIRS (two
// object keys equal by content are two entries, hence a duplicate pair when
// their values match too). `contains` is NOT an emitter concern: it rides the
// node's Contains checks and is spliced by the validate / errors walkers for
// every base kind.
//
// Both bases are KindClass nodes (SubKindSet / SubKindMap), so the two
// emitters register under KindClass with their own names; the registry keys
// by (kind, name), which keeps them apart. The brand rides the same
// StructuralBrand sentinels as formattedArray, lifted onto the class node by
// the builtin-class branch of the intersection collapse.
package structural

import (
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

const (
	formattedSetName = "formattedSet"
	formattedMapName = "formattedMap"
)

// collectionEmitter implements one collection family.
type collectionEmitter struct {
	name string
	// expected is the kind word the error entry reports (`set` / `map`).
	expected string
	// publicName is the type-first wrapper a build diagnostic names.
	publicName string
}

func init() {
	formats.Register(collectionEmitter{name: formattedSetName, expected: "set", publicName: "FormattedSet"})
	formats.Register(collectionEmitter{name: formattedMapName, expected: "map", publicName: "FormattedMap"})
}

func (emitter collectionEmitter) Name() string {
	return emitter.name
}

func (collectionEmitter) Kind() reflection.ReflectionKind {
	return reflection.KindClass
}

func (emitter collectionEmitter) EmitValidateCheck(annotation *reflection.FormatAnnotation, vλl string, ctx formats.EmitContext) string {
	if annotation == nil || len(annotation.Params) == 0 {
		return ""
	}
	conditions := lengthConditions(annotation.Params, vλl+".size")
	if unique, _ := formats.ReadBoolParam(annotation.Params, "uniqueItems"); unique {
		conditions = append(conditions, uniqueItemsCheck(ctx, vλl))
	}
	return strings.Join(conditions, " && ")
}

func (emitter collectionEmitter) EmitValidationErrorsCheck(annotation *reflection.FormatAnnotation, vλl, pathExpr, errorsArr string, ctx formats.EmitContext) string {
	if annotation == nil || len(annotation.Params) == 0 {
		return ""
	}
	statements := lengthErrorStatements(annotation.Params, vλl+".size", pathExpr, errorsArr, emitter.expected, emitter.name)
	if unique, _ := formats.ReadBoolParam(annotation.Params, "uniqueItems"); unique {
		statements = append(statements,
			"if (!("+uniqueItemsCheck(ctx, vλl)+")) "+formats.FormatErrCall(pathExpr, errorsArr, emitter.expected, emitter.name, "uniqueItems", "true"))
	}
	return strings.Join(statements, ";")
}

// ValidateParams surfaces bound contradictions at build time, like the array
// family does for its item bounds.
func (emitter collectionEmitter) ValidateParams(annotation *reflection.FormatAnnotation) []string {
	if annotation == nil {
		return nil
	}
	return boundsContradiction(annotation.Params, emitter.publicName)
}
