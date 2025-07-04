import type {BaseRunType, CollectionRunType} from '@mionkit/run-types/src/lib/baseRunTypes';
import type {JitCompiler} from '@mionkit/run-types/src/lib/jitCompiler';
import type {UnionRunType} from '@mionkit/run-types/src/runType/collection/union';
import type {PropertyRunType} from '@mionkit/run-types/src/runType/member/property';
import type {jitCode} from '@mionkit/run-types/src/types';
import {
    UnionFlattenedProps,
    UnionPropsByName,
    getDiscriminatorProperties,
    getUniqueDiscriminatorProperties,
    getFlatPropCompiledName,
    type FlattenedUnionProp,
    type SimpleUnionItem,
    type SplitUnionTypes,
} from '@mionkit/run-types/src/runType/collection/unionDiscriminator';
import {callCheckUnknownProperties} from '@mionkit/run-types/src/lib/utils';
import {ReflectionKind} from '@deepkit/type';

export const UNION_FLATTENED_OBJECT_INDEX = -1; // when encoded item is a flattened object index is always -1

/**
 * Iterators for unions
 * */

// ############################## ##################################### ##############################
// ############################## ITERATE & COMPILE UNION ENCODE/DECODE ##############################
// ############################## ##################################### ##############################

/**
 * Iterate over the union types and call the different callbacks to generate encoding code.
 * Objects in the union are merged into a single object and encoded as [-1, value], any other type is encoded as [unioItemIndex, value]
 * If there are any prop with the same it also gets encoded as [unionItemIndex, propValue]
 */
export function iterateAndCompileUnionEncode(
    comp: JitCompiler,
    uRT: UnionRunType,
    onStart: () => jitCode,
    encodeUnionType: (item: SimpleUnionItem) => jitCode,
    encodeFlattenedProp: (prop: FlattenedUnionProp) => jitCode,
    encodeFlattenedObject: (index: number) => jitCode,
    onFailed: () => jitCode
): string {
    return iterateUnionEncodeDecode(comp, uRT, onStart, encodeUnionType, encodeFlattenedProp, encodeFlattenedObject, onFailed);
}

/**
 * Iterate over the union types and call the different callbacks to generate decoding code.
 * Items are decoded using the discriminator index: [index, value]
 * Objects index is always -1
 * */
export function iterateAndCompileUnionDecode(
    comp: JitCompiler,
    uRT: UnionRunType,
    onStart: () => jitCode,
    decodeUnionType: (item: SimpleUnionItem) => jitCode,
    decodeFlattenedProp: (prop: FlattenedUnionProp) => jitCode,
    onFailed: () => jitCode,
    decodeIndexVarName: string
): string {
    return iterateUnionEncodeDecode(
        comp,
        uRT,
        onStart,
        decodeUnionType,
        decodeFlattenedProp,
        () => '',
        onFailed,
        decodeIndexVarName
    );
}

