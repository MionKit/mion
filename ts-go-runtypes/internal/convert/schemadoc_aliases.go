package convert

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
	"github.com/mionkit/mion/ts-go-runtypes/internal/schemadoc"
)

// Thin aliases over the shared schema vocabulary (internal/schemadoc): the
// format-family roster and the pure keyword-rendering helpers moved there so
// the runtime document renderer (the `jsc` cache family) and the type/builders
// printers read ONE vocabulary and can never drift. Call sites keep their
// historical names; the schemadoc names are the canonical ones.

type formatFamily = schemadoc.FormatFamily

var formatFamilies = schemadoc.FormatFamilies

func leafFormat(annotation *reflection.FormatAnnotation) (formatFamily, map[string]any, bool) {
	return schemadoc.LeafFormat(annotation)
}

func structuralAnnotationParams(node *reflection.RunType) map[string]any {
	return schemadoc.StructuralAnnotationParams(node)
}

func hasStructuralPayload(node *reflection.RunType) bool { return schemadoc.HasStructuralPayload(node) }

func isStructuralAnnotation(annotation *reflection.FormatAnnotation) bool {
	return schemadoc.IsStructuralAnnotation(annotation)
}

func printFormatParams(params map[string]any, bigintValues bool) (string, bool) {
	return schemadoc.PrintFormatParams(params, bigintValues)
}

func paramValueText(value any, bigintValues bool) (string, bool) {
	return schemadoc.ParamValueText(value, bigintValues)
}

func sortArms(arms []string) []string { return schemadoc.SortArms(arms) }

func spanKind(raw any) (reflection.ReflectionKind, bool) { return schemadoc.SpanKind(raw) }

func isRegExpNode(node *reflection.RunType) bool { return schemadoc.IsRegExpNode(node) }

func literalValueText(node *reflection.RunType) (string, bool) {
	return schemadoc.LiteralValueText(node)
}

func formatNumberLiteral(value float64) (string, bool) { return schemadoc.FormatNumberLiteral(value) }

func isBigIntLiteral(node *reflection.RunType) bool { return schemadoc.IsBigIntLiteral(node) }

func quoteSingle(value string) string { return schemadoc.QuoteSingle(value) }

func kindLabel(kind reflection.ReflectionKind) string { return schemadoc.KindLabel(kind) }
