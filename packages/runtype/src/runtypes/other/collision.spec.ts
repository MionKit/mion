import {JitFnIDs} from '../../constants';
import {runType} from '../../runType';

type FunctionType = (a: number, b: boolean, c?: string) => Date;
const rtFunctionType = runType<FunctionType>();

type FunctionType2 = (a: Date, b?: boolean) => bigint;
const rtFunctionType2 = runType<FunctionType2>();

type RestFunctionType = (a: number, b: boolean, ...c: Date[]) => Date;
const rtRestFunctionType = runType<RestFunctionType>();

type Rest2FunctionType = (...a: number[]) => Date;
const rtRest2FunctionType = runType<Rest2FunctionType>();

type ObjectType = object;
const rtObject = runType<ObjectType>();

type NumberType = number;
const rtNumber = runType<NumberType>();

type NullType = null;
const rtNull = runType<NullType>();

type NeverType = never;
const rtNever = runType<NeverType>();

type LiteralType2 = 2;
const rtLiteral2 = runType<LiteralType2>();

type LiteralTypeA = 'a';
const rtLiteralA = runType<LiteralTypeA>();

const reg = /abc/i;
type LiteralTypeReg = typeof reg;
const rtLiteralReg = runType<LiteralTypeReg>();

const sym = Symbol('hello');
type LiteralTypeSym = typeof sym;
const rtLiteralSym = runType<LiteralTypeSym>();

type LiteralTypeTrue = true;
const rtLiteralTrue = runType<LiteralTypeTrue>();

type LiteralTypeBigInt = 1n;
const rtLiteralBigInt = runType<LiteralTypeBigInt>();

enum Color {
    Red,
    Green = 'green',
    Blue = 2,
}
const rtColor = runType<Color>();

type DateType = Date;
const rtDate = runType<DateType>();

type BooleanType = boolean;
const rtBoolean = runType<BooleanType>();

type AnyType = any;
const rtAny = runType<AnyType>();

type ArrayTypeMembers = number[];
const rtArrayMembers = runType<ArrayTypeMembers>();

type TupleTypeMembers = [number, string, boolean?];
const rtTupleMembers = runType<TupleTypeMembers>();

type ObjectTypeMembers = {a: number; b?: string; c: boolean};
const rtObjectMembers = runType<ObjectTypeMembers>();

type UnionType = string | number | boolean;
const rtUnion = runType<UnionType>();

type IntersectionType = {a: number} & {b: string};
const rtIntersection = runType<IntersectionType>();

type NestedType = {
    id: number;
    name: string;
    meta: {
        created: Date;
        tags: string[];
    };
};
const rtNested = runType<NestedType>();

type RecursiveType = {
    value: number;
    next?: RecursiveType;
};
const rtRecursive = runType<RecursiveType>();

interface GenericType<T> {
    data: T;
}
type GenericNumberType = GenericType<number>;
const rtGenericNumber = runType<GenericNumberType>();

type OptionalType = {
    a: number;
    b?: string;
};
const rtOptional = runType<OptionalType>();

type IndexedType = {
    [key: string]: number;
};
const rtIndexed = runType<IndexedType>();

type ArrayTypeCollection = number[];
const rtArrayCollection = runType<ArrayTypeCollection>();

type TupleTypeCollection = [number, string, boolean?];
const rtTupleCollection = runType<TupleTypeCollection>();

type SetType = Set<string>;
const rtSet = runType<SetType>();

type MapType = Map<string, number>;
const rtMap = runType<MapType>();

type WeakMapType = WeakMap<object, number>;
const rtWeakMap = runType<WeakMapType>();

type WeakSetType = WeakSet<object>;
const rtWeakSet = runType<WeakSetType>();

it.skip('should create all jit functions without collision', () => {
    const validateFunctionType = rtFunctionType.createJitFunction(JitFnIDs.isType);
    const validateFunctionType2 = rtFunctionType2.createJitFunction(JitFnIDs.isType);
    const validateRestFunctionType = rtRestFunctionType.createJitFunction(JitFnIDs.isType);
    const validateRest2FunctionType = rtRest2FunctionType.createJitFunction(JitFnIDs.isType);
    const validateObject = rtObject.createJitFunction(JitFnIDs.isType);
    const validateNumber = rtNumber.createJitFunction(JitFnIDs.isType);
    const validateNull = rtNull.createJitFunction(JitFnIDs.isType);
    const validateNever = rtNever.createJitFunction(JitFnIDs.isType);
    const validateLiteral2 = rtLiteral2.createJitFunction(JitFnIDs.isType);
    const validateLiteralA = rtLiteralA.createJitFunction(JitFnIDs.isType);
    const validateLiteralReg = rtLiteralReg.createJitFunction(JitFnIDs.isType);
    const validateLiteralSym = rtLiteralSym.createJitFunction(JitFnIDs.isType);
    const validateLiteralTrue = rtLiteralTrue.createJitFunction(JitFnIDs.isType);
    const validateLiteralBigInt = rtLiteralBigInt.createJitFunction(JitFnIDs.isType);
    const validateColor = rtColor.createJitFunction(JitFnIDs.isType);
    const validateDate = rtDate.createJitFunction(JitFnIDs.isType);
    const validateBoolean = rtBoolean.createJitFunction(JitFnIDs.isType);
    const validateAny = rtAny.createJitFunction(JitFnIDs.isType);
    const validateArrayMembers = rtArrayMembers.createJitFunction(JitFnIDs.isType);
    const validateTupleMembers = rtTupleMembers.createJitFunction(JitFnIDs.isType);
    const validateObjectMembers = rtObjectMembers.createJitFunction(JitFnIDs.isType);
    const validateUnion = rtUnion.createJitFunction(JitFnIDs.isType);
    const validateIntersection = rtIntersection.createJitFunction(JitFnIDs.isType);
    const validateNested = rtNested.createJitFunction(JitFnIDs.isType);
    const validateRecursive = rtRecursive.createJitFunction(JitFnIDs.isType);
    const validateGenericNumber = rtGenericNumber.createJitFunction(JitFnIDs.isType);
    const validateOptional = rtOptional.createJitFunction(JitFnIDs.isType);
    const validateIndexed = rtIndexed.createJitFunction(JitFnIDs.isType);
    const validateArrayCollection = rtArrayCollection.createJitFunction(JitFnIDs.isType);
    const validateTupleCollection = rtTupleCollection.createJitFunction(JitFnIDs.isType);
    const validateSet = rtSet.createJitFunction(JitFnIDs.isType);
    const validateMap = rtMap.createJitFunction(JitFnIDs.isType);
    const validateWeakMap = rtWeakMap.createJitFunction(JitFnIDs.isType);
    const validateWeakSet = rtWeakSet.createJitFunction(JitFnIDs.isType);

    expect(true).toBe(true);
});
