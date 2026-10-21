// formatTransform leaves a callable-interface property as it is, like a function property: it is not data.

import {describe, it, expect} from 'vitest';
import type * as TF from '@mionjs/run-types/formats';
import '@mionjs/run-types/formats';
import {createFormatTransformFn} from '@mionjs/run-types';

interface Labelled {
  (): void;
  label: TF.Transform<string, {trim: true}>;
}
type Holder = {handler: Labelled; name: TF.Transform<string, {trim: true}>};

const makeHolder = (): Holder => ({handler: Object.assign(() => undefined, {label: '  padded  '}), name: '  name  '});

describe('formatTransform — a callable-interface property', () => {
  it('formats the data and leaves the callable alone (static shape)', () => {
    const transform = createFormatTransformFn<Holder>();
    const result = transform(makeHolder());
    expect(result.name).toBe('name');
    expect(result.handler.label).toBe('  padded  ');
  });

  it('formats the data and leaves the callable alone (value shape)', () => {
    const sample = makeHolder();
    const transform = createFormatTransformFn(sample);
    const result = transform(makeHolder());
    expect(result.name).toBe('name');
    expect(result.handler.label).toBe('  padded  ');
  });
});
