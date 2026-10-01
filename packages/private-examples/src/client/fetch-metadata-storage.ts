import {initClient, requestPersistentStorage} from '@mionjs/client';
import {useFetchMetadata} from '@mionjs/client/middlewares';
import type {MyApi} from './metadata-fetch.routes.ts';

const {middlewares} = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
  storageEngine: 'indexeddb',
});
useFetchMetadata(middlewares.mionFetchMetadata);

// ask the browser to keep the cache when it clears storage, best after a user action
document
  .querySelector('#settings')
  ?.addEventListener('click', () => requestPersistentStorage());
