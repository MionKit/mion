import type {JitCompiler} from '@mionkit/run-types/src/lib/jitCompiler';
import type {UnionRunType} from '@mionkit/run-types/src/runType/collection/union';
import type {jitCode} from '@mionkit/run-types/src/types';
import {
    getUnionSplitItems,
    UnionFlattenedProps,
    UnionPropsByName,
    type FlattenedUnionProp,
    type SimpleUnionItem,
    type SplitUnionItems,
} from '@mionkit/run-types/src/runType/collection/unionDiscriminator';
import {callCheckUnknownProperties} from '@mionkit/run-types/src/lib/utils';

export const UNION_FLATTENED_OBJECT_INDEX = -1; // when encoded item is a flattened object index is always -1

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
            return `${PROP_IF} (${propIsType}) {${encDec}; ${accessor} = [${item.unionIndex}, ${accessor}]}`;
        });
        return sanitizeCode(encDecMultiNamedProps);
    };

    const onUnionSimpleTypes = (unionItems: SplitUnionItems, unionData: UnionIteratorData) => {
        const simpleItemsCode = compileRegularItems(unionItems.simpleItems);
        const hasNext = unionData.hasFlattenedProps || unionData.hasIndexItems;
        const returnCode = hasNext ? '' : `else {${failedCode}}`;
        return `${simpleItemsCode}${returnCode}`;
    };
    const onFlattenedProps = (unionItems: SplitUnionItems, unionData: UnionIteratorData) => {
        const {isObjectCheck} = unionData;
        const checkIsObject = `${IF()} (!(${isObjectCheck})) {${failedCode}}`;
        const {discriminatorProps, otherProps} = unionItems.propsByName as UnionPropsByName;
        const discriminatorsEntries = Array.from(discriminatorProps.entries());
        const otherEntries = Array.from(otherProps.entries());
        const allEntries = [...discriminatorsEntries, ...otherEntries];
        const propsCode = sanitizeCode(allEntries.map((ent) => compilePropsByName(ent[1])));
        // TODO: refactor else if (true) as is actually an else and next code will never be reached
        const ELSE = unionData.hasIndexItems ? 'else if (true)' : 'else';
        return `${checkIsObject} ${ELSE} {${propsCode};${encodeFlattenedObject(UNION_FLATTENED_OBJECT_INDEX)}}`;
    };
    const onIndexTypes = (unionItems: SplitUnionItems) => compileRegularItems(unionItems.indexItems);
    const onEnd = (unionItems: SplitUnionItems, unionData: UnionIteratorData) => {
        if (unionData.hasIndexItems) return `else {${failedCode}}`;
        return '';
    };
    return iterateUnionCompiler(comp, uRT, onStart, onUnionSimpleTypes, onFlattenedProps, onIndexTypes, onEnd);
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
            const checkPropIndex = `${accessor} !== undefined && ${accessor}[0] === ${item.unionIndex}`;
            const PROP_IF = i === 0 ? 'if' : 'else if';
            return `${PROP_IF} (${checkPropIndex}) {${accessor} = ${accessor}[1]; ${encDec}}`;
        });
        return sanitizeCode(encDecMultiNamedProps);
    };

    const onUnionSimpleTypes = (unionItems: SplitUnionItems) => compileRegularItems(unionItems.simpleItems);
    const onFlattenedProps = (unionItems: SplitUnionItems) => {
        const {discriminatorProps, otherProps} = unionItems.propsByName as UnionPropsByName;
        const discriminatorsEntries = Array.from(discriminatorProps.entries());
        const otherEntries = Array.from(otherProps.entries());
        const allEntries = [...discriminatorsEntries, ...otherEntries];
        const propsCode = sanitizeCode(allEntries.map((ent) => compilePropsByName(ent[1])));
        return `if (${errVarNameIndex} === ${UNION_FLATTENED_OBJECT_INDEX}) {${propsCode};}`;
    };
    const onIndexTypes = (unionItems: SplitUnionItems) => compileRegularItems(unionItems.indexItems);
    const onEnd = () => '';

    return iterateUnionCompiler(comp, uRT, onStart, onUnionSimpleTypes, onFlattenedProps, onIndexTypes, onEnd);
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
    const compileIsRegularType = (items: SimpleUnionItem[]) => {
        const itemsCode = items.map((item) => item.rt.compileIsType(comp));
        const code = sanitizeCode(itemsCode, ' || ');
        if (!code) return '';
        return `if (${code}) return true;`;
    };

    const compileIsTypeRegularProp = (item: FlattenedUnionProp) => {
        const varName = item.compiledName;
        const propCode = item.prop.compileIsType(comp);
        if (!propCode) return '';
        return `if (${propCode}) ${varName} = true;`;
    };

    // check discriminator properties
    const compileIsTypeDiscriminatorProp = (item: FlattenedUnionProp, i: number, isLast: boolean, hasIndexItems: boolean) => {
        const varName = item.compiledName;
        const propCode = item.prop.compileIsType(comp);
        const IF = i === 0 ? 'if' : 'else if';
        const code = `${IF} (${propCode}) ${varName} = true;`;
        const isEarlyReturn = isLast && !hasIndexItems;
        // if we don't find a discriminator we can return early
        return isEarlyReturn ? code + 'else return false;' : code;
    };

    const onStart = () => '';
    const onIsTypeUnionItems = (unionItems: SplitUnionItems) => compileIsRegularType(unionItems.simpleItems);
    const onFlattenedProps = (unionItems: SplitUnionItems, unionData: UnionIteratorData) => {
        const {isObjectCheck, propsInitCode} = unionData;
        const checkIsObject = `if (!(${isObjectCheck})) return false;${propsInitCode}`;
        const {discriminatorProps, otherProps} = unionItems.flattenedProps as UnionFlattenedProps;
        const discriminatorsCode = sanitizeCode(
            discriminatorProps.map((item, i) =>
                compileIsTypeDiscriminatorProp(item, i, isLast(i, discriminatorProps), unionData.hasIndexItems)
            )
        );
        const regularPropsCode = sanitizeCode(otherProps.map((item) => compileIsTypeRegularProp(item)));
        const {unknownPropCode} = unionData;
        const entries = Array.from(unionItems.propsByUnionItem.entries());
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
        const checkUnionItems = `if ((${unionItemsCheck}) && !${unknownPropCode}) return true;`;
        return sanitizeCode([checkIsObject, discriminatorsCode, regularPropsCode, checkUnionItems], '\n');
    };
    const onIsTypeIndexItems = (unionItems: SplitUnionItems) => compileIsRegularType(unionItems.indexItems);
    const onEnd = () => 'return false;';
    const shouldCheckUnknownProps = true;
    return iterateUnionCompiler(
        comp,
        uRT,
        onStart,
        onIsTypeUnionItems,
        onFlattenedProps,
        onIsTypeIndexItems,
        onEnd,
        shouldCheckUnknownProps
    );
}

