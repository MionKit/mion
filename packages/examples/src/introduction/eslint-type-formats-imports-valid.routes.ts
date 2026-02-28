/* eslint-disable */
// This file demonstrates VALID usage for the @mionkit/type-formats-imports rule
// Format types should be imported WITHOUT the 'type' keyword

// start:type-formats-imports-valid
// ✅ CORRECT: Regular imports preserve type metadata for runtime reflection
import {FormatEmail, FormatUrl, FormatStringDate} from '@mionkit/type-formats/StringFormats';
import {FormatNumber, FormatInteger} from '@mionkit/type-formats/NumberFormats';
import {FormatBigInt} from '@mionkit/type-formats/BigintFormats';
import {TypeFormat} from '@mionkit/run-types';
// end:type-formats-imports-valid
