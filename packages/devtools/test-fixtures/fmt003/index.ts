// FMT003 — a declared mockSample must satisfy the format's own statically checkable siblings.
// 'b' is 1 UTF-16 code unit but minLength is 5, so the sample its own validator would reject.
// Expected: the build halts rather than let createMockDataFn emit an invalid value.
import {createValidateFn} from '@ts-runtypes/core';
import {String} from '@ts-runtypes/core/formats';

type TooShortSample = String<{minLength: 5; pattern: {source: '^b+$'; mockSamples: ['b', 'bb']}}>;

export const validate = createValidateFn<TooShortSample>();
