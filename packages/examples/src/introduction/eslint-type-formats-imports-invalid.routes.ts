/* eslint-disable */
// This file demonstrates INVALID usage for the @mionjs/type-formats-imports rule
// Format types should NOT be imported with the 'type' keyword

// start:type-formats-imports-invalid
// ❌ WRONG: Type-only imports strip metadata, causing silent validation failures
import type {FormatEmail, FormatStringDate} from '@mionjs/type-formats/StringFormats';
import type {FormatFloat} from '@mionjs/type-formats/NumberFormats';
import {type FormatBigInt64} from '@mionjs/type-formats/BigintFormats';
import type {TypeFormat} from '@mionjs/run-types';
// end:type-formats-imports-invalid
