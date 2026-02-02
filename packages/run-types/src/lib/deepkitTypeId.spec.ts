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

        expect(getDeepkitTypeId(stringRt.src)).toBe(stringRt.getTypeID());
        expect(getDeepkitTypeId(numberRt.src)).toBe(numberRt.getTypeID());
        expect(getDeepkitTypeId(booleanRt.src)).toBe(booleanRt.getTypeID());
    });

    it('should generate consistent IDs for object types', () => {
        type TestObj = {name: string; age: number};

        const rt1 = runType<TestObj>();
        const rt2 = runType<TestObj>();

        const id1 = getDeepkitTypeId(rt1.src);
        const id2 = getDeepkitTypeId(rt2.src);

        // Same type should produce same ID even if different Type objects
        expect(id1).toBe(id2);
        expect(id1).toBe(rt1.getTypeID());
        expect(id2).toBe(rt2.getTypeID());
    });

    it('should generate different IDs for different types', () => {
        type TypeA = {a: string};
        type TypeB = {b: number};

        const rtA = runType<TypeA>();
        const rtB = runType<TypeB>();

        expect(getDeepkitTypeId(rtA.src)).not.toBe(getDeepkitTypeId(rtB.src));
        expect(getDeepkitTypeId(rtA.src)).toBe(rtA.getTypeID());
        expect(getDeepkitTypeId(rtB.src)).toBe(rtB.getTypeID());
    });

    it('should handle circular types without infinite loop', () => {
        interface Node {
            value: number;
            next?: Node;
        }

        const rt = runType<Node>();

        // Should not throw or hang
        const id = getDeepkitTypeId(rt.src);
        expect(id).toBe(rt.getTypeID());
    });

    it('should cache ID on type object', () => {
        type TestType = {x: number};
        const rt = runType<TestType>();

        // First call computes and caches
        const id1 = getDeepkitTypeId(rt.src);

        // Second call should return cached value
        const id2 = getDeepkitTypeId(rt.src);

        expect(id1).toBe(id2);
        expect(id1).toBe(rt.getTypeID());
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
        expect(idA).toBe(rtA.getTypeID());
        expect(idB).toBe(rtB.getTypeID());
    });

    it('should handle RegExp literal types', () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const reg = /abc/i;
        const rtReg = runType<typeof reg>(); // eslint-disable-line @mionkit/no-typeof-runtype

        const id = getDeepkitTypeId(rtReg.src);
        expect(id).toBe(rtReg.getTypeID());
    });

    it('should handle BigInt literal types', () => {
        const rtBig = runType<1n>();

        const id = getDeepkitTypeId(rtBig.src);
        expect(id).toBe(rtBig.getTypeID());
    });

    it('should handle union types', () => {
        type UnionType = string | number;

        const rt = runType<UnionType>();
        const id = getDeepkitTypeId(rt.src);

        expect(id).toBe(rt.getTypeID());
    });

    it('should handle array types', () => {
        type ArrayType = string[];

        const rt = runType<ArrayType>();
        const id = getDeepkitTypeId(rt.src);

        expect(id).toBe(rt.getTypeID());
    });

    it('should handle tuple types', () => {
        type TupleType = [string, number, boolean];

        const rt = runType<TupleType>();
        const id = getDeepkitTypeId(rt.src);

        expect(id).toBe(rt.getTypeID());
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

        expect(id).toBe(rt.getTypeID());
    });

    it('should handle Date class type', () => {
        const rt = runType<Date>();
        const id = getDeepkitTypeId(rt.src);

        expect(id).toBe(rt.getTypeID());
    });

    it('should handle Map class type', () => {
        type MapType = Map<string, number>;

        const rt = runType<MapType>();
        const id = getDeepkitTypeId(rt.src);

        expect(id).toBe(rt.getTypeID());
    });

    it('should handle Set class type', () => {
        type SetType = Set<string>;

        const rt = runType<SetType>();
        const id = getDeepkitTypeId(rt.src);

        expect(id).toBe(rt.getTypeID());
    });

    it('should handle function types', () => {
        type FnType = (a: string, b: number) => boolean;

        const rt = runType<FnType>();
        const id = getDeepkitTypeId(rt.src);

        expect(id).toBe(rt.getTypeID());
    });

    it('should handle optional properties', () => {
        type WithOptional = {required: string; optional?: number};

        const rt = runType<WithOptional>();
        const id = getDeepkitTypeId(rt.src);

        expect(id).toBe(rt.getTypeID());
    });

    it('should handle enum types', () => {
        enum TestEnum {
            A = 'a',
            B = 'b',
        }

        const rt = runType<TestEnum>();
        const id = getDeepkitTypeId(rt.src);

        expect(id).toBe(rt.getTypeID());
    });

    it('should handle intersection types', () => {
        type TypeA = {a: string};
        type TypeB = {b: number};
        type IntersectionType = TypeA & TypeB;

        const rt = runType<IntersectionType>();
        const id = getDeepkitTypeId(rt.src);

        expect(id).toBe(rt.getTypeID());
    });

    it('should handle deeply nested circular types', () => {
        interface TreeNode {
            value: number;
            children: TreeNode[];
        }

        const rt = runType<TreeNode>();

        // Should not throw or hang
        const id = getDeepkitTypeId(rt.src);
        expect(id).toBe(rt.getTypeID());

        // Calling again should return cached value
        const id2 = getDeepkitTypeId(rt.src);
        expect(id).toBe(id2);
        expect(id2).toBe(rt.getTypeID());
    });
});
