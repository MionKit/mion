/* eslint-disable */
// This file demonstrates INVALID usage for the @mionkit/type-formats-imports rule
// Format types should NOT be imported with the 'type' keyword

// start:type-formats-imports-invalid
// ❌ WRONG: Type-only imports strip metadata, causing silent validation failures
import type {StrEmail, StrDate} from '@mionkit/type-formats/FormatsString';
import type {NumFloat} from '@mionkit/type-formats/FormatsNumber';
import {type BigNumInt64} from '@mionkit/type-formats/FormatsBigint';
import type {TypeFormat} from '@mionkit/run-types';
// end:type-formats-imports-invalid
