import {defineConfig} from 'vite';
import {resolve} from 'path';

// Client doesn't need any plugin - pureServerFn() just returns metadata
// The server plugin scans client source directly
export default defineConfig({
    build: {
        lib: {
            entry: resolve(__dirname, 'src/pureFns.ts'),
            formats: ['es'],
            fileName: 'pureFns',
        },
        emptyOutDir: true,
        minify: false,
        rollupOptions: {
            external: ['@mionkit/server-pure-functions'],
        },
    },
});
