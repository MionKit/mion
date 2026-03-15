import {defineConfig} from 'vite';
import {resolve} from 'path';
import {mionPlugin} from '@mionjs/devtools/vite-plugin';

export default defineConfig({
    plugins: [
        mionPlugin({
            runTypes: {
                tsConfig: resolve(__dirname, 'tsconfig.json'),
                compilerOptions: {
                    sourceMap: true,
                },
            },
            serverPureFunctions: {
                clientSrcPath: resolve(__dirname, 'src/client'),
            },
        }) as any,
    ],
});
