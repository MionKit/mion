/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// A types-only package prints another package's class as a `declare class` with the same name and members, so a
// client that registers the real class gets real instances back from a type that names the printed one.
//
// Marker rule (CLAUDE.md): every case exercises BOTH createXxx<T>() (static) and createXxx(value) (reflect).

import {afterEach, describe, expect, it} from 'vitest';
import {createJsonDecoderFn, createJsonEncoderFn, getRunTypeId} from '@mionjs/run-types';
import {registerClassSerializer} from '@mionjs/run-types/runtime';
import {clearClassSerializers} from '../../src/runtypes/classSerializerRegistry.ts';

afterEach(() => {
  clearClassSerializers();
});

class Money {
  constructor(public amount: number) {}
  add(other: Money): Money {
    return new Money(this.amount + other.amount);
  }
}

// What `mion api-types` prints for Money: same name, same members.
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace printed {
  export declare class Money {
    amount: number;
    add(other: Money): Money;
  }
}

// The same class from another version of its package: one member more, so another id, still the same name.
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace drifted {
  export declare class Money {
    amount: number;
    currency?: string;
    add(other: Money): Money;
  }
}

const register = () => registerClassSerializer(Money, {deserialize: (data) => new Money(data.amount)});

describe('classSerializer / a printed class finds the class the client registers', () => {
  it('static — the printed class has the real class id, so the exact lookup finds it', () => {
    register();
    expect(getRunTypeId<printed.Money>()).toBe(getRunTypeId<Money>());
    // both call shapes resolve the printed class to the same id
    expect(getRunTypeId<printed.Money>()).toBe(getRunTypeId(new Money(1) as unknown as printed.Money));
    const decoded = createJsonDecoderFn<printed.Money>()(createJsonEncoderFn<Money>()(new Money(5)) as string);
    expect(decoded).toBeInstanceOf(Money);
    expect((decoded as Money).add(new Money(1)).amount).toBe(6);
  });

  it('reflect — the same through the value-first form', () => {
    register();
    const sample = new Money(1) as unknown as printed.Money;
    const real = new Money(1);
    expect(getRunTypeId(sample)).toBe(getRunTypeId(real));
    const decoded = createJsonDecoderFn(sample)(createJsonEncoderFn(real)(new Money(7)) as string);
    expect(decoded).toBeInstanceOf(Money);
  });

  it('static — a class whose members changed has another id and is found by its name', () => {
    register();
    expect(getRunTypeId<drifted.Money>()).not.toBe(getRunTypeId<Money>());
    const decoded = createJsonDecoderFn<drifted.Money>()(createJsonEncoderFn<Money>()(new Money(5)) as string);
    expect(decoded).toBeInstanceOf(Money);
  });

  it('reflect — a class whose members changed is found by its name through the value-first form', () => {
    register();
    const sample = new Money(1) as unknown as drifted.Money;
    expect(getRunTypeId(sample)).not.toBe(getRunTypeId(new Money(1)));
    const decoded = createJsonDecoderFn(sample)(createJsonEncoderFn(new Money(1))(new Money(9)) as string);
    expect(decoded).toBeInstanceOf(Money);
  });
});