function iterateUnionEncodeDecode(
    comp: JitCompiler,
    uRT: UnionRunType,
    onStart: () => jitCode,
    encDecUnionType: (item: SimpleUnionItem) => jitCode,
    encDecFlattenedProp: (prop: FlattenedUnionProp) => jitCode,
    encDecFlattenedObject: (index: number) => jitCode,
    onFailed: () => jitCode,
    /** if passed the iterator will emit decoding src code */
    decodeIndexVarName?: string
): string {
    const isEncode = !decodeIndexVarName;
    const noCode = () => '';
    const failedCode = onFailed();

    let onObjectIf = false;
    const IF = () => {
        const IF = !onObjectIf ? 'if' : 'else if';
        onObjectIf = true;
        return IF;
    };

    const onUnionSimpleTypes = (items: SimpleUnionItem[]) => {
        const itemsCode = items.map((item) => {
            const checkType = isEncode ? item.rt.compileIsType(comp) : `${decodeIndexVarName} === ${item.unionIndex}`;
            const cbCode = encDecUnionType(item);
            if (!cbCode || !checkType) return '';
            return `${IF()} (${checkType}){${cbCode}}`;
        });
        return sanitizeCode(itemsCode);
    };

    // index types behave as normal types for now
    const onIndexTypes = onUnionSimpleTypes;

    const onUnionSimpleTypesEnd = (items: SimpleUnionItem[], unionData: UnionIteratorData) => {
        if (unionData.hasFlattenedProps) return '';
        if (!isEncode) return '';
        return `else {${failedCode}}`; // if encoding and there are no flattened props we need to fail as item does not belong to the union
    };

    const onFlattenedPropsByName = (props: FlattenedUnionProp[]) => {
        if (!props.length) throw new Error('Cant encode union: no properties');

        if (props.length === 1) {
            // single props do not need to be encoded with a discriminator
            const prop0 = props[0];
            const encDec = encDecFlattenedProp(prop0) || '';
            if (!encDec) return '';
            if (isEncode) return `if (${prop0.prop.compileIsType(comp)}) {${encDec}}`;
            if (prop0.prop.isOptional()) return encDec; // optional props already include an undefined check
            const accessor = prop0.prop.getMemberVλl(comp.vλl, comp);
            return `if (${accessor} !== undefined) {${encDec}}`;
        }

        let encDecMultiNamedProps: jitCode[] = [];
        if (isEncode) {
            // properties in multiple object need to be encoded with a discriminator prop = [index, prop || encodedProp]
            encDecMultiNamedProps = props.map((item, i) => {
                const encDec = encDecFlattenedProp(item) || '';
                const propIsType = item.prop.compileIsType(comp);
                const accessor = item.prop.getMemberVλl(comp.vλl, comp);
                const PROP_IF = i === 0 ? 'if' : 'else if';
                return `${PROP_IF} (${propIsType}) {${encDec}; ${accessor} = [${item.unionIndex}, ${accessor}]}`;
            });
        } else {
            const decodeItems: {item: FlattenedUnionProp; encDec: jitCode}[] = props.map((item) => {
                const encDec = encDecFlattenedProp(item);
                return {item, encDec};
            });

            const decodeNotRequired = decodeItems.every((el) => !el.encDec);
            if (decodeNotRequired) {
                const prop0 = props[0];
                const accessor = prop0.prop.getMemberVλl(comp.vλl, comp);
                return `if (typeof ${accessor}?.[0] === 'number') {${accessor} = ${accessor}[1]}`;
            }

            // when decoding we need to check the discriminator index
            encDecMultiNamedProps = props.map((item, i) => {
                const accessor = item.prop.getMemberVλl(comp.vλl, comp);
                // TODO: we might want to check accessor is an array [index, value] and throw error if not
                const checkPropIndex = `${accessor} !== undefined && ${accessor}[0] === ${item.unionIndex}`;
                const encDec = encDecFlattenedProp(item) || '';
                const PROP_IF = i === 0 ? 'if' : 'else if';
                return `${PROP_IF} (${checkPropIndex}) {${accessor} = ${accessor}[1]; ${encDec}}`;
            });
        }

        return sanitizeCode(encDecMultiNamedProps);
    };

    // initialize variables for flattened properties
    const onFlattenedPropsStart = (props: FlattenedUnionProp[], unionData: UnionIteratorData) => {
        if (isEncode) {
            const {isObjectCheck} = unionData;
            return `${IF()} (!(${isObjectCheck})) {${failedCode}}`;
        }
        return '';
    };

    const onFlattenedProps = (flattenedProps: UnionFlattenedProps, propsByName: UnionPropsByName) => {
        const {discriminatorProps, otherProps} = propsByName;
        const discriminatorsEntries = Array.from(discriminatorProps.entries());
        const otherEntries = Array.from(otherProps.entries());
        const allEntries = [...discriminatorsEntries, ...otherEntries];
        const propsCode = sanitizeCode(allEntries.map((ent) => onFlattenedPropsByName(ent[1])));
        const ELSE = isEncode ? 'else' : `if (${decodeIndexVarName} === ${UNION_FLATTENED_OBJECT_INDEX})`;
        return `${ELSE} {${propsCode};${encDecFlattenedObject(UNION_FLATTENED_OBJECT_INDEX)}}`;
    };

    // making this undefined prevents emitting code for unknown props
    const onFlattenedPropsEnd = undefined;

    const onEnd = noCode;
    const [
        startCode,
        nonObjectCode,
        nonObjectEndCode,
        flattenedObjStartCode,
        flattenedCode,
        flattenedPropsEndCode,
        indexCode,
        endCode,
    ] = iterateUnionCompiler(
        comp,
        uRT,
        onStart,
        onUnionSimpleTypes,
        onUnionSimpleTypesEnd,
        onFlattenedPropsStart,
        onFlattenedProps,
        onFlattenedPropsEnd,
        onIndexTypes,
        onEnd
    );
    const reordered = [
        startCode,
        nonObjectCode,
        // moving index code here as is behaving as normal types wen encoding decoding
        // so index types are fully checked and using their own index (basically index types behaves like XOR)
        // this is pretty difficult to optimize and typescript behavior is also weird so not a priority
        indexCode,
        nonObjectEndCode,
        flattenedObjStartCode,
        flattenedCode,
        flattenedPropsEndCode,
        endCode,
    ];
    return sanitizeCode(reordered, '\n');
}

