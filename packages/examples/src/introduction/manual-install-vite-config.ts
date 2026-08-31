import {defineConfig} from 'vite';
import runtypes from '@ts-runtypes/devtools/vite';

// Every option has a sane default. The plugin works with no config at all.
export default defineConfig({
  plugins: [
    runtypes({
      // Optional: where your tsconfig lives. Defaults to 'tsconfig.json'.
      tsconfig: 'tsconfig.json',
      // Optional: override the auto-resolved platform binary with a custom or
      // local build (otherwise resolved from the @ts-runtypes/binary-* package).
      // binary: './bin/mion',
      // Optional knobs. See the plugin & CLI reference for the full list.
      // emitMode: 'code',
      // moduleMode: 'default',
    }),
  ],
});
