package datetime

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// nativeDateEmitter implements the format named "nativeDate" —
// FormatDate<P>, which brands the native JS `Date` object (not a string).
// It reuses the shared bounds logic: min/max are an absolute literal OR a
// relative now±P spec, with both date AND time duration components allowed
// (a Date carries both). Validation is added on top of the base-kind Date
// check (instanceof + non-NaN); no serialisation work — Date serialises
// through the existing default serialisers.
//
// Kind is KindClass: the scanner lifts the format brand off the
// `Date & {brand}` intersection (see splitBuiltinClassBrand in
// internal/cachegen/runtype/intersection_collapse.go) onto a KindClass /
// SubKindDate node, and the host istype/typeerrors class arm dispatches
// here via formats.LookupForRunType keyed on (KindClass, "nativeDate").
type nativeDateEmitter struct{}

func init() {
	formats.Register(nativeDateEmitter{})
}

func (nativeDateEmitter) Name() string                    { return "nativeDate" }
func (nativeDateEmitter) Kind() reflection.ReflectionKind { return reflection.KindClass }

// ValidateParams validates the optional min/max bounds with dateTimeKind
// (both component groups allowed). The layout key is "T" — only used by
// the best-effort static ordering parse for absolute dateTime literals.
func (nativeDateEmitter) ValidateParams(annotation *reflection.FormatAnnotation) []string {
	if annotation == nil {
		return nil
	}
	return validateMinMax(annotation.Params, dateTimeKind, "T")
}

// EmitValidateCheck returns the bound comparison expression. The base-kind
// Date check (instanceof Date && !isNaN(getTime())) is emitted by the host
// class arm; this only adds the min/max guard. The value's comparison key
// is the Date's epoch ms directly (no string parsing), compared against a
// baked absolute epoch or pf_relativeNowKey for a relative bound.
func (nativeDateEmitter) EmitValidateCheck(annotation *reflection.FormatAnnotation, vλl string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	return nativeDateBoundChecks(ctx, annotation.Params, vλl)
}

func (nativeDateEmitter) EmitValidationErrorsCheck(annotation *reflection.FormatAnnotation, vλl, pathExpr, errorsArr string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	// The value key is the Date's epoch ms directly (no string parsing);
	// the shared key-based helper emits one error per failed bound.
	return boundTypeErrorChecksFromKey(ctx, annotation.Params, vλl+".getTime()", pathExpr, errorsArr, "Date", "nativeDate", dateTimeKind, "T")
}

// nativeDateBoundChecks builds the AND-able min/max/gt/lt expression over a
// Date value's getTime(). Returns "" when no bound is set.
func nativeDateBoundChecks(ctx formats.EmitContext, params map[string]any, vλl string) string {
	return boundValidateChecksFromKey(ctx, params, vλl+".getTime()", dateTimeKind, "T")
}
