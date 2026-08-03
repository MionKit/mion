// Slim, marker-free format-validation suite — mirrors
// src/suites/format-validation/index.ts but recombines the marker-free group
// files under shared/cases/format-validation. Each case carries samples +
// expectedFormatErrors metadata only.

import {STRING_FORMAT} from './StringFormat.ts';
import {NUMBER_FORMAT} from './NumberFormat.ts';
import {BIGINT_FORMAT} from './BigintFormat.ts';
import {DATETIME} from './DateTime.ts';
import {JSON_SCHEMA} from './JsonSchema.ts';
import type {FormatValidationCase} from '../types.ts';

export const FORMAT_VALIDATION_SUITE = {STRING_FORMAT, NUMBER_FORMAT, BIGINT_FORMAT, DATETIME, JSON_SCHEMA} as const satisfies {
  STRING_FORMAT: Record<string, FormatValidationCase>;
  NUMBER_FORMAT: Record<string, FormatValidationCase>;
  BIGINT_FORMAT: Record<string, FormatValidationCase>;
  DATETIME: Record<string, FormatValidationCase>;
  JSON_SCHEMA: Record<string, FormatValidationCase>;
};

export * from './types.ts';
