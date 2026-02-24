/* eslint-disable */
// This file demonstrates VALID usage for the @mionkit/type-formats-imports rule
// Format types should be imported WITHOUT the 'type' keyword

// start:type-formats-imports-valid
// ✅ CORRECT: Regular imports preserve type metadata for Deepkit reflection
import {StrEmail, StrUrl, StrDate} from '@mionkit/type-formats/FormatsString';
import {NumFormat, NumInteger} from '@mionkit/type-formats/FormatsNumber';
import {BigNumFormat} from '@mionkit/type-formats/FormatsBigint';
import {TypeFormat} from '@mionkit/run-types';
// end:type-formats-imports-valid
