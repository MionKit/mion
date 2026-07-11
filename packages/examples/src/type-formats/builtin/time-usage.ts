import {FormatStringTime} from '@mionjs/type-formats/StringFormats';

// Default ISO format with timezone
type ISOTime = FormatStringTime; // 'HH:mm:ss[.mmm]TZ'

// Custom formats
type SimpleTime = FormatStringTime<{format: 'HH:mm:ss'}>;
type ShortTime = FormatStringTime<{format: 'HH:mm'}>;
type Duration = FormatStringTime<{format: 'mm:ss'}>;

// ISO time examples
('14:30:00Z'); // ✓ UTC
('14:30:00+05:30'); // ✓ with offset
('14:30:00.123Z'); // ✓ with milliseconds