// ############################## ############################### ##############################
// ############################## ITERATE & COMPILE UNION IS TYPE ##############################
// ############################## ############################### ##############################

/**
 * Optimized version of the iterator for compiling isType function
 * @param comp
 * @param uRT
 * @returns string
 */
export function compileIsTypeUnion(comp: JitCompiler, uRT: UnionRunType): string {
    const onIsTypeUnionItems = (items: SimpleUnionItem[]) => {
        const itemsCode = items.map((item) => item.rt.compileIsType(comp));
        const code = sanitizeCode(itemsCode, ' || ');
        if (!code) return '';
        return `if (${code}) return true;`;
    };

    const onFlattenedPropsStart = (props: FlattenedUnionProp[], unionData: UnionIteratorData) => {
        const {isObjectCheck, propsInitCode} = unionData;
        return `if (!(${isObjectCheck})) return false;${propsInitCode}`;
    };

    // check discriminator properties
    const onIsTypeDiscriminator = (item: FlattenedUnionProp, i: number, isLast: boolean, hasIndexItems: boolean) => {
        const varName = item.compiledName;
        const propCode = item.prop.compileIsType(comp);
        const IF = i === 0 ? 'if' : 'else if';
        const code = `${IF} (${propCode}) ${varName} = true;`;
        const isEarlyReturn = isLast && !hasIndexItems;
        // if we don't find a discriminator we can return early
        return isEarlyReturn ? code + 'else return false;' : code;
    };

    // check other properties
    const onIsTypeRegularProp = (item: FlattenedUnionProp) => {
        const varName = item.compiledName;
        const propCode = item.prop.compileIsType(comp);
        if (!propCode) return '';
        return `if (${propCode}) ${varName} = true;`;
    };
    const onFlattenedProps = (
        flattenedProps: UnionFlattenedProps,
        propsByName: UnionPropsByName,
        unionData: UnionIteratorData
    ) => {
        const {discriminatorProps, otherProps} = flattenedProps;
        const discriminatorsCode = sanitizeCode(
            discriminatorProps.map((item, i) =>
                onIsTypeDiscriminator(item, i, isLast(i, discriminatorProps), unionData.hasIndexItems)
            )
        );
        const regularPropsCode = sanitizeCode(otherProps.map((item) => onIsTypeRegularProp(item)));
        return `${discriminatorsCode}\n${regularPropsCode}`;
    };

    // check all boolean variables of each union item so at least one is true
    const onFlattenedPropsEnd = (
        propsByUnionItem: Map<CollectionRunType<any>, FlattenedUnionProp[]>,
        unionData: UnionIteratorData
    ) => {
        const {unknownPropCode} = unionData;
        const entries = Array.from(propsByUnionItem.entries());
        const unionItemsCheck = entries
            .map(([objItem, propItems]) => {
                const children = propItems.map((item) => item.prop);
                const checkAllProps = propItems.map((item) => item.compiledName);
                // if all properties are optional we need to check that there are no properties from other types
                if (objItem.areAllChildrenOptional(children))
                    checkAllProps.push('!' + callCheckUnknownProperties(objItem, comp, children, false, false));
                const checkCode = checkAllProps.filter(Boolean).join(' && ');
                if (!checkCode) return '';
                return checkCode;
            })
            .filter(Boolean)
            .join(' || ');
        return `if ((${unionItemsCheck}) && !${unknownPropCode}) return true;`;
    };

    const onIsTypeIndexItems = onIsTypeUnionItems;
    const onEnd = () => 'return false;';
    const noCode = () => '';
    const onStart = noCode;
    const onUnionSimpleTypesEnd = noCode;
    const codeChunks = iterateUnionCompiler(
        comp,
        uRT,
        onStart,
        onIsTypeUnionItems,
        onUnionSimpleTypesEnd,
        onFlattenedPropsStart,
        onFlattenedProps,
        onFlattenedPropsEnd,
        onIsTypeIndexItems,
        onEnd
    );
    return sanitizeCode(codeChunks, '\n');
}

