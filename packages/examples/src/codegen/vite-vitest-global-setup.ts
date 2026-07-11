// vitest globalSetup — wait for the mion server before running tests
import {serverReady} from '@mionjs/devtools/vite-plugin';

export async function setup() {
    await serverReady;
}
