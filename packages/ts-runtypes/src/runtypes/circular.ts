// Circular-reference support for the live-object families (validate /
// getValidationErrors / jsonEncode / binaryEncode). The guard itself is a
// COMPILE-TIME option (`{rejectCircularRefs: true}`) baked into the armed
// factory body by the Go emitter, which walks a value against a small path
// skeleton via the `rt::findCycle` pure fn (see circular-pure-fns.ts) and
// applies the family's reaction. This module keeps only the small, always-static
// pieces the armed bodies and their callers need: the error class the encoders
// throw, the path formatter, and the CircularPath type.

/** Path to a detected cycle — object keys and array/tuple indices, plus
 *  `mapKey[i]`/`mapValue[i]` labels for keyed collections. **/
export type CircularPath = (string | number)[];

/** Thrown by the encoder families (`jsonEncode` / `binaryEncode`) when the
 *  input value contains a reference cycle and the guard is armed. `validate`
 *  returns `false` and `getValidationErrors` pushes a `{expected: 'circular'}`
 *  entry instead — the reaction is baked into each armed factory body. **/
export class CircularReferenceError extends Error {
  readonly path: CircularPath;
  constructor(path: CircularPath) {
    super(`Circular reference detected at ${formatCircularPath(path)}`);
    this.name = 'CircularReferenceError';
    this.path = path;
  }
}

/** Renders a CircularPath to a dotted/bracketed string for error messages. **/
export function formatCircularPath(path: CircularPath): string {
  if (path.length === 0) return '<root>';
  let out = '';
  for (const segment of path) {
    if (typeof segment === 'number') out += `[${segment}]`;
    else out += out ? `.${segment}` : segment;
  }
  return out;
}
