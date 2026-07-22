/* eslint-disable */
// This file demonstrates INVALID usage for the @mionjs/type-formats-imports rule
// Format types should NOT be imported with the 'type' keyword

// start:type-formats-imports-invalid
// ❌ WRONG: Type-only imports strip metadata, causing silent validation failures
import type {Email, StringDate} from '@ts-runtypes/core/formats';
import type {Float} from '@ts-runtypes/core/formats';
import {type BigInt64} from '@ts-runtypes/core/formats';
import type {TypeFormat} from '@ts-runtypes/core';
// end:type-formats-imports-invalid
