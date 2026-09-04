// Negative controls for the generated-code oracles: every check fires on a
// deliberately broken body and stays quiet on a sound one, so a green corpus
// scan means the checks looked, not that they were blind.

import {describe, expect, it} from 'vitest';
import {checkGeneratedCode, stripLiterals, INJECT_MARKER, type EmittedBody} from './generatedCodeOracle.ts';

const body = (code: string, family = 'val'): EmittedBody => ({key: 'k', family, code});
const oracles = (code: string, family?: string): string[] => checkGeneratedCode(body(code, family)).map((v) => v.oracle);

describe('generated-code oracles fire on broken bodies (negative controls)', () => {
  it('GC-PARSE fires on text that is not a program, and stops there', () => {
    expect(oracles("function f(v){return v['unterminated}")).toEqual(['GC-PARSE']);
  });

  it('GC-TEXT fires on a raw control byte or line terminator', () => {
    expect(oracles("function f(v){return v['a\u0000b']}")).toEqual(['GC-TEXT']);
    expect(oracles("function f(v){return v['a\u2028b']}")).toEqual(['GC-TEXT']);
    expect(oracles('function f(v){\n\treturn v}')).toEqual([]);
  });

  it('GC-INJECT fires when the marker escapes its quotes, not when it sits inside them', () => {
    expect(oracles(`function f(v){return v['x']; ${INJECT_MARKER}(); return 1}`)).toEqual(['GC-INJECT']);
    expect(oracles(`function f(v){return v['${INJECT_MARKER}'] === "${INJECT_MARKER}"}`)).toEqual([]);
    expect(oracles(`function f(v){return /${INJECT_MARKER}/.test(v)}`)).toEqual([]);
    expect(oracles(`const re = new RegExp("${INJECT_MARKER}"); function f(v){return re.test(v)}`)).toEqual([]);
  });

  it('GC-REBUILD fires on an unguarded key-writing loop and on Object.assign', () => {
    expect(oracles('function f(v){const _r = {};for (const k0 in v) {_r[k0] = v[k0];}return _r}')).toEqual(['GC-REBUILD']);
    expect(
      oracles(
        "function f(v){const _r = {};for (const k0 in v) {if (k0 === '__proto__' || k0 === 'prototype' || k0 === 'constructor') continue;_r[k0] = v[k0];}return _r}"
      )
    ).toEqual([]);
    expect(oracles('function f(v){return Object.assign({}, v)}')).toEqual(['GC-REBUILD']);
    // A read-only loop rebuilds nothing, and a write back onto the walked
    // object only ever hits an own key.
    expect(oracles('function f(v){for (const k0 in v) {if (!v[k0]) return false;}return true}')).toEqual([]);
    expect(oracles('function f(v){for (const k0 in v) {v[k0] = undefined;}return v}')).toEqual([]);
  });

  it('GC-COUNT fires on a raw length allocation or loop in a binary decoder', () => {
    expect(oracles('function f(v, Des){const n = Des.desLength();v = new Array(n);return v}', 'fb')).toEqual([
      'GC-COUNT',
      'GC-COUNT',
    ]);
    expect(
      oracles(
        'function f(v, Des){const n = Des.desCount(1);v = new Array(n);for (let i = 0; i < n; i++) {v[i] = Des.desString()}return v}',
        'fb'
      )
    ).toEqual([]);
    expect(
      oracles(
        'function f(v, Des){const n = Des.view.getUint32(Des.index, 1);for (let i = 0; i < n; i++) {v[i] = 1}return v}',
        'fb'
      )
    ).toEqual(['GC-COUNT']);
    // The same text is not a binary decoder's problem in another family.
    expect(oracles('function f(v){const n = v.length;v = new Array(n);return v}', 'ces')).toEqual([]);
  });

  it('GC-REGEXP fires when a RegExp is built from anything but a double-quoted literal', () => {
    expect(oracles("function f(v){return new RegExp(v.source, 'g')}")).toEqual(['GC-REGEXP']);
    expect(oracles('const re = new RegExp("^a$"); function f(v){return re.test(v)}')).toEqual([]);
  });

  it('GC-GUARD fires on a JSON decoder that converts a wire value without checking its shape', () => {
    expect(oracles('function f(v){v = new Date(v);return v}', 'rj')).toEqual(['GC-GUARD']);
    expect(oracles("function f(v){v = typeof v === 'string' ? new Date(v) : v;return v}", 'rj')).toEqual([]);
    expect(oracles('function f(v){v = BigInt(v);return v}', 'cjr')).toEqual(['GC-GUARD']);
    expect(oracles('function f(v){if (reBigWire.test(v)) v = BigInt(v);return v}', 'cjr')).toEqual([]);
    expect(oracles('function f(v){v = new Set(v);return v}', 'jdST')).toEqual(['GC-GUARD']);
    expect(oracles('function f(v){v = Array.isArray(v) ? new Set(v) : v;return v}', 'jdST')).toEqual([]);
    expect(oracles('function f(v){const dec0 = v[0]; v = v[1];return v}', 'jdPR')).toEqual(['GC-GUARD']);
    expect(
      oracles('function f(v){if (Array.isArray(v) && v.length === 2) {const dec0 = v[0]; v = v[1];}return v}', 'jdPR')
    ).toEqual([]);
    // a tuple member read is not an unwrap
    expect(oracles('function f(v){const v1 = v[1]; v[1] = v1;return v}', 'jdPR')).toEqual([]);
    // the guard has to be on the SAME variable
    expect(
      oracles("function f(v){const v0 = v.a; v0 = typeof v === 'string' ? 1 : 2; v.a = new Date(v0);return v}", 'rj')
    ).toEqual(['GC-GUARD']);
    // the same text is not a JSON decoder's problem in another family
    expect(oracles('function f(v){v = new Date(v);return v}', 'ces')).toEqual([]);
  });

  it('GC-ACCESS fires when a property access spells a quote or a digit after the dot', () => {
    expect(oracles('function f(v){return v.9lead}')).toEqual(['GC-PARSE']);
    expect(oracles("function f(v){return v['9lead'] && v.ok}")).toEqual([]);
  });

  it('stripLiterals blanks strings, templates and regex literals but keeps the program text', () => {
    const stripped = stripLiterals("const a = 'x\\'y'; const b = \"q\"; const c = /a\\/b[/]c/gi.test(d); e = f / g;");
    expect(stripped).toContain('const a = \'    \'; const b = " "; const c = /        /gi.test(d); e = f / g;');
  });
});
