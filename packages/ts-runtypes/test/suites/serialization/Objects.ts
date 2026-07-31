import * as TF from '@ts-runtypes/core/formats';
import {
  createBinaryDecoderFn,
  createBinaryEncoderFn,
  createJsonDecoderFn,
  createJsonEncoderFn,
  registerClassSerializer,
} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/schema';
import type {SerializationCase} from './types.ts';

export const OBJECTS = {
  interface: {
    title: 'Interface',
    description:
      'Object literal mixing a Date field, bigint, number, string, null, a string array, a weird-named key, and an optional string, exercising Date and bigint wire round-trip plus an optional prop present in one sample and absent in the other.',
    serializeNotes: 'Date serialises to ISO string and restores to a Date; bigint round-trips through both JSON and binary.',
    mutateEncoder: () =>
      createJsonEncoderFn<{
        startDate: Date;
        quantity: number;
        name: string;
        nullValue: null;
        big: bigint;
        stringArray: string[];
        "weird prop name \n?>'\\\t\r": string;
        optionalString?: string;
      }>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () =>
      createJsonEncoderFn<{
        startDate: Date;
        quantity: number;
        name: string;
        nullValue: null;
        big: bigint;
        stringArray: string[];
        "weird prop name \n?>'\\\t\r": string;
        optionalString?: string;
      }>(undefined, {strategy: 'clone'}),
    directEncoder: () =>
      createJsonEncoderFn<{
        startDate: Date;
        quantity: number;
        name: string;
        nullValue: null;
        big: bigint;
        stringArray: string[];
        "weird prop name \n?>'\\\t\r": string;
        optionalString?: string;
      }>(undefined, {strategy: 'direct'}),
    compactEncoder: () =>
      createJsonEncoderFn<{
        startDate: Date;
        quantity: number;
        name: string;
        nullValue: null;
        big: bigint;
        stringArray: string[];
        "weird prop name \n?>'\\\t\r": string;
        optionalString?: string;
      }>(undefined, {strategy: 'compact'}),
    stripDecoder: () =>
      createJsonDecoderFn<{
        startDate: Date;
        quantity: number;
        name: string;
        nullValue: null;
        big: bigint;
        stringArray: string[];
        "weird prop name \n?>'\\\t\r": string;
        optionalString?: string;
      }>(),
    preserveDecoder: () =>
      createJsonDecoderFn<{
        startDate: Date;
        quantity: number;
        name: string;
        nullValue: null;
        big: bigint;
        stringArray: string[];
        "weird prop name \n?>'\\\t\r": string;
        optionalString?: string;
      }>(undefined, {strategy: 'preserve'}),
    compactDecoder: () =>
      createJsonDecoderFn<{
        startDate: Date;
        quantity: number;
        name: string;
        nullValue: null;
        big: bigint;
        stringArray: string[];
        "weird prop name \n?>'\\\t\r": string;
        optionalString?: string;
      }>(undefined, {strategy: 'compact'}),
    binaryEncoder: () =>
      createBinaryEncoderFn<{
        startDate: Date;
        quantity: number;
        name: string;
        nullValue: null;
        big: bigint;
        stringArray: string[];
        "weird prop name \n?>'\\\t\r": string;
        optionalString?: string;
      }>(),
    binaryDecoder: () =>
      createBinaryDecoderFn<{
        startDate: Date;
        quantity: number;
        name: string;
        nullValue: null;
        big: bigint;
        stringArray: string[];
        "weird prop name \n?>'\\\t\r": string;
        optionalString?: string;
      }>(),
    schemaEncoder: () =>
      createJsonEncoderFn(
        RT.object({
          startDate: TF.date(),
          quantity: TF.number(),
          name: TF.string(),
          nullValue: RT.literal(null),
          big: TF.bigInt(),
          stringArray: RT.array(TF.string()),
          "weird prop name \n?>'\\\t\r": TF.string(),
          optionalString: RT.optional(TF.string()),
        })
      ),
    schemaDecoder: () =>
      createJsonDecoderFn(
        RT.object({
          startDate: TF.date(),
          quantity: TF.number(),
          name: TF.string(),
          nullValue: RT.literal(null),
          big: TF.bigInt(),
          stringArray: RT.array(TF.string()),
          "weird prop name \n?>'\\\t\r": TF.string(),
          optionalString: RT.optional(TF.string()),
        })
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoderFn(
        RT.object({
          startDate: TF.date(),
          quantity: TF.number(),
          name: TF.string(),
          nullValue: RT.literal(null),
          big: TF.bigInt(),
          stringArray: RT.array(TF.string()),
          "weird prop name \n?>'\\\t\r": TF.string(),
          optionalString: RT.optional(TF.string()),
        })
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoderFn(
        RT.object({
          startDate: TF.date(),
          quantity: TF.number(),
          name: TF.string(),
          nullValue: RT.literal(null),
          big: TF.bigInt(),
          stringArray: RT.array(TF.string()),
          "weird prop name \n?>'\\\t\r": TF.string(),
          optionalString: RT.optional(TF.string()),
        })
      ),
    getTestData: () => {
      const value = {
        startDate: new Date('2000-08-06T02:13:00.000Z'),
        quantity: 123,
        name: 'hello',
        nullValue: null,
        big: BigInt(123),
        stringArray: ['a', 'b', 'c'],
        "weird prop name \n?>'\\\t\r": 'hello2',
      };
      const valueWithOptional = {...value, optionalString: 'hello3'};
      return {values: [value, valueWithOptional]};
    },
  },
  many_optional_props: {
    title: 'Many optional props',
    description:
      'Object with 32 optional number properties whose samples carry sparse subsets and an empty object, exercising optional-prop presence/absence handling across JSON and binary at scale.',
    mutateEncoder: () => {
      type N = number;
      // prettier-ignore
      type ManyOptional = {
          a0?: N; a1?: N; a2?: N; a3?: N; a4?: N; a5?: N; a6?: N; a7?: N;
          a8?: N; a9?: N; a10?: N; a11?: N; a12?: N; a13?: N; a14?: N; a15?: N;
          b0?: N; b1?: N; b2?: N; b3?: N; b4?: N; b5?: N; b6?: N; b7?: N;
          b8?: N; b9?: N; b10?: N; b11?: N; b12?: N; b13?: N; b14?: N; b15?: N;
        };
      return createJsonEncoderFn<ManyOptional>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      type N = number;
      // prettier-ignore
      type ManyOptional = {
          a0?: N; a1?: N; a2?: N; a3?: N; a4?: N; a5?: N; a6?: N; a7?: N;
          a8?: N; a9?: N; a10?: N; a11?: N; a12?: N; a13?: N; a14?: N; a15?: N;
          b0?: N; b1?: N; b2?: N; b3?: N; b4?: N; b5?: N; b6?: N; b7?: N;
          b8?: N; b9?: N; b10?: N; b11?: N; b12?: N; b13?: N; b14?: N; b15?: N;
        };
      return createJsonEncoderFn<ManyOptional>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      type N = number;
      // prettier-ignore
      type ManyOptional = {
          a0?: N; a1?: N; a2?: N; a3?: N; a4?: N; a5?: N; a6?: N; a7?: N;
          a8?: N; a9?: N; a10?: N; a11?: N; a12?: N; a13?: N; a14?: N; a15?: N;
          b0?: N; b1?: N; b2?: N; b3?: N; b4?: N; b5?: N; b6?: N; b7?: N;
          b8?: N; b9?: N; b10?: N; b11?: N; b12?: N; b13?: N; b14?: N; b15?: N;
        };
      return createJsonEncoderFn<ManyOptional>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      type N = number;
      // prettier-ignore
      type ManyOptional = {
          a0?: N; a1?: N; a2?: N; a3?: N; a4?: N; a5?: N; a6?: N; a7?: N;
          a8?: N; a9?: N; a10?: N; a11?: N; a12?: N; a13?: N; a14?: N; a15?: N;
          b0?: N; b1?: N; b2?: N; b3?: N; b4?: N; b5?: N; b6?: N; b7?: N;
          b8?: N; b9?: N; b10?: N; b11?: N; b12?: N; b13?: N; b14?: N; b15?: N;
        };
      return createJsonEncoderFn<ManyOptional>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      type N = number;
      // prettier-ignore
      type ManyOptional = {
          a0?: N; a1?: N; a2?: N; a3?: N; a4?: N; a5?: N; a6?: N; a7?: N;
          a8?: N; a9?: N; a10?: N; a11?: N; a12?: N; a13?: N; a14?: N; a15?: N;
          b0?: N; b1?: N; b2?: N; b3?: N; b4?: N; b5?: N; b6?: N; b7?: N;
          b8?: N; b9?: N; b10?: N; b11?: N; b12?: N; b13?: N; b14?: N; b15?: N;
        };
      return createJsonDecoderFn<ManyOptional>();
    },
    preserveDecoder: () => {
      type N = number;
      // prettier-ignore
      type ManyOptional = {
          a0?: N; a1?: N; a2?: N; a3?: N; a4?: N; a5?: N; a6?: N; a7?: N;
          a8?: N; a9?: N; a10?: N; a11?: N; a12?: N; a13?: N; a14?: N; a15?: N;
          b0?: N; b1?: N; b2?: N; b3?: N; b4?: N; b5?: N; b6?: N; b7?: N;
          b8?: N; b9?: N; b10?: N; b11?: N; b12?: N; b13?: N; b14?: N; b15?: N;
        };
      return createJsonDecoderFn<ManyOptional>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      type N = number;
      // prettier-ignore
      type ManyOptional = {
          a0?: N; a1?: N; a2?: N; a3?: N; a4?: N; a5?: N; a6?: N; a7?: N;
          a8?: N; a9?: N; a10?: N; a11?: N; a12?: N; a13?: N; a14?: N; a15?: N;
          b0?: N; b1?: N; b2?: N; b3?: N; b4?: N; b5?: N; b6?: N; b7?: N;
          b8?: N; b9?: N; b10?: N; b11?: N; b12?: N; b13?: N; b14?: N; b15?: N;
        };
      return createJsonDecoderFn<ManyOptional>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      type N = number;
      // prettier-ignore
      type ManyOptional = {
          a0?: N; a1?: N; a2?: N; a3?: N; a4?: N; a5?: N; a6?: N; a7?: N;
          a8?: N; a9?: N; a10?: N; a11?: N; a12?: N; a13?: N; a14?: N; a15?: N;
          b0?: N; b1?: N; b2?: N; b3?: N; b4?: N; b5?: N; b6?: N; b7?: N;
          b8?: N; b9?: N; b10?: N; b11?: N; b12?: N; b13?: N; b14?: N; b15?: N;
        };
      return createBinaryEncoderFn<ManyOptional>();
    },
    binaryDecoder: () => {
      type N = number;
      // prettier-ignore
      type ManyOptional = {
          a0?: N; a1?: N; a2?: N; a3?: N; a4?: N; a5?: N; a6?: N; a7?: N;
          a8?: N; a9?: N; a10?: N; a11?: N; a12?: N; a13?: N; a14?: N; a15?: N;
          b0?: N; b1?: N; b2?: N; b3?: N; b4?: N; b5?: N; b6?: N; b7?: N;
          b8?: N; b9?: N; b10?: N; b11?: N; b12?: N; b13?: N; b14?: N; b15?: N;
        };
      return createBinaryDecoderFn<ManyOptional>();
    },
    schemaEncoder: () => {
      const n = () => RT.optional(TF.number());
      return createJsonEncoderFn(
        RT.object({
          a0: n(),
          a1: n(),
          a2: n(),
          a3: n(),
          a4: n(),
          a5: n(),
          a6: n(),
          a7: n(),
          a8: n(),
          a9: n(),
          a10: n(),
          a11: n(),
          a12: n(),
          a13: n(),
          a14: n(),
          a15: n(),
          b0: n(),
          b1: n(),
          b2: n(),
          b3: n(),
          b4: n(),
          b5: n(),
          b6: n(),
          b7: n(),
          b8: n(),
          b9: n(),
          b10: n(),
          b11: n(),
          b12: n(),
          b13: n(),
          b14: n(),
          b15: n(),
        })
      );
    },
    schemaDecoder: () => {
      const n = () => RT.optional(TF.number());
      return createJsonDecoderFn(
        RT.object({
          a0: n(),
          a1: n(),
          a2: n(),
          a3: n(),
          a4: n(),
          a5: n(),
          a6: n(),
          a7: n(),
          a8: n(),
          a9: n(),
          a10: n(),
          a11: n(),
          a12: n(),
          a13: n(),
          a14: n(),
          a15: n(),
          b0: n(),
          b1: n(),
          b2: n(),
          b3: n(),
          b4: n(),
          b5: n(),
          b6: n(),
          b7: n(),
          b8: n(),
          b9: n(),
          b10: n(),
          b11: n(),
          b12: n(),
          b13: n(),
          b14: n(),
          b15: n(),
        })
      );
    },
    schemaBinaryEncoder: () => {
      const n = () => RT.optional(TF.number());
      return createBinaryEncoderFn(
        RT.object({
          a0: n(),
          a1: n(),
          a2: n(),
          a3: n(),
          a4: n(),
          a5: n(),
          a6: n(),
          a7: n(),
          a8: n(),
          a9: n(),
          a10: n(),
          a11: n(),
          a12: n(),
          a13: n(),
          a14: n(),
          a15: n(),
          b0: n(),
          b1: n(),
          b2: n(),
          b3: n(),
          b4: n(),
          b5: n(),
          b6: n(),
          b7: n(),
          b8: n(),
          b9: n(),
          b10: n(),
          b11: n(),
          b12: n(),
          b13: n(),
          b14: n(),
          b15: n(),
        })
      );
    },
    schemaBinaryDecoder: () => {
      const n = () => RT.optional(TF.number());
      return createBinaryDecoderFn(
        RT.object({
          a0: n(),
          a1: n(),
          a2: n(),
          a3: n(),
          a4: n(),
          a5: n(),
          a6: n(),
          a7: n(),
          a8: n(),
          a9: n(),
          a10: n(),
          a11: n(),
          a12: n(),
          a13: n(),
          a14: n(),
          a15: n(),
          b0: n(),
          b1: n(),
          b2: n(),
          b3: n(),
          b4: n(),
          b5: n(),
          b6: n(),
          b7: n(),
          b8: n(),
          b9: n(),
          b10: n(),
          b11: n(),
          b12: n(),
          b13: n(),
          b14: n(),
          b15: n(),
        })
      );
    },
    getTestData: () => ({
      values: [{a0: 0, a1: 1, b0: 16, a8: 8, b7: 23, b15: 31}, {a0: 0, b8: 24}, {}],
    }),
  },
  class: {
    title: 'Class',
    description:
      'Class instance with string, number, and Date data fields plus a getFullName() method that serializes its data fields only and decodes to a plain object, dropping the method and losing the prototype.',
    serializeNotes: [
      'Class instance decodes to a plain object (asymmetric deserializedValues): the getFullName method is non-serializable and dropped, the instance prototype is not restored.',
      'The startDate Date field round-trips via ISO string.',
    ],
    mutateEncoder: () => {
      class MySerializableClass {
        name: string;
        surname: string;
        id: number;
        startDate: Date;
        constructor() {
          this.name = 'John';
          this.surname = 'Doe';
          this.id = 0;
          this.startDate = new Date('2000-08-06T02:13:00.000Z');
        }
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createJsonEncoderFn<MySerializableClass>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      class MySerializableClass {
        name: string;
        surname: string;
        id: number;
        startDate: Date;
        constructor() {
          this.name = 'John';
          this.surname = 'Doe';
          this.id = 0;
          this.startDate = new Date('2000-08-06T02:13:00.000Z');
        }
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createJsonEncoderFn<MySerializableClass>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      class MySerializableClass {
        name: string;
        surname: string;
        id: number;
        startDate: Date;
        constructor() {
          this.name = 'John';
          this.surname = 'Doe';
          this.id = 0;
          this.startDate = new Date('2000-08-06T02:13:00.000Z');
        }
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createJsonEncoderFn<MySerializableClass>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      class MySerializableClass {
        name: string;
        surname: string;
        id: number;
        startDate: Date;
        constructor() {
          this.name = 'John';
          this.surname = 'Doe';
          this.id = 0;
          this.startDate = new Date('2000-08-06T02:13:00.000Z');
        }
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createJsonEncoderFn<MySerializableClass>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      class MySerializableClass {
        name: string;
        surname: string;
        id: number;
        startDate: Date;
        constructor() {
          this.name = 'John';
          this.surname = 'Doe';
          this.id = 0;
          this.startDate = new Date('2000-08-06T02:13:00.000Z');
        }
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createJsonDecoderFn<MySerializableClass>();
    },
    preserveDecoder: () => {
      class MySerializableClass {
        name: string;
        surname: string;
        id: number;
        startDate: Date;
        constructor() {
          this.name = 'John';
          this.surname = 'Doe';
          this.id = 0;
          this.startDate = new Date('2000-08-06T02:13:00.000Z');
        }
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createJsonDecoderFn<MySerializableClass>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      class MySerializableClass {
        name: string;
        surname: string;
        id: number;
        startDate: Date;
        constructor() {
          this.name = 'John';
          this.surname = 'Doe';
          this.id = 0;
          this.startDate = new Date('2000-08-06T02:13:00.000Z');
        }
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createJsonDecoderFn<MySerializableClass>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      class MySerializableClass {
        name: string;
        surname: string;
        id: number;
        startDate: Date;
        constructor() {
          this.name = 'John';
          this.surname = 'Doe';
          this.id = 0;
          this.startDate = new Date('2000-08-06T02:13:00.000Z');
        }
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createBinaryEncoderFn<MySerializableClass>();
    },
    binaryDecoder: () => {
      class MySerializableClass {
        name: string;
        surname: string;
        id: number;
        startDate: Date;
        constructor() {
          this.name = 'John';
          this.surname = 'Doe';
          this.id = 0;
          this.startDate = new Date('2000-08-06T02:13:00.000Z');
        }
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createBinaryDecoderFn<MySerializableClass>();
    },
    schemaEncoder: () => {
      class MySerializableClass {
        name: string;
        surname: string;
        id: number;
        startDate: Date;
        constructor() {
          this.name = 'John';
          this.surname = 'Doe';
          this.id = 0;
          this.startDate = new Date('2000-08-06T02:13:00.000Z');
        }
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createJsonEncoderFn(RT.classType(MySerializableClass));
    },
    schemaDecoder: () => {
      class MySerializableClass {
        name: string;
        surname: string;
        id: number;
        startDate: Date;
        constructor() {
          this.name = 'John';
          this.surname = 'Doe';
          this.id = 0;
          this.startDate = new Date('2000-08-06T02:13:00.000Z');
        }
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createJsonDecoderFn(RT.classType(MySerializableClass));
    },
    schemaBinaryEncoder: () => {
      class MySerializableClass {
        name: string;
        surname: string;
        id: number;
        startDate: Date;
        constructor() {
          this.name = 'John';
          this.surname = 'Doe';
          this.id = 0;
          this.startDate = new Date('2000-08-06T02:13:00.000Z');
        }
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createBinaryEncoderFn(RT.classType(MySerializableClass));
    },
    schemaBinaryDecoder: () => {
      class MySerializableClass {
        name: string;
        surname: string;
        id: number;
        startDate: Date;
        constructor() {
          this.name = 'John';
          this.surname = 'Doe';
          this.id = 0;
          this.startDate = new Date('2000-08-06T02:13:00.000Z');
        }
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createBinaryDecoderFn(RT.classType(MySerializableClass));
    },
    getTestData: () => {
      class MySerializableClass {
        name: string;
        surname: string;
        id: number;
        startDate: Date;
        constructor() {
          this.name = 'John';
          this.surname = 'Doe';
          this.id = 0;
          this.startDate = new Date('2000-08-06T02:13:00.000Z');
        }
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      const item = new MySerializableClass();
      const restored = {name: item.name, surname: item.surname, id: item.id, startDate: item.startDate};
      return {values: [new MySerializableClass()], deserializedValues: [restored]};
    },
  },
  extended_class: {
    title: 'Extended class',
    description:
      'Subclass instance whose serializable shape combines its own extendedProp with the inherited baseProp, confirming inherited string fields are walked and round-tripped alongside own fields.',
    serializeNotes:
      'Inherited baseProp is included in the projection; both fields are plain strings so the round-trip is symmetric (no deserializedValues override).',
    mutateEncoder: () => {
      class BaseClass {
        baseProp: string = 'base';
      }
      class ExtendedClass extends BaseClass {
        extendedProp: string = 'extended';
      }
      return createJsonEncoderFn<ExtendedClass>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      class BaseClass {
        baseProp: string = 'base';
      }
      class ExtendedClass extends BaseClass {
        extendedProp: string = 'extended';
      }
      return createJsonEncoderFn<ExtendedClass>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      class BaseClass {
        baseProp: string = 'base';
      }
      class ExtendedClass extends BaseClass {
        extendedProp: string = 'extended';
      }
      return createJsonEncoderFn<ExtendedClass>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      class BaseClass {
        baseProp: string = 'base';
      }
      class ExtendedClass extends BaseClass {
        extendedProp: string = 'extended';
      }
      return createJsonEncoderFn<ExtendedClass>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      class BaseClass {
        baseProp: string = 'base';
      }
      class ExtendedClass extends BaseClass {
        extendedProp: string = 'extended';
      }
      return createJsonDecoderFn<ExtendedClass>();
    },
    preserveDecoder: () => {
      class BaseClass {
        baseProp: string = 'base';
      }
      class ExtendedClass extends BaseClass {
        extendedProp: string = 'extended';
      }
      return createJsonDecoderFn<ExtendedClass>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      class BaseClass {
        baseProp: string = 'base';
      }
      class ExtendedClass extends BaseClass {
        extendedProp: string = 'extended';
      }
      return createJsonDecoderFn<ExtendedClass>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      class BaseClass {
        baseProp: string = 'base';
      }
      class ExtendedClass extends BaseClass {
        extendedProp: string = 'extended';
      }
      return createBinaryEncoderFn<ExtendedClass>();
    },
    binaryDecoder: () => {
      class BaseClass {
        baseProp: string = 'base';
      }
      class ExtendedClass extends BaseClass {
        extendedProp: string = 'extended';
      }
      return createBinaryDecoderFn<ExtendedClass>();
    },
    schemaEncoder: () => {
      class BaseClass {
        baseProp: string = 'base';
      }
      class ExtendedClass extends BaseClass {
        extendedProp: string = 'extended';
      }
      return createJsonEncoderFn(RT.classType(ExtendedClass));
    },
    schemaDecoder: () => {
      class BaseClass {
        baseProp: string = 'base';
      }
      class ExtendedClass extends BaseClass {
        extendedProp: string = 'extended';
      }
      return createJsonDecoderFn(RT.classType(ExtendedClass));
    },
    schemaBinaryEncoder: () => {
      class BaseClass {
        baseProp: string = 'base';
      }
      class ExtendedClass extends BaseClass {
        extendedProp: string = 'extended';
      }
      return createBinaryEncoderFn(RT.classType(ExtendedClass));
    },
    schemaBinaryDecoder: () => {
      class BaseClass {
        baseProp: string = 'base';
      }
      class ExtendedClass extends BaseClass {
        extendedProp: string = 'extended';
      }
      return createBinaryDecoderFn(RT.classType(ExtendedClass));
    },
    getTestData: () => {
      class BaseClass {
        baseProp: string = 'base';
      }
      class ExtendedClass extends BaseClass {
        extendedProp: string = 'extended';
      }
      return {values: [new ExtendedClass()]};
    },
  },
  non_serializable_class: {
    title: 'Non-serializable class',
    description:
      'Class instance round-trips to a plain object: the method is dropped and the instance prototype is not restored, while the data fields (including the startDate Date) survive.',
    serializeNotes: [
      'Class instance decodes to a plain object (asymmetric deserializedValues): the getFullName method is non-serializable and dropped, the instance prototype is not restored.',
      'The startDate Date field round-trips via ISO string.',
    ],
    mutateEncoder: () => {
      class NonSerializableClass {
        constructor(
          public name: string,
          public surname: string,
          public id: number,
          public startDate: Date
        ) {}
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createJsonEncoderFn<NonSerializableClass>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      class NonSerializableClass {
        constructor(
          public name: string,
          public surname: string,
          public id: number,
          public startDate: Date
        ) {}
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createJsonEncoderFn<NonSerializableClass>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      class NonSerializableClass {
        constructor(
          public name: string,
          public surname: string,
          public id: number,
          public startDate: Date
        ) {}
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createJsonEncoderFn<NonSerializableClass>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      class NonSerializableClass {
        constructor(
          public name: string,
          public surname: string,
          public id: number,
          public startDate: Date
        ) {}
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createJsonEncoderFn<NonSerializableClass>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      class NonSerializableClass {
        constructor(
          public name: string,
          public surname: string,
          public id: number,
          public startDate: Date
        ) {}
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createJsonDecoderFn<NonSerializableClass>();
    },
    preserveDecoder: () => {
      class NonSerializableClass {
        constructor(
          public name: string,
          public surname: string,
          public id: number,
          public startDate: Date
        ) {}
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createJsonDecoderFn<NonSerializableClass>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      class NonSerializableClass {
        constructor(
          public name: string,
          public surname: string,
          public id: number,
          public startDate: Date
        ) {}
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createJsonDecoderFn<NonSerializableClass>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      class NonSerializableClass {
        constructor(
          public name: string,
          public surname: string,
          public id: number,
          public startDate: Date
        ) {}
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createBinaryEncoderFn<NonSerializableClass>();
    },
    binaryDecoder: () => {
      class NonSerializableClass {
        constructor(
          public name: string,
          public surname: string,
          public id: number,
          public startDate: Date
        ) {}
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createBinaryDecoderFn<NonSerializableClass>();
    },
    schemaEncoder: () => {
      class NonSerializableClass {
        constructor(
          public name: string,
          public surname: string,
          public id: number,
          public startDate: Date
        ) {}
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createJsonEncoderFn(RT.classType(NonSerializableClass));
    },
    schemaDecoder: () => {
      class NonSerializableClass {
        constructor(
          public name: string,
          public surname: string,
          public id: number,
          public startDate: Date
        ) {}
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createJsonDecoderFn(RT.classType(NonSerializableClass));
    },
    schemaBinaryEncoder: () => {
      class NonSerializableClass {
        constructor(
          public name: string,
          public surname: string,
          public id: number,
          public startDate: Date
        ) {}
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createBinaryEncoderFn(RT.classType(NonSerializableClass));
    },
    schemaBinaryDecoder: () => {
      class NonSerializableClass {
        constructor(
          public name: string,
          public surname: string,
          public id: number,
          public startDate: Date
        ) {}
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createBinaryDecoderFn(RT.classType(NonSerializableClass));
    },
    getTestData: () => {
      class NonSerializableClass {
        constructor(
          public name: string,
          public surname: string,
          public id: number,
          public startDate: Date
        ) {}
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      const item = new NonSerializableClass('John', 'Doe', 0, new Date('2000-08-06T02:13:00.000Z'));
      const restored = {name: item.name, surname: item.surname, id: item.id, startDate: item.startDate};
      return {values: [item], deserializedValues: [restored]};
    },
  },
  undefined_in_object: {
    title: 'Undefined prop',
    description:
      'Object with an explicitly `undefined`-typed property alongside string and number fields, where the undefined-valued key is omitted from JSON output so the restored shape drops it (asymmetric deserializedValues).',
    serializeNotes: 'An undefined-valued property is omitted on the wire and absent after the round-trip.',
    mutateEncoder: () => createJsonEncoderFn<{a: string; b: number; c: undefined}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<{a: string; b: number; c: undefined}>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<{a: string; b: number; c: undefined}>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<{a: string; b: number; c: undefined}>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<{a: string; b: number; c: undefined}>(),
    preserveDecoder: () => createJsonDecoderFn<{a: string; b: number; c: undefined}>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<{a: string; b: number; c: undefined}>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<{a: string; b: number; c: undefined}>(),
    binaryDecoder: () => createBinaryDecoderFn<{a: string; b: number; c: undefined}>(),
    schemaEncoder: () => createJsonEncoderFn(RT.object({a: TF.string(), b: TF.number(), c: RT.literal(undefined)})),
    schemaDecoder: () => createJsonDecoderFn(RT.object({a: TF.string(), b: TF.number(), c: RT.literal(undefined)})),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.object({a: TF.string(), b: TF.number(), c: RT.literal(undefined)})),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.object({a: TF.string(), b: TF.number(), c: RT.literal(undefined)})),
    getTestData: () => ({
      values: [{a: 'hello', b: 42, c: undefined}],
      deserializedValues: [{a: 'hello', b: 42}],
    }),
  },
  optional_properties_order: {
    title: 'Optional props order',
    description:
      'Object with a required string followed by an optional string whose samples cover the optional prop present and absent, checking each round-trips without reordering or dropping the required field.',
    mutateEncoder: () => createJsonEncoderFn<{a: string; b?: string}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<{a: string; b?: string}>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<{a: string; b?: string}>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<{a: string; b?: string}>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<{a: string; b?: string}>(),
    preserveDecoder: () => createJsonDecoderFn<{a: string; b?: string}>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<{a: string; b?: string}>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<{a: string; b?: string}>(),
    binaryDecoder: () => createBinaryDecoderFn<{a: string; b?: string}>(),
    schemaEncoder: () => createJsonEncoderFn(RT.object({a: TF.string(), b: RT.optional(TF.string())})),
    schemaDecoder: () => createJsonDecoderFn(RT.object({a: TF.string(), b: RT.optional(TF.string())})),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.object({a: TF.string(), b: RT.optional(TF.string())})),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.object({a: TF.string(), b: RT.optional(TF.string())})),
    getTestData: () => ({values: [{a: 'helloA', b: 'helloB'}, {a: 'helloA'}]}),
  },
  all_optional_fields: {
    title: 'All optional fields',
    description:
      'Object where every property is an optional string, with samples covering both present, one present, and the empty object to verify a fully-optional shape round-trips with any subset of keys.',
    mutateEncoder: () => createJsonEncoderFn<{a?: string; b?: string}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<{a?: string; b?: string}>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<{a?: string; b?: string}>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<{a?: string; b?: string}>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<{a?: string; b?: string}>(),
    preserveDecoder: () => createJsonDecoderFn<{a?: string; b?: string}>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<{a?: string; b?: string}>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<{a?: string; b?: string}>(),
    binaryDecoder: () => createBinaryDecoderFn<{a?: string; b?: string}>(),
    schemaEncoder: () => createJsonEncoderFn(RT.object({a: RT.optional(TF.string()), b: RT.optional(TF.string())})),
    schemaDecoder: () => createJsonDecoderFn(RT.object({a: RT.optional(TF.string()), b: RT.optional(TF.string())})),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.object({a: RT.optional(TF.string()), b: RT.optional(TF.string())})),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.object({a: RT.optional(TF.string()), b: RT.optional(TF.string())})),
    getTestData: () => ({values: [{a: 'helloA', b: 'helloB'}, {a: 'helloA'}, {}]}),
  },
  extras_passthrough_unsafe: {
    title: 'Extras passthrough',
    description:
      'Canonical baseline for the unsafe `prepareForJson + JSON.stringify` path where declared children get transformed while structural extras (top-level and nested-in-declared-composites) pass through unchanged, mirroring the `03JsonObjects.spec.ts` strip-extras case whose strip expectation is commented out, with the safe `stripUnknownKeys` divergence exercised in EXTRA_PARAMS.',
    serializeNotes: [
      'Strategy split: `mutate` walks declared children only and lets `JSON.stringify` pass undeclared extras through, so `getTestData` round-trips them unchanged; `clone` and `direct` are shape-derived and strip extras pre-serialise, so `getTestDataForStringify` restores the declared-only shape (`deserializedValues` drops the extras).',
      'Decode split: the `preserve` decoder passes undeclared keys through to the restored value, while the default `strip` decoder nukes them to `undefined`.',
    ],
    mutateEncoder: () =>
      createJsonEncoderFn<{
        startDate: Date;
        quantity: number;
        name: string;
        nullValue: null;
        stringArray: string[];
        bigInt: bigint;
        optionalString?: string;
        "weird prop name \n?>'\\\t\r": string;
        deep: {a: string; b: number};
        '?other weird p': {c: string; d: number};
      }>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () =>
      createJsonEncoderFn<{
        startDate: Date;
        quantity: number;
        name: string;
        nullValue: null;
        stringArray: string[];
        bigInt: bigint;
        optionalString?: string;
        "weird prop name \n?>'\\\t\r": string;
        deep: {a: string; b: number};
        '?other weird p': {c: string; d: number};
      }>(undefined, {strategy: 'clone'}),
    directEncoder: () =>
      createJsonEncoderFn<{
        startDate: Date;
        quantity: number;
        name: string;
        nullValue: null;
        stringArray: string[];
        bigInt: bigint;
        optionalString?: string;
        "weird prop name \n?>'\\\t\r": string;
        deep: {a: string; b: number};
        '?other weird p': {c: string; d: number};
      }>(undefined, {strategy: 'direct'}),
    compactEncoder: () =>
      createJsonEncoderFn<{
        startDate: Date;
        quantity: number;
        name: string;
        nullValue: null;
        stringArray: string[];
        bigInt: bigint;
        optionalString?: string;
        "weird prop name \n?>'\\\t\r": string;
        deep: {a: string; b: number};
        '?other weird p': {c: string; d: number};
      }>(undefined, {strategy: 'compact'}),
    stripDecoder: () =>
      createJsonDecoderFn<{
        startDate: Date;
        quantity: number;
        name: string;
        nullValue: null;
        stringArray: string[];
        bigInt: bigint;
        optionalString?: string;
        "weird prop name \n?>'\\\t\r": string;
        deep: {a: string; b: number};
        '?other weird p': {c: string; d: number};
      }>(),
    preserveDecoder: () =>
      createJsonDecoderFn<{
        startDate: Date;
        quantity: number;
        name: string;
        nullValue: null;
        stringArray: string[];
        bigInt: bigint;
        optionalString?: string;
        "weird prop name \n?>'\\\t\r": string;
        deep: {a: string; b: number};
        '?other weird p': {c: string; d: number};
      }>(undefined, {strategy: 'preserve'}),
    compactDecoder: () =>
      createJsonDecoderFn<{
        startDate: Date;
        quantity: number;
        name: string;
        nullValue: null;
        stringArray: string[];
        bigInt: bigint;
        optionalString?: string;
        "weird prop name \n?>'\\\t\r": string;
        deep: {a: string; b: number};
        '?other weird p': {c: string; d: number};
      }>(undefined, {strategy: 'compact'}),
    binaryEncoder: () =>
      createBinaryEncoderFn<{
        startDate: Date;
        quantity: number;
        name: string;
        nullValue: null;
        stringArray: string[];
        bigInt: bigint;
        optionalString?: string;
        "weird prop name \n?>'\\\t\r": string;
        deep: {a: string; b: number};
        '?other weird p': {c: string; d: number};
      }>(),
    binaryDecoder: () =>
      createBinaryDecoderFn<{
        startDate: Date;
        quantity: number;
        name: string;
        nullValue: null;
        stringArray: string[];
        bigInt: bigint;
        optionalString?: string;
        "weird prop name \n?>'\\\t\r": string;
        deep: {a: string; b: number};
        '?other weird p': {c: string; d: number};
      }>(),
    schemaEncoder: () =>
      createJsonEncoderFn(
        RT.object({
          startDate: TF.date(),
          quantity: TF.number(),
          name: TF.string(),
          nullValue: RT.literal(null),
          stringArray: RT.array(TF.string()),
          bigInt: TF.bigInt(),
          optionalString: RT.optional(TF.string()),
          "weird prop name \n?>'\\\t\r": TF.string(),
          deep: RT.object({a: TF.string(), b: TF.number()}),
          '?other weird p': RT.object({c: TF.string(), d: TF.number()}),
        })
      ),
    schemaDecoder: () =>
      createJsonDecoderFn(
        RT.object({
          startDate: TF.date(),
          quantity: TF.number(),
          name: TF.string(),
          nullValue: RT.literal(null),
          stringArray: RT.array(TF.string()),
          bigInt: TF.bigInt(),
          optionalString: RT.optional(TF.string()),
          "weird prop name \n?>'\\\t\r": TF.string(),
          deep: RT.object({a: TF.string(), b: TF.number()}),
          '?other weird p': RT.object({c: TF.string(), d: TF.number()}),
        })
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoderFn(
        RT.object({
          startDate: TF.date(),
          quantity: TF.number(),
          name: TF.string(),
          nullValue: RT.literal(null),
          stringArray: RT.array(TF.string()),
          bigInt: TF.bigInt(),
          optionalString: RT.optional(TF.string()),
          "weird prop name \n?>'\\\t\r": TF.string(),
          deep: RT.object({a: TF.string(), b: TF.number()}),
          '?other weird p': RT.object({c: TF.string(), d: TF.number()}),
        })
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoderFn(
        RT.object({
          startDate: TF.date(),
          quantity: TF.number(),
          name: TF.string(),
          nullValue: RT.literal(null),
          stringArray: RT.array(TF.string()),
          bigInt: TF.bigInt(),
          optionalString: RT.optional(TF.string()),
          "weird prop name \n?>'\\\t\r": TF.string(),
          deep: RT.object({a: TF.string(), b: TF.number()}),
          '?other weird p': RT.object({c: TF.string(), d: TF.number()}),
        })
      ),
    getTestData: () => {
      const startDate = new Date('2000-08-06T02:13:00.000Z');
      const objectWithExtraParams = {
        startDate,
        quantity: 123,
        name: 'hello',
        nullValue: null,
        stringArray: ['a', 'b', 'c'],
        bigInt: BigInt(123),
        "weird prop name \n?>'\\\t\r": 'hello2',
        deep: {a: 'hello', b: 123, cExtra: true},
        '?other weird p': {c: 'hello', d: 123, eExtra: true},
        extraA: 'hello',
        extraB: 123,
        extraC: true,
      };
      // Unsafe path: extras preserved through round-trip — expected
      // result equals the input (no `deserializedValues` override).
      return {values: [objectWithExtraParams]};
    },
    getTestDataForStringify: () => {
      const startDate = new Date('2000-08-06T02:13:00.000Z');
      const objectWithExtraParams = {
        startDate,
        quantity: 123,
        name: 'hello',
        nullValue: null,
        stringArray: ['a', 'b', 'c'],
        bigInt: BigInt(123),
        "weird prop name \n?>'\\\t\r": 'hello2',
        deep: {a: 'hello', b: 123, cExtra: true},
        '?other weird p': {c: 'hello', d: 123, eExtra: true},
        extraA: 'hello',
        extraB: 123,
        extraC: true,
      };
      const noExtraParams = {
        startDate,
        quantity: 123,
        name: 'hello',
        nullValue: null,
        stringArray: ['a', 'b', 'c'],
        bigInt: BigInt(123),
        "weird prop name \n?>'\\\t\r": 'hello2',
        deep: {a: 'hello', b: 123},
        '?other weird p': {c: 'hello', d: 123},
      };
      // Safe path: extras are stripped before serialise, so the
      // round-trip restores the declared-only shape.
      return {values: [objectWithExtraParams], deserializedValues: [noExtraParams]};
    },
  },
  interface_circular: {
    title: 'Circular interface',
    description:
      'Self-referential interface with an optional `child` of its own type, exercising (de)serialization of a recursively-defined object across a finite nested tree.',
    mutateEncoder: () => {
      interface ICircular {
        name: string;
        child?: ICircular;
      }
      return createJsonEncoderFn<ICircular>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      interface ICircular {
        name: string;
        child?: ICircular;
      }
      return createJsonEncoderFn<ICircular>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      interface ICircular {
        name: string;
        child?: ICircular;
      }
      return createJsonEncoderFn<ICircular>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      interface ICircular {
        name: string;
        child?: ICircular;
      }
      return createJsonEncoderFn<ICircular>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      interface ICircular {
        name: string;
        child?: ICircular;
      }
      return createJsonDecoderFn<ICircular>();
    },
    preserveDecoder: () => {
      interface ICircular {
        name: string;
        child?: ICircular;
      }
      return createJsonDecoderFn<ICircular>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      interface ICircular {
        name: string;
        child?: ICircular;
      }
      return createJsonDecoderFn<ICircular>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      interface ICircular {
        name: string;
        child?: ICircular;
      }
      return createBinaryEncoderFn<ICircular>();
    },
    binaryDecoder: () => {
      interface ICircular {
        name: string;
        child?: ICircular;
      }
      return createBinaryDecoderFn<ICircular>();
    },
    schemaEncoder: () => {
      const ic = RT.circular(RT.object({name: TF.string(), child: RT.optional(RT.self())}));
      return createJsonEncoderFn(ic);
    },
    schemaDecoder: () => {
      const ic = RT.circular(RT.object({name: TF.string(), child: RT.optional(RT.self())}));
      return createJsonDecoderFn(ic);
    },
    schemaBinaryEncoder: () => {
      const ic = RT.circular(RT.object({name: TF.string(), child: RT.optional(RT.self())}));
      return createBinaryEncoderFn(ic);
    },
    schemaBinaryDecoder: () => {
      const ic = RT.circular(RT.object({name: TF.string(), child: RT.optional(RT.self())}));
      return createBinaryDecoderFn(ic);
    },
    getTestData: () => ({
      values: [{name: 'leaf'}, {name: 'hello', child: {name: 'world'}}, {name: 'a', child: {name: 'b', child: {name: 'c'}}}],
    }),
  },
  interface_circular_array: {
    title: 'Circular array',
    description:
      'Self-referential interface that recurses through an optional array of its own type, with samples covering an empty children array and a populated one to exercise recursion via an array element.',
    mutateEncoder: () => {
      interface ICircularArray {
        name: string;
        children?: ICircularArray[];
      }
      return createJsonEncoderFn<ICircularArray>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      interface ICircularArray {
        name: string;
        children?: ICircularArray[];
      }
      return createJsonEncoderFn<ICircularArray>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      interface ICircularArray {
        name: string;
        children?: ICircularArray[];
      }
      return createJsonEncoderFn<ICircularArray>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      interface ICircularArray {
        name: string;
        children?: ICircularArray[];
      }
      return createJsonEncoderFn<ICircularArray>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      interface ICircularArray {
        name: string;
        children?: ICircularArray[];
      }
      return createJsonDecoderFn<ICircularArray>();
    },
    preserveDecoder: () => {
      interface ICircularArray {
        name: string;
        children?: ICircularArray[];
      }
      return createJsonDecoderFn<ICircularArray>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      interface ICircularArray {
        name: string;
        children?: ICircularArray[];
      }
      return createJsonDecoderFn<ICircularArray>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      interface ICircularArray {
        name: string;
        children?: ICircularArray[];
      }
      return createBinaryEncoderFn<ICircularArray>();
    },
    binaryDecoder: () => {
      interface ICircularArray {
        name: string;
        children?: ICircularArray[];
      }
      return createBinaryDecoderFn<ICircularArray>();
    },
    schemaEncoder: () => {
      const ica = RT.circular(RT.object({name: TF.string(), children: RT.optional(RT.array(RT.self()))}));
      return createJsonEncoderFn(ica);
    },
    schemaDecoder: () => {
      const ica = RT.circular(RT.object({name: TF.string(), children: RT.optional(RT.array(RT.self()))}));
      return createJsonDecoderFn(ica);
    },
    schemaBinaryEncoder: () => {
      const ica = RT.circular(RT.object({name: TF.string(), children: RT.optional(RT.array(RT.self()))}));
      return createBinaryEncoderFn(ica);
    },
    schemaBinaryDecoder: () => {
      const ica = RT.circular(RT.object({name: TF.string(), children: RT.optional(RT.array(RT.self()))}));
      return createBinaryDecoderFn(ica);
    },
    getTestData: () => ({
      values: [
        {name: 'hello', children: []},
        {name: 'hello', children: [{name: 'world'}]},
      ],
    }),
  },
  interface_circular_deep: {
    title: 'Circular deep',
    description:
      'Self-referential interface whose recursion is buried inside a nested `embedded` object with a bigint field at each level, exercising deep recursion plus bigint round-trip at multiple depths.',
    serializeNotes: 'Each level carries a bigint that round-trips through both JSON and binary.',
    mutateEncoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {
          hello: string;
          child?: ICircularDeep;
        };
      }
      return createJsonEncoderFn<ICircularDeep>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {
          hello: string;
          child?: ICircularDeep;
        };
      }
      return createJsonEncoderFn<ICircularDeep>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {
          hello: string;
          child?: ICircularDeep;
        };
      }
      return createJsonEncoderFn<ICircularDeep>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {
          hello: string;
          child?: ICircularDeep;
        };
      }
      return createJsonEncoderFn<ICircularDeep>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {
          hello: string;
          child?: ICircularDeep;
        };
      }
      return createJsonDecoderFn<ICircularDeep>();
    },
    preserveDecoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {
          hello: string;
          child?: ICircularDeep;
        };
      }
      return createJsonDecoderFn<ICircularDeep>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {
          hello: string;
          child?: ICircularDeep;
        };
      }
      return createJsonDecoderFn<ICircularDeep>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {
          hello: string;
          child?: ICircularDeep;
        };
      }
      return createBinaryEncoderFn<ICircularDeep>();
    },
    binaryDecoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {
          hello: string;
          child?: ICircularDeep;
        };
      }
      return createBinaryDecoderFn<ICircularDeep>();
    },
    schemaEncoder: () => {
      const icd = RT.circular(
        RT.object({name: TF.string(), big: TF.bigInt(), embedded: RT.object({hello: TF.string(), child: RT.optional(RT.self())})})
      );
      return createJsonEncoderFn(icd);
    },
    schemaDecoder: () => {
      const icd = RT.circular(
        RT.object({name: TF.string(), big: TF.bigInt(), embedded: RT.object({hello: TF.string(), child: RT.optional(RT.self())})})
      );
      return createJsonDecoderFn(icd);
    },
    schemaBinaryEncoder: () => {
      const icd = RT.circular(
        RT.object({name: TF.string(), big: TF.bigInt(), embedded: RT.object({hello: TF.string(), child: RT.optional(RT.self())})})
      );
      return createBinaryEncoderFn(icd);
    },
    schemaBinaryDecoder: () => {
      const icd = RT.circular(
        RT.object({name: TF.string(), big: TF.bigInt(), embedded: RT.object({hello: TF.string(), child: RT.optional(RT.self())})})
      );
      return createBinaryDecoderFn(icd);
    },
    getTestData: () => ({
      values: [
        {name: 'hello', big: 1n, embedded: {hello: 'world'}},
        {
          name: 'hello',
          big: 2n,
          embedded: {hello: 'world', child: {name: 'world1', big: 3n, embedded: {hello: 'world2'}}},
        },
      ],
    }),
  },
  interface_root_not_circular: {
    title: 'Non-circular root',
    description:
      'Non-recursive root with literal `isRoot: true` and a circular `ciChild` that wraps a deeply-recursive bigint-bearing member, confirming a non-circular root resolves correctly when it embeds a circular type.',
    serializeNotes: 'The nested ciChild carries a bigint at each level that round-trips through both JSON and binary.',
    mutateEncoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      return createJsonEncoderFn<RootNotCircular>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      return createJsonEncoderFn<RootNotCircular>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      return createJsonEncoderFn<RootNotCircular>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      return createJsonEncoderFn<RootNotCircular>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      return createJsonDecoderFn<RootNotCircular>();
    },
    preserveDecoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      return createJsonDecoderFn<RootNotCircular>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      return createJsonDecoderFn<RootNotCircular>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      return createBinaryEncoderFn<RootNotCircular>();
    },
    binaryDecoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      return createBinaryDecoderFn<RootNotCircular>();
    },
    schemaEncoder: () => {
      const icd = RT.circular(
        RT.object({name: TF.string(), big: TF.bigInt(), embedded: RT.object({hello: TF.string(), child: RT.optional(RT.self())})})
      );
      const root = RT.object({isRoot: RT.literal(true), ciChild: icd});
      return createJsonEncoderFn(root);
    },
    schemaDecoder: () => {
      const icd = RT.circular(
        RT.object({name: TF.string(), big: TF.bigInt(), embedded: RT.object({hello: TF.string(), child: RT.optional(RT.self())})})
      );
      const root = RT.object({isRoot: RT.literal(true), ciChild: icd});
      return createJsonDecoderFn(root);
    },
    schemaBinaryEncoder: () => {
      const icd = RT.circular(
        RT.object({name: TF.string(), big: TF.bigInt(), embedded: RT.object({hello: TF.string(), child: RT.optional(RT.self())})})
      );
      const root = RT.object({isRoot: RT.literal(true), ciChild: icd});
      return createBinaryEncoderFn(root);
    },
    schemaBinaryDecoder: () => {
      const icd = RT.circular(
        RT.object({name: TF.string(), big: TF.bigInt(), embedded: RT.object({hello: TF.string(), child: RT.optional(RT.self())})})
      );
      const root = RT.object({isRoot: RT.literal(true), ciChild: icd});
      return createBinaryDecoderFn(root);
    },
    getTestData: () => ({
      values: [
        {isRoot: true, ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}}},
        {
          isRoot: true,
          ciChild: {
            name: 'hello',
            big: 2n,
            embedded: {hello: 'world', child: {name: 'world1', big: 2n, embedded: {hello: 'world2'}}},
          },
        },
      ],
    }),
  },
  interface_multiple_circular: {
    title: 'Multiple circular',
    description:
      'Self-referential root that also references two further circular interfaces, a bigint-bearing tree and a Date-bearing one, exercising several distinct circular types coexisting in one graph with Date and bigint fields.',
    serializeNotes: 'Mixes Date (ISO-string) and bigint round-trips across multiple self-referential interfaces.',
    mutateEncoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface ICircularDate {
        date: Date;
        month: number;
        year: number;
        embedded?: ICircularDate;
        deep?: ICircularDeep;
      }
      interface RootCircular {
        isRoot: true;
        ciChild: ICircularDeep;
        ciRoort?: RootCircular;
        ciDate: ICircularDate;
      }
      return createJsonEncoderFn<RootCircular>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface ICircularDate {
        date: Date;
        month: number;
        year: number;
        embedded?: ICircularDate;
        deep?: ICircularDeep;
      }
      interface RootCircular {
        isRoot: true;
        ciChild: ICircularDeep;
        ciRoort?: RootCircular;
        ciDate: ICircularDate;
      }
      return createJsonEncoderFn<RootCircular>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface ICircularDate {
        date: Date;
        month: number;
        year: number;
        embedded?: ICircularDate;
        deep?: ICircularDeep;
      }
      interface RootCircular {
        isRoot: true;
        ciChild: ICircularDeep;
        ciRoort?: RootCircular;
        ciDate: ICircularDate;
      }
      return createJsonEncoderFn<RootCircular>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface ICircularDate {
        date: Date;
        month: number;
        year: number;
        embedded?: ICircularDate;
        deep?: ICircularDeep;
      }
      interface RootCircular {
        isRoot: true;
        ciChild: ICircularDeep;
        ciRoort?: RootCircular;
        ciDate: ICircularDate;
      }
      return createJsonEncoderFn<RootCircular>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface ICircularDate {
        date: Date;
        month: number;
        year: number;
        embedded?: ICircularDate;
        deep?: ICircularDeep;
      }
      interface RootCircular {
        isRoot: true;
        ciChild: ICircularDeep;
        ciRoort?: RootCircular;
        ciDate: ICircularDate;
      }
      return createJsonDecoderFn<RootCircular>();
    },
    preserveDecoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface ICircularDate {
        date: Date;
        month: number;
        year: number;
        embedded?: ICircularDate;
        deep?: ICircularDeep;
      }
      interface RootCircular {
        isRoot: true;
        ciChild: ICircularDeep;
        ciRoort?: RootCircular;
        ciDate: ICircularDate;
      }
      return createJsonDecoderFn<RootCircular>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface ICircularDate {
        date: Date;
        month: number;
        year: number;
        embedded?: ICircularDate;
        deep?: ICircularDeep;
      }
      interface RootCircular {
        isRoot: true;
        ciChild: ICircularDeep;
        ciRoort?: RootCircular;
        ciDate: ICircularDate;
      }
      return createJsonDecoderFn<RootCircular>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface ICircularDate {
        date: Date;
        month: number;
        year: number;
        embedded?: ICircularDate;
        deep?: ICircularDeep;
      }
      interface RootCircular {
        isRoot: true;
        ciChild: ICircularDeep;
        ciRoort?: RootCircular;
        ciDate: ICircularDate;
      }
      return createBinaryEncoderFn<RootCircular>();
    },
    binaryDecoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface ICircularDate {
        date: Date;
        month: number;
        year: number;
        embedded?: ICircularDate;
        deep?: ICircularDeep;
      }
      interface RootCircular {
        isRoot: true;
        ciChild: ICircularDeep;
        ciRoort?: RootCircular;
        ciDate: ICircularDate;
      }
      return createBinaryDecoderFn<RootCircular>();
    },
    schemaEncoder: () => {
      const icd = RT.circular(
        RT.object({name: TF.string(), big: TF.bigInt(), embedded: RT.object({hello: TF.string(), child: RT.optional(RT.self())})})
      );
      const icDate = RT.circular(
        RT.object({
          date: TF.date(),
          month: TF.number(),
          year: TF.number(),
          embedded: RT.optional(RT.self()),
          deep: RT.optional(icd),
        })
      );
      const root = RT.circular(
        RT.object({isRoot: RT.literal(true), ciChild: icd, ciRoort: RT.optional(RT.self()), ciDate: icDate})
      );
      return createJsonEncoderFn(root);
    },
    schemaDecoder: () => {
      const icd = RT.circular(
        RT.object({name: TF.string(), big: TF.bigInt(), embedded: RT.object({hello: TF.string(), child: RT.optional(RT.self())})})
      );
      const icDate = RT.circular(
        RT.object({
          date: TF.date(),
          month: TF.number(),
          year: TF.number(),
          embedded: RT.optional(RT.self()),
          deep: RT.optional(icd),
        })
      );
      const root = RT.circular(
        RT.object({isRoot: RT.literal(true), ciChild: icd, ciRoort: RT.optional(RT.self()), ciDate: icDate})
      );
      return createJsonDecoderFn(root);
    },
    schemaBinaryEncoder: () => {
      const icd = RT.circular(
        RT.object({name: TF.string(), big: TF.bigInt(), embedded: RT.object({hello: TF.string(), child: RT.optional(RT.self())})})
      );
      const icDate = RT.circular(
        RT.object({
          date: TF.date(),
          month: TF.number(),
          year: TF.number(),
          embedded: RT.optional(RT.self()),
          deep: RT.optional(icd),
        })
      );
      const root = RT.circular(
        RT.object({isRoot: RT.literal(true), ciChild: icd, ciRoort: RT.optional(RT.self()), ciDate: icDate})
      );
      return createBinaryEncoderFn(root);
    },
    schemaBinaryDecoder: () => {
      const icd = RT.circular(
        RT.object({name: TF.string(), big: TF.bigInt(), embedded: RT.object({hello: TF.string(), child: RT.optional(RT.self())})})
      );
      const icDate = RT.circular(
        RT.object({
          date: TF.date(),
          month: TF.number(),
          year: TF.number(),
          embedded: RT.optional(RT.self()),
          deep: RT.optional(icd),
        })
      );
      const root = RT.circular(
        RT.object({isRoot: RT.literal(true), ciChild: icd, ciRoort: RT.optional(RT.self()), ciDate: icDate})
      );
      return createBinaryDecoderFn(root);
    },
    getTestData: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface ICircularDate {
        date: Date;
        month: number;
        year: number;
        embedded?: ICircularDate;
        deep?: ICircularDeep;
      }
      const ciDate: ICircularDate = {date: new Date('2000-08-06T02:13:00.000Z'), month: 1, year: 2021};
      // Exercise the so-far-unpopulated edges: the root self-reference
      // (`ciRoort`) and the ICircularDate recursion (`embedded`) plus its
      // cross-type `deep` ICircularDeep branch.
      const ciDateNested: ICircularDate = {
        date: new Date('2001-09-07T03:14:00.000Z'),
        month: 9,
        year: 2001,
        embedded: {date: new Date('2002-10-08T04:15:00.000Z'), month: 10, year: 2002},
        deep: {name: 'deepName', big: 7n, embedded: {hello: 'deepHello'}},
      };
      return {
        values: [
          {isRoot: true, ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}}, ciDate},
          {
            isRoot: true,
            ciChild: {
              name: 'hello',
              big: 1n,
              embedded: {hello: 'world', child: {name: 'world1', big: 1n, embedded: {hello: 'world2'}}},
            },
            ciDate,
          },
          {
            isRoot: true,
            ciChild: {name: 'outer', big: 3n, embedded: {hello: 'outerEmbedded'}},
            ciRoort: {isRoot: true, ciChild: {name: 'inner', big: 5n, embedded: {hello: 'innerEmbedded'}}, ciDate},
            ciDate: ciDateNested,
          },
        ],
      };
    },
  },
  interface_with_methods: {
    title: 'Interface with methods',
    description:
      'Interface with a string field plus a function-typed `methodProp` where the non-serializable method is dropped from the projection, so the restored shape keeps only the data field (asymmetric deserializedValues).',
    serializeNotes:
      'The function-typed property is non-serializable and silently dropped on the wire; only the string field round-trips.',
    mutateEncoder: () => {
      interface ObjectWithMethods {
        name: string;
        methodProp: () => any;
      }
      return createJsonEncoderFn<ObjectWithMethods>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      interface ObjectWithMethods {
        name: string;
        methodProp: () => any;
      }
      return createJsonEncoderFn<ObjectWithMethods>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      interface ObjectWithMethods {
        name: string;
        methodProp: () => any;
      }
      return createJsonEncoderFn<ObjectWithMethods>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      interface ObjectWithMethods {
        name: string;
        methodProp: () => any;
      }
      return createJsonEncoderFn<ObjectWithMethods>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      interface ObjectWithMethods {
        name: string;
        methodProp: () => any;
      }
      return createJsonDecoderFn<ObjectWithMethods>();
    },
    preserveDecoder: () => {
      interface ObjectWithMethods {
        name: string;
        methodProp: () => any;
      }
      return createJsonDecoderFn<ObjectWithMethods>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      interface ObjectWithMethods {
        name: string;
        methodProp: () => any;
      }
      return createJsonDecoderFn<ObjectWithMethods>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      interface ObjectWithMethods {
        name: string;
        methodProp: () => any;
      }
      return createBinaryEncoderFn<ObjectWithMethods>();
    },
    binaryDecoder: () => {
      interface ObjectWithMethods {
        name: string;
        methodProp: () => any;
      }
      return createBinaryDecoderFn<ObjectWithMethods>();
    },
    schemaEncoder: () => createJsonEncoderFn(RT.object({name: TF.string(), methodProp: RT.func([], RT.any())})),
    schemaDecoder: () => createJsonDecoderFn(RT.object({name: TF.string(), methodProp: RT.func([], RT.any())})),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.object({name: TF.string(), methodProp: RT.func([], RT.any())})),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.object({name: TF.string(), methodProp: RT.func([], RT.any())})),
    getTestData: () => {
      interface ObjectWithMethods {
        name: string;
        methodProp: () => any;
      }
      const objWithMethod = {
        name: 'John',
        methodProp() {
          return 'method result';
        },
      } as ObjectWithMethods;
      return {values: [objWithMethod], deserializedValues: [{name: 'John'}]};
    },
  },
  // Registered user classes reconstruct a real instance on decode (the class
  // serializer registry). Kept in the OBJECTS group (a class is object-like) so
  // they flow through every existing serialization consumer. Each thunk defines
  // the class + its registerClassSerializer INLINE (self-contained, per the
  // suite CLAUDE.md); value-first schema is 'not-supported' (a class is not an
  // `RT.*` model), so id-integrity skips them.
  registered_root_class: {
    title: 'Registered root class (Date + bigint + array)',
    serializeNotes:
      'A registered `Ledger` class round-trips its declared props through every strategy and reconstructs a real instance; Date rides its ISO arm and bigint its decimal-string arm. Value-first schema not-supported (a class is not an `RT.*` model).',
    mutateEncoder: () => {
      class Ledger {
        constructor(
          public owner: string,
          public opened: Date,
          public balance: bigint,
          public tags: string[]
        ) {}
        summary(): string {
          return `${this.owner}:${this.balance}`;
        }
      }
      registerClassSerializer(Ledger, {deserialize: (d) => new Ledger(d.owner, d.opened, d.balance, d.tags)});
      return createJsonEncoderFn<Ledger>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      class Ledger {
        constructor(
          public owner: string,
          public opened: Date,
          public balance: bigint,
          public tags: string[]
        ) {}
        summary(): string {
          return `${this.owner}:${this.balance}`;
        }
      }
      registerClassSerializer(Ledger, {deserialize: (d) => new Ledger(d.owner, d.opened, d.balance, d.tags)});
      return createJsonEncoderFn<Ledger>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      class Ledger {
        constructor(
          public owner: string,
          public opened: Date,
          public balance: bigint,
          public tags: string[]
        ) {}
        summary(): string {
          return `${this.owner}:${this.balance}`;
        }
      }
      registerClassSerializer(Ledger, {deserialize: (d) => new Ledger(d.owner, d.opened, d.balance, d.tags)});
      return createJsonEncoderFn<Ledger>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      class Ledger {
        constructor(
          public owner: string,
          public opened: Date,
          public balance: bigint,
          public tags: string[]
        ) {}
        summary(): string {
          return `${this.owner}:${this.balance}`;
        }
      }
      registerClassSerializer(Ledger, {deserialize: (d) => new Ledger(d.owner, d.opened, d.balance, d.tags)});
      return createJsonEncoderFn<Ledger>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      class Ledger {
        constructor(
          public owner: string,
          public opened: Date,
          public balance: bigint,
          public tags: string[]
        ) {}
        summary(): string {
          return `${this.owner}:${this.balance}`;
        }
      }
      registerClassSerializer(Ledger, {deserialize: (d) => new Ledger(d.owner, d.opened, d.balance, d.tags)});
      return createJsonDecoderFn<Ledger>();
    },
    preserveDecoder: () => {
      class Ledger {
        constructor(
          public owner: string,
          public opened: Date,
          public balance: bigint,
          public tags: string[]
        ) {}
        summary(): string {
          return `${this.owner}:${this.balance}`;
        }
      }
      registerClassSerializer(Ledger, {deserialize: (d) => new Ledger(d.owner, d.opened, d.balance, d.tags)});
      return createJsonDecoderFn<Ledger>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      class Ledger {
        constructor(
          public owner: string,
          public opened: Date,
          public balance: bigint,
          public tags: string[]
        ) {}
        summary(): string {
          return `${this.owner}:${this.balance}`;
        }
      }
      registerClassSerializer(Ledger, {deserialize: (d) => new Ledger(d.owner, d.opened, d.balance, d.tags)});
      return createJsonDecoderFn<Ledger>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      class Ledger {
        constructor(
          public owner: string,
          public opened: Date,
          public balance: bigint,
          public tags: string[]
        ) {}
        summary(): string {
          return `${this.owner}:${this.balance}`;
        }
      }
      registerClassSerializer(Ledger, {deserialize: (d) => new Ledger(d.owner, d.opened, d.balance, d.tags)});
      return createBinaryEncoderFn<Ledger>();
    },
    binaryDecoder: () => {
      class Ledger {
        constructor(
          public owner: string,
          public opened: Date,
          public balance: bigint,
          public tags: string[]
        ) {}
        summary(): string {
          return `${this.owner}:${this.balance}`;
        }
      }
      registerClassSerializer(Ledger, {deserialize: (d) => new Ledger(d.owner, d.opened, d.balance, d.tags)});
      return createBinaryDecoderFn<Ledger>();
    },
    schemaEncoder: 'not-supported',
    schemaDecoder: 'not-supported',
    schemaBinaryEncoder: 'not-supported',
    schemaBinaryDecoder: 'not-supported',
    getTestData: () => {
      class Ledger {
        constructor(
          public owner: string,
          public opened: Date,
          public balance: bigint,
          public tags: string[]
        ) {}
        summary(): string {
          return `${this.owner}:${this.balance}`;
        }
      }
      return {
        values: [
          new Ledger('alice', new Date('2023-06-01T00:00:00.000Z'), 10000000000000000000n, ['x', 'y']),
          new Ledger('bob', new Date('2019-02-03T04:05:06.000Z'), 0n, []),
        ],
      };
    },
  },
  nested_registered_class: {
    title: 'Object holding a registered class property',
    serializeNotes:
      'A registered `Vertex` class nested as `origin` reconstructs inside the containing object through every strategy. Value-first schema not-supported (contains a class).',
    mutateEncoder: () => {
      class Vertex {
        constructor(
          public x: number,
          public y: number
        ) {}
        norm(): number {
          return Math.hypot(this.x, this.y);
        }
      }
      registerClassSerializer(Vertex, {deserialize: (d) => new Vertex(d.x, d.y)});
      return createJsonEncoderFn<{name: string; origin: Vertex}>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      class Vertex {
        constructor(
          public x: number,
          public y: number
        ) {}
        norm(): number {
          return Math.hypot(this.x, this.y);
        }
      }
      registerClassSerializer(Vertex, {deserialize: (d) => new Vertex(d.x, d.y)});
      return createJsonEncoderFn<{name: string; origin: Vertex}>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      class Vertex {
        constructor(
          public x: number,
          public y: number
        ) {}
        norm(): number {
          return Math.hypot(this.x, this.y);
        }
      }
      registerClassSerializer(Vertex, {deserialize: (d) => new Vertex(d.x, d.y)});
      return createJsonEncoderFn<{name: string; origin: Vertex}>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      class Vertex {
        constructor(
          public x: number,
          public y: number
        ) {}
        norm(): number {
          return Math.hypot(this.x, this.y);
        }
      }
      registerClassSerializer(Vertex, {deserialize: (d) => new Vertex(d.x, d.y)});
      return createJsonEncoderFn<{name: string; origin: Vertex}>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      class Vertex {
        constructor(
          public x: number,
          public y: number
        ) {}
        norm(): number {
          return Math.hypot(this.x, this.y);
        }
      }
      registerClassSerializer(Vertex, {deserialize: (d) => new Vertex(d.x, d.y)});
      return createJsonDecoderFn<{name: string; origin: Vertex}>();
    },
    preserveDecoder: () => {
      class Vertex {
        constructor(
          public x: number,
          public y: number
        ) {}
        norm(): number {
          return Math.hypot(this.x, this.y);
        }
      }
      registerClassSerializer(Vertex, {deserialize: (d) => new Vertex(d.x, d.y)});
      return createJsonDecoderFn<{name: string; origin: Vertex}>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      class Vertex {
        constructor(
          public x: number,
          public y: number
        ) {}
        norm(): number {
          return Math.hypot(this.x, this.y);
        }
      }
      registerClassSerializer(Vertex, {deserialize: (d) => new Vertex(d.x, d.y)});
      return createJsonDecoderFn<{name: string; origin: Vertex}>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      class Vertex {
        constructor(
          public x: number,
          public y: number
        ) {}
        norm(): number {
          return Math.hypot(this.x, this.y);
        }
      }
      registerClassSerializer(Vertex, {deserialize: (d) => new Vertex(d.x, d.y)});
      return createBinaryEncoderFn<{name: string; origin: Vertex}>();
    },
    binaryDecoder: () => {
      class Vertex {
        constructor(
          public x: number,
          public y: number
        ) {}
        norm(): number {
          return Math.hypot(this.x, this.y);
        }
      }
      registerClassSerializer(Vertex, {deserialize: (d) => new Vertex(d.x, d.y)});
      return createBinaryDecoderFn<{name: string; origin: Vertex}>();
    },
    schemaEncoder: 'not-supported',
    schemaDecoder: 'not-supported',
    schemaBinaryEncoder: 'not-supported',
    schemaBinaryDecoder: 'not-supported',
    getTestData: () => {
      class Vertex {
        constructor(
          public x: number,
          public y: number
        ) {}
        norm(): number {
          return Math.hypot(this.x, this.y);
        }
      }
      return {
        values: [
          {name: 'triangle', origin: new Vertex(3, 4)},
          {name: 'origin', origin: new Vertex(0, 0)},
        ],
      };
    },
  },
} as const satisfies Record<string, SerializationCase>;
