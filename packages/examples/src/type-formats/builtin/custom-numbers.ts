import {FormatNumber} from '@mionkit/type-formats/NumberFormats';

// Age with valid range
type Age = FormatNumber<{
    min: 0;
    max: 120;
    integer: true;
}>;

// Percentage with decimals
type Percentage = FormatNumber<{
    min: 0;
    max: 100;
}>;

// Price must be multiple of 0.01 (cents)
type Price = FormatNumber<{
    min: 0;
    multipleOf: 1; // multipleOf must be integer
    integer: true; // store as cents
}>;
