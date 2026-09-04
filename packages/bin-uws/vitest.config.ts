import {defineConfig} from 'vitest/config';

// Plain-JS loader package: no runtypes transform, no mion vite plugin — the
// specs only exercise binary path resolution and the native module load.
export default defineConfig({
  test: {
    name: 'bin-uws',
    globals: true,
    environment: 'node',
    include: ['test/**/*.spec.ts'],
  },
});
