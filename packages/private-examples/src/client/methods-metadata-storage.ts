import {initClient, requestPersistentStorage} from '@mionjs/client';
import {useMethodsMetadata} from '@mionjs/client/middlewares';
import type {MyApi} from './metadata-fetch.routes.ts';

const {middlewares} = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
  // the default: keep what the client learns between visits
  storageEngine: 'indexeddb',
});
useMethodsMetadata(middlewares.mionMethodsMetadata);

// ask the browser to keep the cache when it clears storage, best after a user action
document
  .querySelector('#settings')
  ?.addEventListener('click', () => requestPersistentStorage());
