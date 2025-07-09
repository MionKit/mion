import type {BaseRunType, CollectionRunType, MemberRunType} from '@mionkit/run-types/src/lib/baseRunTypes';
import type {JitCompiler} from '@mionkit/run-types/src/lib/jitCompiler';
import type {UnionRunType} from '@mionkit/run-types/src/runType/collection/union';
import type {PropertyRunType} from '@mionkit/run-types/src/runType/member/property';
import type {IndexSignatureRunType} from '@mionkit/run-types/src/runType/member/indexProperty';
import {getTotalComplexity, sortRunTypeByComplexity} from '@mionkit/run-types/src/lib/utils';
import {ReflectionKind} from '@deepkit/type';

export type SimpleUnionItem = {
    rt: BaseRunType;
    unionIndex: number;
};
export type FlattenedUnionProp = {
    /** union item, parent of the property */
    unionItem: CollectionRunType<any>;
    /** index of the union item in the union */
    position: string | number;
    /** one property of the union item  */
    prop: PropertyRunType | IndexSignatureRunType;
    /** typeID of the property */
    typeID: string | number;
    /** name of the property as it should be used in the code */
    flagVarName: string;
};
export type UnionFlattenedProps = {
    /** List of properties that are used to discriminate the union.
     * Discriminator props are unique properties to each object in the union, those can be checked fist for early return.
     * if there are discriminator props and none of them match, that means item is not in the union so can return early
     * */
    discriminatorProps: FlattenedUnionProp[];
    /** List of properties that are not used to discriminate the union.
     * If we can't use the discriminators to know the type of the object we need to check all of these properties. */
    otherProps: FlattenedUnionProp[];
    /** List of properties that are in the index types. */
    indexProps: FlattenedUnionProp[];
};
export type UnionPropsByName = {
    /** Map of properties by name that are used to discriminate the union.
     * If non of the discriminator props match that means item is not in the union
     * and should skip processing the rest of the properties */
    discriminatorProps: Map<string | number, FlattenedUnionProp[]>;
    /** Map of properties by name that are not used to discriminate the union.
     * If we can't use the discriminators to know the type of the object we need to check all of these properties. */
    otherProps: Map<string | number, FlattenedUnionProp[]>;
};
export type SplitUnionItems = {
    /** items in the union that are not objects, will have to be fully checked */
    simpleItems: SimpleUnionItem[];
    /** The flattened properties of all the objects in the union, split by discriminators and regular props and index props */
    flattenedProps?: UnionFlattenedProps;
    /** List of all the properties in the union, It does not include index props */
    namedProps?: FlattenedUnionProp[];
    /** Map of all the properties by name */
    propsByName?: UnionPropsByName;
    /** Map of properties by union item  */
    propsByUnionItem?: Map<CollectionRunType<any>, FlattenedUnionProp[]>;
};
export type UnionItemWithObjects = Required<SplitUnionItems>;
export type PropUnionItemPair = {prop: PropertyRunType; unionItem: CollectionRunType<any>};

/**
 * Mark discriminator properties so they can be sorted and validate union more efficiently.
 * @param comp
 * @param urt
 */
export function markDiscriminators(comp: JitCompiler, urt: UnionRunType, unionItems: BaseRunType[]) {
    if (urt.hasDiscriminators !== undefined && urt.hasObjectTypes !== undefined) return;
    const objectItems = unionItems.filter((item) => urt.isTypeWithProperties(item)) as CollectionRunType<any>[];
    const namedDiscriminators = getDiscriminatorPropertiesWithSameName(comp, urt, objectItems, getFlatPropCompiledName());
    const uniqueDiscriminators = getUniqueDiscriminatorProperties(comp, urt, objectItems, getFlatPropCompiledName());
    urt.hasObjectTypes = !!objectItems.length;
    urt.hasDiscriminators = !!namedDiscriminators.length || !!uniqueDiscriminators.length;
}

/**
 * Compiles code that traverses all the types of the union and execute the callback for each type
 * The callBack should return the code to execute for the current union item.
 * @return SplitUnionItems if there are objects in the union, they are flattened into the last item.
 */
