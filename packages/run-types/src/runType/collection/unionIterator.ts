import type {JitCompiler} from '@mionkit/run-types/src/lib/jitCompiler';
import type {UnionRunType} from '@mionkit/run-types/src/runType/collection/union';
import type {jitCode} from '@mionkit/run-types/src/types';
import type {IndexSignatureRunType} from '@mionkit/run-types/src/runType/member/indexProperty';
import {
    getUnionSplitItems,
    UnionItemWithObjects,
    UnionFlattenedProps,
    UnionPropsByName,
    type FlattenedUnionProp,
    type SimpleUnionItem,
    type SplitUnionItems,
} from '@mionkit/run-types/src/runType/collection/unionDiscriminator';
import {callCheckUnknownProperties} from '@mionkit/run-types/src/lib/utils';
import {ReflectionKind} from '@deepkit/type';
export const UNION_FLATTENED_OBJECT_INDEX = -1; // when encoded item is a flattened object index is always -1

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
    const indexFlagsVarName = `uIdx${uRT.getNestLevel()}`;
    const getFlagCode = (item: FlattenedUnionProp, unionData: UnionIteratorData) => {
        const setFLagTrue = `${item.flagVarName} = true;`;
        const isIndexProp = item.prop.src.kind === ReflectionKind.indexSignature;
        const emitIndexCode = unionData.hasIndexProps && !isIndexProp;
        const setIndexFlagTrue = emitIndexCode ? `${indexFlagsVarName}[${item.prop.getChildLiteral()}] = true;` : '';
        return `${setFLagTrue}${setIndexFlagTrue}`;
    };
    const compileIsRegularType = (items: SimpleUnionItem[]) => {
        const itemsCode = items.map((item) => item.rt.compileIsType(comp));
        const code = sanitizeCode(itemsCode, ' || ');
        if (!code) return '';
        return `if (${code}) return true;`;
    };

    const compileIsTypeRegularProp = (item: FlattenedUnionProp, unionData: UnionIteratorData) => {
        const propCode = item.prop.compileIsType(comp);
        if (!propCode) return '';
        return `if (${propCode}){${getFlagCode(item, unionData)}}`;
    };

    // check discriminator properties
    const compileIsTypeDiscriminatorProp = (
        item: FlattenedUnionProp,
        i: number,
        isLast: boolean,
        unionData: UnionIteratorData
    ) => {
        const {hasIndexProps} = unionData;
        const propCode = item.prop.compileIsType(comp);
        const IF = i === 0 ? 'if' : 'else if';
        const code = `${IF} (${propCode}){${getFlagCode(item, unionData)}}`;
        const isEarlyReturn = isLast && !hasIndexProps;
        // if we don't find a discriminator we can return early
        return isEarlyReturn ? code + 'else return false;' : code;
    };

    const compileIsTypeIndexProp = (item: FlattenedUnionProp, splitUnionItems: SplitUnionItems, unionData: UnionIteratorData) => {
        // of there are no index props we don't need to do anything special
        // but also if there are no named props there is no need to set the index flags as those wont be checked
        if (!unionData.hasIndexProps || !unionData.hasNamedProps) {
            const propCode = item.prop.compileIsType(comp);
            if (!propCode) return '';
            return `if (${propCode}){${getFlagCode(item, unionData)}}`;
        }
        const indexRt = item.prop as IndexSignatureRunType;
        indexRt.tempUnionData = {indexFlagsVarName, splitUnionItems};
        const propCode = indexRt.compileIsType(comp);
        indexRt.tempUnionData = undefined;
        if (!propCode) return '';
        return `if (${propCode}){${getFlagCode(item, unionData)}}`;
    };

    /*
     * To compile isType for union we first create a variable to store the flags for each property in the union
     * If that property type check pass then we set that flag to true.
     * Once all flags have been set, we check the flags for each individual object in the union,
     * if all then flags from one of the objects are true, that means the type matches one of the objects in the union
     */

    const onStart = () => '';
    const onIsTypeUnionItems = (unionItems: SplitUnionItems) => compileIsRegularType(unionItems.simpleItems);
    const onFlattenedProps = (unionItems: UnionItemWithObjects, unionData: UnionIteratorData) => {
        const {namedProps, flattenedProps, propsByUnionItem} = unionItems;
        const {isObjectCheck, hasIndexProps, hasNamedProps} = unionData;
        const {discriminatorProps, otherProps, indexProps} = flattenedProps as UnionFlattenedProps;
        const allProps = [...discriminatorProps, ...otherProps, ...indexProps];

        // each named property has a flag, if type check passes then we set the flag for that property to true, ie u0P0 = true;
        // we cant use the property name here because there can be multiple props with the same name on different objects
        // flagVarNames are unique for each type, so multiple props could have the same flag
        const uniqueVarNames = Array.from(new Set(allProps.map((item) => item.flagVarName)));
        const flagsInit = uniqueVarNames.map((flagVarName) => `${flagVarName}=false`).join(',');
        const flagNamesInit = hasNamedProps ? `let ${flagsInit};` : '';
        // if there are index properties we also need to keep track of which properties have been checked, ie: uIdx0['a'] = true;
        const fullInit = namedProps.length <= 10;
        const fullIndexFlagsInit = fullInit ? namedProps.map((item) => `${item.prop.getChildLiteral()}:false`).join(',') : '';
        const flagIndexNamesInit = hasIndexProps && hasNamedProps ? `const ${indexFlagsVarName}={${fullIndexFlagsInit}};` : '';
        const flagsInitCode = `${flagNamesInit}${flagIndexNamesInit}`;

        const checkIsObject = `if (!(${isObjectCheck})) return false;${flagsInitCode}`;

        const discriminatorsCode = discriminatorProps.map((item, i) => {
            const isLast = i === discriminatorProps.length - 1;
            return compileIsTypeDiscriminatorProp(item, i, isLast, unionData);
        });
        const regularPropsCode = otherProps.map((item) => compileIsTypeRegularProp(item, unionData));
        const indexPropsCode = indexProps.map((item) => compileIsTypeIndexProp(item, unionItems, unionData));
        const entries = Array.from(propsByUnionItem.entries());

        const shouldCheckUnknownProps = !hasIndexProps && hasNamedProps;

        // once all flags have been set, we check the flags for each individual object in the union,
        // if all flags from all the properties are true, that means the type of at least one object in the union matches
        const checkFlagsFromItems = entries
            .map(([objItem, propItems]) => {
                const children = propItems.map((item) => item.prop);
                const checkAllFlagsForItem = propItems.map((item) => item.flagVarName);
                // if all properties are optional we need to check that there are no properties from other types
                // this also prevents
                const shouldCheckUnknownForItem = shouldCheckUnknownProps && objItem.areAllChildrenOptional(children);
                if (shouldCheckUnknownForItem) {
                    checkAllFlagsForItem.push('!' + callCheckUnknownProperties(objItem, comp, children, false, false));
                }
                const checkCode = checkAllFlagsForItem.filter(Boolean).join(' && ');
                if (!checkCode) return '';
                return `(${checkCode})`;
            })
            .filter(Boolean)
            .join(' || ');

        const allNamesProps = namedProps.map((item) => item.prop);
        const unknownPropCode = shouldCheckUnknownProps
            ? ` && !${callCheckUnknownProperties(uRT, comp, allNamesProps, false, false)}`
            : '';
        const checkUnionItems = `if ((${checkFlagsFromItems})${unknownPropCode}) return true;`;
        return sanitizeCode(
            [checkIsObject, ...discriminatorsCode, ...regularPropsCode, ...indexPropsCode, checkUnionItems],
            '\n'
        );
    };
    const onEnd = () => 'return false;';
    return iterateUnionCompiler(comp, uRT, onStart, onIsTypeUnionItems, onFlattenedProps, onEnd);
}

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
    encodeFlattenedObject: (index: number) => jitCode
): string {
    const errVarName = `uErr${uRT.getNestLevel()}`;
    const errMessage = `const ${errVarName} = "Can not encode union to json, item does not belong to the union"`;
    comp.contextCodeItems.set(errVarName, errMessage);
    const failedCode = `throw new Error(${errVarName})`;
    let isIf = true;
    const IF = () => {
        const IF = isIf ? 'if' : 'else if';
        isIf = false;
        return IF;
    };
    const compileRegularItems = (items: SimpleUnionItem[]) => {
        const itemsCode = items.map((item) => {
            const checkType = item.rt.compileIsType(comp);
            const cbCode = encodeUnionType(item);
            if (!cbCode || !checkType) return '';
            return `${IF()} (${checkType}){${cbCode}}`;
        });
        return sanitizeCode(itemsCode);
    };
    const compilePropsByName = (props: FlattenedUnionProp[]) => {
        if (props.length === 1) {
            // single props do not need to be encoded with a discriminator
            const prop0 = props[0];
            const encDec = encodeFlattenedProp(prop0) || '';
            if (!encDec) return '';
            return `if (${prop0.prop.compileIsType(comp)}) {${encDec}}`;
        }
        // properties in multiple object need to be encoded with a discriminator prop = [index, prop || encodedProp]
        const encDecMultiNamedProps: jitCode[] = props.map((item, i) => {
            const encDec = encodeFlattenedProp(item) || '';
            const propIsType = item.prop.compileIsType(comp);
            const accessor = item.prop.getMemberVλl(comp.vλl, comp);
            const PROP_IF = i === 0 ? 'if' : 'else if';
            return `${PROP_IF} (${propIsType}) {${encDec}; ${accessor} = [${item.position}, ${accessor}]}`;
        });
        return sanitizeCode(encDecMultiNamedProps);
    };

    const onUnionSimpleTypes = (unionItems: SplitUnionItems, unionData: UnionIteratorData) => {
        const simpleItemsCode = compileRegularItems(unionItems.simpleItems);
        const hasNext = unionData.hasFlattenedProps || unionData.hasIndexProps;
        const returnCode = hasNext ? '' : `else {${failedCode}}`;
        return `${simpleItemsCode}${returnCode}`;
    };
    const onFlattenedProps = (unionItems: UnionItemWithObjects, unionData: UnionIteratorData) => {
        const {isObjectCheck} = unionData;
        const checkIsObject = `${IF()} (!(${isObjectCheck})) {${failedCode}}`;
        const {discriminatorProps, otherProps} = unionItems.propsByName as UnionPropsByName;
        const discriminatorsEntries = Array.from(discriminatorProps.entries());
        const otherEntries = Array.from(otherProps.entries());
        const allEntries = [...discriminatorsEntries, ...otherEntries];
        const propsCode = sanitizeCode(allEntries.map((ent) => compilePropsByName(ent[1])));
        // TODO: refactor else if (true) as is actually an else and next code will never be reached
        const ELSE = unionData.hasIndexProps ? 'else if (true)' : 'else';
        return `${checkIsObject} ${ELSE} {${propsCode};${encodeFlattenedObject(UNION_FLATTENED_OBJECT_INDEX)}}`;
    };
    const onEnd = (unionItems: SplitUnionItems, unionData: UnionIteratorData) => {
        if (unionData.hasIndexProps) return `else {${failedCode}}`;
        return '';
    };
    return iterateUnionCompiler(comp, uRT, onStart, onUnionSimpleTypes, onFlattenedProps, onEnd);
}

