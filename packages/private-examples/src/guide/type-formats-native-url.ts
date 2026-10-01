import type * as TF from '@mionjs/run-types/formats';
import {createJsonDecoderFn, createValidateFn} from '@mionjs/run-types';

// start-native-url
interface Bookmark {
  page: URL; // any URL object
  api: TF.NativeUrlHttp<{maxLength: 200}>; // http(s) only, href up to 200 chars
  backup: TF.NativeUrlFile; // file:// only
}

const isBookmark = createValidateFn<Bookmark>();
const decodeBookmark = createJsonDecoderFn<Bookmark>();

const bookmark = decodeBookmark(
  '{"page":"mailto:ada@example.com","api":"https://example.com/v1","backup":"file:///tmp/b.json"}'
);
bookmark.api.pathname; // '/v1', a real URL object
isBookmark(bookmark); // true
isBookmark({...bookmark, api: 'https://example.com/v1'}); // false, a string is not a URL
// end-native-url
