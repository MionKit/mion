import {defineConfig} from 'vitest/config';

// No mion plugin here: this lane READS what `mion compile` emitted (dist-cli/ + .mion-cli/) and
// boots the emitted server under plain node; loading the plugin would spawn a resolver for nothing.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/tests/compile-output.spec.ts'],
    testTimeout: 120000,
    hookTimeout: 120000,
  },
});
