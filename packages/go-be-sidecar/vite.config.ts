import {defineConfig} from 'vite';

// Library build producing the ONE self-contained ESM file that
// scripts/core/gen-sidecar-js.mjs copies (with a generated header) to
// ts-go-runtypes/internal/jsengine/sidecar.bundle.mjs for go:embed.
// Unminified on purpose: the committed bundle must diff readably and the
// codegen drift gate must stay deterministic.
export default defineConfig({
  build: {
    lib: {entry: 'src/index.ts', formats: ['es'], fileName: () => 'sidecar.mjs'},
    minify: false,
    target: 'node18',
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {external: [/^node:/]},
  },
});
