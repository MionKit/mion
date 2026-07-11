import {FormatUrl, FormatUrlHttp, FormatUrlFile} from '@mionjs/type-formats/StringFormats';

type GeneralUrl = FormatUrl;
type WebUrl = FormatUrlHttp;
type FileUrl = FormatUrlFile;

// FormatUrl - accepts multiple protocols
('http://example.com'); // ✓
('https://example.com'); // ✓
('ftp://example.com'); // ✓
('ws://example.com'); // ✓

// FormatUrlHttp - HTTP/HTTPS only
('http://example.com'); // ✓
('https://example.com'); // ✓
('ftp://example.com'); // ✗
('ws://example.com'); // ✗

// FormatUrlFile - file protocol only
('file://hello.png'); // ✓
('file:///c:/lorem/ipsum.jpg'); // ✓
('http://example.com'); // ✗
