import {defineConfig} from 'vite';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite-plugin';

export default defineConfig({
    plugins: [
        mionVitePlugin({
            runTypes: {
                tsConfig: resolve(__dirname, 'tsconfig.json'),
            },
            // consume the mappers the test lane harvested (registered via the
            // virtual:mion/server-mappers side-effect import in src/server/server.ts)
            serverMappers: {consume: resolve(__dirname, '.mion/server-mappers.json')},
        }),
    ],
});
