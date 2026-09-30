import {initClient, type MetadataStore} from '@mionjs/client';
import type {MyApi} from './metadata-fetch.routes.ts';

// opens your app's own storage, like a native app's database
declare function openAppStore(): Promise<MetadataStore | undefined>;

export const {routes, middlewares} = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
  // returning undefined keeps the cache in memory
  storageEngine: openAppStore,
});