function setPropsByName(item: FlattenedUnionProp, propsMap: Map<string | number, FlattenedUnionProp[]>) {
    const propName = item.prop.getChildVarName();
    const existingList = propsMap.get(propName) || [];
    const isSameTypeID = existingList.some((existing) => existing.typeID === item.typeID);
    // ensured we don't have duplicated entries with same type if as will generate same code
    if (!isSameTypeID) existingList.push(item);
    propsMap.set(propName, existingList);
}

/**
 * Compiles code that traverses all the types of the union and execute the callback for each type
 * The callBack should return the code to execute for the current union item.
 * @return SplitUnionTypes if there are objects in the union, they are flattened into the last item.
 */
export function getUnionSplitItems(comp: JitCompiler, urt: UnionRunType): SplitUnionTypes {
    const {objectTypes, simpleTypes, indexTypes} = splitUnionTypes(comp, urt);
    const flattened = getFlattenedObjectItem(comp, urt, objectTypes, getFlatPropCompiledName());
    const propsByName: UnionPropsByName | undefined = flattened
        ? {discriminatorProps: new Map(), otherProps: new Map()}
        : undefined;
    if (propsByName && flattened) {
        flattened.discriminatorProps.forEach((item) => setPropsByName(item, propsByName.discriminatorProps));
        flattened.otherProps.forEach((item) => setPropsByName(item, propsByName.otherProps));
    }
    return {
        simpleTypes: getUnionPlainItems(simpleTypes, 0),
        indexTypes: getUnionPlainItems(indexTypes, 0),
        flattened,
        propsByName,
    };
}

/**
 * Split the union types in two groups: interface types and simple types
 * interface types are types that have properties, simple types are the rest (atomic types, tuples, etc)
 */
function splitUnionTypes(
    comp: JitCompiler,
    urt: UnionRunType
): {objectTypes: CollectionRunType<any>[]; simpleTypes: BaseRunType[]; indexTypes: CollectionRunType<any>[]} {
    const unionItems = urt.getJitChildren(comp);
    const objectTypes: CollectionRunType<any>[] = [];
    const simpleTypes: BaseRunType[] = [];
    const indexTypes: CollectionRunType<any>[] = [];
    unionItems.forEach((unionItem) => {
        const isObj = urt.isTypeWithProperties(unionItem);
        if (!isObj) return simpleTypes.push(unionItem);
        const objItem = unionItem as CollectionRunType<any>;
        // Object with index properties can not be flattened and need to be fully checked
        const hasIndexProperty = objItem.getJitChildren?.(comp).some((prop) => prop.src.kind === ReflectionKind.indexSignature);
        if (hasIndexProperty) return indexTypes.push(objItem);
        return objectTypes.push(objItem);
    });

    return {objectTypes, simpleTypes, indexTypes};
}

