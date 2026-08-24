// Shared case shape for the AI-enrichment generation suite. Each case's `case()` body is real,
// type-checked TypeScript carrying four marker-delimited spans:
//
//   // ##### src #####       — `type Target = …;`
//   // ##### friendly #####  — `const friendlyTarget: FriendlyText<Target> = …;`
//   // ##### mock #####       — `const mockTarget: MockData<Target> = …;`
//   // ##### result #####     — `return {friendlyTarget, mockTarget};`
//
// The harness extracts the body via `ts-go-runtypes/cmd/extract-fn-bodies`, splits by the
// markers, feeds `src` to the `gen --files` CLI, and compares the generated
// object-literal skeleton against the case-authored `friendly` / `mock`
// initializers (Prettier-normalized). `tsc` proves the expecteds are
// well-formed `FriendlyText<Target>` / `MockData<Target>` for the given type.
export interface EnrichCase {
  title: string;
  description?: string;
  case: () => unknown;
}
