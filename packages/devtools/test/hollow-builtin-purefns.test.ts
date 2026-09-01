import {describe, it, expect} from 'vitest';
// @ts-expect-error — a plain .mjs build script, no types
import {hollowSource} from '../../../scripts/core/hollow-builtin-purefns.mjs';

// The dist hollow transform strips built-in pure-fn factory BODIES out of the
// published registration files (they ship on demand from the built-in table
// now). These pin the scanner: it must find the matching call `)` past regex,
// template, string, and comment content, hollow only `rt::`/`rtFormats::` keys,
// preserve the file's line count, and handle both the ESM and tsc CJS call
// shapes.

function lineCount(source: string): number {
  return source.split('\n').length;
}

describe('hollowSource', () => {
  it('hollows an ESM built-in registration and preserves line count', () => {
    const src = `export const pf_x = registerPureFnFactory('rt::x', function () {
  const re = /[a-z]\\/[0-9]/;
  return function (s) { return re.test(s) && s !== ')'; };
});
`;
    const {code, count} = hollowSource(src);
    expect(count).toBe(1);
    expect(lineCount(code)).toBe(lineCount(src));
    expect(code).toContain("registerPureFnFactory('rt::x', null /** rt::x hollowed");
    expect(code).not.toContain('re.test'); // body gone
    expect(code.trimEnd().endsWith('*/);')).toBe(true);
  });

  it('hollows the tsc CJS call shape `(0, mod.registerPureFnFactory)(...)`', () => {
    const src = `exports.pf_y = (0, pureFn_ts_1.registerPureFnFactory)('rtFormats::isY', function () {
    return function (v) { return v; };
});
`;
    const {code, count} = hollowSource(src);
    expect(count).toBe(1);
    expect(lineCount(code)).toBe(lineCount(src));
    expect(code).toContain('null /** rtFormats::isY hollowed');
    expect(code).not.toContain('return v;');
  });

  it('leaves USER-namespaced registrations untouched', () => {
    const src = `registerPureFnFactory('myapp::slug', function () { return (s) => s; });
`;
    const {code, count} = hollowSource(src);
    expect(count).toBe(0);
    expect(code).toBe(src);
  });

  it('skips template literals, nested braces, and strings containing parens', () => {
    const src = `registerPureFnFactory('rt::tpl', function () {
  const build = (a, b) => \`\${a}/(\${b})\`;
  const paren = '(' + ')';
  return function (x) { return build(x, paren) + x; };
});
`;
    const {code, count} = hollowSource(src);
    expect(count).toBe(1);
    expect(lineCount(code)).toBe(lineCount(src));
    expect(code).not.toContain('build(x, paren)');
    // The scaffolding after the call must survive intact.
    expect(code).toContain('*/);');
  });

  it('hollows multiple registrations in one file', () => {
    const src = `export const a = registerPureFnFactory('rt::a', function () { return () => 1; });
export const b = registerPureFnFactory('rtFormats::b', function () { return () => 2; });
export const u = registerPureFnFactory('user::c', function () { return () => 3; });
`;
    const {code, count} = hollowSource(src);
    expect(count).toBe(2);
    expect(code).toContain('null /** rt::a hollowed');
    expect(code).toContain('null /** rtFormats::b hollowed');
    expect(code).toContain("registerPureFnFactory('user::c', function () { return () => 3; })"); // user kept
  });

  it('is idempotent — a hollowed file re-runs to a no-op', () => {
    const src = `registerPureFnFactory('rt::x', function () { return () => 1; });
`;
    const once = hollowSource(src).code;
    const twice = hollowSource(once);
    expect(twice.count).toBe(0);
    expect(twice.code).toBe(once);
  });
});
