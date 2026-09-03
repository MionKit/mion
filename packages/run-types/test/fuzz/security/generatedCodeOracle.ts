// The generated-code audit, as oracles: every compiled function body the
// emitters produce is JavaScript text materialized with `new Function`, so the
// hole can sit in the template rather than in any hand-written file. Each
// check below is a pure predicate over one emitted body, so the unit lane can
// prove every one FIRES on deliberately broken output, and both drivers (the
// hand-written nasty corpus in test/features, the generated types in the
// secgen lane) run the same list.
//
//   GC-PARSE    the body compiles as strict-mode JavaScript.
//   GC-TEXT     the body carries no raw control byte or Unicode line
//               terminator (a name or literal never ends a line inside its
//               own string literal; the one quoting helper escapes them).
//   GC-INJECT   a corpus marker planted inside a property name, a literal, an
//               enum member or a key pattern never appears OUTSIDE a string or
//               regex literal: type-derived text stays quoted.
//   GC-REBUILD  every loop that writes wire keys onto a fresh object carries
//               the prototype-name guard, and nothing calls Object.assign.
//   GC-COUNT    a binary decoder never allocates or loops on a raw length:
//               every `new Array(n)` and every counted loop reads its bound
//               through desCount / desCountU32, and desLength is never called
//               bare.
//   GC-REGEXP   every `new RegExp(` in emitted code takes a build-time
//               double-quoted literal; nothing builds a RegExp from a wire
//               value.
//   GC-ACCESS   a property access never spells an unsafe name bare: after a
//               `.` comes an identifier, never a quote or a digit.
//
// Erasable TypeScript only: the secgen lane's runner imports this file
// alongside the other security oracles.

export type GeneratedCodeOracleId = 'GC-PARSE' | 'GC-TEXT' | 'GC-INJECT' | 'GC-REBUILD' | 'GC-COUNT' | 'GC-REGEXP' | 'GC-ACCESS';

export interface EmittedBody {
  /** The cache key (`<fnHash>_<typeId>`) or the entry-module basename. **/
  key: string;
  /** The family tag the entry was emitted for (`val`, `fb`, `jdST`, …). **/
  family: string;
  code: string;
}

export interface GeneratedCodeViolation {
  oracle: GeneratedCodeOracleId;
  key: string;
  family: string;
  message: string;
}

/** The marker the nasty corpus plants inside names and literals. Seeing it in
 *  the code outside a string or regex literal means type-derived text broke
 *  out of its quotes. **/
export const INJECT_MARKER = 'rt_injected_marker';

const UNSAFE_KEYS = ['__proto__', 'prototype', 'constructor'];

