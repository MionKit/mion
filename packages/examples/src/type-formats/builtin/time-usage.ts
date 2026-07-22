import {StringTime} from '@ts-runtypes/core/formats';

// Default ISO format with timezone
type ISOTime = StringTime; // 'HH:mm:ss[.mmm]TZ'

// Custom formats
type SimpleTime = StringTime<{format: 'HH:mm:ss'}>;
type ShortTime = StringTime<{format: 'HH:mm'}>;
type Duration = StringTime<{format: 'mm:ss'}>;

// ISO time examples
('14:30:00Z'); // ✓ UTC
('14:30:00+05:30'); // ✓ with offset
('14:30:00.123Z'); // ✓ with milliseconds
