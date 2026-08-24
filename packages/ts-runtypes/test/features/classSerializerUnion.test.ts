// Class reconstruction inside a JSON / binary UNION.
//
// A union that contains named class members routes each class through the flat
// union's per-member index dispatch (the numeric [idx,value] envelope binary
// already uses), guarded on encode by instance identity (`v instanceof cs.cls`).
// Decode reconstructs the right instance per member. This covers:
//   - distinct-shape class unions (Circle | Square),
//   - SAME-shape class unions (Vec | Loc, both {x,y}) — sound only because the
//     class name is folded into the structural id so the two members are
//     distinct nodes with distinct indices,
//   - class + plain-object unions (Coin | {note}) — the instance reconstructs,
//     the plain object stays plain,
//   - unregistered members fall back to plain objects (no throw),
//   - JSON and binary agree.
//
// Marker rule (CLAUDE.md): every case exercises BOTH createXxx<T>() (static)
// and createXxx(value) (reflect).

import {afterEach, describe, expect, it} from 'vitest';
import {
  createJsonEncoderFn,
  createJsonDecoderFn,
  createBinaryEncoderFn,
  createBinaryDecoderFn,
  registerClassSerializer,
} from '@ts-runtypes/core';
import {clearClassSerializers} from '../../src/runtypes/classSerializerRegistry.ts';

afterEach(() => {
  clearClassSerializers();
});

// ---- Distinct-shape classes -------------------------------------------------

class Circle {
  constructor(public radius: number) {}
  area(): number {
    return Math.PI * this.radius * this.radius;
  }
}
class Square {
  constructor(public side: number) {}
  area(): number {
    return this.side * this.side;
  }
}
type Shape = Circle | Square;

function registerShapes(): void {
  registerClassSerializer(Circle, {deserialize: (d) => new Circle(d.radius)});
  registerClassSerializer(Square, {deserialize: (d) => new Square(d.side)});
}

describe('classSerializer union / distinct-shape classes (JSON)', () => {
  it('static — createJsonEncoderFn<Shape> reconstructs the right member', () => {
    registerShapes();
    const encode = createJsonEncoderFn<Shape>();
    const decode = createJsonDecoderFn<Shape>();

    const c = decode(encode(new Circle(2)) as string) as Circle;
    expect(c).toBeInstanceOf(Circle);
    expect(c.radius).toBe(2);
    expect(c.area()).toBeCloseTo(Math.PI * 4);

    const s = decode(encode(new Square(3)) as string) as Square;
    expect(s).toBeInstanceOf(Square);
    expect(s.side).toBe(3);
    expect(s.area()).toBe(9);
  });

  it('reflect — createJsonEncoderFn(value) reconstructs the right member', () => {
    registerShapes();
    const sample: Shape = new Circle(0);
    const encode = createJsonEncoderFn(sample);
    const decode = createJsonDecoderFn(sample);

    expect(decode(encode(new Square(4)) as string)).toBeInstanceOf(Square);
    expect(decode(encode(new Circle(5)) as string)).toBeInstanceOf(Circle);
  });
});

describe('classSerializer union / distinct-shape classes (binary)', () => {
  it('static — createBinaryEncoderFn<Shape> reconstructs the right member', () => {
    registerShapes();
    const encode = createBinaryEncoderFn<Shape>();
    const decode = createBinaryDecoderFn<Shape>();

    expect(decode(encode(new Circle(7)))).toBeInstanceOf(Circle);
    const s = decode(encode(new Square(8))) as Square;
    expect(s).toBeInstanceOf(Square);
    expect(s.side).toBe(8);
  });

  it('reflect — createBinaryEncoderFn(value) reconstructs the right member', () => {
    registerShapes();
    const sample: Shape = new Circle(0);
    const encode = createBinaryEncoderFn(sample);
    const decode = createBinaryDecoderFn(sample);
    expect(decode(encode(new Square(1)))).toBeInstanceOf(Square);
    expect(decode(encode(new Circle(1)))).toBeInstanceOf(Circle);
  });
});

// ---- SAME-shape classes (the type-id fold-in is what makes this sound) -------

class Vec {
  constructor(
    public x: number,
    public y: number
  ) {}
  kind(): string {
    return 'vec';
  }
}
class Loc {
  constructor(
    public x: number,
    public y: number
  ) {}
  kind(): string {
    return 'loc';
  }
}
type Pair = Vec | Loc;

