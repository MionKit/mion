package string

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// nativeUrlEmitter runs the url format's checks over a URL object's href; it lives here for the unexported pattern helpers.
// KindClass because splitBuiltinClassBrand lifts the brand onto the SubKindUrl node, whose class arm emits the instanceof.
type nativeUrlEmitter struct{}

func init() {
	formats.Register(nativeUrlEmitter{})
}

func (nativeUrlEmitter) Name() string                    { return "nativeUrl" }
func (nativeUrlEmitter) Kind() reflection.ReflectionKind { return reflection.KindClass }

func (nativeUrlEmitter) EmitValidateCheck(annotation *reflection.FormatAnnotation, vλl string, ctx formats.EmitContext) string {
	return namedPatternValidate(ctx, annotation, vλl+".href")
}

func (nativeUrlEmitter) EmitValidationErrorsCheck(annotation *reflection.FormatAnnotation, vλl, pathExpr, errorsArr string, ctx formats.EmitContext) string {
	return namedPatternErrorsAs(ctx, annotation, vλl+".href", pathExpr, errorsArr, "URL", "nativeUrl")
}

// ValidateParams: a URL object is never rewritten, so `transform` is refused.
func (nativeUrlEmitter) ValidateParams(annotation *reflection.FormatAnnotation) []string {
	if annotation == nil {
		return nil
	}
	params := annotation.Params
	var errs []string
	if _, present := params["transform"]; present {
		errs = append(errs, "NativeUrl: `transform` is not supported, a URL object is never rewritten")
	}
	maxLen, hasMax := formats.ReadNumberParam(params, "maxLength")
	minLen, hasMin := formats.ReadNumberParam(params, "minLength")
	if hasMax && hasMin && maxLen < minLen {
		errs = append(errs, "NativeUrl: `maxLength` cannot be less than `minLength`")
	}
	return errs
}
