package convert

import (
	"github.com/mionkit/ts-runtypes/internal/reflection"
	"github.com/mionkit/ts-runtypes/internal/schemadoc"
)

// Thin aliases over the shared schema vocabulary (internal/schemadoc): the
// format-family roster and the pure keyword-rendering helpers moved there so
// the runtime document renderer (the `jsc` cache family) and this printer read
// ONE vocabulary and can never drift. Call sites keep their historical names;
// the schemadoc names are the canonical ones.

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

func defaultedStructuralParams(params map[string]any) map[string]any {
	return schemadoc.DefaultedStructuralParams(params)
}

func rtFormatParamsSuffix(params map[string]any) string {
	return schemadoc.RTFormatParamsSuffix(params)
}

func printBigintParamsAsDigits(params map[string]any) (string, bool) {
	return schemadoc.PrintBigintParamsAsDigits(params)
}

func formatWireParts(family formatFamily, annotation *reflection.FormatAnnotation) string {
	return schemadoc.FormatWireParts(family, annotation)
}

func standardParamKeywords(params map[string]any, family formatFamily) string {
	return schemadoc.StandardParamKeywords(params, family)
}

func standardFormatName(name string) string { return schemadoc.StandardFormatName(name) }

func wireKeyPattern(key *reflection.RunType) string { return schemadoc.WireKeyPattern(key) }

func templateWirePattern(texts []string) string { return schemadoc.TemplateWirePattern(texts) }

func templateParts(node *reflection.RunType) ([]string, []map[string]any, bool) {
	return schemadoc.TemplateParts(node)
}

func templateSpanSchemaText(span map[string]any) (string, bool) {
	return schemadoc.TemplateSpanSchemaText(span)
}