export function getUnionSplitItems(comp: JitCompiler, urt: UnionRunType): SplitUnionItems {
    if (urt.splitUnionItems) return urt.splitUnionItems;
    const {objectItems, simpleItems, indexItems} = splitUnionItems(comp, urt);
    const indexPropsLength = indexItems.length >= 1 ? 1 : 0; // it does not matter how many index items are, they are all considered independent
    const needsPropsMerging = objectItems.length + indexPropsLength > 1;
    // if there is only one item that is not simple then we can treat it as simple as we do not need to merge anything
    if (!needsPropsMerging) {
        const mergedItems = [...simpleItems, ...objectItems, ...indexItems];
        return {simpleItems: getUnionPlainItems(mergedItems)};
    }
    const flattenedProps = getFlattenedObjectItem(comp, urt, objectItems, indexItems, getFlatPropCompiledName());
    const propsByName: UnionPropsByName | undefined = flattenedProps
        ? {discriminatorProps: new Map(), otherProps: new Map()}
        : undefined;
    if (propsByName && flattenedProps) {
        flattenedProps.discriminatorProps.forEach((item) => setPropsByName(item, propsByName.discriminatorProps));
        flattenedProps.otherProps.forEach((item) => setPropsByName(item, propsByName.otherProps));
    }
    const namedProps = flattenedProps ? [...flattenedProps.discriminatorProps, ...flattenedProps.otherProps] : [];
    const allFlattenedProps = flattenedProps
        ? [...flattenedProps.discriminatorProps, ...flattenedProps.otherProps, ...flattenedProps.indexProps]
        : [];
    const propsByUnionItem = new Map<CollectionRunType<any>, FlattenedUnionProp[]>();
    allFlattenedProps.forEach((item) => {
        const existing = propsByUnionItem.get(item.unionItem) || [];
        propsByUnionItem.set(item.unionItem, [...existing, item]);
    });
    const items = {
        simpleItems: getUnionPlainItems(simpleItems),
        flattenedProps,
        propsByName,
        namedProps: namedProps,
        propsByUnionItem,
    };
    urt.splitUnionItems = items;
    return items;
}

/**
 * Find discriminators properties with the same name. ie: {nodeType: 'a'} | {nodeType: 'b'} | {nodeType: 'c'}
 * Discriminator props are unique properties to each object in the union.
 * It also marks those properties as discriminator properties so can be sorted later
 */
function getDiscriminatorPropertiesWithSameName(
    comp: JitCompiler,
    urt: UnionRunType,
    unionObjectItems: CollectionRunType<any>[],
    getCompiledName: getCompiledNameFN
): FlattenedUnionProp[] {
    if (!unionObjectItems.length) return [];
    const propByName = new Map<string | number, PropUnionItemPair[]>();
    unionObjectItems.forEach((unionItem) => {
        const props = unionItem.getJitChildren(comp) as PropertyRunType[];
        props.forEach((prop) => {
            const name = prop.getChildVarName();
            const existing = propByName.get(name) || [];
            // index no needed now
            propByName.set(name, [...existing, {prop, unionItem}]);
        });
    });
    const propsOnAllItems = Array.from(propByName.entries())
        // filter all properties that are in all types
        .filter(([, props]) => props.length === unionObjectItems.length)
        // calculate complexity and check if all types are different in all props
        .map(([key, props]) => ({
            name: key,
            props,
            complexity: props.reduce((acc, item) => acc + getTotalComplexity(comp, item.prop), 0),
            isUniqueType: props.every((item) => {
                const child = item;
                const typeID = child.prop.getTypeID();
                const isDiff = props.every((otherItem) => child.prop === otherItem.prop || otherItem.prop.getTypeID() !== typeID);
                return isDiff;
            }),
        }))
        .filter((item) => item.isUniqueType);
    const lessComplexProps = propsOnAllItems.toSorted((a, b) => a.complexity - b.complexity);
    const lessComplex = lessComplexProps[0];
    if (!lessComplex) return [];
    // we need to marks the property as discriminator so they can be sorted and checked first later
    return lessComplex.props.map((item) => {
        item.prop.isUnionDiscriminator = true;
        const typeID = item.prop.getTypeID();
        return {
            unionItem: item.unionItem,
            position: urt.getUnionItemIndex(comp, item.unionItem),
            prop: item.prop,
            typeID,
            flagVarName: getCompiledName(urt, typeID),
        };
    });
}

/**
 * Find discriminators properties with different names.
 * ie: {a: string, repeated: string} | {b: number, repeated: string} | {c: boolean, repeated:string}
 * repeated is not a discriminator as is not unique to each object in the union,
 * Discriminator props are unique properties to each object in the union.
 * It also marks those properties as discriminator properties so can be sorted later
 * */
function getUniqueDiscriminatorProperties(
    comp: JitCompiler,
    urt: UnionRunType,
    unionObjectItems: CollectionRunType<any>[],
    getCompiledName: getCompiledNameFN
): FlattenedUnionProp[] {
    if (!unionObjectItems.length) return [];
    const uniquePropByUnionItem = new Map<CollectionRunType<any>, PropUnionItemPair>();
    unionObjectItems.forEach((unionItem) => {
        const props = unionItem.getJitChildren(comp) as PropertyRunType[];
        props.forEach((prop) => {
            const typeID = prop.getTypeID();
            const isUnique = unionObjectItems.every((otherUnionItem) => {
                if (otherUnionItem === unionItem) return true;
                const otherProps = otherUnionItem.getJitChildren(comp) as MemberRunType<any>[];
                return otherProps.every((otherProp) => otherProp.getTypeID() !== typeID);
            });
            if (isUnique) {
                const existing = uniquePropByUnionItem.get(unionItem);
                if (!existing) {
                    uniquePropByUnionItem.set(unionItem, {
                        prop,
                        unionItem,
                    });
                    return;
                }
                const newItem = {prop, unionItem};
                const lessComplex = [newItem, existing].toSorted((a, b) => sortRunTypeByComplexity(comp, a.prop, b.prop))[0];
                uniquePropByUnionItem.set(unionItem, lessComplex);
            }
        });
    });
    if (!uniquePropByUnionItem.size) return [];
    const uniqueProps = Array.from(uniquePropByUnionItem.values());
    return uniqueProps.map((item) => {
        item.prop.isUnionDiscriminator = true;
        const typeID = item.prop.getTypeID();
        return {
            unionItem: item.unionItem,
            position: urt.getUnionItemIndex(comp, item.unionItem),
            prop: item.prop,
            typeID,
            flagVarName: getCompiledName(urt, typeID),
        };
    });
}

