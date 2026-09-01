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

// EmitFormatTransform lowercases the URL (ref: url.runtype.ts:141 — URLs
// are canonicalised to lower case by the format pass).
func (urlEmitter) EmitFormatTransform(_ *reflection.FormatAnnotation, vλl string, _ formats.EmitContext) string {
	return vλl + ".toLowerCase()"
}
