import runtypes from '@mionjs/devtools/runtypes/rollup';

export default {
  plugins: [
    runtypes({
      tsconfig: 'tsconfig.json',
    }),
  ],
};
