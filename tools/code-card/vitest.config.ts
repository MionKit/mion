import vue from '@vitejs/plugin-vue';
import {defineConfig} from 'vitest/config';

// plugin-vue compiles the components the tests render; taking a PNG needs a browser, so tests stop at the HTML.
export default defineConfig({
  plugins: [vue()],
  test: {
    name: 'code-card',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
