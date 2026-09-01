package string

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// urlEmitter implements the format named "url" — FormatUrl /
// FormatUrlHttp / FormatUrlFile. Pure pattern format; see domain.go.
type urlEmitter struct{}

func init() {
	formats.Register(urlEmitter{})
}

func (urlEmitter) Name() string                    { return "url" }
func (urlEmitter) Kind() reflection.ReflectionKind { return reflection.KindString }

func (urlEmitter) EmitValidateCheck(annotation *reflection.FormatAnnotation, vλl string, ctx formats.EmitContext) string {
	return namedPatternValidate(ctx, annotation, vλl)
}

func (urlEmitter) EmitValidationErrorsCheck(annotation *reflection.FormatAnnotation, vλl, pathExpr, errorsArr string, ctx formats.EmitContext) string {
	return namedPatternErrors(ctx, annotation, vλl, pathExpr, errorsArr, "url")
}

// EmitFormatTransform applies the rewrite declared under `transform`, and
// nothing otherwise: a URL path is case-sensitive, so a blanket lowercase is
// the field's decision, not the format's.
func (urlEmitter) EmitFormatTransform(annotation *reflection.FormatAnnotation, vλl string, _ formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	return formats.EmitStringTransform(annotation.Params, vλl)
}

// ValidateParams: the only cross-param rule a URL carries is the shape of its
// `transform` block.
func (urlEmitter) ValidateParams(annotation *reflection.FormatAnnotation) []string {
	if annotation == nil {
		return nil
	}
	return formats.ValidateTransformParams(annotation.Params, "FormatUrl")
}
