import {defineConfig} from 'vite';
import runtypes from '@ts-runtypes/devtools/vite';

// The plugin works with no options: the resolver binary for your platform is
// installed and resolved automatically. Everything below is optional.
export default defineConfig({
  plugins: [
    runtypes({
      // Optional: where your tsconfig lives. Defaults to 'tsconfig.json'.
      tsconfig: 'tsconfig.json',
      // Optional: point at a custom or local binary build to override
      // auto-resolution.
      // binary: './bin/ts-runtypes',
    }),
  ],
});
