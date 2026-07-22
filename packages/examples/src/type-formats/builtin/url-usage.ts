import {Url, UrlHttp, UrlFile} from '@ts-runtypes/core/formats';

type GeneralUrl = Url;
type WebUrl = UrlHttp;
type FileUrl = UrlFile;

// Url - accepts multiple protocols
('http://example.com'); // ✓
('https://example.com'); // ✓
('ftp://example.com'); // ✓
('ws://example.com'); // ✓

// UrlHttp - HTTP/HTTPS only
('http://example.com'); // ✓
('https://example.com'); // ✓
('ftp://example.com'); // ✗
('ws://example.com'); // ✗

// UrlFile - file protocol only
('file://hello.png'); // ✓
('file:///c:/lorem/ipsum.jpg'); // ✓
('http://example.com'); // ✗
