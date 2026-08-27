import {defineConfig} from 'vitest/config';

// No runtypes plugin: the recorder core's own specs are plain runtime tests
// with a FAKE drizzle namespace (the whole point is that this package works
// with drizzle-orm absent). Marker-API coverage lives in the dialect packages.
export default defineConfig({
  resolve: {conditions: ['source']},
  ssr: {resolve: {conditions: ['source']}},
  test: {
    name: 'drizzle-root',
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**'],
    },
  },
});
