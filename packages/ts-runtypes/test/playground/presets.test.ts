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
      expect(preset.schema).toContain('MyType');
      expect(preset.input.trim().length).toBeGreaterThan(0);
    }
  });
});
