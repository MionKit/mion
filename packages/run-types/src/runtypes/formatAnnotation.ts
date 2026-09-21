// JS-side mirror of the wire FormatAnnotation the Go binary emits (see internal/reflection/runtype.go).
// Generic over the params shape so concrete format types can type their access narrowly.
export interface FormatAnnotation<Params extends object = Record<string, unknown>> {
  name: string;
  params?: Params;
}
