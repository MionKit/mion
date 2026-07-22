import {StringDate} from '@ts-runtypes/core/formats';

// Default ISO format
type ISODate = StringDate; // 'YYYY-MM-DD'

// Custom formats
type EuropeanDate = StringDate<{format: 'DD-MM-YYYY'}>;
type USDate = StringDate<{format: 'MM-DD-YYYY'}>;
type MonthYear = StringDate<{format: 'YYYY-MM'}>;

// Validates leap years correctly
('2000-02-29'); // ✓ (leap year)
('1900-02-29'); // ✗ (not a leap year)
