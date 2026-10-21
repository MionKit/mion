import vue from '@vitejs/plugin-vue';
import {defineConfig} from 'vitest/config';

// plugin-vue compiles the components the tests render.
export default defineConfig({
  plugins: [vue()],
  test: {
    name: 'code-card',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
