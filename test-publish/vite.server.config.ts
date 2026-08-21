import {defineConfig} from 'vite';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite-plugin';

export default defineConfig({
    plugins: [
        mionVitePlugin({
            runTypes: {
                tsConfig: resolve(__dirname, 'tsconfig.json'),
            },
            // consume the mappers the test lane harvested (the plugin generates
            // .mion/server-mappers.generated.js and imports it for us)
            serverMappers: {consume: resolve(__dirname, '.mion/server-mappers.json')},
        }),
    ],
});
