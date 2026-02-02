/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {getDeepkitTypeId} from './deepkitTypeId';
import {runType} from '../createRunType';
import {ReflectionKind} from '@deepkit/type';
import {ReflectionSubKind} from '../constants.kind';
import {BaseRunTypeFormat} from './baseRunTypeFormat';
import {BaseRunType} from './baseRunTypes';
import {registerFormatter} from './formats';
import {TypeFormat} from './formats.runtype';
import {JitFnCompiler, JitErrorsFnCompiler} from './jitFnCompiler';
import {JitCode} from '../types';

describe('getDeepkitTypeId should match RunType.getTypeID() for all node types', () => {
    type Max5 = TypeFormat<string, 'max5', {maxLength: 5}>;
    class Max5Formatter extends BaseRunTypeFormat<any> {
        kind = ReflectionKind.string;
        name = 'max5';
        _mock() {}
        emitIsType(comp: JitFnCompiler, rt: BaseRunType): JitCode {
            const p = this.getParams(rt);
            return {code: `${comp.vλl}.length <= ${p.maxLength}`, type: 'E'};
        }
        emitIsTypeErrors(comp: JitErrorsFnCompiler, rt: BaseRunType): JitCode {
            const p = this.getParams(rt);
            const errFn = this.getCallJitFormatErr(comp, rt, this);
            return {code: `if (${comp.vλl}.length > ${p.maxLength}) ${errFn('maxLength', p.maxLength)}`, type: 'S'};
        }
    }
    registerFormatter(new Max5Formatter());
    describe('Atomic Types', () => {
        it('any', () => {
            const rt = runType<any>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('unknown', () => {
            const rt = runType<unknown>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('string', () => {
            const rt = runType<string>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('number', () => {
            const rt = runType<number>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('boolean', () => {
            const rt = runType<boolean>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('bigint', () => {
            const rt = runType<bigint>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('null', () => {
            const rt = runType<null>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('undefined', () => {
            const rt = runType<undefined>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('void', () => {
            const rt = runType<void>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('never', () => {
            const rt = runType<never>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('object (atomic)', () => {
            const rt = runType<object>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('regexp', () => {
            const rt = runType<RegExp>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('symbol', () => {
            const rt = runType<symbol>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('literal - string', () => {
            const rt = runType<'hello'>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('literal - number', () => {
            const rt = runType<42>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('literal - boolean', () => {
            const rt = runType<true>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });
    });

    describe('Enum Types', () => {
        enum StringEnum {
            A = 'a',
            B = 'b',
        }

        enum NumberEnum {
            A = 1,
            B = 2,
        }

        enum MixedEnum {
            A = 'a',
            B = 2,
        }

        it('string enum', () => {
            const rt = runType<StringEnum>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('number enum', () => {
            const rt = runType<NumberEnum>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('mixed enum', () => {
            const rt = runType<MixedEnum>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });
    });

    describe('Collection Types', () => {
        it('union', () => {
            type UnionType = string | number;
            const rt = runType<UnionType>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('union with multiple types', () => {
            type UnionType = string | number | boolean | null;
            const rt = runType<UnionType>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('intersection', () => {
            type A = {a: string};
            type B = {b: number};
            type IntersectionType = A & B;
            const rt = runType<IntersectionType>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('tuple', () => {
            type TupleType = [string, number, boolean];
            const rt = runType<TupleType>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('tuple with optional', () => {
            type TupleType = [string, number?];
            const rt = runType<TupleType>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('tuple with rest', () => {
            type TupleType = [string, ...number[]];
            const rt = runType<TupleType>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('interface', () => {
            interface Person {
                name: string;
                age: number;
            }
            const rt = runType<Person>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('object literal', () => {
            type ObjType = {name: string; age: number};
            const rt = runType<ObjType>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('nested object', () => {
            type NestedType = {
                user: {
                    name: string;
                    address: {
                        city: string;
                    };
                };
            };
            const rt = runType<NestedType>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });
    });

    describe('Member Types', () => {
        it('array', () => {
            const rt = runType<string[]>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('array of arrays', () => {
            const rt = runType<string[][]>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('promise', () => {
            const rt = runType<Promise<string>>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });
    });

    describe('Class Types with SubKinds', () => {
        it('Date', () => {
            const rt = runType<Date>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
            expect(getDeepkitTypeId(rt.src)).toBe(ReflectionSubKind.date);
        });

        it('Map', () => {
            const rt = runType<Map<string, number>>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('Set', () => {
            const rt = runType<Set<number>>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('custom class', () => {
            class MyClass {
                name = 'test';
            }
            const rt = runType<MyClass>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('generic class', () => {
            class GenericClass<T> {
                value!: T;
            }
            const rt = runType<GenericClass<string>>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });
    });

    describe('Function Types', () => {
        it('simple function', () => {
            type Fn = () => void;
            const rt = runType<Fn>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('function with params', () => {
            type Fn = (a: string, b: number) => boolean;
            const rt = runType<Fn>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('function with return', () => {
            type Fn = () => string;
            const rt = runType<Fn>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('function with optional param', () => {
            type Fn = (a: string, b?: number) => void;
            const rt = runType<Fn>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('function with rest params', () => {
            type Fn = (a: string, ...rest: number[]) => void;
            const rt = runType<Fn>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });
    });

    describe('Method Types', () => {
        it('method signature in interface', () => {
            interface WithMethod {
                greet(name: string): string;
            }
            const rt = runType<WithMethod>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('optional method', () => {
            interface WithOptionalMethod {
                greet?(name: string): string;
            }
            const rt = runType<WithOptionalMethod>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });
    });

    describe('Index Signature Types', () => {
        it('string index signature', () => {
            type StringIndex = {[key: string]: number};
            const rt = runType<StringIndex>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('number index signature', () => {
            type NumberIndex = {[key: number]: string};
            const rt = runType<NumberIndex>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });
    });

    describe('Optional Properties', () => {
        it('optional property', () => {
            type WithOptional = {
                required: string;
                optional?: number;
            };
            const rt = runType<WithOptional>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('all optional', () => {
            type AllOptional = {
                a?: string;
                b?: number;
            };
            const rt = runType<AllOptional>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });
    });

    describe('Circular References', () => {
        it('self-referencing type', () => {
            type Node = {
                value: string;
                children?: Node[];
            };
            const rt = runType<Node>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('mutually recursive types', () => {
            type A = {
                b?: B;
            };
            type B = {
                a?: A;
            };
            const rt = runType<A>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });
    });

    describe('Complex Nested Types', () => {
        it('deeply nested', () => {
            type DeepType = {
                level1: {
                    level2: {
                        level3: {
                            value: string;
                        };
                    };
                };
            };
            const rt = runType<DeepType>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('array of unions', () => {
            type ArrayUnion = (string | number)[];
            const rt = runType<ArrayUnion>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('union of arrays', () => {
            type UnionArray = string[] | number[];
            const rt = runType<UnionArray>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('tuple with union', () => {
            type TupleUnion = [string, string | number];
            const rt = runType<TupleUnion>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });
    });

    describe('Call Signatures', () => {
        it('object with call signature', () => {
            type Callable = {
                (a: number): string;
                prop: boolean;
            };
            const rt = runType<Callable>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });
    });

    describe('Non-serializable Types', () => {
        it('function property', () => {
            type WithFn = {
                fn: () => void;
            };
            const rt = runType<WithFn>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('class with method', () => {
            class WithMethod {
                method() {
                    return 'hello';
                }
            }
            const rt = runType<WithMethod>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });
    });

    describe('Edge Cases', () => {
        it('empty object', () => {
            type Empty = Record<string, never>;
            const rt = runType<Empty>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('empty tuple', () => {
            type Empty = [];
            const rt = runType<Empty>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('single element tuple', () => {
            type Single = [string];
            const rt = runType<Single>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('nullable types', () => {
            type Nullable = string | null | undefined;
            const rt = runType<Nullable>();
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });
    });

    describe('Type Formats', () => {
        it('formatted string root', () => {
            const rt = runType<Max5>() as BaseRunType;
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('formatted string in array', () => {
            const rt = runType<Max5[]>() as BaseRunType;
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });

        it('formatted string in object', () => {
            const rt = runType<{a: Max5}>() as BaseRunType;
            expect(getDeepkitTypeId(rt.src)).toBe(rt.getTypeID());
        });
    });
});
