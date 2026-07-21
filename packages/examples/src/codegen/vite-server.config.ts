import {defineConfig} from 'vite';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite-plugin';

export default defineConfig({
    plugins: [
        mionVitePlugin({
            runTypes: {tsConfig: resolve(__dirname, 'tsconfig.json')},
            // Register the inline serverMapFrom mappers the CLIENT build harvested into this manifest.
            serverMappers: {consume: resolve(__dirname, '../client/.mion/server-mappers.json')},
        }) as any,
    ],
    build: {
        lib: {
            entry: resolve(__dirname, 'src/init.ts'),
            formats: ['es'],
        },
        rollupOptions: {
            external: [/^[^./]/],
        },
    },
});
