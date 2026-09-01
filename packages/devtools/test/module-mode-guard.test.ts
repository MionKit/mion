// The `moduleMode` option guard; the wiring each mode produces is module-mode.test.ts.
import {describe, expect, it} from 'vitest';
import {MODULE_MODES, assertValidModuleMode} from '../src/core/module-mode.ts';
import {
  MODULE_MODE_ALL_MODULES,
  MODULE_MODE_ALL_SINGLE,
  MODULE_MODE_DEFAULT,
  type ModuleMode,
} from '../src/core/go-generated/runtypes-constants.generated.ts';

describe('@mionjs/devtools / assertValidModuleMode', () => {
  it('accepts every mode the generated constants declare', () => {
    for (const mode of MODULE_MODES) expect(() => assertValidModuleMode(mode)).not.toThrow();
  });

  it('accepts undefined — the option is optional', () => {
    expect(() => assertValidModuleMode(undefined)).not.toThrow();
  });

  it('rejects an unknown mode and names every valid one', () => {
    // Cast: the guard exists for what a JS caller or hand-edited config can still pass.
    const typo = 'allModule' as ModuleMode;
    expect(() => assertValidModuleMode(typo)).toThrow(/unknown moduleMode "allModule"/);
    expect(() => assertValidModuleMode(typo)).toThrow(
      new RegExp(`'${MODULE_MODE_DEFAULT}' \\| '${MODULE_MODE_ALL_SINGLE}' \\| '${MODULE_MODE_ALL_MODULES}'`)
    );
  });

  it('covers the full ModuleMode union — the tuple cannot silently drop an arm', () => {
    const covered = [...MODULE_MODES] satisfies ModuleMode[];
    expect(new Set(covered)).toEqual(new Set([MODULE_MODE_DEFAULT, MODULE_MODE_ALL_SINGLE, MODULE_MODE_ALL_MODULES]));
  });
});