// ############################## ################################# ##############################
// ############################## PURE UNION ITERATOR WITH NO LOGIC ##############################
// ############################## ################################# ##############################

export type UnionIteratorData = {
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
 * 2 : compile flat properties, this could be discriminator and other properties, if non of the discriminator props match that means item is not in the union so can return early
 * 3 : compile object that have index properties, ie. {[k: string]: any}
 */
export function iterateUnionCompiler(
    comp: JitCompiler,
    uRT: UnionRunType,
    onStart: () => jitCode,
    /** Called to compile simple types in the union */
    onUnionSimpleTypes: (unionItems: SplitUnionItems, unionData: UnionIteratorData) => jitCode,
    /** Called to compile a single flattened object with an union of all properties */
    onFlattenedProps: (unionItems: SplitUnionItems, unionData: UnionIteratorData) => jitCode,
    /** Called to compile types that have index properties */
    onIndexType: (unionItems: SplitUnionItems, unionData: UnionIteratorData) => jitCode,
    onEnd: (unionItems: SplitUnionItems, unionData: UnionIteratorData) => jitCode,
    shouldCheckUnknownProps: boolean = false
): string {
    const unionItems = getUnionSplitItems(comp, uRT);
    const allProps = unionItems.allFlattenedProps.map((item) => item.prop);
    const allCompiledPropNames = Array.from(new Set(unionItems.allFlattenedProps.map((item) => item.compiledName)));

    // flags
    const hasSimpleItems = !!unionItems.simpleItems.length;
    const hasFlattenedProps = !!(unionItems.flattenedProps && unionItems.propsByName);
    const hasIndexItems = !!unionItems.indexItems.length;

    // precalculated code
    const hasAllOptional = Array.from(unionItems.propsByUnionItem.keys()).some((rt) =>
        rt.areAllChildrenOptional(rt.getJitChildren(comp))
    );
    const isNotArray = hasAllOptional ? `!Array.isArray(${comp.vλl})` : '';
    const isObjectCheck = sanitizeCode([`typeof ${comp.vλl} === 'object' && ${comp.vλl} !== null`, isNotArray], ' && ');
    const propsInitCode = `let ${allCompiledPropNames.map((name) => `${name} = false`).join(',')};`;
    const unknownPropCode =
        shouldCheckUnknownProps && hasFlattenedProps ? callCheckUnknownProperties(uRT, comp, allProps, false, false) : '';

    // unionData
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
    const simpleItemsCode = hasSimpleItems ? onUnionSimpleTypes(unionItems, unionData) : '';
    const flattenedCode = hasFlattenedProps ? onFlattenedProps(unionItems, unionData) : '';
    // index types behaves like simple types for now as need to be fully checked
    // TODO index types can not run same encoding as other defined props in the union,
    // so when there are index types we need to exclude those props name to run in the index logic
    const indexCode: jitCode = hasIndexItems ? onIndexType(unionItems, unionData) : '';

    const endCode = onEnd(unionItems, unionData);
    const codeChunks = [startCode, simpleItemsCode, flattenedCode, indexCode, endCode];
    return sanitizeCode(codeChunks, '\n');
}

function isLast(i: number, arr: any[]) {
    return i === arr.length - 1;
}

function sanitizeCode(chunks: (string | undefined)[] | undefined, join: string = '') {
    if (!chunks) return '';
    return chunks.filter(Boolean).join(join);
}
