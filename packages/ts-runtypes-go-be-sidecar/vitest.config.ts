import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    name: '@ts-runtypes/go-be-sidecar',
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
