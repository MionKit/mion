// Code-point counting shared by the mock: lengths count code points, as JSON Schema bounds and the emitted
// validator do, so an astral character is one character, never two.

/** Code points, the unit JSON Schema length bounds and the emitted validator count in. **/
export function codePointLength(value: string): number {
  let count = 0;
  for (const _char of value) count++;
  return count;
}