export function checkGeneratedCode(body: EmittedBody, markers: readonly string[] = [INJECT_MARKER]): GeneratedCodeViolation[] {
  const out: GeneratedCodeViolation[] = [];
  const push = (oracle: GeneratedCodeOracleId, message: string): void => {
    out.push({oracle, key: body.key, family: body.family, message});
  };
  const {code} = body;

  // GC-PARSE
  try {
    // oxlint-disable-next-line typescript/no-implied-eval
    new Function('utl', `'use strict'; ${code}`);
  } catch (err) {
    push('GC-PARSE', `body does not compile: ${err instanceof Error ? err.message : String(err)}`);
    return out; // nothing else is meaningful on text that is not a program
  }

  // GC-TEXT
  for (let i = 0; i < code.length; i++) {
    const c = code.charCodeAt(i);
    if ((c < 0x20 && c !== 0x0a && c !== 0x0d && c !== 0x09) || c === 0x7f || c === 0x2028 || c === 0x2029) {
      push('GC-TEXT', `raw U+${c.toString(16).padStart(4, '0')} at offset ${i}`);
      break;
    }
  }

  // GC-INJECT
  const residue = stripLiterals(code);
  for (const marker of markers) {
    if (residue.includes(marker)) {
      push('GC-INJECT', `the marker '${marker}' appears outside a string or regex literal`);
      break;
    }
  }

  // GC-REBUILD
  if (/\bObject\.assign\(/.test(code))
    push('GC-REBUILD', 'Object.assign copies inherited-setter keys; use a guarded own-key loop');
  for (const match of code.matchAll(/for \(const (\w+) in (\w+)\) \{/g)) {
    const [, keyVar, source] = match;
    const bodyStart = match.index! + match[0].length;
    const loopBody = code.slice(bodyStart, bodyStart + 4000);
    // A write back onto the object being walked is safe: `for…in` only yields
    // an own `__proto__` key (Object.prototype's is not enumerable), and
    // assigning an own key never reaches the setter. A write onto any OTHER
    // object (a fresh `{}`, a clone) does, so that loop must carry the guard.
    const targets = new Set<string>();
    for (const write of loopBody.matchAll(new RegExp(`\\b(\\w+)\\[${keyVar}\\] =`, 'g'))) {
      if (write[1] !== source) targets.add(write[1]);
    }
    if (targets.size === 0) continue;
    const guarded = UNSAFE_KEYS.every((name) => loopBody.includes(`${keyVar} === '${name}'`));
    if (!guarded)
      push(
        'GC-REBUILD',
        `the loop over '${keyVar}' writes wire keys onto ${[...targets].join(', ')} without the prototype-name guard`
      );
  }

  // GC-COUNT (binary decoders only)
  if (body.family === 'fb') {
    if (code.includes('.desLength()')) push('GC-COUNT', 'desLength() read bare: a count must go through desCount / desCountU32');
    for (const match of code.matchAll(/new Array\((\w+)\)/g)) {
      const lenVar = match[1];
      if (!new RegExp(`const ${lenVar} = \\w+\\.desCount\\(`).test(code)) {
        push('GC-COUNT', `new Array(${lenVar}) is not bounded by desCount`);
      }
    }
    for (const match of code.matchAll(/for \(let (\w+) = [^;]+; \1 < ([^;]+);/g)) {
      const bound = match[2].trim();
      if (/^\w+\.length$/.test(bound) || /^\d+$/.test(bound)) continue;
      const boundVar = bound.replace(/^\w+ \+ /, '');
      if (!/^\w+$/.test(boundVar)) continue;
      if (!new RegExp(`const ${boundVar} = \\w+\\.desCount(U32)?\\(`).test(code)) {
        push('GC-COUNT', `the loop bound '${bound}' is not read through desCount / desCountU32`);
      }
    }
  }

  // GC-REGEXP
  for (const match of code.matchAll(/new RegExp\(/g)) {
    const next = code.charAt(match.index! + match[0].length);
    if (next !== '"') push('GC-REGEXP', `new RegExp( takes a non-literal argument at offset ${match.index}`);
  }

  // GC-ACCESS
  const access = /[\w$)\]]\.['"\d]/.exec(residue);
  if (access) push('GC-ACCESS', `a property access spells a non-identifier name at offset ${access.index}`);

  return out;
}

/** Replace the contents of every string, template and regex literal with
 *  spaces, keeping offsets stable, so a scan sees only the program text. The
 *  regex heuristic (a `/` after an operator, a bracket or a keyword opens a
 *  literal) matches what the emitters produce. **/
export function stripLiterals(code: string): string {
  const out = code.split('');
  let i = 0;
  const blank = (from: number, to: number): void => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  // What precedes a `/` decides whether it opens a regex literal: an
  // operator, an opening bracket, a separator, or one of the keywords a
  // literal can follow (the emitters write `return /re/.test(v)`).
  const REGEX_AFTER_KEYWORD = new Set(['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'instanceof']);
  const opensRegex = (pos: number): boolean => {
    let k = pos - 1;
    while (k >= 0 && (code[k] === ' ' || code[k] === '\n' || code[k] === '\t' || code[k] === '\r')) k--;
    if (k < 0) return true;
    const ch = code[k];
    if (/[(,=:[!&|?{};+\-*%<>~^]/.test(ch)) return true;
    if (/[\w$]/.test(ch)) {
      let start = k;
      while (start >= 0 && /[\w$]/.test(code[start])) start--;
      return REGEX_AFTER_KEYWORD.has(code.slice(start + 1, k + 1));
    }
    return false;
  };
  while (i < code.length) {
    const ch = code[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      const start = i;
      i++;
      while (i < code.length && code[i] !== ch) {
        if (code[i] === '\\') i++;
        i++;
      }
      blank(start + 1, i);
      i++;
      continue;
    }
    if (ch === '/' && code[i + 1] !== '/' && code[i + 1] !== '*' && opensRegex(i)) {
      const start = i;
      i++;
      let inClass = false;
      while (i < code.length) {
        const c = code[i];
        if (c === '\\') {
          i += 2;
          continue;
        }
        if (c === '[') inClass = true;
        else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) break;
        else if (c === '\n') break;
        i++;
      }
      blank(start + 1, i);
      i++;
      while (i < code.length && /[a-z]/.test(code[i])) i++; // flags
      continue;
    }
    i++;
  }
  return out.join('');
}

export function renderGeneratedCodeViolations(violations: GeneratedCodeViolation[]): string {
  return violations.map((v) => `[${v.oracle}] ${v.key} (${v.family}): ${v.message}`).join('\n');
}
