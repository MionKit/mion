// FormatAnnotation is the JS-side mirror of the wire FormatAnnotation
// emitted by the Go binary (see internal/reflection/runtype.go). Carries
// the format name + the literal params payload. Generic over the params
// shape so concrete format types can type their access narrowly.
export interface FormatAnnotation<Params extends object = Record<string, unknown>> {
  name: string;
  params?: Params;
}