export function isFlattenedItem(comp: JitCompiler, urt: UnionRunType, unionItem: BaseRunType) {
    return (
        urt.isTypeWithProperties(unionItem) &&
        !(unionItem as CollectionRunType<any>)
            .getJitChildren?.(comp)
            .some((prop) => prop.src.kind === ReflectionKind.indexSignature)
    );
}

function getUnionPlainItems(unionTypes: BaseRunType[], startIndex = 0): SimpleUnionItem[] {
    if (!unionTypes.length) return [];
    return unionTypes.map((rt, i) => ({rt, unionIndex: startIndex + i}));
}

/** Find discriminators properties in the union ans create a check code to validate the discriminator */
function getFlattenedObjectItem(
    comp: JitCompiler,
    urt: UnionRunType,
    objectTypes: CollectionRunType<any>[],
    getCompiledName: (urt: UnionRunType, propTypeID: string | number) => string
): UnionFlattenedProps | undefined {
    let discriminatorProps = getDiscriminatorProperties(comp, urt, objectTypes, getCompiledName);
    if (!discriminatorProps.length) {
        discriminatorProps = getUniqueDiscriminatorProperties(comp, urt, objectTypes, getCompiledName);
        if (!discriminatorProps.length) return;
    }
    const otherProps: FlattenedUnionProp[] = objectTypes
        .map((rt) => {
            const children = rt.getJitChildren(comp) as PropertyRunType[];
            const unionIndex = urt.getUnionItemIndex(comp, rt);
            return children.map((prop) => {
                const typeID = prop.getTypeID();
                return {
                    unionItem: rt,
                    unionIndex,
                    prop,
                    typeID,
                    compiledName: getCompiledName(urt, typeID),
                };
            });
        })
        .flat()
        .filter((item) => !item.prop.isUnionDiscriminator);
    return {discriminatorProps, otherProps};
}

// ############################## ################################# ##############################
// ############################## PURE UNION ITERATOR WITH NO LOGIC ##############################
// ############################## ################################# ##############################

type UnionIteratorData = {
    hasSimpleItems: boolean;
    hasFlattenedProps: boolean;
    hasIndexItems: boolean;
    isObjectCheck: string;
    propsInitCode: string;
    unknownPropCode: string;
};

/**
 * iterate over the union types to compile code
 * union type should be compiled following an order to follow typescript behavior
 * 1 : compile atomic or simple types that does not have properties, if type is any of this one we can return early
 * --- onFlattenedPropsStart : here we can check if type is an object, if not we can return early
 * 2 : compile discriminator properties, if non of the discriminator props match that means item is not in the union so can return early
 * 3 : compile regular properties, we need to parse all of them no matter what
 * --- onFlattenedPropsEnd : here we can check the result of the discriminator and regular properties to know what object in the union
 * 4 : compile object that have index properties, ie. {[k: string]: any}
 */
