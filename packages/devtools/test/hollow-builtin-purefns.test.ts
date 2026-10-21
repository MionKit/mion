import {describe, it, expect} from 'vitest';
// @ts-expect-error — a plain .mjs build script, no types
import {hollowSource} from '../../../scripts/core/hollow-builtin-purefns.mjs';

// The dist hollow transform strips built-in pure-fn factory BODIES out of the
// published registration files (they ship on demand from the built-in table
// now). These pin the scanner: it must find the matching call `)` past regex,
// template, string, and comment content, replace the WHOLE argument list (the
// id goes with the body), preserve the file's line count, and handle both the
// ESM and tsc CJS call shapes.

const UTILS = '@mionjs/run-types/src/runtypes/pure-fns-utils';
const FORMATS = '@mionjs/run-types/src/formats/string/string-formats-pure-fns';

function lineCount(source: string): number {
  return source.split('\n').length;
}

describe('hollowSource', () => {
  it('hollows an ESM built-in registration and preserves line count', () => {
    const src = `export const x = registerPureFnFactory(function () {
  const re = /[a-z]\\/[0-9]/;
  return function (s) { return re.test(s) && s !== ')'; };
}, '${UTILS}#x');
`;
    const {code, count} = hollowSource(src);
    expect(count).toBe(1);
    expect(lineCount(code)).toBe(lineCount(src));
    expect(code).toContain(`registerPureFnFactory(null /** '${UTILS}#x' hollowed`);
    expect(code).not.toContain('re.test'); // body gone
    expect(code.trimEnd().endsWith('*/);')).toBe(true);
  });

  it('hollows the tsc CJS call shape `(0, mod.registerPureFnFactory)(...)`', () => {
    const src = `exports.isY = (0, pureFn_ts_1.registerPureFnFactory)(function () {
    return function (v) { return v; };
}, '${FORMATS}#isY');
`;
    const {code, count} = hollowSource(src);
    expect(count).toBe(1);
    expect(lineCount(code)).toBe(lineCount(src));
    expect(code).toContain(`null /** '${FORMATS}#isY' hollowed`);
    expect(code).not.toContain('return v;');
  });

  it('leaves a call the build never gave an id alone', () => {
    // These files pass the id explicitly (the generator writes it), so a
    // single-argument call is not one of ours — and an inert registration with
    // no id to key would throw at import.
    const src = `registerPureFnFactory(function () { return (s) => s; });
`;
    const {code, count} = hollowSource(src);
    expect(count).toBe(0);
    expect(code).toBe(src);
  });

  it('skips template literals, nested braces, and strings containing parens', () => {
    const src = `registerPureFnFactory(function () {
  const build = (a, b) => \`\${a}/(\${b})\`;
  const paren = '(' + ')';
  return function (x) { return build(x, paren) + x; };
}, '${UTILS}#tpl');
`;
    const {code, count} = hollowSource(src);
    expect(count).toBe(1);
    expect(lineCount(code)).toBe(lineCount(src));
    expect(code).not.toContain('build(x, paren)');
    // The scaffolding after the call must survive intact.
    expect(code).toContain('*/);');
  });

  it('hollows multiple registrations in one file', () => {
    const src = `export const a = registerPureFnFactory(function () { return () => 1; }, '${UTILS}#a');
export const b = registerPureFnFactory(function () { return () => 2; }, '${FORMATS}#b');
`;
    const {code, count} = hollowSource(src);
    expect(count).toBe(2);
    expect(code).toContain(`null /** '${UTILS}#a' hollowed`);
    expect(code).toContain(`null /** '${FORMATS}#b' hollowed`);
  });

  it('is idempotent — a hollowed file re-runs to a no-op', () => {
    const src = `registerPureFnFactory(function () { return () => 1; }, '${UTILS}#x');
`;
    const once = hollowSource(src).code;
    const twice = hollowSource(once);
    expect(twice.count).toBe(0);
    expect(twice.code).toBe(once);
  });
});
