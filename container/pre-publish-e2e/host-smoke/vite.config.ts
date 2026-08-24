import {defineConfig} from 'vitest/config';
import runtypes from '@ts-runtypes/devtools/vite';

// No `binary` option in the published path: the plugin auto-resolves the
// host-platform binary from the installed @ts-runtypes/binary-<os>-<arch> optional
// dependency (via @ts-runtypes/bin's getExePath). That per-OS resolution + spawn
// is exactly what this fixture exists to prove. RT_E2E_BINARY overrides it for
// local dev against an in-repo build.
export default defineConfig({
  plugins: [runtypes({tsconfig: 'tsconfig.json', ...(process.env.RT_E2E_BINARY ? {binary: process.env.RT_E2E_BINARY} : {})})],
  test: {include: ['test/**/*.test.ts']},
});
