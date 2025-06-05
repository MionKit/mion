import type {BaseRunType, CollectionRunType} from '@mionkit/run-types/src/lib/baseRunTypes';
import type {JitCompiler} from '@mionkit/run-types/src/lib/jitCompiler';
import type {UnionRunType} from '@mionkit/run-types/src/runType/collection/union';
import type {PropertyRunType} from '@mionkit/run-types/src/runType/member/property';
import {
    FlattenedItem,
    getDiscriminatorProperties,
    getUniqueDiscriminatorProperties,
    initGetCompiledName,
    type FlattenedProp,
    type PlainItem,
    type SplitUnionTypes,
} from '@mionkit/run-types/src/runType/collection/unionDiscriminator';
import {callCheckUnknownProperties} from '@mionkit/run-types/src/lib/utils';
import {ReflectionKind} from '@deepkit/type';

/**  !!!!!!!!!!!!!!!!!!!!!!!! IMPORTANT: THIS CODE WONT BE USED FOR NOW, MAYBE IN THE FUTURE WITH EXTRA COMPILATION FLAG !!!!!!!!!!!!!!!!!!!!!!!!
 * We couldn't make the union behave exactly as typescript does when mixing objects and non objects in the union.
 * We can make the validation and encoding work correctly but then the decoding might work,
 * there might be props that does not belong to the discriminated object of the union.
 * Without the discriminator info we would not be able to restore to the correct type.
 * ie: type MyUnion = {type: 'a', b: number} | {type: 'b', x: string, } | {a: 'c', x: bigint};
 * const v1: MyUnion = {a: 'hello', b: 3, x: 'hello'};  this is valid typescript as it matches first type of the union and also includes x
 * when we encode, we save the discriminator as 1 as is the index of the type in the union, be we would't know how to decode it correctly,
 * we would know if x is a string or a bigint.
 * we would have to save a discriminator per property to be able to decode it correctly and this is not performant
 * */

// ############################## ############################## ##############################
// ############################## ITERATE & COMPILE UNION ENCODE ##############################
// ############################## ############################## ##############################

/**
 * iterate over the union types and call the callbacks to generate code for each type or flat property
 * @param comp
 * @param uRT
 * @param onUnionType
 * @param onFlattenedProp
 * @param onFailed
 * @returns
 */