/**
 * Iterate over the union types and call the different callbacks to generate decoding code.
 * Items are decoded using the discriminator index: [index, value]
 * Objects index is always -1
 * */
export function iterateAndCompileUnionDecode(
    comp: JitCompiler,
    uRT: UnionRunType,
    decodeUnionType: (item: SimpleUnionItem) => jitCode,
    decodeFlattenedProp: (prop: FlattenedUnionProp) => jitCode
): string {
    const children = uRT.getJitChildren(comp);
    const decVar = `dεc${uRT.getNestLevel()}`;

    const errVarNameFormat = `uErrF${uRT.getNestLevel()}`;
    const errFormatMessage = `const ${errVarNameFormat} = "Can not decode union from json: expected format [index, value]"`;
    comp.contextCodeItems.set(errVarNameFormat, errFormatMessage);
    const errVarNameIndex = `uErrI${uRT.getNestLevel()}`;
    const errIndexMessage = `const ${errVarNameIndex} = "Can not decode union from json: expected index between ${UNION_FLATTENED_OBJECT_INDEX} and ${children.length - 1}"`;
    comp.contextCodeItems.set(errVarNameIndex, errIndexMessage);
    const onStart = () => {
        return `
            if (!Array.isArray(${comp.vλl}) || ${comp.vλl}.length !== 2) { throw new Error(${errVarNameFormat}) }
            const ${decVar} = ${comp.vλl}[0]; ${comp.vλl} = ${comp.vλl}[1];
            if (${decVar} < ${UNION_FLATTENED_OBJECT_INDEX} || ${decVar} >= ${children.length}) { throw new Error(${errVarNameIndex}) }
        `;
    };
    let isIf = true;
    const IF = () => {
        const IF = isIf ? 'if' : 'else if';
        isIf = false;
        return IF;
    };

    const compileRegularItems = (items: SimpleUnionItem[]) => {
        const itemsCode = items.map((item) => {
            const checkType = `${errVarNameIndex} === ${item.unionIndex}`;
            const cbCode = decodeUnionType(item);
            if (!cbCode || !checkType) return '';
            return `${IF()} (${checkType}){${cbCode}}`;
        });
        return sanitizeCode(itemsCode);
    };

    // TODO: we might need to update this if encoding into something else than json (ie: bson)
    // in that case we should not assume encoding into an array [index, value]
    const compilePropsByName = (props: FlattenedUnionProp[]) => {
        if (props.length === 1) {
            // single props do not need to be encoded with a discriminator
            const prop0 = props[0];
            const encDec = decodeFlattenedProp(prop0) || '';
            if (!encDec) return '';
            if (prop0.prop.isOptional()) return encDec; // optional props already include an undefined check
            const accessor = prop0.prop.getMemberVλl(comp.vλl, comp);
            return `if (${accessor} !== undefined) {${encDec}}`;
        }
        const decodeItems: {item: FlattenedUnionProp; encDec: jitCode}[] = props.map((item) => {
            const encDec = decodeFlattenedProp(item);
            return {item, encDec};
        });
        const decodeNotRequired = decodeItems.every((el) => !el.encDec);
        if (decodeNotRequired) {
            const prop0 = props[0];
            const accessor = prop0.prop.getMemberVλl(comp.vλl, comp);
            return `if (typeof ${accessor}?.[0] === 'number') {${accessor} = ${accessor}[1]}`;
        }
        // when decoding we need to check the discriminator index
        const encDecMultiNamedProps: jitCode[] = decodeItems.map((el, i) => {
            const {item, encDec} = el;
            const accessor = item.prop.getMemberVλl(comp.vλl, comp);
            // TODO: we might want to check accessor is an array [index, value] and throw error if not
            const checkPropIndex = `${accessor} !== undefined && ${accessor}[0] === ${item.position}`;
            const PROP_IF = i === 0 ? 'if' : 'else if';
            return `${PROP_IF} (${checkPropIndex}) {${accessor} = ${accessor}[1]; ${encDec}}`;
        });
        return sanitizeCode(encDecMultiNamedProps);
    };

    const onUnionSimpleTypes = (unionItems: SplitUnionItems) => compileRegularItems(unionItems.simpleItems);
    const onFlattenedProps = (unionItems: UnionItemWithObjects) => {
        const {discriminatorProps, otherProps} = unionItems.propsByName as UnionPropsByName;
        const discriminatorsEntries = Array.from(discriminatorProps.entries());
        const otherEntries = Array.from(otherProps.entries());
        const allEntries = [...discriminatorsEntries, ...otherEntries];
        const propsCode = sanitizeCode(allEntries.map((ent) => compilePropsByName(ent[1])));
        return `if (${errVarNameIndex} === ${UNION_FLATTENED_OBJECT_INDEX}) {${propsCode};}`;
    };
    const onEnd = () => '';

    return iterateUnionCompiler(comp, uRT, onStart, onUnionSimpleTypes, onFlattenedProps, onEnd);
}

