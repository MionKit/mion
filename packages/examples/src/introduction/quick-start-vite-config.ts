import {defineConfig} from 'vite';
import runtypes from '@ts-runtypes/devtools/vite';

// vite.config.ts. Add the plugin. The resolver binary for your platform is
// installed automatically (an optional dependency) and resolved for you.
export default defineConfig({
  plugins: [
    runtypes({
      tsconfig: 'tsconfig.json',
    }),
  ],
});