export function iterateAndCompileUnionEncode(
    comp: JitCompiler,
    uRT: UnionRunType,
    encodeUnionType: (item: PlainItem) => string,
    encodeFlattenedProp: (prop: FlattenedProp) => string,
    onFailed: () => string
): string {
    const failedCode = onFailed();
    let onObjectIf = false;
    const onUnionTypes = (items: PlainItem[]) => {
        const itemsCode = items.map((item) => {
            const code = item.rt.compileIsType(comp);
            const IF = !onObjectIf ? 'if' : 'else if';
            const cbCode = encodeUnionType(item);
            if (!cbCode || !code) return '';
            onObjectIf = true;
            return `${IF} (${code}){${cbCode}}`;
        });
        return toCode(itemsCode);
    };

    // initialize variables for flattened properties
    const onFlattenedObjStart = (props: FlattenedProp[], isNotObjectCode: string, propsInitCode: string) => {
        return `if (${isNotObjectCode}) {${failedCode};}${propsInitCode}`;
    };

    // check all properties individually
    const onDiscriminatorProp = (item: FlattenedProp) => {
        const varName = item.compiledName;
        const propCode = item.prop.compileIsType(comp);
        const cbCode = encodeFlattenedProp(item);
        // we still need to check if the property type even if there is no callback logic
        if (!propCode) return '';
        const code = `if (${propCode}) {${varName} = true;${cbCode}}`;
        return code;
    };
    const onRegularProp = (item: FlattenedProp) => {
        const varName = item.compiledName;
        const propCode = item.prop.compileIsType(comp);
        const cbCode = encodeFlattenedProp(item);
        // we still need to check if the property type even if there is no callback logic
        if (!propCode) return '';
        return `if (${propCode}) {${varName} = true;${cbCode}}`;
    };
    const onFlattenedProps = (discriminators: FlattenedProp[], regularProps: FlattenedProp[]) => {
        const discriminatorsCode = toCode(discriminators.map((item) => onDiscriminatorProp(item)));
        const regularPropsCode = toCode(regularProps.map((item) => onRegularProp(item)));
        return `${discriminatorsCode}\n${regularPropsCode}`;
    };

    // check all boolean variables of each union item so at least one is true
    let flatObjsIf = false;
    const onFlattenedPropsEnd = (propsByUnionItem: Map<CollectionRunType<any>, FlattenedProp[]>, unknownPropCode: string) => {
        const entries = Array.from(propsByUnionItem.entries());
        const checkObjectsCode = entries.map(([objItem, props]) => {
            const IF = !flatObjsIf ? 'if' : 'else if';
            const children = objItem.getJitChildren(comp);
            const checkAllProps = props.map((propItem) => propItem.compiledName);
            // if all properties are optional we need to check that there are no properties from other types
            if (objItem.areAllChildrenOptional(children)) checkAllProps.push('!' + unknownPropCode);
            const checkCode = checkAllProps.filter(Boolean).join(' && ');
            const cbCode = encodeUnionType({rt: objItem, unionIndex: uRT.getUnionItemIndex(comp, objItem)});
            if (!checkCode || !cbCode) return '';
            flatObjsIf = true;
            const code = `${IF} (${checkCode}) {${cbCode}}`;
            return code;
        });
        return toCode(checkObjectsCode);
    };

    // index types, ie: {[k: string]: any}
    let indexIf = false;
    const onIndexTypes = (items: PlainItem[]) => {
        const itemsCode = toCode(
            items.map((item) => {
                const code = item.rt.compileIsType(comp);
                const IF = !indexIf ? 'if' : 'else if';
                const cbCode = encodeUnionType(item);
                if (!cbCode || !code) return '';
                indexIf = true;
                return `${IF} (${code}){${cbCode}}`;
            })
        );
        return itemsCode;
    };
    return iterateUnionCompiler(
        comp,
        uRT,
        () => '',
        onUnionTypes,
        onFlattenedObjStart,
        onFlattenedProps,
        onFlattenedPropsEnd,
        onIndexTypes,
        () => failedCode
    );
}

// ############################## ############################## ##############################
// ############################## ITERATE & COMPILE UNION DECODE ##############################
// ############################## ############################## ##############################

/**
 * iterate over the union types and call the callbacks to generate code for each type or flat property
 * @param comp
 * @param uRT
 * @param onUnionType
 * @param onFlattenedProp
 * @param onFailed
 * @returns
 */
