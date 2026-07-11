/* eslint-disable */
// This file demonstrates VALID usage for the @mionjs/type-formats-imports rule
// Format types should be imported WITHOUT the 'type' keyword

// start:type-formats-imports-valid
// ✅ CORRECT: Regular imports preserve type metadata for runtime reflection
import {FormatEmail, FormatUrl, FormatStringDate} from '@mionjs/type-formats/StringFormats';
import {FormatNumber, FormatInteger} from '@mionjs/type-formats/NumberFormats';
import {FormatBigInt} from '@mionjs/type-formats/BigintFormats';
import {TypeFormat} from '@mionjs/run-types';
// end:type-formats-imports-valid
