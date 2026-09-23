import {defineConfig} from 'vite';
import runtypes from '@mionjs/devtools/runtypes/vite';

export default defineConfig({
  plugins: [
    // the binary for your platform installs as an optional dependency
    runtypes({
      tsconfig: 'tsconfig.json',
    }),
  ],
});
