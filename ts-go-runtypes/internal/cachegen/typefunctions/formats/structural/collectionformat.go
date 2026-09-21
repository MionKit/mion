package structural

// formattedSet / formattedMap, the builtin collection classes on the COLLECTION keywords. A Set is an array on
// the wire and a Map an array of `[key, value]` pairs, so both count off `.size` and both take `uniqueItems`
// through their OWN pure fn: a Set compares its members, a Map the `[key, value]` PAIRS, since two object keys
// equal by content are two entries and so a duplicate pair only when their values match too.
// `contains` is NOT an emitter concern: it rides the node's Contains checks, spliced by the validate / errors
// walkers for every base kind.
// Both bases are KindClass nodes, so the two emitters register under KindClass with their own names and the
// registry's (kind, name) key keeps them apart.

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnids"
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
	// uniquePureFn is the family's own `uniqueItems` predicate, rather than one shared behind a runtime kind test.
	uniquePureFn string
}

func init() {
	formats.Register(collectionEmitter{
		name: formattedSetName, expected: "set", publicName: "FormattedSet", uniquePureFn: purefnids.UniqueSetMembers})
	formats.Register(collectionEmitter{
		name: formattedMapName, expected: "map", publicName: "FormattedMap", uniquePureFn: purefnids.UniqueMapEntries})
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
		conditions = append(conditions, uniqueItemsCheck(ctx, vλl, emitter.uniquePureFn))
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
			"if (!("+uniqueItemsCheck(ctx, vλl, emitter.uniquePureFn)+")) "+formats.FormatErrCall(pathExpr, errorsArr, emitter.expected, emitter.name, "uniqueItems", "true"))
	}
	return strings.Join(statements, ";")
}

// ValidateParams reports bound contradictions at build time, like the array family does for its item bounds.
func (emitter collectionEmitter) ValidateParams(annotation *reflection.FormatAnnotation) []string {
	if annotation == nil {
		return nil
	}
	return boundsContradiction(annotation.Params, emitter.publicName)
}
