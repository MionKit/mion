import {defineConfig} from 'vite';

// Second build target: the WASM host hook as an IIFE classic script
// (dist/sidecar-hook.js). The website playground stages it next to the
// resolver WASM and loads it with a plain <script> tag (the containerized
// site cannot import workspace packages); the node playground tests run
// it via vm.runInThisContext — both just need "execute this file and the
// __tsRunTypesJsEngine global exists". Runs AFTER the main build, so
// emptyOutDir must stay off here.
export default defineConfig({
  build: {
    lib: {entry: 'src/hook.ts', formats: ['iife'], name: 'tsRunTypesSidecarHook', fileName: () => 'sidecar-hook.js'},
    minify: false,
    target: 'es2020',
    outDir: 'dist',
    emptyOutDir: false,
  },
});
