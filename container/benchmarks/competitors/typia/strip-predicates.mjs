// Kept apart from esbuild.config.mjs, which imports the bench-only toolchain at load, so a host test can import it.

// ": input is <TYPE> =>" -> " =>", scanning to the depth-0 "=>" so unions, generics and parenthesized arms go whole.
export function stripReturnPredicates(code) {
  const needle = ': input is ';
  let out = '';
  let cursor = 0;
  while (cursor < code.length) {
    const at = code.indexOf(needle, cursor);
    if (at === -1) {
      out += code.slice(cursor);
      break;
    }
    out += code.slice(cursor, at);
    let scan = at + needle.length;
    let depth = 0;
    let stringDelim = null;
    while (scan < code.length) {
      const ch = code[scan];
      if (stringDelim) {
        if (ch === '\\') {
          scan += 2;
          continue;
        }
        if (ch === stringDelim) stringDelim = null;
        scan++;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        stringDelim = ch;
        scan++;
        continue;
      }
      // A nested function type's `=>` must not read its `>` as a closing bracket.
      if (ch === '=' && code[scan + 1] === '>') {
        if (depth === 0) break;
        scan += 2;
        continue;
      }
      if (ch === '(' || ch === '[' || ch === '{' || ch === '<') {
        depth++;
        scan++;
        continue;
      }
      if (ch === ')' || ch === ']' || ch === '}' || ch === '>') {
        depth--;
        scan++;
        continue;
      }
      scan++;
    }
    out += ' '; // collapse the stripped annotation to one space before "=>"
    cursor = scan;
  }
  return out;
}