type getCompiledNameFN = (urt: UnionRunType, propTypeID: string | number) => string;

function getFlatPropCompiledName(): getCompiledNameFN {
    const typeIDs = new Map<string | number, number>();
    return function getCompiledName(urt: UnionRunType, typeID: string | number): string {
        const existingIndex = typeIDs.get(typeID);
        if (existingIndex) return `u${urt.getNestLevel()}P${existingIndex}`;
        const newIndex = typeIDs.size;
        typeIDs.set(typeID, newIndex);
        return `u${urt.getNestLevel()}P${newIndex}`;
    };
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
 * Split the union types in two groups: interface types and simple types
 * interface types are types that have properties, simple types are the rest (atomic types, tuples, etc)
 */
function splitUnionItems(
    comp: JitCompiler,
    urt: UnionRunType
): {objectItems: CollectionRunType<any>[]; simpleItems: BaseRunType[]; indexItems: CollectionRunType<any>[]} {
    const unionItems = urt.getJitChildren(comp);
    const objectItems: CollectionRunType<any>[] = [];
    const simpleItems: BaseRunType[] = [];
    const indexItems: CollectionRunType<any>[] = [];
    unionItems.forEach((unionItem) => {
        const isObj = urt.isTypeWithProperties(unionItem);
        if (!isObj) return simpleItems.push(unionItem);
        const objItem = unionItem as CollectionRunType<any>;
        // Object with index properties can not be flattened and need to be fully checked
        const hasIndexProperty = objItem.getJitChildren?.(comp).some((prop) => prop.src.kind === ReflectionKind.indexSignature);
        if (hasIndexProperty) return indexItems.push(objItem);
        return objectItems.push(objItem);
    });

    return {objectItems, simpleItems, indexItems};
}

function getUnionPlainItems(unionItems: BaseRunType[]): SimpleUnionItem[] {
    if (!unionItems.length) return [];
    return unionItems.map((rt, i) => ({rt, unionIndex: i}));
}

/** Find discriminators properties in the union ans create a check code to validate the discriminator */
function getFlattenedObjectItem(
    comp: JitCompiler,
    urt: UnionRunType,
    objectItems: CollectionRunType<any>[],
    indexItems: CollectionRunType<any>[],
    getCompiledName: getCompiledNameFN
): UnionFlattenedProps | undefined {
    let discriminatorProps: FlattenedUnionProp[] = [];
    // if there are index properties that means that every property could be the prop itself or the type of the index,
    // so in this case we can't use discriminator props
    const skipDiscriminatorProps = indexItems.length >= 1;
    if (!skipDiscriminatorProps) {
        discriminatorProps = getDiscriminatorPropertiesWithSameName(comp, urt, objectItems, getCompiledName);
    }
    if (!skipDiscriminatorProps && !discriminatorProps.length) {
        discriminatorProps = getUniqueDiscriminatorProperties(comp, urt, objectItems, getCompiledName);
    }

    const otherProps = objectItems
        .map((rt) => {
            const children = rt.getJitChildren(comp) as PropertyRunType[];
            return children.map((prop) => {
                const typeID = prop.getTypeID();
                return {
                    unionItem: rt,
                    position: urt.getUnionItemIndex(comp, rt),
                    prop,
                    typeID,
                    flagVarName: getCompiledName(urt, typeID),
                } as FlattenedUnionProp;
            });
        })
        .flat()
        .filter((item) => !(item.prop as PropertyRunType).isUnionDiscriminator);
    const indexProps = indexItems
        .map((rt) => {
            const children = rt.getJitChildren(comp) as IndexSignatureRunType[];
            return children.map((prop) => {
                const typeID = prop.getTypeID();
                return {
                    unionItem: rt,
                    position: urt.getUnionItemIndex(comp, rt),
                    prop,
                    typeID,
                    flagVarName: getCompiledName(urt, typeID),
                } as FlattenedUnionProp;
            });
        })
        .flat()
        .filter((item) => !(item.prop as PropertyRunType).isUnionDiscriminator);
    return {discriminatorProps, otherProps, indexProps};
}
