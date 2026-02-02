/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {getDeepkitTypeId} from './deepkitTypeId';
import {runType} from '../createRunType';
import {ReflectionKind} from '@deepkit/type';

describe('getDeepkitTypeId', () => {
    it('should generate consistent IDs for atomic types', () => {
        const stringRt = runType<string>();
        const numberRt = runType<number>();
        const booleanRt = runType<boolean>();

        // Atomic types return their ReflectionKind as a number
        expect(getDeepkitTypeId(stringRt.src)).toBe(ReflectionKind.string);
        expect(getDeepkitTypeId(numberRt.src)).toBe(ReflectionKind.number);
        expect(getDeepkitTypeId(booleanRt.src)).toBe(ReflectionKind.boolean);
    });

    it('should generate consistent IDs for object types', () => {
        type TestObj = {name: string; age: number};

        const rt1 = runType<TestObj>();
        const rt2 = runType<TestObj>();

        const id1 = getDeepkitTypeId(rt1.src);
        const id2 = getDeepkitTypeId(rt2.src);

        // Same type should produce same ID even if different Type objects
        expect(id1).toBe(id2);
    });

    it('should generate different IDs for different types', () => {
        type TypeA = {a: string};
        type TypeB = {b: number};

        const rtA = runType<TypeA>();
        const rtB = runType<TypeB>();

        expect(getDeepkitTypeId(rtA.src)).not.toBe(getDeepkitTypeId(rtB.src));
    });

    it('should handle circular types without infinite loop', () => {
        interface Node {
            value: number;
            next?: Node;
        }

        const rt = runType<Node>();

        // Should not throw or hang
        const id = getDeepkitTypeId(rt.src);
        expect(id).toBeDefined();
        expect(typeof id).toBe('string');
    });

    it('should cache ID on type object', () => {
        type TestType = {x: number};
        const rt = runType<TestType>();

        // First call computes and caches
        const id1 = getDeepkitTypeId(rt.src);

        // Second call should return cached value
        const id2 = getDeepkitTypeId(rt.src);

        expect(id1).toBe(id2);
        expect((rt.src as any)._typeId).toBe(id1);
    });

    it('should handle literal types', () => {
        type LiteralA = 'hello';
        type LiteralB = 42;

        const rtA = runType<LiteralA>();
        const rtB = runType<LiteralB>();

        const idA = getDeepkitTypeId(rtA.src);
        const idB = getDeepkitTypeId(rtB.src);

        // Different literals should have different IDs
        expect(idA).not.toBe(idB);
        // IDs should include the literal value (using String() conversion)
        expect(idA).toContain('hello');
        expect(idB).toContain('42');
    });

    it('should handle RegExp literal types', () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const reg = /abc/i;
        const rtReg = runType<typeof reg>(); // eslint-disable-line @mionkit/no-typeof-runtype

        const id = getDeepkitTypeId(rtReg.src);
        expect(id).toBeDefined();
        expect(typeof id).toBe('string');
    });

    it('should handle BigInt literal types', () => {
        const rtBig = runType<1n>();

        const id = getDeepkitTypeId(rtBig.src);
        expect(id).toBeDefined();
        expect(typeof id).toBe('string');
        expect(id).toContain('1');
    });

    it('should handle union types', () => {
        type UnionType = string | number;

        const rt = runType<UnionType>();
        const id = getDeepkitTypeId(rt.src);

        expect(id).toBeDefined();
        expect(typeof id).toBe('string');
    });

    it('should handle array types', () => {
        type ArrayType = string[];

        const rt = runType<ArrayType>();
        const id = getDeepkitTypeId(rt.src);

        expect(id).toBeDefined();
        expect(typeof id).toBe('string');
    });

    it('should handle tuple types', () => {
        type TupleType = [string, number, boolean];

        const rt = runType<TupleType>();
        const id = getDeepkitTypeId(rt.src);

        expect(id).toBeDefined();
        expect(typeof id).toBe('string');
        // Tuple should use square brackets
        expect(id).toContain('[');
    });

    it('should handle nested object types', () => {
        type NestedType = {
            outer: {
                inner: {
                    value: string;
                };
            };
        };

        const rt = runType<NestedType>();
        const id = getDeepkitTypeId(rt.src);

        expect(id).toBeDefined();
        expect(typeof id).toBe('string');
    });

    it('should handle Date class type', () => {
        const rt = runType<Date>();
        const id = getDeepkitTypeId(rt.src);

        expect(id).toBeDefined();
        // Date returns a subKind number for special handling
        expect(['string', 'number']).toContain(typeof id);
    });

    it('should handle Map class type', () => {
        type MapType = Map<string, number>;

        const rt = runType<MapType>();
        const id = getDeepkitTypeId(rt.src);

        expect(id).toBeDefined();
        // Map returns a subKind number for special handling
        expect(['string', 'number']).toContain(typeof id);
    });

    it('should handle Set class type', () => {
        type SetType = Set<string>;

        const rt = runType<SetType>();
        const id = getDeepkitTypeId(rt.src);

        expect(id).toBeDefined();
        // Set returns a subKind number for special handling
        expect(['string', 'number']).toContain(typeof id);
    });

    it('should handle function types', () => {
        type FnType = (a: string, b: number) => boolean;

        const rt = runType<FnType>();
        const id = getDeepkitTypeId(rt.src);

        expect(id).toBeDefined();
        // Function types return just the kind number (17) to match FunctionRunType._getTypeID()
        expect(['string', 'number']).toContain(typeof id);
    });

    it('should handle optional properties', () => {
        type WithOptional = {required: string; optional?: number};

        const rt = runType<WithOptional>();
        const id = getDeepkitTypeId(rt.src);

        expect(id).toBeDefined();
        expect(typeof id).toBe('string');
        // Optional property should include ? marker
        expect(id).toContain('?');
    });

    it('should handle enum types', () => {
        enum TestEnum {
            A = 'a',
            B = 'b',
        }

        const rt = runType<TestEnum>();
        const id = getDeepkitTypeId(rt.src);

        expect(id).toBeDefined();
        expect(typeof id).toBe('string');
    });

    it('should handle intersection types', () => {
        type TypeA = {a: string};
        type TypeB = {b: number};
        type IntersectionType = TypeA & TypeB;

        const rt = runType<IntersectionType>();
        const id = getDeepkitTypeId(rt.src);

        expect(id).toBeDefined();
        expect(typeof id).toBe('string');
    });

    it('should handle deeply nested circular types', () => {
        interface TreeNode {
            value: number;
            children: TreeNode[];
        }

        const rt = runType<TreeNode>();

        // Should not throw or hang
        const id = getDeepkitTypeId(rt.src);
        expect(id).toBeDefined();
        expect(typeof id).toBe('string');

        // Calling again should return cached value
        const id2 = getDeepkitTypeId(rt.src);
        expect(id).toBe(id2);
    });
});
