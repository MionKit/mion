import {defineConfig} from 'vite';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite';

// The Worker config the Cloudflare docs page shows, built over the INSTALLED tarballs: @mionjs/* is
// bundled from its published dist, so the packages' own generated modules ship as they would to a user.
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
            // Workers do not support dynamic code splitting, so bundle everything into one file
            output: {inlineDynamicImports: true},
        },
    },
});
