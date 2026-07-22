/* eslint-disable */
// This file demonstrates VALID usage for the @mionjs/type-formats-imports rule
// Format types should be imported WITHOUT the 'type' keyword

// start:type-formats-imports-valid
// ✅ CORRECT: Regular imports preserve type metadata for runtime reflection
import {Email, Url, StringDate} from '@ts-runtypes/core/formats';
import {Number, Integer} from '@ts-runtypes/core/formats';
import {BigInt} from '@ts-runtypes/core/formats';
import {TypeFormat} from '@ts-runtypes/core';
// end:type-formats-imports-valid
