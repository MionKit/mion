import {StrTime} from '@mionkit/type-formats/FormatsString';

// Default ISO format with timezone
type ISOTime = StrTime; // 'HH:mm:ss[.mmm]TZ'

// Custom formats
type SimpleTime = StrTime<{format: 'HH:mm:ss'}>;
type ShortTime = StrTime<{format: 'HH:mm'}>;
type Duration = StrTime<{format: 'mm:ss'}>;

// ISO time examples
'14:30:00Z'; // ✓ UTC
'14:30:00+05:30'; // ✓ with offset
'14:30:00.123Z'; // ✓ with milliseconds

