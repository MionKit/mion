import {defineConfig} from 'vitest/config';

// No plugins: the card app is plain Node, and taking a PNG needs a browser, so these tests stop at the HTML.
export default defineConfig({
  test: {
    name: 'code-card',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
