/* eslint-disable */
// This file demonstrates INVALID usage for the @mionkit/type-formats-imports rule
// Format types should NOT be imported with the 'type' keyword

// start:type-formats-imports-invalid
// ❌ WRONG: Type-only imports strip metadata, causing silent validation failures
import type {FormatEmail, FormatStringDate} from '@mionkit/type-formats/StringFormats';
import type {FormatFloat} from '@mionkit/type-formats/NumberFormats';
import {type FormatBigInt64} from '@mionkit/type-formats/BigintFormats';
import type {TypeFormat} from '@mionkit/run-types';
// end:type-formats-imports-invalid
