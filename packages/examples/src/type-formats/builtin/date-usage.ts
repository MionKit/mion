import {FormatStringDate} from '@mionjs/type-formats/StringFormats';

// Default ISO format
type ISODate = FormatStringDate; // 'YYYY-MM-DD'

// Custom formats
type EuropeanDate = FormatStringDate<{format: 'DD-MM-YYYY'}>;
type USDate = FormatStringDate<{format: 'MM-DD-YYYY'}>;
type MonthYear = FormatStringDate<{format: 'YYYY-MM'}>;

// Validates leap years correctly
('2000-02-29'); // ✓ (leap year)
('1900-02-29'); // ✗ (not a leap year)
