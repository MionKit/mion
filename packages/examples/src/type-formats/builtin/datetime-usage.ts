import {StringDateTime} from '@ts-runtypes/core/formats';

// Default: ISO date + ISO time, separated by 'T'
type ISODateTime = StringDateTime;
// Example: '2023-01-15T14:30:00Z'

// Custom combination
type CustomDateTime = StringDateTime<{
    date: {format: 'DD-MM-YYYY'};
    time: {format: 'HH:mm'};
    splitChar: ' '; // space separator instead of 'T'
}>;
// Example: '15-01-2023 14:30'

// Short datetime
type ShortDateTime = StringDateTime<{
    date: {format: 'MM-DD'};
    time: {format: 'HH'};
}>;
// Example: '01-15T14'
