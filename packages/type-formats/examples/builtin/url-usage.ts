import {StrUrl, StrUrlHttp, StrUrlFile} from '@mionkit/type-formats/FormatsString';

type GeneralUrl = StrUrl;
type WebUrl = StrUrlHttp;
type FileUrl = StrUrlFile;

// StrUrl - accepts multiple protocols
'http://example.com'; // ✓
'https://example.com'; // ✓
'ftp://example.com'; // ✓
'ws://example.com'; // ✓

// StrUrlHttp - HTTP/HTTPS only
'http://example.com'; // ✓
'https://example.com'; // ✓
'ftp://example.com'; // ✗
'ws://example.com'; // ✗

// StrUrlFile - file protocol only
'file://hello.png'; // ✓
'file:///c:/lorem/ipsum.jpg'; // ✓
'http://example.com'; // ✗

