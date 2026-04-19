import {defineConfig} from 'vite';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite-plugin';

// Server config when the client is NOT built with Vite (e.g., Next.js with Turbopack).
// noViteClient requires all pureServerFn() and mapFrom() calls to have explicit names.
export default defineConfig({
    plugins: [
        mionVitePlugin({
            runTypes: {tsConfig: resolve(__dirname, 'tsconfig.json')},
            serverPureFunctions: {
                clientSrcPath: resolve(__dirname, '../client/src'),
                noViteClient: true,
            },
        }),
    ],
});
