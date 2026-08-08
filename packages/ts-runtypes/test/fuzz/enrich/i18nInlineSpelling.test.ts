// Pin for the i18n fuzzer's inline format-brand spellings (i18nModel.ts).
//
// Those fixtures are scratch temp dirs with no ts-runtypes install, so the
// model writes the raw sentinel intersection instead of importing TF.String<P>
// (a declared exception in srcOverlay.ts). Duplication without an oracle is
// the one thing the harness cannot afford: if the shipped encoding changed,
// the model would keep generating the old spelling and the i18n fuzzer would
// silently exercise a plain string instead of a formatted one.
//
// The pin is two hops, both load-bearing:
//   1. the type literals HERE resolve to the same structural id as the shipped
//      TF.String<P> brands (compile-time, via the real transformer), and
//   2. the strings i18nModel actually writes are byte-equal to those literals
//      (runtime), so hop 1 really is about the generated fixtures.
import {describe, expect, it} from 'vitest';
import * as TF from '@ts-runtypes/core/formats';
import {getRunTypeId} from '@ts-runtypes/core';
import {MINLENGTH_FMT, patternFmt} from './i18nModel.ts';

// Byte-for-byte the text of MINLENGTH_FMT / patternFmt('bravo') — hop 2
// asserts that below.
type InlineMinLength = string & {readonly __rtFormatName?: 'stringFormat'; readonly __rtFormatParams?: {minLength: 2}};
type InlinePattern = string & {
  readonly __rtFormatName?: 'stringFormat';
  readonly __rtFormatParams?: {pattern: {source: 'bravo'; flags: ''}};
};

describe('i18n fuzzer inline spellings still equal the shipped TF.String encoding', () => {
  it('minLength spelling === TF.String<{minLength: 2}> by structural id (static form)', () => {
    expect(getRunTypeId<InlineMinLength>()).toBe(getRunTypeId<TF.String<{minLength: 2}>>());
  });

  it('pattern spelling === TF.String<{pattern: …}> by structural id (reflection form)', () => {
    const branded: InlinePattern = 'bravo';
    expect(getRunTypeId(branded)).toBe(getRunTypeId<TF.String<{pattern: {source: 'bravo'; flags: ''}}>>());
  });

  it('the pinned literals are the strings i18nModel actually writes', () => {
    expect(MINLENGTH_FMT).toBe("string & {readonly __rtFormatName?: 'stringFormat'; readonly __rtFormatParams?: {minLength: 2}}");
    expect(patternFmt('bravo')).toBe(
      "string & {readonly __rtFormatName?: 'stringFormat'; readonly __rtFormatParams?: {pattern: {source: 'bravo'; flags: ''}}}"
    );
  });
});
