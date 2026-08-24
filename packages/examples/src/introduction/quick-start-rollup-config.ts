import runtypes from '@ts-runtypes/devtools/rollup';

// rollup.config.js. Same plugin and the same options as the Vite entry, imported
// from the Rollup entry point instead.
export default {
  plugins: [
    runtypes({
      tsconfig: 'tsconfig.json',
    }),
  ],
};
