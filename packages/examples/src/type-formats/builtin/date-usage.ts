import {StrDate} from '@mionkit/type-formats/FormatsString';

// Default ISO format
type ISODate = StrDate; // 'YYYY-MM-DD'

// Custom formats
type EuropeanDate = StrDate<{format: 'DD-MM-YYYY'}>;
type USDate = StrDate<{format: 'MM-DD-YYYY'}>;
type MonthYear = StrDate<{format: 'YYYY-MM'}>;

// Validates leap years correctly
'2000-02-29'; // ✓ (leap year)
'1900-02-29'; // ✗ (not a leap year)