// ############################## ################################# ##############################
// ############################## PURE UNION ITERATOR WITH NO LOGIC ##############################
// ############################## ################################# ##############################

export type UnionIteratorData = {
    hasSimpleItems: boolean;
    hasFlattenedProps: boolean;
    hasIndexProps: boolean;
    hasNamedProps: boolean;
    isObjectCheck: string;
};

/**
 * iterate over the union types to compile code
 * union type should be compiled following an order to follow typescript behavior
 * 1 : compile atomic or simple types that does not have properties, if type is any of this one we can return early
 * 2 : compile flat and index properties, this could be discriminator and other properties
 *     if non of the discriminator props match, that means item is not in the union so can return early
 */
export function iterateUnionCompiler(
    comp: JitCompiler,
    uRT: UnionRunType,
    onStart: () => jitCode,
    /** Called to compile simple types in the union */
    onUnionSimpleTypes: (unionItems: SplitUnionItems, unionData: UnionIteratorData) => jitCode,
    /** Called to compile a single flattened object with an union of all properties */
    onFlattenedProps: (unionItems: UnionItemWithObjects, unionData: UnionIteratorData) => jitCode,
    /** Called to compile types that have index properties */
    onEnd: (unionItems: SplitUnionItems, unionData: UnionIteratorData) => jitCode
): string {
    const unionItems = getUnionSplitItems(comp, uRT);

    // flags
    const hasSimpleItems = !!unionItems.simpleItems.length;
    const hasNamedProps = !!unionItems.namedProps?.length;
    const hasFlattenedProps =
        !!unionItems.flattenedProps?.discriminatorProps.length ||
        !!unionItems.flattenedProps?.otherProps.length ||
        !!unionItems.flattenedProps?.indexProps.length;
    const hasIndexProps = !!unionItems.flattenedProps?.indexProps.length;

    // precalculated code
    const hasAllOptional = unionItems.propsByUnionItem
        ? Array.from(unionItems.propsByUnionItem.keys()).some((rt) => rt.areAllChildrenOptional(rt.getJitChildren(comp)))
        : false;
    const isNotArray = hasAllOptional ? `!Array.isArray(${comp.vλl})` : '';
    const isObjectCheck = sanitizeCode([`typeof ${comp.vλl} === 'object' && ${comp.vλl} !== null`, isNotArray], ' && ');

    // unionData
    const unionData: UnionIteratorData = {
        hasSimpleItems,
        hasFlattenedProps,
        hasNamedProps,
        hasIndexProps,
        isObjectCheck,
    };

    // simple union items
    const startCode = onStart();
    const simpleItemsCode = hasSimpleItems ? onUnionSimpleTypes(unionItems, unionData) : '';
    const flattenedCode = hasFlattenedProps ? onFlattenedProps(unionItems as UnionItemWithObjects, unionData) : '';
    const endCode = onEnd(unionItems, unionData);
    const codeChunks = [startCode, simpleItemsCode, flattenedCode, endCode];
    return sanitizeCode(codeChunks, '\n');
}

function sanitizeCode(chunks: (string | undefined)[] | undefined, join: string = '') {
    if (!chunks) return '';
    return chunks.filter(Boolean).join(join);
}
