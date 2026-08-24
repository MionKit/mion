import {defineConfig} from 'vitest/config';

// No mion plugin here: this lane only READS dist/server.js as text, and loading the
// plugin would spawn a second resolver for nothing.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/tests/build-output.spec.ts'],
    testTimeout: 60000,
  },
});