export function iterateAndCompileUnionDecode(
    comp: JitCompiler,
    uRT: UnionRunType,
    decVarName: string,
    onStart: () => string,
    decodeUnionType: (item: PlainItem) => string,
    decodeFlattenedProp: (prop: FlattenedProp) => string,
    onFailed: () => string
): string {
    const failedCode = onFailed();
    let onObjectIf = false;
    const onUnionTypes = (items: PlainItem[]) => {
        const itemsCode = items.map((item) => {
            const code = item.rt.compileIsType(comp);
            const IF = !onObjectIf ? 'if' : 'else if';
            const cbCode = decodeUnionType(item);
            if (!cbCode || !code) return '';
            onObjectIf = true;
            return `${IF} (${code}){${cbCode}}`;
        });
        return toCode(itemsCode);
    };

    // initialize variables for flattened properties
    const onFlattenedObjStart = (props: FlattenedProp[], isNotObjectCode: string, propsInitCode: string) => {
        return `if (${isNotObjectCode}) {${failedCode};}${propsInitCode}`;
    };

    // check all properties individually
    const onDiscriminatorProp = (item: FlattenedProp) => {
        const varName = item.compiledName;
        const propCode = item.prop.compileIsType(comp);
        const cbCode = decodeFlattenedProp(item);
        // we still need to check if the property type even if there is no callback logic
        if (!propCode) return '';
        const code = `if (${propCode}) {${varName} = true;${cbCode}}`;
        return code;
    };
    const onRegularProp = (item: FlattenedProp) => {
        const varName = item.compiledName;
        const propCode = item.prop.compileIsType(comp);
        const cbCode = decodeFlattenedProp(item);
        // we still need to check if the property type even if there is no callback logic
        if (!propCode) return '';
        return `if (${propCode}) {${varName} = true;${cbCode}}`;
    };
    const onFlattenedProps = (discriminators: FlattenedProp[], regularProps: FlattenedProp[]) => {
        const discriminatorsCode = toCode(discriminators.map((item) => onDiscriminatorProp(item)));
        const regularPropsCode = toCode(regularProps.map((item) => onRegularProp(item)));
        return `${discriminatorsCode}\n${regularPropsCode}`;
    };

    // check all boolean variables of each union item so at least one is true
    let flatObjsIf = false;
    const onFlattenedPropsEnd = (propsByUnionItem: Map<CollectionRunType<any>, FlattenedProp[]>, unknownPropCode: string) => {
        const entries = Array.from(propsByUnionItem.entries());
        const checkObjectsCode = entries.map(([objItem, props]) => {
            const IF = !flatObjsIf ? 'if' : 'else if';
            const children = objItem.getJitChildren(comp);
            const checkAllProps = props.map((propItem) => propItem.compiledName);
            // if all properties are optional we need to check that there are no properties from other types
            if (objItem.areAllChildrenOptional(children)) checkAllProps.push('!' + unknownPropCode);
            const checkCode = checkAllProps.filter(Boolean).join(' && ');
            const cbCode = decodeUnionType({rt: objItem, unionIndex: uRT.getUnionItemIndex(comp, objItem)});
            if (!checkCode || !cbCode) return '';
            flatObjsIf = true;
            const code = `${IF} (${checkCode}) {${cbCode}}`;
            return code;
        });
        return toCode(checkObjectsCode);
    };

    // index types, ie: {[k: string]: any}
    let indexIf = false;
    const onIndexTypes = (items: PlainItem[]) => {
        const itemsCode = toCode(
            items.map((item) => {
                const code = item.rt.compileIsType(comp);
                const IF = !indexIf ? 'if' : 'else if';
                const cbCode = decodeUnionType(item);
                if (!cbCode || !code) return '';
                indexIf = true;
                return `${IF} (${code}){${cbCode}}`;
            })
        );
        return itemsCode;
    };
    return iterateUnionCompiler(
        comp,
        uRT,
        () => '',
        onUnionTypes,
        onFlattenedObjStart,
        onFlattenedProps,
        onFlattenedPropsEnd,
        onIndexTypes,
        () => failedCode
    );
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
    const onIsTypeUnionItems = (items: PlainItem[]) => {
        const itemsCode = items.map((item) => item.rt.compileIsType(comp));
        const code = toCode(itemsCode, ' || ');
        if (!code) return '';
        return `if (${code}) return true;`;
    };

    const onFlattenedObjStart = (props: FlattenedProp[], isNotObjectCode: string, propsInitCode: string) => {
        return `if (${isNotObjectCode}) return false;${propsInitCode}`;
    };

    // check discriminator properties
    const onIsTypeDiscriminator = (item: FlattenedProp, i: number, isLast: boolean, hasIndexTypes: boolean) => {
        const varName = item.compiledName;
        const propCode = item.prop.compileIsType(comp);
        const IF = i === 0 ? 'if' : 'else if';
        const code = `${IF} (${propCode}) ${varName} = true;`;
        const isEarlyReturn = isLast && !hasIndexTypes;
        // if we don't find a discriminator we can return early
        return isEarlyReturn ? code + 'else return false;' : code;
    };

    // check other properties
    const onIsTypeRegularProp = (item: FlattenedProp) => {
        const varName = item.compiledName;
        const propCode = item.prop.compileIsType(comp);
        if (!propCode) return '';
        return `if (${propCode}) ${varName} = true;`;
    };
    const onFlattenedProps = (discriminators: FlattenedProp[], regularProps: FlattenedProp[], hasIndexTypes: boolean) => {
        const discriminatorsCode = toCode(
            discriminators.map((item, i) => onIsTypeDiscriminator(item, i, isLast(i, discriminators), hasIndexTypes))
        );
        const regularPropsCode = toCode(regularProps.map((item) => onIsTypeRegularProp(item)));
        return `${discriminatorsCode}\n${regularPropsCode}`;
    };

    // check all boolean variables of each union item so at least one is true
    const onFlattenedPropsEnd = (propsByUnionItem: Map<CollectionRunType<any>, FlattenedProp[]>, unknownPropCode: string) => {
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

    const onIsTypeIndexItems = (items: PlainItem[]) => {
        const itemsCode = items.map((item) => item.rt.compileIsType(comp));
        const code = toCode(itemsCode, ' || ');
        if (!code) return '';
        return `if (${code}) return true;`;
    };
    const onEnd = () => 'return false;';
    const code = iterateUnionCompiler(
        comp,
        uRT,
        () => '',
        onIsTypeUnionItems,
        onFlattenedObjStart,
        onFlattenedProps,
        onFlattenedPropsEnd,
        onIsTypeIndexItems,
        onEnd
    );
    return code;
}

/**
 * Compiles code that traverses all the types of the union and execute the callback for each type
 * The callBack should return the code to execute for the current union item.
 * @return SplitUnionTypes if there are objects in the union, they are flattened into the last item.
 */
export function getUnionSplitItems(comp: JitCompiler, urt: UnionRunType): SplitUnionTypes {
    const {objectTypes, regularTypes, indexTypes} = splitUnionTypes(comp, urt);
    return {
        regularTypes: getUnionPlainItems(regularTypes, 0),
        indexTypes: getUnionPlainItems(indexTypes, 0),
        flattened: getFlattenedObjectItem(comp, urt, objectTypes, initGetCompiledName()),
    };
}

/**
 * Split the union types in two groups: interface types and simple types
 * interface types are types that have properties, simple types are the rest (atomic types, tuples, etc)
 */
function splitUnionTypes(
    comp: JitCompiler,
    urt: UnionRunType
): {objectTypes: CollectionRunType<any>[]; regularTypes: BaseRunType[]; indexTypes: CollectionRunType<any>[]} {
    const unionItems = urt.getJitChildren(comp);
    const objectTypes: CollectionRunType<any>[] = [];
    const regularTypes: BaseRunType[] = [];
    const indexTypes: CollectionRunType<any>[] = [];
    unionItems.forEach((unionItem) => {
        const isObj = urt.isTypeWithProperties(unionItem);
        if (!isObj) return regularTypes.push(unionItem);
        const objItem = unionItem as CollectionRunType<any>;
        // Object with index properties can not be flattened and need to be fully checked
        const hasIndexProperty = objItem.getJitChildren?.(comp).some((prop) => prop.src.kind === ReflectionKind.indexSignature);
        if (hasIndexProperty) return indexTypes.push(objItem);
        return objectTypes.push(objItem);
    });

    return {objectTypes, regularTypes, indexTypes};
}

export function isFlattenedItem(comp: JitCompiler, urt: UnionRunType, unionItem: BaseRunType) {
    return (
        urt.isTypeWithProperties(unionItem) &&
        !(unionItem as CollectionRunType<any>)
            .getJitChildren?.(comp)
            .some((prop) => prop.src.kind === ReflectionKind.indexSignature)
    );
}

function getUnionPlainItems(unionTypes: BaseRunType[], startIndex = 0): PlainItem[] {
    if (!unionTypes.length) return [];
    return unionTypes.map((rt, i) => ({rt, unionIndex: startIndex + i}));
}

/** Find discriminators properties in the union ans create a check code to validate the discriminator */
function getFlattenedObjectItem(
    comp: JitCompiler,
    urt: UnionRunType,
    objectTypes: CollectionRunType<any>[],
    getCompiledName: (urt: UnionRunType, propTypeID: string | number) => string
): FlattenedItem | undefined {
    let discriminatorProps = getDiscriminatorProperties(comp, urt, objectTypes, getCompiledName);
    if (!discriminatorProps.length) {
        discriminatorProps = getUniqueDiscriminatorProperties(comp, urt, objectTypes, getCompiledName);
        if (!discriminatorProps.length) return;
    }
    const otherProps: FlattenedProp[] = objectTypes
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

/**
 * iterate over the union types to compile code
 * union type should be compiled following an order to follow typescript behavior
 * 1 : compile atomic or simple types that does not have properties, if type is any of this one we can return early
 * --- onFlattenedObjStart : here we can check if type is an object, if not we can return early
 * 2 : compile discriminator properties, if non of the discriminator props match that means item is not in the union so can return early
 * 3 : compile regular properties, we need to parse all of them no matter what
 * --- onFlattenedPropsEnd : here we can check the result of the discriminator and regular properties to know what object in the union
 * 4 : compile object that have index properties, ie. {[k: string]: any}
 */
export function iterateUnionCompiler(
    comp: JitCompiler,
    uRT: UnionRunType,
    onStart: () => string,
    onUnionTypes: (items: PlainItem[]) => string,
    /** Should be used to initialize variables, etc. */
    onFlattenedObjStart: (allProps: FlattenedProp[], isNotObjectCode: string, propsInitCode: string) => string,
    /** Should be used to check the properties individually first discriminators then regular properties. */
    onFlattenedProps: (discriminators: FlattenedProp[], regularProps: FlattenedProp[], hasIndexTypes: boolean) => string,
    /** Should be used to check full object types depending on onFlattenedProp variables */
    onFlattenedPropsEnd: (propsByUnionItem: Map<CollectionRunType<any>, FlattenedProp[]>, unknownPropCode: string) => string,
    onIndexType: (items: PlainItem[]) => string,
    onEnd: () => string
): string {
    const {regularTypes, flattened, indexTypes} = getUnionSplitItems(comp, uRT);
    const {discriminatorProps, otherProps} = flattened || {};
    const allFlattenedItems = [...(discriminatorProps || []), ...(otherProps || [])];
    const allProps = allFlattenedItems.map((item) => item.prop);
    const allCompiledPropNames = Array.from(new Set(allFlattenedItems.map((item) => item.compiledName)));
    const isFlattened = allFlattenedItems.length;
    const hasIndexItems = indexTypes.length;
    const propsByUnionItem = new Map<CollectionRunType<any>, FlattenedProp[]>();
    allFlattenedItems.forEach((item) => {
        const existing = propsByUnionItem.get(item.unionItem) || [];
        propsByUnionItem.set(item.unionItem, [...existing, item]);
    });

    // precalculated code
    const hasAllOptional = Array.from(propsByUnionItem.keys()).some((rt) => rt.areAllChildrenOptional(rt.getJitChildren(comp)));
    const arrayCheck = hasAllOptional ? `Array.isArray(${comp.vλl})` : '';
    const isNotObjectCode = toCode([`!(typeof ${comp.vλl} === 'object' && ${comp.vλl} !== null)`, arrayCheck], ' || ');
    const propsInitCode = `let ${allCompiledPropNames.map((name) => `${name} = false`).join(',')};`;
    const unknownPropCode = callCheckUnknownProperties(uRT, comp, allProps, false, false);

    // generate code
    const startCode = onStart();
    const nonObjectCode = onUnionTypes(regularTypes);

    // if there are no flattened items, we return iterating only on non object types and index types
    if (!isFlattened) {
        const objectItems: string[] = [];
        if (hasIndexItems) {
            const flattenedObjStartCode = onFlattenedObjStart(allFlattenedItems, isNotObjectCode, propsInitCode) || '';
            const indexCode = onIndexType(indexTypes) || '';
            objectItems.push(flattenedObjStartCode, indexCode);
        }
        const endCode = onEnd();
        const code = toCode([startCode, nonObjectCode, ...objectItems, endCode]);
        return code;
    }

    // flattened properties
    const flattenedObjStartCode = isFlattened ? onFlattenedObjStart(allFlattenedItems, isNotObjectCode, propsInitCode) : '';
    const flattenedCode = onFlattenedProps(discriminatorProps || [], otherProps || [], !!indexTypes.length);
    // const discriminatorPropsCode = toCode(
    //     discriminatorProps?.map((item, i) => onDiscriminatorProp(item, i, isLast(i, discriminatorProps), indexTypes.length))
    // );
    // const regularPropsCode = toCode(otherProps?.map((item, i) => onRegularProp(item, i, isLast(i, otherProps))));
    const flattenedPropsEndCode = isFlattened ? onFlattenedPropsEnd(propsByUnionItem, unknownPropCode) : '';
    const indexCode = onIndexType(indexTypes);
    const endCode = onEnd();
    const codeChunks = [
        startCode,
        nonObjectCode,
        flattenedObjStartCode,
        flattenedCode,
        flattenedPropsEndCode,
        indexCode,
        endCode,
    ];
    return toCode(codeChunks, '\n');
}

function isLast(i: number, arr: any[]) {
    return i === arr.length - 1;
}

function toCode(chunks: (string | undefined)[] | undefined, join?: string) {
    if (!chunks) return '';
    return chunks.filter(Boolean).join(join || '');
}