export function iterateUnionCompiler(
    comp: JitCompiler,
    uRT: UnionRunType,
    onStart: () => jitCode,
    onUnionSimpleTypes: (items: SimpleUnionItem[], unionData: UnionIteratorData) => jitCode,
    /** Should be used to check if type is an object, if not we can return early */
    onUnionSimpleTypesEnd: (items: SimpleUnionItem[], unionData: UnionIteratorData) => jitCode,
    /** Should be used to initialize variables, etc. */
    onFlattenedPropsStart: (allProps: FlattenedUnionProp[], unionData: UnionIteratorData) => jitCode,
    /** Should be used to check the properties individually first discriminators then regular properties. */
    onFlattenedProps: (
        flattenedProps: UnionFlattenedProps,
        propsByName: UnionPropsByName,
        unionData: UnionIteratorData
    ) => jitCode,
    /** Should be used to check full object types depending on onFlattenedProp variables */
    onFlattenedPropsEnd:
        | undefined
        | ((propsByUnionItem: Map<CollectionRunType<any>, FlattenedUnionProp[]>, unionData: UnionIteratorData) => jitCode),
    onIndexType: (items: SimpleUnionItem[], unionData: UnionIteratorData) => jitCode,
    onEnd: (unionData: UnionIteratorData) => jitCode
): jitCode[] {
    const {simpleTypes, flattened, indexTypes, propsByName} = getUnionSplitItems(comp, uRT);
    const {discriminatorProps, otherProps} = flattened || {};
    const allFlattenedItems = [...(discriminatorProps || []), ...(otherProps || [])];
    const allProps = allFlattenedItems.map((item) => item.prop);
    const allCompiledPropNames = Array.from(new Set(allFlattenedItems.map((item) => item.compiledName)));
    const propsByUnionItem = new Map<CollectionRunType<any>, FlattenedUnionProp[]>();
    allFlattenedItems.forEach((item) => {
        const existing = propsByUnionItem.get(item.unionItem) || [];
        propsByUnionItem.set(item.unionItem, [...existing, item]);
    });

    // precalculated code
    const hasAllOptional = Array.from(propsByUnionItem.keys()).some((rt) => rt.areAllChildrenOptional(rt.getJitChildren(comp)));
    const isNotArray = hasAllOptional ? `!Array.isArray(${comp.vλl})` : '';
    const isObjectCheck = sanitizeCode([`typeof ${comp.vλl} === 'object' && ${comp.vλl} !== null`, isNotArray], ' && ');
    const propsInitCode = `let ${allCompiledPropNames.map((name) => `${name} = false`).join(',')};`;
    const unknownPropCode = onFlattenedPropsEnd ? callCheckUnknownProperties(uRT, comp, allProps, false, false) : '';

    // unionData
    const hasSimpleItems = !!simpleTypes.length;
    const hasFlattenedProps = !!(flattened && propsByName);
    const hasIndexItems = !!indexTypes.length;
    const unionData: UnionIteratorData = {
        hasSimpleItems,
        hasFlattenedProps,
        hasIndexItems,
        isObjectCheck,
        propsInitCode,
        unknownPropCode,
    };

    // simple union items
    const startCode = onStart();
    let nonObjectCode: jitCode = '';
    let nonObjectEndCode: jitCode = '';
    if (hasSimpleItems) {
        nonObjectCode = onUnionSimpleTypes(simpleTypes, unionData);
        nonObjectEndCode = onUnionSimpleTypesEnd(simpleTypes, unionData);
    }

    // flattened properties
    let flattenedObjStartCode: jitCode = '';
    let flattenedCode: jitCode = '';
    let flattenedPropsEndCode: jitCode = '';
    if (hasFlattenedProps) {
        flattenedObjStartCode = onFlattenedPropsStart(allFlattenedItems, unionData);
        flattenedCode = onFlattenedProps(flattened, propsByName, unionData);
        flattenedPropsEndCode = onFlattenedPropsEnd?.(propsByUnionItem, unionData);
    }

    // index types behaves like simple types for now as need to be fully checked
    // TODO index types can not run same encoding as other defined props in the union,
    // so when there are index types we need to exclude those props name to run in the index logic
    let indexCode: jitCode = '';
    if (hasIndexItems) {
        indexCode = onIndexType(indexTypes, unionData);
    }

    const endCode = onEnd(unionData);
    const codeChunks = [
        startCode,
        nonObjectCode,
        nonObjectEndCode,
        flattenedObjStartCode,
        flattenedCode,
        flattenedPropsEndCode,
        indexCode,
        endCode,
    ];
    return codeChunks;
}

function isLast(i: number, arr: any[]) {
    return i === arr.length - 1;
}

function sanitizeCode(chunks: (string | undefined)[] | undefined, join: string = '') {
    if (!chunks) return '';
    return chunks.filter(Boolean).join(join);
}