function registerPair(): void {
  registerClassSerializer(Vec, {deserialize: (d) => new Vec(d.x, d.y)});
  registerClassSerializer(Loc, {deserialize: (d) => new Loc(d.x, d.y)});
}

describe('classSerializer union / same-shape classes distinguished by identity', () => {
  it('static (JSON) — a Vec and a Loc with identical fields reconstruct as their own class', () => {
    registerPair();
    const encode = createJsonEncoderFn<Pair>();
    const decode = createJsonDecoderFn<Pair>();

    const v = decode(encode(new Vec(1, 2)) as string) as Vec;
    expect(v).toBeInstanceOf(Vec);
    expect(v.kind()).toBe('vec');

    const l = decode(encode(new Loc(1, 2)) as string) as Loc;
    expect(l).toBeInstanceOf(Loc);
    expect(l.kind()).toBe('loc');
  });

  it('reflect (binary) — same-shape members stay distinct through the binary index', () => {
    registerPair();
    const sample: Pair = new Vec(0, 0);
    const encode = createBinaryEncoderFn(sample);
    const decode = createBinaryDecoderFn(sample);

    expect(decode(encode(new Vec(3, 4)))).toBeInstanceOf(Vec);
    expect(decode(encode(new Loc(3, 4)))).toBeInstanceOf(Loc);
  });
});

// ---- Class + plain object ---------------------------------------------------

class Coin {
  constructor(public cents: number) {}
  dollars(): number {
    return this.cents / 100;
  }
}
type Money = Coin | {note: string};

describe('classSerializer union / class + plain object', () => {
  it('static (JSON) — the class instance reconstructs, the plain object stays plain', () => {
    registerClassSerializer(Coin, {deserialize: (d) => new Coin(d.cents)});
    const encode = createJsonEncoderFn<Money>();
    const decode = createJsonDecoderFn<Money>();

    const coin = decode(encode(new Coin(250)) as string) as Coin;
    expect(coin).toBeInstanceOf(Coin);
    expect(coin.dollars()).toBe(2.5);

    const note = decode(encode({note: 'IOU'}) as string);
    expect(note).not.toBeInstanceOf(Coin);
    expect(note).toEqual({note: 'IOU'});
  });

  it('reflect (binary) — class instance vs plain object round-trip', () => {
    registerClassSerializer(Coin, {deserialize: (d) => new Coin(d.cents)});
    const sample: Money = new Coin(0);
    const encode = createBinaryEncoderFn(sample);
    const decode = createBinaryDecoderFn(sample);

    expect(decode(encode(new Coin(99)))).toBeInstanceOf(Coin);
    expect(decode(encode({note: 'hi'}))).toEqual({note: 'hi'});
  });
});

// ---- Unregistered union members fall back to plain objects ------------------

describe('classSerializer union / unregistered members fall back to plain objects', () => {
  it('static (JSON) — a class union with no registration decodes to plain objects (no throw)', () => {
    // No registerShapes() call.
    const encode = createJsonEncoderFn<Shape>();
    const decode = createJsonDecoderFn<Shape>();

    let decoded: unknown;
    expect(() => {
      decoded = decode(encode(new Circle(3)) as string);
    }).not.toThrow();
    expect(decoded).not.toBeInstanceOf(Circle);
    expect(decoded).toMatchObject({radius: 3});
  });

  it('reflect (binary) — unregistered class union decodes to plain objects (no throw)', () => {
    const sample: Shape = new Circle(0);
    const encode = createBinaryEncoderFn(sample);
    const decode = createBinaryDecoderFn(sample);

    let decoded: unknown;
    expect(() => {
      decoded = decode(encode(new Square(6)));
    }).not.toThrow();
    expect(decoded).not.toBeInstanceOf(Square);
    expect(decoded).toMatchObject({side: 6});
  });
});

// ---- JSON and binary agree --------------------------------------------------

describe('classSerializer union / both codecs agree', () => {
  it('JSON and binary reconstruct the same member for a mixed batch', () => {
    registerShapes();
    const inputs: Shape[] = [new Circle(1), new Square(2), new Circle(3)];
    for (const input of inputs) {
      const viaJson = createJsonDecoderFn<Shape>()(createJsonEncoderFn<Shape>()(input) as string);
      const viaBinary = createBinaryDecoderFn<Shape>()(createBinaryEncoderFn<Shape>()(input));
      expect((viaBinary as object).constructor.name).toBe((viaJson as object).constructor.name);
      expect(viaBinary).toEqual(viaJson);
    }
  });
});
