import {defineConfig} from 'vite';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite';

// Mirrors the Cloudflare docs config; @mionjs/* bundles from the installed tarballs' dist, as in a user's build.
export default defineConfig({
    plugins: [
        mionVitePlugin({
            tsConfig: resolve(__dirname, 'tsconfig.json'),
            runTypes: {
                // required on Workers: no `new Function` at runtime
                emitMode: 'both',
            },
        }),
    ],
    build: {
        lib: {
            entry: 'src/index.ts',
            formats: ['es'],
            fileName: 'worker',
        },
        rollupOptions: {
            // Workers do not support dynamic code splitting
            output: {inlineDynamicImports: true},
        },
    },
});
