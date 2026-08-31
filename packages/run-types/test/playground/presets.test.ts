import {describe, expect, it} from 'vitest';
import {PRESETS} from '../../../../container/website/app/playground/presets.ts';

// Tripwire for the presets data module: container/ sits outside the lint/typecheck
// scope and no other test imports PRESETS, so without this import a syntax break
// there passes every gate and only surfaces in the site's dev server.
describe('playground presets', () => {
  it('module loads and every preset carries name, both authoring forms, and an input', () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(6);
    const names = PRESETS.map((preset) => preset.name);
    expect(new Set(names).size).toBe(names.length);
    for (const preset of PRESETS) {
      expect(preset.name).toBeTruthy();
      expect(preset.ts).toContain('MyType');
      expect(preset.builder).toContain('MyType');
      expect(preset.builder).toContain("from '@mionjs/run-types/builders'");
      expect(preset.input.trim().length).toBeGreaterThan(0);
    }
  });

  // Both authoring forms must end at the SAME handle, the plain type `MyType`,
  // because the engine calls `createX<MyType>()` for both. In the builder form
  // that means the schema const carries its own name (whatever it models) and
  // MyType is recovered from it, which also leaves the const unused so the build
  // emits no runtype cache.
  it('every builder preset names its schema const and recovers MyType from it', () => {
    for (const preset of PRESETS) {
      const schema = /^const (\w+) = RT\./m.exec(preset.builder);
      expect(schema, `${preset.name}: expected a named schema const`).toBeTruthy();
      expect(preset.builder, preset.name).toContain(`type MyType = InferType<typeof ${schema![1]}>;`);
      // No leftover `const MyType = ...` schema: that would shadow the type.
      expect(preset.builder, preset.name).not.toContain('const MyType');
    }
  });
});
