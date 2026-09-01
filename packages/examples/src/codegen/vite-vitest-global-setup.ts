// vitest globalSetup — wait for the mion server before running tests
import {serverReady} from '@mionjs/devtools/vite';

export async function setup() {
  await serverReady;
}
